import { matchesGlob, relative } from 'node:path';
import type { ToolContext } from '../tools/registry.js';
import { NotStartedError } from '../core/errors.js';
import { executionSettings } from '../../shared/execution.js';
import type { ActionRule } from '../../shared/types.js';
export async function matchingRules(ctx: ToolContext, name: string, args: Record<string, any>) {
  const matches: ActionRule[] = [];
  for (const rule of ctx.config.get().actionRules || []) {
    if (
      !rule.enabled ||
      (rule.tool !== '*' && rule.tool !== name) ||
      (rule.projectId && rule.projectId !== ctx.conversation.projectId)
    )
      continue;
    if (rule.commandEquals !== undefined && args.command !== rule.commandEquals) continue;
    if (
      rule.backend &&
      rule.backend !== executionSettings(ctx.config.get(), ctx.conversation).commandBackend
    )
      continue;
    if (rule.pathGlob) {
      const paths =
        args.files?.map((f: any) => f.path) || (typeof args.path === 'string' ? [args.path] : []);
      let found = false;
      for (const p of paths) {
        const resolved = await ctx.files.resolve(p, true);
        for (const root of ctx.files.roots) {
          const rel = relative(root, resolved).replaceAll('\\', '/');
          if (!rel.startsWith('../') && matchesGlob(rel.toLowerCase(), rule.pathGlob.toLowerCase()))
            found = true;
        }
      }
      if (!found) continue;
    }
    matches.push(rule);
  }
  return matches;
}
export async function enforceActionPolicy(
  ctx: ToolContext,
  name: string,
  args: Record<string, any>,
) {
  const rules = await matchingRules(ctx, name, args);
  if (!rules.length) return;
  const denied = rules.find((r) => r.decision === 'deny');
  ctx.store.event(ctx.run.conversationId, ctx.run.id, 'policy.decision', {
    tool: name,
    decision: denied ? 'deny' : 'ask',
    ruleIds: rules.map((r) => r.id),
    reasons: rules.map((r) => r.reason),
  });
  if (denied) throw new NotStartedError('POLICY_DENIED', denied.reason);
  await ctx.inputs.request(
    ctx.run,
    'approval',
    {
      action: 'policy-review',
      forceManual: true,
      tool: name,
      arguments: args,
      reason: rules.map((r) => r.reason).join('; '),
    },
    ctx.signal,
  );
  const current = { ...ctx, conversation: ctx.store.get<any>('conversation', ctx.conversation.id) };
  if (
    current.conversation.permission !== ctx.conversation.permission ||
    current.conversation.projectId !== ctx.conversation.projectId
  )
    throw new NotStartedError('POLICY_CHANGED', 'Conversation permissions changed.');
  const after = await matchingRules(current, name, args);
  if (JSON.stringify(after) !== JSON.stringify(rules))
    throw new NotStartedError('POLICY_CHANGED', 'Action policy changed during approval.');
}
