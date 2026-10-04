import type { ToolHook } from '../../shared/types.js';
import type { ToolContext } from '../tools/registry.js';
import { NotStartedError } from '../core/errors.js';
export async function toolHooks(
  c: Pick<
    ToolContext,
    'config' | 'store' | 'run' | 'conversation' | 'invokeHook' | 'disabledHookIds'
  >,
  stage: ToolHook['stage'],
  name: string,
) {
  for (const h of c.config.get().hooks || []) {
    if (
      !h.enabled ||
      c.disabledHookIds?.includes(h.id) ||
      h.stage !== stage ||
      (h.tool !== '*' && h.tool !== name) ||
      (h.projectId && h.projectId !== c.conversation.projectId)
    )
      continue;
    c.store.event(c.run.conversationId, c.run.id, 'tool.hook', {
      hookId: h.id,
      stage,
      tool: name,
      action: h.action,
      message: h.message,
    });
    if (h.action === 'deny') throw new NotStartedError('HOOK_DENIED', h.message);
    if (h.action === 'command') {
      if (!c.invokeHook || !h.command)
        throw new NotStartedError(
          'HOOK_EXECUTION_UNAVAILABLE',
          'This hook needs an audited tool execution context.',
        );
      await c.invokeHook(h.id, h.command, h.timeoutSeconds || 60);
    }
  }
}

export function memoryHooks(
  store: ToolContext['store'],
  config: ToolContext['config'],
  stage: 'beforeMemoryWrite' | 'afterMemoryWrite',
  memory: { id: string; scope: string },
) {
  for (const h of config.get().hooks || []) {
    if (
      !h.enabled ||
      h.stage !== stage ||
      !['*', 'memory'].includes(h.tool) ||
      (h.projectId && memory.scope !== 'project:' + h.projectId)
    )
      continue;
    if (h.action === 'deny') throw new NotStartedError('HOOK_DENIED', h.message);
    store.put('hook-observation', {
      id: crypto.randomUUID(),
      hookId: h.id,
      stage,
      scope: memory.scope,
      memoryId: memory.id,
      message: h.message,
      createdAt: Date.now(),
    });
  }
}
