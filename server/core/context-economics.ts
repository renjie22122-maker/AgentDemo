import type { Profile, Usage } from '../../shared/types.js';
export function usageCost(usage: Usage, prices: Profile['prices']): number | null {
  if (
    !usage.measured ||
    Object.values(prices).some((v) => v === null || !Number.isFinite(v) || v! < 0)
  )
    return null;
  return (
    (Math.max(0, usage.input - usage.cached) * prices.input! +
      usage.cached * prices.cached! +
      usage.output * prices.output!) /
    1e6
  );
}
export function compactionEconomics(
  before: number,
  after: number,
  summaryUsd: number | null,
  cacheRatio: number | null,
  prices: Profile['prices'],
) {
  const savedTokens = Math.max(0, before - after);
  if (summaryUsd === null || cacheRatio === null || prices.input === null || prices.cached === null)
    return {
      savedTokens,
      summaryUsd,
      breakEvenRequests: null,
      estimatedSavingPerRequestUsd: null,
      estimatedRewarmUsd: null,
    };
  const ratio = Math.max(0, Math.min(1, cacheRatio));
  const rate = (1 - ratio) * prices.input + ratio * prices.cached;
  const estimatedSavingPerRequestUsd = (savedTokens * rate) / 1e6;
  const estimatedRewarmUsd = Math.max(0, (after * ratio * (prices.input - prices.cached)) / 1e6);
  return {
    savedTokens,
    summaryUsd,
    estimatedSavingPerRequestUsd,
    estimatedRewarmUsd,
    breakEvenRequests:
      estimatedSavingPerRequestUsd > 0
        ? Math.ceil((summaryUsd + estimatedRewarmUsd) / estimatedSavingPerRequestUsd)
        : null,
  };
}
