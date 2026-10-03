import { cognitivePolicy, initialCognitiveState } from '../server/core/cognitive-policy.js';
export class ProgressMonitor {
  private state = initialCognitiveState();
  reset() {
    this.state = initialCognitiveState();
  }
  intervene(calls: unknown, outputs: string[]) {
    const d = cognitivePolicy(this.state, { calls, outputs, tasks: [] });
    this.state = d.state;
    return d.action === 'stop' ? 'stop' : d.action === 'change-strategy' ? 'warn' : 'none';
  }
  observe(calls: unknown, outputs: string[]) {
    return this.intervene(calls, outputs) !== 'none';
  }
}
