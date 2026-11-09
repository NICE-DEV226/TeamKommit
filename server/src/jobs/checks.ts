import { open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import yauzl from 'yauzl';
import { config } from '../config.js';
import { downloadToFile } from '../storage/s3.js';
import type { StepType } from '../models/Pipeline.js';

export interface FileCheckResult {
  fileType: 'zip' | 'pdf' | 'image' | 'text' | 'unknown' | 'rejected';
  isZipBomb: boolean;
  archiveEntries?: number;
  uncompressedBytes?: number;
  errors: string[];
  preview?: string;
}

const SIGNATURES: { type: FileCheckResult['fileType']; test: (b: Buffer) => boolean }[] = [
  { type: 'zip', test: (b) => b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07) },
  { type: 'pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { type: 'image', test: (b) => (b[0] === 0x89 && b[1] === 0x50) || (b[0] === 0xff && b[1] === 0xd8) },
];

export async function detectType(path: string): Promise<FileCheckResult['fileType']> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(8);
    await fh.read(buf, 0, 8, 0);
    for (const s of SIGNATURES) if (s.test(buf)) return s.type;
    // crude text sniff
    const chunk = Buffer.alloc(512);
    const { bytesRead } = await fh.read(chunk, 0, 512, 0);
    const head = chunk.subarray(0, bytesRead);
    if (head.includes(0)) return 'unknown';
    return 'text';
  } finally {
    await fh.close();
  }
}

export interface ZipScan { entries: number; uncompressed: number; readme?: string; truncated: boolean }

/** Stream-scan a zip: entry count, total uncompressed size (bomb ratio), first README. */
export function scanZip(path: string): Promise<ZipScan> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, validateEntrySizes: false }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error('Cannot open zip'));
      const scan: ZipScan = { entries: 0, uncompressed: 0, truncated: false };
      const maxEntries = config.submissions.maxZipEntries;
      zip.readEntry();
      zip.on('entry', (entry: yauzl.Entry) => {
        scan.entries++;
        scan.uncompressed += entry.uncompressedSize;
        if (scan.entries > maxEntries) { scan.truncated = true; zip.close(); return resolve(scan); }
        const isReadme = /(^|\/)readme[^/]*\.(md|txt|markdown)$/i.test(entry.fileName) && entry.uncompressedSize < 64 * 1024;
        if (isReadme && !scan.readme) {
          zip.openReadStream(entry, (e2, stream) => {
            if (e2 || !stream) { zip.readEntry(); return; }
            const chunks: Buffer[] = [];
            stream.on('data', (c: Buffer) => chunks.push(c));
            stream.on('end', () => { scan.readme = Buffer.concat(chunks).toString('utf8').slice(0, 4000); zip.readEntry(); });
            stream.on('error', () => zip.readEntry());
          });
        } else {
          zip.readEntry();
        }
      });
      zip.on('end', () => resolve(scan));
      zip.on('error', reject);
    });
  });
}

async function pdfPreview(path: string): Promise<string | undefined> {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(await import('node:fs/promises').then((fs) => fs.readFile(path)), { max: 1 });
    return data.text?.slice(0, 1000) || undefined;
  } catch {
    return undefined;
  }
}

export async function checkLinks(links: string[]): Promise<{ ok: string[]; failed: string[] }> {
  const ok: string[] = [];
  const failed: string[] = [];
  await Promise.all(links.slice(0, config.submissions.maxLinks).map(async (url) => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), config.submissions.linkCheckTimeoutMs);
      const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctrl.signal });
      clearTimeout(t);
      (res.status < 400 ? ok : failed).push(url);
      // drain body
      await res.arrayBuffer().catch(() => {});
    } catch {
      failed.push(url);
    }
  }));
  return { ok, failed };
}

// ---------------------------------------------------------------------------
// Pipeline evaluation — pure, testable. Facts are collected once; steps decide.
// ---------------------------------------------------------------------------

export interface PipelineStep {
  stepId: string;
  type: StepType;
  enabled: boolean;
  severity: 'reject' | 'warn';
  config: Record<string, unknown>;
}

