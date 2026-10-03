import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CodingCase } from './cases.js';
export async function grade(
  source: string,
  checks: CodingCase['checks'],
): Promise<{ passed: boolean; checks: number; error?: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'agentdemo-grade-'));
  const worker = fileURLToPath(new URL('./grader-worker.cjs', import.meta.url));
  try {
    const file = join(dir, 'input.json');
    await writeFile(file, JSON.stringify({ source, checks }));
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['--permission', '--allow-fs-read=' + worker, '--allow-fs-read=' + file, worker, file],
      { timeout: 10000, maxBuffer: 64000, windowsHide: true },
    );
    const result = JSON.parse(stdout);
    if (typeof result.passed !== 'boolean') throw Error('Invalid grader output');
    return result;
  } catch {
    return { passed: false, checks: checks.length, error: 'grader_process_failed' };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
