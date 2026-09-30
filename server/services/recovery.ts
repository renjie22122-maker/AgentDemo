import type { Store } from '../storage/store.js';
import type { FileScope } from './paths.js';
export async function inspectEffects(store: Store, files: FileScope, conversationId: string) {
  const resolved = store.reconcileKnownEffects(conversationId);
  for (const effect of store.unknownEffects(conversationId)) {
    if (effect.tool !== 'write_file') continue;
    try {
      const args = JSON.parse(effect.args);
      if (typeof args.path !== 'string' || typeof args.content !== 'string') continue;
      if ((await files.read(args.path, 1000000)) === args.content) {
        store.resolveEffect(
          effect.id,
          'Automatic read-only check: current file exactly matches requested complete content. No replay performed.',
        );
        resolved.push(effect.id);
      }
    } catch {
      /* Missing, changed or inaccessible files remain uncertain. */
    }
  }
  return {
    resolved,
    unresolved: store
      .unknownEffects(conversationId)
      .map((e) => ({ id: e.id, tool: e.tool, args: JSON.parse(e.args) })),
  };
}
