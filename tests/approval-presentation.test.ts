import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalPresentation as view } from '../shared/approval-presentation.js';
import { approvalRisk } from '../shared/approval-risk.js';

const assessment = {
  risk: 'low',
  authorization: 'explicit',
  bounded: true,
  effectsKnown: true,
  sensitiveData: false,
  securityChange: false,
  reason: '只运行已核对的算术脚本。',
};
test('completed assessment replaces initial unknown label without changing enforcement', () => {
  const payload = { command: 'python check.py', autoReview: { assessment } };
  assert.equal(approvalRisk(payload).level, 'unknown');
  assert.equal(view(payload, true).label, '低风险');
  assert.equal(view(payload, true).detail, assessment.reason);
});
test('review failures distinguish capacity, provider and response from action danger', () => {
  for (const code of [
    'REVIEW_TIMEOUT',
    'REVIEW_CANCELLED',
    'REVIEW_PROVIDER_FAILED',
    'REVIEW_INVALID_RESPONSE',
    'REVIEW_PREPARATION_FAILED',
  ]) {
    const v = view({ command: 'python check.py', autoReview: { failureCode: code } }, true);
    assert.notEqual(v.label, '风险未明');
    assert.notEqual(v.level, 'high');
  }
  assert.match(
    view({ autoReview: { failureCode: 'REVIEW_TIMEOUT', failurePhase: 'queue' } }, true).detail,
    /模型空位/,
  );
  assert.equal(
    view({ autoReview: { failureCode: 'REVIEW_TIMEOUT' } }, false).label,
    'Review timed out',
  );
});
test('broad process termination names missing ownership evidence', () => {
  const v = view({ autoReview: { failureCode: 'UNSCOPED_PROCESS_TERMINATION' } }, true);
  assert.equal(v.level, 'high');
  assert.match(v.detail, /属于本任务/);
});
test('missing authorization and incomplete sources are explicit', () => {
  const v = view(
    {
      autoReview: {
        assessment: {
          ...assessment,
          authorization: 'unknown',
          bounded: false,
          effectsKnown: false,
        },
        sourceEvidence: [
          { path: '@0/main.py', status: 'unavailable' },
          { path: '@0/test.py', status: 'read', truncated: true },
        ],
      },
    },
    true,
  );
  assert.equal(v.label, '需要确认授权');
  assert.equal(v.gaps.length, 5);
  assert.ok(v.gaps.some((s) => s.includes('@0/main.py')));
});
test('model cannot downgrade destructive command or erase mandatory human confirmation', () => {
  assert.equal(view({ command: 'git push', autoReview: { assessment } }, true).level, 'high');
  assert.equal(view({ forceHuman: true, autoReview: { assessment } }, true).label, '需要人工确认');
  assert.equal(
    view({ autoReview: { assessment: { ...assessment, risk: 'critical' } } }, true).level,
    'high',
  );
});
test('manual and legacy requests get concrete prompts rather than invented findings', () => {
  assert.equal(
    view({ command: 'python task.py', risk: { level: 'unknown' } }, true).label,
    '命令影响待核对',
  );
  assert.equal(view({ path: 'README.md' }, true).label, '核对文件改动');
  assert.equal(view({}, false).label, 'Review operation');
});
