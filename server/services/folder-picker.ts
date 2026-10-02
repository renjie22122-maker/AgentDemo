import { spawn, type ChildProcess } from 'node:child_process';
import { assert } from '../core/errors.js';

// Always settle, even if a terminated process never closes inherited output handles.
export function waitForFolderPicker(
  child: ChildProcess,
  signal?: AbortSignal,
  timeoutMs = 90000,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let output = '',
      done = false;
    const finish = (error?: Error, value: string | null = null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      if (error) {
        try {
          child.kill();
        } catch {}
        reject(error);
      } else resolve(value);
    };
    const cancel = () => finish(new Error('Folder selection cancelled.'));
    const timer = setTimeout(
      () => finish(new Error('Folder selection timed out. Paste a path or try again.')),
      timeoutMs,
    );
    child.stdout?.on('data', (d) => {
      output += d.toString('utf8');
      if (output.length > 32768) finish(new Error('Invalid folder picker output.'));
    });
    child.stderr?.on('data', () => {});
    child.once('error', (error) => finish(error));
    child.once('close', (code) =>
      code === 0
        ? finish(undefined, output.trim() || null)
        : finish(new Error('Folder picker could not open. Paste a path instead.')),
    );
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
  });
}
let openPicker = false;
export async function pickFolder(signal?: AbortSignal): Promise<string | null> {
  assert(
    process.platform === 'win32',
    'PICKER_UNAVAILABLE',
    'Paste absolute paths on this platform.',
  );
  assert(!openPicker, 'PICKER_BUSY', 'A folder picker is already open. Close it or paste a path.');
  if (signal?.aborted) throw new Error('Folder selection cancelled.');
  openPicker = true;
  try {
    const script =
      "$OutputEncoding=[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); Add-Type -AssemblyName System.Windows.Forms; $owner=New-Object System.Windows.Forms.Form; $owner.TopMost=$true; $owner.ShowInTaskbar=$false; $owner.Width=1; $owner.Height=1; $owner.StartPosition='CenterScreen'; $dialog=New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description='Choose a project folder'; $dialog.ShowNewFolderButton=$true; try {$owner.Show(); $owner.Activate(); if($dialog.ShowDialog($owner) -eq 'OK'){[Console]::Write($dialog.SelectedPath)}} finally {$dialog.Dispose();$owner.Dispose()}";
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return await waitForFolderPicker(child, signal);
  } finally {
    openPicker = false;
  }
}
