export interface PlanningCase {
  id: string;
  split: 'development' | 'holdout';
  brief: string;
  tasks: string[];
  edges: [string, string][];
  readOnly: boolean;
}
const c = (
  id: string,
  split: PlanningCase['split'],
  brief: string,
  tasks: string[],
  edges: [string, string][],
  readOnly = false,
): PlanningCase => ({ id, split, brief, tasks, edges, readOnly });
export const cases: PlanningCase[] = [
  c(
    'schema-api-ui',
    'development',
    'Migrate the schema. The API consumes the new schema. Build the frontend mock independently against an already frozen contract. Integration uses migrated schema, API, frontend.',
    ['schema', 'api', 'frontend', 'integration'],
    [
      ['schema', 'api'],
      ['schema', 'integration'],
      ['api', 'integration'],
      ['frontend', 'integration'],
    ],
  ),
  c(
    'independent-audits',
    'development',
    'Inspect authentication and billing independently, then combine findings into an in-chat review. Do not implement changes or write files.',
    ['auth', 'billing', 'report'],
    [
      ['auth', 'report'],
      ['billing', 'report'],
    ],
    true,
  ),
  c(
    'shared-file',
    'development',
    'Two separately requested changes to the same config file must occur in order: update defaults first, then validation. Documentation uses an already provided specification and is independent. Final checks consume both code changes and docs.',
    ['defaults', 'validation', 'docs', 'checks'],
    [
      ['defaults', 'validation'],
      ['validation', 'checks'],
      ['docs', 'checks'],
    ],
  ),
  c(
    'readonly-scope',
    'development',
    'Read existing source and existing tests independently. Summarize their discrepancies in chat. No new tests, code, or report files may be written.',
    ['source', 'tests', 'summary'],
    [
      ['source', 'summary'],
      ['tests', 'summary'],
    ],
    true,
  ),
  c(
    'contract-no-chain',
    'development',
    'Publish a type contract, then implement two independent clients consuming it. Compatibility checks require both clients.',
    ['types', 'client_a', 'client_b', 'compatibility'],
    [
      ['types', 'client_a'],
      ['types', 'client_b'],
      ['client_a', 'compatibility'],
      ['client_b', 'compatibility'],
    ],
  ),
  c(
    'localization-release',
    'holdout',
    'Translate the fixed English source into Japanese and German independently. Accessibility work uses the unchanged English build and is independent. Release assembly needs both translations and accessibility changes.',
    ['ja', 'de', 'a11y', 'release'],
    [
      ['ja', 'release'],
      ['de', 'release'],
      ['a11y', 'release'],
    ],
  ),
  c(
    'offline-report',
    'holdout',
    'Read the supplied incident log and existing runbook independently. Compare them, then give recommendations in chat only. No commands, file edits or new report files.',
    ['logs', 'runbook', 'comparison', 'advice'],
    [
      ['logs', 'comparison'],
      ['runbook', 'comparison'],
      ['comparison', 'advice'],
    ],
    true,
  ),
  c(
    'schema-two-consumers',
    'holdout',
    'Freeze the event schema. Producer and consumer implementations each require it, but neither requires the other. End-to-end validation needs both.',
    ['schema', 'producer', 'consumer', 'e2e'],
    [
      ['schema', 'producer'],
      ['schema', 'consumer'],
      ['producer', 'e2e'],
      ['consumer', 'e2e'],
    ],
  ),
  c(
    'data-analysis',
    'holdout',
    'Inspect data column definitions first. Separately analyze values using those definitions and review privacy using those definitions. The final in-chat assessment combines both. Read-only throughout.',
    ['definitions', 'values', 'privacy', 'assessment'],
    [
      ['definitions', 'values'],
      ['definitions', 'privacy'],
      ['values', 'assessment'],
      ['privacy', 'assessment'],
    ],
    true,
  ),
  c(
    'parallel-assets',
    'holdout',
    'Create the illustration and soundtrack independently from a frozen creative brief. Storyboard is also independent. Assemble the presentation from all three.',
    ['illustration', 'soundtrack', 'storyboard', 'presentation'],
    [
      ['illustration', 'presentation'],
      ['soundtrack', 'presentation'],
      ['storyboard', 'presentation'],
    ],
  ),
  c(
    'repro-fix',
    'holdout',
    'Reproduce the bug, then fix it, then check the fix. Documentation spelling corrections are independent and can start immediately.',
    ['repro', 'fix', 'check', 'spelling'],
    [
      ['repro', 'fix'],
      ['fix', 'check'],
    ],
  ),
  c(
    'sdk-release',
    'holdout',
    'Generate client SDK from an existing frozen specification. Draft release notes independently using the supplied change list. Package both only after ABI validation of the generated SDK.',
    ['sdk', 'notes', 'abi', 'package'],
    [
      ['sdk', 'abi'],
      ['abi', 'package'],
      ['notes', 'package'],
    ],
  ),
  c(
    'rename-sequence',
    'holdout',
    'Rename the public symbol, then migrate callers, then run checks. A security policy review is independent of the rename and is not a prerequisite for those checks.',
    ['rename', 'callers', 'checks', 'security'],
    [
      ['rename', 'callers'],
      ['callers', 'checks'],
    ],
  ),
  c(
    'research-comparison',
    'holdout',
    'Independently read supplied option A and B documentation, then compare, then recommend in chat. No purchasing, installations, implementation, or file writes.',
    ['option_a', 'option_b', 'compare', 'recommend'],
    [
      ['option_a', 'compare'],
      ['option_b', 'compare'],
      ['compare', 'recommend'],
    ],
    true,
  ),
  c(
    'three-branches',
    'holdout',
    'Build a common parser. Formatter and linter each depend on it and can proceed independently. Integration tests require formatter and linter. Documentation can start now from the provided spec; integration tests do not consume documentation.',
    ['parser', 'formatter', 'linter', 'integration', 'docs'],
    [
      ['parser', 'formatter'],
      ['parser', 'linter'],
      ['formatter', 'integration'],
      ['linter', 'integration'],
    ],
  ),
];
