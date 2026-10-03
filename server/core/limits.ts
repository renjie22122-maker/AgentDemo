/** Persist zero; normalize only at scheduling/comparison boundaries. */
export function configuredLimit(value: number): number {
  return value === 0 ? Number.POSITIVE_INFINITY : value;
}
