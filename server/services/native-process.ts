import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isAbsolute } from 'node:path';
import type { Settings } from '../../shared/types.js';
import type { CommandResult } from './process.js';
import { AppError, NotStartedError } from '../core/errors.js';
export function executeNative(
  command: string,
  cwd: string,
  signal: AbortSignal,
  timeoutMs: number,
  settings: Settings,
): Promise<CommandResult> {
  if (process.platform !== 'win32' || !settings.nativePython || !isAbsolute(settings.nativePython))
    return Promise.reject(
      new NotStartedError(
        'NATIVE_UNAVAILABLE',
        'Windows native isolation requires an absolute Python interpreter path in Settings. No host fallback.',
      ),
    );
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {};
    for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'LOCALAPPDATA', 'TEMP', 'TMP'])
      if (process.env[key]) env[key] = process.env[key];
    const child = spawn(
      settings.nativePython!,
      ['-X', 'utf8', fileURLToPath(new URL('../../native/windows/bridge.py', import.meta.url))],
      { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let out = '',
      err = '',
      ended = false;
    const cancel = () => {
      if (!child.stdin.destroyed) child.stdin.end('\n');
    };
    const guard = setTimeout(cancel, timeoutMs + 120000);
    signal.addEventListener('abort', cancel, { once: true });
    child.stdout.on('data', (v) => {
      out += v.toString();
      if (out.length > 7000000) cancel();
    });
    child.stderr.on('data', (v) => (err = (err + v.toString()).slice(-4000)));
    child.stdin.on('error', () => {});
    child.on('error', (e) => finish(new NotStartedError('NATIVE_UNAVAILABLE', e.message)));
    function finish(error?: Error, result?: CommandResult) {
      if (ended) return;
      ended = true;
      clearTimeout(guard);
      signal.removeEventListener('abort', cancel);
      if (error) reject(error);
      else resolve(result!);
    }
    child.on('close', () => {
      try {
        const r = JSON.parse(out);
        if (r.error) throw new Error(r.error);
        if (typeof r.stdout !== 'string' || typeof r.timedOut !== 'boolean')
          throw new Error('Invalid adapter response');
        if (r.commandStarted === false && r.preflight?.allowed === false) {
          finish(
            new NotStartedError(
              'SANDBOX_PREFLIGHT_FAILED',
              r.stdout +
                ' Requested command was not started. Check Settings diagnostics or explicitly choose file isolation with host networking; no automatic downgrade.',
            ),
          );
          return;
        }
        finish(undefined, {
          ...r,
          execution: { backend: 'native-windows', shell: 'cmd.exe', cwd },
        });
      } catch (e) {
        finish(new AppError('NATIVE_FAILED', String(e) + ' ' + err));
      }
    });
    child.stdin.write(
      JSON.stringify({ command, cwd, timeoutMs, network: settings.nativeNetwork || 'deny' }) + '\n',
    );
    if (signal.aborted) cancel();
  });
}
