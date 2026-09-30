import { spawn } from 'node:child_process';
import { assert } from '../core/errors.js';
export async function pickFolder(): Promise<string | null> {
  assert(
    process.platform === 'win32',
    'PICKER_UNAVAILABLE',
    'Paste absolute paths on this platform.',
  );
  const script =
    "$OutputEncoding=[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); Add-Type -AssemblyName System.Windows.Forms; $dialog=New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description='Choose a project folder'; $dialog.ShowNewFolderButton=$true; if($dialog.ShowDialog() -eq 'OK'){[Console]::Write($dialog.SelectedPath)}; $dialog.Dispose()";
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    child.stdout.on('data', (d) => (output += d.toString('utf8')));
    child.stderr.on('data', () => {});
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve(output.trim() || null)
        : reject(new Error('Folder picker could not open. Paste a path instead.')),
    );
  });
}
