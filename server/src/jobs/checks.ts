import { open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import yauzl from 'yauzl';
import { config } from '../config.js';
import { downloadToFile } from '../storage/s3.js';

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

/**
 * Full background check for one submission file.
 * Downloads to a temp file (API server never holds the bytes), sniffs the
 * real type from magic bytes — never the extension — scans zips for bombs.
 */
export async function runFileCheck(s3Key: string, links: string[]): Promise<{
  file: FileCheckResult;
  links: { ok: string[]; failed: string[] };
}> {
  const tmp = join(tmpdir(), `tk-check-${randomUUID()}`);
  const errors: string[] = [];
  try {
    const size = await downloadToFile(s3Key, tmp);
    if (size > config.submissions.maxFileBytes) {
      return { file: { fileType: 'rejected', isZipBomb: false, errors: ['File exceeds 100 MB'] }, links: { ok: [], failed: links } };
    }
    const fileType = await detectType(tmp);
    const file: FileCheckResult = { fileType, isZipBomb: false, errors };

    if (fileType === 'zip') {
      const scan = await scanZip(tmp);
      file.archiveEntries = scan.entries;
      file.uncompressedBytes = scan.uncompressed;
      const ratio = scan.uncompressed / Math.max(1, size);
      if (scan.truncated || scan.entries > config.submissions.maxZipEntries) {
        file.isZipBomb = true;
        errors.push(`Archive has too many entries (${scan.entries})`);
      } else if (ratio > config.submissions.zipBombRatio) {
        file.isZipBomb = true;
        errors.push(`Suspected zip bomb: compression ratio ${ratio.toFixed(0)}:1`);
      }
      if (scan.readme) file.preview = scan.readme.slice(0, 2000);
    } else if (fileType === 'pdf') {
      file.preview = await pdfPreview(tmp);
    }

    const linkResult = await checkLinks(links);
    return { file, links: linkResult };
  } finally {
    await import('node:fs/promises').then((fs) => fs.rm(tmp, { force: true })).catch(() => {});
  }
}
