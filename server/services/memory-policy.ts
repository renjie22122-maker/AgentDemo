import type { Conversation } from '../../shared/types.js';
import { Store } from '../storage/store.js';
import { Configuration } from './settings.js';
export const chatMemoryScope = (c: Pick<Conversation, 'projectId'>) =>
  c.projectId ? 'project:' + c.projectId : 'user';
export function inheritedMemory(
  store: Store,
  config: Configuration,
  c: Pick<Conversation, 'projectId' | 'profileId'>,
) {
  const policy = store.maybe<any>('memory-policy', chatMemoryScope(c));
  const profile = config.get().profiles.find((p) => p.id === c.profileId);
  const target = profile ? profile.id + '|' + profile.baseUrl : '';
  const enabled = !!(policy?.enabled && policy.targets?.includes(target));
  return {
    memoryPolicy: 'inherit' as const,
    automaticMemory: enabled,
    generateMemory: enabled,
    memory: enabled,
    includeUserMemory: false,
    memoryGenerationTarget: enabled ? target : undefined,
  };
}
