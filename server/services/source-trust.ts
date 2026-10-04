import { createHash } from 'node:crypto';
/** Signals, not a security classifier. Absence of matches never means trusted. */
export function sourceTrust(tool: string, text: string) {
  const patterns: [string, RegExp][] = [
    [
      'instruction-override',
      /ignore (all |any )?(previous|prior|system) instructions|忽略.{0,12}(指令|规则|提示词)/i,
    ],
    ['role-spoof', /<\/?(system|developer)>|\[system\]|系统消息[:：]/i],
    [
      'authorization-spoof',
      /user (has )?(approved|authorized) (all|everything)|用户已.{0,8}(批准所有|授权所有)/i,
    ],
    ['secret-export', /(upload|send|post|发送|上传).{0,80}(api.?key|secret|credential|密钥|凭据)/i],
  ];
  return {
    source: 'tool-output',
    tool,
    trust: 'untrusted',
    sha256: createHash('sha256').update(text).digest('hex'),
    signals: patterns.filter(([, p]) => p.test(text)).map(([id]) => id),
    authorizationGranted: false,
    detector: 'heuristic-v1',
    scannedCharacters: text.length,
  };
}
