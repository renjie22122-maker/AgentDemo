import { NotStartedError } from '../core/errors.js';
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
/** Data-only references. Never evaluates source or follows object prototypes. */
export function workflowValue(value: unknown, results: unknown[], item?: unknown, depth = 0): any {
  if (depth > 24) throw new NotStartedError('WORKFLOW_DEPTH', 'Workflow data nesting exceeded 24.');
  if (Array.isArray(value)) return value.map((v) => workflowValue(v, results, item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length === 1 && typeof record.$ref === 'string') {
    const parts = record.$ref.split('.');
    let selected: any;
    if (parts[0] === 'item') {
      selected = item;
      parts.shift();
    } else {
      const first = parts.shift()!;
      if (!/^(0|[1-9][0-9]*)$/.test(first) || Number(first) >= results.length)
        throw new NotStartedError(
          'WORKFLOW_REFERENCE',
          'References must target an earlier completed step.',
        );
      selected = results[Number(first)];
    }
    for (const part of parts) {
      if (forbidden.has(part) || !selected || !Object.prototype.hasOwnProperty.call(selected, part))
        throw new NotStartedError('WORKFLOW_REFERENCE', 'Unknown or unsafe result property.');
      selected = selected[part];
    }
    if (selected === undefined)
      throw new NotStartedError('WORKFLOW_REFERENCE', 'Reference has no value.');
    return structuredClone(selected);
  }
  const output: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(record)) {
    if (forbidden.has(key)) throw new NotStartedError('WORKFLOW_REFERENCE', 'Unsafe data key.');
    output[key] = workflowValue(v, results, item, depth + 1);
  }
  return output;
}
export function workflowObservation(result: any) {
  let data: unknown;
  try {
    data = JSON.parse(result.content);
  } catch {
    data = result.content;
  }
  return { ...result, data };
}
