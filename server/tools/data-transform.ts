import { z } from 'zod';
import type { ToolRegistry } from './registry.js';
import { NotStartedError } from '../core/errors.js';
const bad = new Set(['__proto__', 'constructor', 'prototype']);
function field(value: any, path: string) {
  for (const key of path.split('.')) {
    if (bad.has(key) || !value || !Object.hasOwn(value, key))
      throw new NotStartedError('DATA_FIELD', 'Missing or unsafe field: ' + path);
    value = value[key];
  }
  return value;
}
export function transformData(input: unknown[], operation: string, path?: string, value?: unknown) {
  if (input.length > 1000 || JSON.stringify(input).length > 1000000)
    throw new NotStartedError('DATA_LIMIT', 'At most 1000 items and 1 MB.');
  const get = (x: any) => (path ? field(x, path) : x);
  switch (operation) {
    case 'count':
      return input.length;
    case 'pluck':
      return input.map(get);
    case 'filterEquals':
      return input.filter((x) => JSON.stringify(get(x)) === JSON.stringify(value));
    case 'unique':
      return [...new Map(input.map((x) => [JSON.stringify(get(x)), x])).values()];
    case 'sum': {
      const nums = input.map(get);
      if (nums.some((n) => typeof n !== 'number' || !Number.isFinite(n)))
        throw new NotStartedError('DATA_NUMBER', 'sum requires finite numbers.');
      const sum = nums.reduce((a, b) => a + b, 0);
      if (!Number.isFinite(sum)) throw new NotStartedError('DATA_NUMBER', 'Sum overflow.');
      return sum;
    }
    default:
      throw new NotStartedError('DATA_OPERATION', 'Unknown transform.');
  }
}
export function installDataTransform(registry: ToolRegistry) {
  registry.add({
    name: 'transform_data',
    effect: 'read',
    parallelSafe: true,
    description:
      'Bounded data-only aggregation for tool_workflow references: count, pluck, filterEquals, unique, sum. No executable expressions, file access or network. field is an optional own-property dotted path.',
    schema: z.object({
      items: z.array(z.unknown()).max(1000),
      operation: z.enum(['count', 'pluck', 'filterEquals', 'unique', 'sum']),
      field: z.string().max(200).optional(),
      value: z.unknown().optional(),
    }),
    run: (a) => ({
      content: JSON.stringify({ result: transformData(a.items, a.operation, a.field, a.value) }),
    }),
  });
}
