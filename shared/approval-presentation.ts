import { approvalRisk } from './approval-risk';

// Presentation only: never use these labels to authorize execution.
export function approvalPresentation(payload: Record<string, any>, zh: boolean) {
  const risk = approvalRisk(payload);
  const review = payload.autoReview;
  const a = review?.assessment;
  const pick = (cn: string, en: string) => (zh ? cn : en);
  let level = risk.level;
  let label = pick('待核对操作', 'Review operation');
  let detail = pick(
    '请核对下方操作的对象、读写范围和外部影响；目前没有完整的审核结论。',
    'Check the target, read/write scope and external effects below; no complete assessment is available.',
  );
  const gaps: string[] = [];
  const failures: Record<string, [string, string, string, string]> = {
    UNSCOPED_PROCESS_TERMINATION: [
      '进程范围过宽',
      'Process scope too broad',
      '进程名或 --test 筛选不能证明进程属于本任务；应先核实本任务拥有的进程身份。',
      'A process name or --test filter does not prove task ownership. Identify task-owned processes first.',
    ],
    REVIEW_TIMEOUT: [
      '审核超时',
      'Review timed out',
      review?.failurePhase === 'queue'
        ? '审核等待模型空位超时，尚未得到模型判断。'
        : '未在审核时限内取得完整结论；这不是命令执行超时，也不表示操作已被判为高风险。',
      review?.failurePhase === 'queue'
        ? 'The review timed out waiting for model capacity; no assessment was obtained.'
        : 'No complete assessment arrived before the review deadline. This is not a command timeout or a high-risk verdict.',
    ],
    REVIEW_CANCELLED: [
      '审核中断',
      'Review interrupted',
      '审核已中断，未形成有效结论。',
      'The review was interrupted without a valid conclusion.',
    ],
    REVIEW_INVALID_RESPONSE: [
      '审核结果无效',
      'Invalid assessment',
      '审核响应未满足所需格式，无法据此自动批准。',
      'The review response did not meet the required format and cannot authorize execution.',
    ],
    REVIEW_PROVIDER_FAILED: [
      '审核连接失败',
      'Review connection failed',
      '审核服务请求失败，尚未取得有效判断。',
      'The review service request failed without a valid assessment.',
    ],
    REVIEW_PREPARATION_FAILED: [
      '审核资料准备失败',
      'Evidence preparation failed',
      '审核资料准备失败；请核对下方资料状态和操作范围。',
      'Evidence preparation failed. Check the source status and operation scope below.',
    ],
  };
  const failure = failures[review?.failureCode];
  if (failure) {
    label = pick(failure[0], failure[1]);
    detail = pick(failure[2], failure[3]);
    if (review.failureCode === 'UNSCOPED_PROCESS_TERMINATION') level = 'high';
  } else if (a) {
    level = ['low', 'medium', 'high', 'critical', 'unknown'].includes(a.risk)
      ? a.risk === 'critical'
        ? 'high'
        : a.risk
      : 'unknown';
    label = pick(
      (
        {
          low: '低风险',
          medium: '注意范围',
          high: '高风险',
          critical: '高风险',
          unknown: '影响待核实',
        } as any
      )[a.risk] || '待核对操作',
      (
        {
          low: 'Low risk',
          medium: 'Review scope',
          high: 'High risk',
          critical: 'High risk',
          unknown: 'Effects need checking',
        } as any
      )[a.risk] || 'Review operation',
    );
    detail = typeof a.reason === 'string' ? a.reason : detail;
    if (a.authorization === 'none' || a.authorization === 'unknown') {
      gaps.push(
        pick('缺少该操作与范围的明确授权。', 'Authorization for this action and scope is missing.'),
      );
      if (!['high', 'critical'].includes(a.risk))
        label = pick('需要确认授权', 'Confirm authorization');
    }
    if (a.bounded === false)
      gaps.push(pick('操作影响范围尚未界定。', 'The action scope has not been bounded.'));
    if (a.effectsKnown === false)
      gaps.push(
        pick(
          '尚未核实完整副作用；请查看审核理由和资料缺口。',
          'Full effects have not been established; see the assessment and evidence gaps.',
        ),
      );
    if (a.sensitiveData)
      gaps.push(
        pick(
          '涉及敏感资料，需要核对读取或发送范围。',
          'Sensitive data is involved; review its access or transmission scope.',
        ),
      );
    if (a.securityChange)
      gaps.push(
        pick(
          '涉及安全设置变更，需要人工核对。',
          'Security settings may change; human review is required.',
        ),
      );
  } else if (payload.forceHuman) {
    label = pick('需要人工确认', 'Human confirmation required');
    detail = pick(
      '当前规则要求人工确认；这本身不是高风险判定。',
      'The current policy requires human confirmation; this alone is not a high-risk finding.',
    );
  } else if (risk.level !== 'unknown') {
    label = pick(
      ({ low: '低风险', medium: '注意范围', high: '高风险' } as any)[risk.level],
      ({ low: 'Low risk', medium: 'Review scope', high: 'High risk' } as any)[risk.level],
    );
    detail = zh ? risk.zh : risk.reason;
  } else if (payload.command) {
    label = pick('命令影响待核对', 'Check command effects');
    detail = pick(
      '仅凭命令文本尚不能确认被调用脚本、依赖及外部影响；请核对命令和审核资料。',
      'Command text alone does not establish invoked scripts, dependencies or external effects. Review the command and evidence.',
    );
  } else if (payload.path || payload.files) {
    label = pick('核对文件改动', 'Review file changes');
    detail = pick(
      '请核对目标路径与前后差异，以及是否允许覆盖现有内容。',
      'Review target paths, before/after changes and permission to overwrite existing content.',
    );
  }
  // An assessor cannot erase a deterministic danger signal.
  if (risk.level === 'high' && !payload.forceHuman) {
    level = 'high';
    label = pick('高风险', 'High risk');
    gaps.unshift(zh ? risk.zh : risk.reason);
  }
  if (payload.forceHuman && !failure && a && !['high', 'critical'].includes(a.risk))
    label = pick('需要人工确认', 'Human confirmation required');
  for (const source of Array.isArray(review?.sourceEvidence) ? review.sourceEvidence : []) {
    if (source.status === 'unavailable')
      gaps.push(pick('未能读取：', 'Could not read: ') + source.path);
    else if (source.truncated)
      gaps.push(pick('仅审核了部分内容：', 'Only part of the source was reviewed: ') + source.path);
  }
  return { level, label, detail, gaps: [...new Set(gaps)] };
}