export interface CheckFacts {
  fileType: FileCheckResult['fileType'];
  fileBytes: number;
  archiveEntries?: number;
  uncompressedBytes?: number;
  compressionRatio?: number;
  hasReadme?: boolean;
  /** Set when the file sniffs as zip but the archive can't be parsed. */
  archiveError?: string;
  linksOk: string[];
  linksFailed: string[];
  totalLinks: number;
}

export interface StepResult {
  stepId: string;
  type: StepType;
  status: 'pass' | 'fail' | 'skipped';
  detail?: string;
}

export interface PipelineVerdict {
  rejected: boolean;
  needsFix: boolean;
  problems: string[];
  results: StepResult[];
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Evaluate ordered pipeline steps against collected facts. */
export function evaluateSteps(steps: PipelineStep[], facts: CheckFacts): PipelineVerdict {
  const results: StepResult[] = [];
  const problems: string[] = [];
  let rejected = false;
  let needsFix = false;

  for (const step of steps) {
    if (!step.enabled) {
      results.push({ stepId: step.stepId, type: step.type, status: 'skipped' });
      continue;
    }
    const fail = (detail: string): void => {
      results.push({ stepId: step.stepId, type: step.type, status: 'fail', detail });
      problems.push(`[${step.type}] ${detail}`);
      if (step.severity === 'reject') rejected = true; else needsFix = true;
    };
    const pass = (detail?: string) => results.push({ stepId: step.stepId, type: step.type, status: 'pass', detail });

    switch (step.type) {
      case 'file-size': {
        const maxMB = num(step.config.maxMB, 100);
        if (facts.fileBytes > maxMB * 1024 * 1024) fail(`File exceeds ${maxMB} MB`);
        else pass(`${(facts.fileBytes / 1024 / 1024).toFixed(1)} MB`);
        break;
      }
      case 'allowed-types': {
        const types = Array.isArray(step.config.types) ? step.config.types as string[] : [];
        if (types.length === 0 || types.includes(facts.fileType)) pass(facts.fileType);
        else fail(`File type "${facts.fileType}" not allowed (allowed: ${types.join(', ')})`);
        break;
      }
      case 'archive-scan': {
        if (facts.fileType !== 'zip') { pass('not an archive'); break; }
        if (facts.archiveError) { fail(`Archive is corrupt or unreadable: ${facts.archiveError}`); break; }
        const maxEntries = num(step.config.maxEntries, config.submissions.maxZipEntries);
        const maxRatio = num(step.config.maxRatio, config.submissions.zipBombRatio);
        const maxUncompressedMB = num(step.config.maxUncompressedMB, 0);
        const entries = facts.archiveEntries ?? 0;
        const ratio = facts.compressionRatio ?? 0;
        const uncompressedMB = (facts.uncompressedBytes ?? 0) / 1024 / 1024;
        if (entries > maxEntries) fail(`Archive has too many entries (${entries} > ${maxEntries})`);
        else if (maxUncompressedMB > 0 && uncompressedMB > maxUncompressedMB) fail(`Uncompressed size ${uncompressedMB.toFixed(0)} MB exceeds ${maxUncompressedMB} MB`);
        else if (ratio > maxRatio) fail(`Suspected zip bomb: compression ratio ${ratio.toFixed(0)}:1`);
        else pass(`${entries} entries, ratio ${ratio.toFixed(0)}:1`);
        break;
      }
      case 'link-check': {
        if (facts.totalLinks === 0) { pass('no links submitted'); break; }
        if (facts.linksFailed.length === 0) pass(`${facts.linksOk.length}/${facts.totalLinks} links OK`);
        else if (facts.linksFailed.length === facts.totalLinks) fail(`All ${facts.totalLinks} submitted links are unreachable`);
        else fail(`${facts.linksFailed.length}/${facts.totalLinks} links unreachable`);
        break;
      }
      case 'readme-required': {
        if (facts.fileType !== 'zip') { pass('not an archive'); break; }
        if (facts.hasReadme) pass('README found');
        else fail('Archive has no README (readme.md/txt at any depth)');
        break;
      }
    }
  }
  return { rejected, needsFix, problems, results };
}

/** Default pipeline = historical behavior, expressed as steps. */
export function defaultSteps(): PipelineStep[] {
  return [
    { stepId: 'size', type: 'file-size', enabled: true, severity: 'reject', config: { maxMB: 100 } },
    { stepId: 'types', type: 'allowed-types', enabled: true, severity: 'warn', config: { types: ['zip', 'pdf', 'image', 'text'] } },
    { stepId: 'archive', type: 'archive-scan', enabled: true, severity: 'reject', config: { maxEntries: config.submissions.maxZipEntries, maxRatio: config.submissions.zipBombRatio, maxUncompressedMB: 0 } },
    { stepId: 'links', type: 'link-check', enabled: true, severity: 'warn', config: {} },
  ];
}

/**
 * Full background check for one submission file.
 * Downloads to a temp file (API server never holds the bytes), sniffs the
 * real type from magic bytes — never the extension — then evaluates the
 * pipeline steps (organizer-configured or defaults).
 */
export async function runFileCheck(
  s3Key: string,
  links: string[],
  steps?: PipelineStep[],
): Promise<{
  file: FileCheckResult;
  links: { ok: string[]; failed: string[] };
  verdict: PipelineVerdict;
}> {
  const tmp = join(tmpdir(), `tk-check-${randomUUID()}`);
  try {
    const size = await downloadToFile(s3Key, tmp);
    const file: FileCheckResult = { fileType: 'unknown', isZipBomb: false, errors: [] };
    const linkResult = { ok: [] as string[], failed: [] as string[] };

    if (size > config.submissions.maxFileBytes) {
      file.fileType = 'rejected';
      file.errors.push('File exceeds 100 MB');
      // Links are never checked on this path — report them as absent rather
      // than fabricating "all links unreachable" failures.
      const verdict = evaluateSteps(steps ?? defaultSteps(), {
        fileType: 'rejected', fileBytes: size, linksOk: [], linksFailed: [], totalLinks: 0,
      });
      return { file, links: linkResult, verdict };
    }

    file.fileType = await detectType(tmp);
    const facts: CheckFacts = {
      fileType: file.fileType, fileBytes: size,
      linksOk: [], linksFailed: [], totalLinks: links.length,
    };

    if (file.fileType === 'zip') {
      try {
        const scan = await scanZip(tmp);
        file.archiveEntries = scan.entries;
        file.uncompressedBytes = scan.uncompressed;
        facts.archiveEntries = scan.entries;
        facts.uncompressedBytes = scan.uncompressed;
        facts.compressionRatio = scan.uncompressed / Math.max(1, size);
        facts.hasReadme = !!scan.readme;
        if (scan.readme) file.preview = scan.readme.slice(0, 2000);
      } catch (err) {
        // Magic bytes said zip but the archive is corrupt/truncated — a
        // checkable failure, NOT a job crash (which would wedge the
        // submission in CHECKING after retries exhaust).
        facts.archiveError = (err as Error).message.slice(0, 200);
      }
    } else if (file.fileType === 'pdf') {
      file.preview = await pdfPreview(tmp);
    }

    const linkRes = await checkLinks(links);
    linkResult.ok = linkRes.ok;
    linkResult.failed = linkRes.failed;
    facts.linksOk = linkRes.ok;
    facts.linksFailed = linkRes.failed;

    const verdict = evaluateSteps(steps ?? defaultSteps(), facts);
    // A corrupt archive is objectively broken — surface it even when the
    // configured pipeline has no archive-scan step to consume archiveError.
    if (facts.archiveError && !verdict.results.some((r) => r.type === 'archive-scan' && r.status === 'fail')) {
      verdict.problems.push(`[archive] Archive is corrupt or unreadable: ${facts.archiveError}`);
      verdict.needsFix = true;
    }
    // Back-compat fields for existing UI/CSV consumers.
    file.isZipBomb = verdict.results.some((r) => r.type === 'archive-scan' && r.status === 'fail');
    file.errors = verdict.problems;
    return { file, links: linkResult, verdict };
  } finally {
    await import('node:fs/promises').then((fs) => fs.rm(tmp, { force: true })).catch(() => {});
  }
}
