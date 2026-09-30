import { createHash } from 'node:crypto';
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
export class ProgressMonitor {
  private samples: string[] = [];
  reset() {
    this.samples = [];
  }
  observe(calls: unknown, outcomes: string[]): boolean {
    const digest = createHash('sha256')
      .update(JSON.stringify(canonical([calls, outcomes])))
      .digest('hex');
    this.samples.push(digest);
    this.samples = this.samples.slice(-12);
    // Four identical trajectories, including ABAB and ABCABC. Changed evidence resets a cycle.
    for (let width = 1; width <= 3; width++) {
      if (this.samples.length < width * 4) continue;
      const tail = this.samples.slice(-width * 4);
      if (tail.every((value, i) => value === tail[i % width])) return true;
    }
    return false;
  }
}
