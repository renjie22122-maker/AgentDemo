export async function submitMemoryBatch<T>(
  items: T[],
  submit: (
    chunk: T[],
  ) => Promise<{
    outcomes: { id: string; ok: boolean; reason?: string }[];
    changed: number;
    failed: number;
  }>,
  onProgress: (result: {
    outcomes: { id: string; ok: boolean; reason?: string }[];
    changed: number;
    failed: number;
    processed: number;
    total: number;
  }) => void,
) {
  const aggregate = {
    outcomes: [] as { id: string; ok: boolean; reason?: string }[],
    changed: 0,
    failed: 0,
    processed: 0,
    total: items.length,
  };
  for (let offset = 0; offset < items.length; offset += 100) {
    // Sequential, bounded requests; failures stop here without replaying an unknown write.
    const result = await submit(items.slice(offset, offset + 100));
    aggregate.outcomes.push(...result.outcomes);
    aggregate.changed += result.changed;
    aggregate.failed += result.failed;
    aggregate.processed += Math.min(100, items.length - offset);
    onProgress({ ...aggregate, outcomes: [...aggregate.outcomes] });
  }
  return aggregate;
}
