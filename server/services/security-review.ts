/** Deterministic review design. Produces hypotheses, never vulnerability verdicts. */
export const securitySurfaces = [
  'identity',
  'authorization',
  'untrusted-input',
  'state-transitions',
  'external-events',
  'secrets',
  'files-network',
] as const;
type Surface = (typeof securitySurfaces)[number];
const checks: Record<Surface, { invariant: string; attacks: string[]; controls: string[] }> = {
  identity: {
    invariant: 'Only a valid, current identity can access protected operations.',
    attacks: [
      'Missing, forged, expired and revoked credentials; session reuse after logout; alternate authentication routes.',
    ],
    controls: ['Valid identity succeeds; rejected attempts leave protected state unchanged.'],
  },
  authorization: {
    invariant: 'Every server entry point enforces role, object ownership and tenant boundaries.',
    attacks: [
      'Use a second real account to replace object identifiers in read, write, list, export and realtime requests.',
      'Attempt role escalation and mass assignment; call the API directly without the UI; compare omitted and forged owner fields.',
    ],
    controls: [
      'Owner/authorized role succeeds; foreign user and anonymous caller fail with no data disclosure or mutation.',
    ],
  },
  'untrusted-input': {
    invariant:
      'Untrusted input cannot become executable instructions or override server authority.',
    attacks: [
      'Exercise injection, stored/reflected script content, malformed types, negative/overflow values and oversized payloads.',
      'Tamper with client-provided amounts, identities, deadlines and computed fields.',
    ],
    controls: [
      'Valid boundary inputs work; invalid inputs cannot change authoritative server state.',
    ],
  },
  'state-transitions': {
    invariant: 'Concurrent and interrupted operations preserve declared invariants atomically.',
    attacks: [
      'Race conflicting operations using separate database connections and synchronized starts.',
      'Replay requests, reorder transitions, inject a failure between writes, restart and reconcile durable state.',
    ],
    controls: [
      'Assert final database invariants and cardinality, not just HTTP success counts; no orphan or partial state.',
    ],
  },
  'external-events': {
    invariant:
      'Callbacks and external events require authenticated provenance and valid state transitions.',
    attacks: [
      'Forge callback identity/signature; replay and reorder events; swap target IDs and alter values.',
      'Check demo, debug and simulation routes for the same trust boundary; being local does not authenticate a request.',
    ],
    controls: [
      'Authentic event succeeds exactly once; forged/replayed event causes no unauthorized transition.',
    ],
  },
  secrets: {
    invariant: 'Credentials and sensitive data remain within explicitly authorized boundaries.',
    attacks: [
      'Inspect responses, errors, logs, fixtures and shipped configuration for secrets; check insecure defaults and account setup.',
    ],
    controls: [
      'Use synthetic secrets and assert redaction; document local-demo limitations without claiming production safety.',
    ],
  },
  'files-network': {
    invariant: 'File and outbound network access stay within the intended authority.',
    attacks: [
      'Try traversal, encoded/absolute paths, symlinks, redirect-to-private destinations and uploaded active content.',
    ],
    controls: [
      'Authorized file/destination works; rejected inputs produce no outside write or unintended request.',
    ],
  },
};
export function prepareSecurityReview(surfaces: Surface[]) {
  return {
    version: 1,
    status: 'not-tested',
    calibratedConfidence: null,
    checks: [...new Set(surfaces)].map((surface) => ({
      surface,
      ...checks[surface],
      evidence: [],
      status: 'not-tested',
    })),
    method:
      'Read entry points and trust boundaries before author tests. Derive counterexamples from the contract, not the implementation. Use disposable local fixtures and authorized tools only. A scanner or a green suite alone is insufficient.',
    evidenceRequired: [
      'Exact actor/input and expected rejection',
      'Observed result and durable state assertion',
      'Positive control that proves the test reached the relevant protection',
      'Current artifact version and tool event ID',
    ],
    next: 'Add applicable checks as verify tasks with artifact paths. Record concrete unresolved concerns with record_task_challenge; resolve against current checks. Report blocked or untested checks explicitly, never as passed.',
    independence:
      'A separate run is not necessarily independent reasoning. Give a reviewer the contract, entry points and artifacts before the author conclusion; use different inputs. Respect collaboration settings and permissions; without delegation label this self-review.',
  };
}

/** Conservative hints from declared contracts, not a vulnerability classifier. */
export function automaticSecurityReview(tasks: import('./task-board.js').BoardTask[]) {
  const surfaces = new Set<Surface>();
  const triggeredBy: { taskId: string; surfaces: Surface[] }[] = [];
  for (const task of tasks) {
    const text = task.title + ' ' + task.acceptance;
    const matched: Surface[] = [];
    const rules: [Surface, RegExp][] = [
      ['identity', /authenticat|login|session|credential|登录|认证|凭据/i],
      ['authorization', /authoriz|permission|tenant|ownership|role|权限|越权|租户|角色/i],
      ['untrusted-input', /input|upload|form|输入|上传|表单/i],
      [
        'state-transitions',
        /database|transaction|concurren|idempoten|payment|数据库|事务|并发|幂等|支付/i,
      ],
      ['external-events', /callback|webhook|external event|回调|外部事件/i],
      ['secrets', /secret|password|token|密钥|密码|令牌/i],
      ['files-network', /download|file access|fetch|proxy|下载|文件访问|代理/i],
    ];
    for (const [surface, pattern] of rules) if (pattern.test(text)) matched.push(surface);
    const paths = [...(task.artifacts || []), ...(task.writePaths || [])];
    if (
      paths.some((p) => /\.(?:[cm]?[jt]sx?|py|go|rs|java|cs|php|rb|sql|c|cpp|h)$/i.test(p)) &&
      !matched.length
    )
      matched.push('untrusted-input');
    if (matched.length) {
      triggeredBy.push({ taskId: task.id, surfaces: matched });
      for (const item of matched) surfaces.add(item);
    }
  }
  if (!surfaces.size) return undefined;
  return {
    trigger: 'host-declared-task-policy',
    triggeredBy: triggeredBy.slice(0, 12),
    omittedTriggers: Math.max(0, triggeredBy.length - 12),
    limitation:
      'Heuristic coverage from declared tasks only. Missing or indirect requirements may not trigger. These are review obligations to assess, not confirmed vulnerabilities or executed checks.',
    ...prepareSecurityReview([...surfaces]),
  };
}
