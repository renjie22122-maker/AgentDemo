import { resolve as absolutePath } from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export async function ocrImage(path: string): Promise<string> {
  if (process.platform !== 'win32')
    throw Error('Local OCR requires Windows OCR language packs on this installation.');
  return new Promise((resolve, reject) => {
    execFile(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        fileURLToPath(new URL('./ocr-windows.ps1', import.meta.url)),
        '-ImagePath',
        absolutePath(path),
      ],
      { windowsHide: true, timeout: 90000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' },
      (error, out, err) => {
        if (error) reject(Error('OCR unavailable: ' + String(err || error.message).slice(0, 500)));
        else resolve('[Local OCR; recognition may contain errors]\n' + out.trim());
      },
    );
  });
}
