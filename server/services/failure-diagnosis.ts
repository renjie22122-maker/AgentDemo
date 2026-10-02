export interface FailureDiagnosis {
  kind:
    | 'authorization'
    | 'credentials'
    | 'dependency'
    | 'network'
    | 'capacity'
    | 'uncertain'
    | 'configuration';
  title: string;
  titleZh: string;
  action: string;
  actionZh: string;
  automatic: boolean;
}
export function diagnoseFailure(error: unknown): FailureDiagnosis {
  const text = String(error instanceof Error ? error.message : error);
  const d = (
    kind: FailureDiagnosis['kind'],
    title: string,
    titleZh: string,
    action: string,
    actionZh: string,
    automatic = false,
  ): FailureDiagnosis => ({ kind, title, titleZh, action, actionZh, automatic });
  if (/unknown.*(effect|result)|uncertain|interrupted|termination.*failed/i.test(text))
    return d(
      'uncertain',
      'Outcome needs inspection',
      '操作结果需要核实',
      'Inspect existing results before considering another execution.',
      '先核对现有结果，再判断是否需要执行；不会直接重跑。',
    );
  if (
    /destination|service changed|outside|denied|permission|scope|preflight|unauthoriz.*scope/i.test(
      text,
    )
  )
    return d(
      'authorization',
      'Scope or permission blocked',
      '范围或权限受阻',
      'Review the selected scope or execution permission. No automatic expansion.',
      '检查已选范围或执行权限；不会自动扩大权限。',
    );
  if (/401|403|api.?key|credential|authentication/i.test(text))
    return d(
      'credentials',
      'Connection credentials rejected',
      '连接凭据被拒绝',
      'Correct the saved credentials. The same authorized destination resumes automatically.',
      '修正已保存凭据；同一已授权服务将自动重试。',
    );
  if (
    /ModuleNotFound|Cannot find (module|package)|not recognized|ENOENT|OCR.*(language|unavailable)|missing.*(package|dependency)|command not found/i.test(
      text,
    )
  )
    return d(
      'dependency',
      'Dependency unavailable',
      '依赖不可用',
      'Prepare the required local dependency with normal approval, then recheck.',
      '通过正常审批准备本地依赖，完成后重新检查。',
    );
  if (
    /timeout|timed out|fetch failed|ECONN|ENET|EAI_AGAIN|HTTP (429|5\d\d)|socket|network unavailable/i.test(
      text,
    )
  )
    return d(
      'network',
      'Temporary connection failure',
      '临时连接故障',
      'Retry with backoff at the existing destination.',
      '在现有服务地址退避重试。',
      true,
    );
  if (/too many|exceeds|more than|pixel limit|supports up to|ENOSPC|out of memory/i.test(text))
    return d(
      'capacity',
      'Resource or source limit',
      '资源或资料超限',
      'Reduce the source size or free resources, then recheck.',
      '缩小资料范围或释放资源后重新检查。',
    );
  return d(
    'configuration',
    'Configuration or response needs checking',
    '配置或返回结果需要检查',
    'Check configuration and diagnostics, then request a bounded retry.',
    '检查配置与诊断结果，然后发起一次有限重试。',
  );
}
