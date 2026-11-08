import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { detectType, scanZip, type FileCheckResult } from '../jobs/checks.js';

/**
 * Test fixtures built with the system `zip` binary — real archives,
 * real magic bytes, no mocks.
 */
export async function detectAndScanFixture(kind: 'zip' | 'zipbomb'): Promise<FileCheckResult & { isZipBomb: boolean }> {
  const dir = mkdtempSync(join(tmpdir(), 'tk-fix-'));
  try {
    let filePath: string;
    if (kind === 'zip') {
      writeFileSync(join(dir, 'README.md'), '# Hello\nThis is a real project.\n');
      writeFileSync(join(dir, 'main.py'), 'print("hi")\n');
      filePath = join(dir, 'project.zip');
      execFileSync('zip', ['-q', '-r', filePath, 'README.md', 'main.py'], { cwd: dir });
    } else {
      // 50MB of zeros compresses to ~50KB → ratio ~1000:1 → bomb
      writeFileSync(join(dir, 'zeros.bin'), Buffer.alloc(50 * 1024 * 1024, 0));
      filePath = join(dir, 'bomb.zip');
      execFileSync('zip', ['-q', '-9', filePath, 'zeros.bin'], { cwd: dir });
    }

    const fileType = await detectType(filePath);
    const { size } = await import('node:fs/promises').then((fs) => fs.stat(filePath));
    const result: FileCheckResult & { isZipBomb: boolean } = { fileType, isZipBomb: false, errors: [] };
    if (fileType === 'zip') {
      const scan = await scanZip(filePath);
      result.archiveEntries = scan.entries;
      result.uncompressedBytes = scan.uncompressed;
      result.preview = scan.readme;
      const ratio = scan.uncompressed / Math.max(1, size);
      if (ratio > 100) {
        result.isZipBomb = true;
        result.errors.push(`Suspected zip bomb: ratio ${ratio.toFixed(0)}:1`);
      }
    }
    return result;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
