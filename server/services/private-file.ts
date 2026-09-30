import { execFileSync } from 'node:child_process';
import { writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
let sid: string | undefined;
export function secureDirectory(path: string) {
  mkdirSync(path, { recursive: true });
  protect(path, true);
}
function protect(path: string, directory = false) {
  if (process.platform === 'win32') {
    sid ||= execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], {
      encoding: 'utf8',
      windowsHide: true,
    }).match(/S-1-5-[0-9-]+/)?.[0];
    if (!sid) throw Error('Cannot identify current Windows user; secret file was not written.');
    const rights = directory ? '(OI)(CI)(F)' : '(F)';
    execFileSync(
      'icacls.exe',
      [
        path,
        '/inheritance:r',
        '/grant:r',
        '*' + sid + ':' + rights,
        '*S-1-5-18:' + rights,
        '*S-1-5-32-544:' + rights,
      ],
      { stdio: 'pipe', windowsHide: true },
    );
  } else chmodSync(path, directory ? 0o700 : 0o600);
}
export function writePrivate(path: string, text: string) {
  secureDirectory(dirname(path));
  writeFileSync(path, '', { mode: 0o600 });
  protect(path);
  writeFileSync(path, text, { mode: 0o600 });
}
