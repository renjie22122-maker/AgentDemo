import { prepareCoordination } from '../services/coordination-journal.js';
import { stamp } from '../services/verification.js';
import { TaskBoard } from '../services/task-board.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Run, ToolCall } from '../../shared/types.js';
import type { ToolContext, ToolRegistry } from '../tools/registry.js';
import { Store, id } from '../storage/store.js';
import { abortError, errorMessage, NotStartedError } from './errors.js';
import { executeBatch } from './tool-batch.js';
export class ToolExecutor {
  constructor(
    private store: Store,
    private registry: ToolRegistry,
    private directory: string,
  ) {}
  async batch(run: Run, calls: ToolCall[], ctx: ToolContext): Promise<string[]> {
    const observations = new Map<string, unknown>();
    const images = new Map<string, string[]>();
    return executeBatch(
      calls,
      (name) => this.registry.parallelSafe(name),
      async (call) => {
        const paths = new TaskBoard(this.store).get(run).tasks.flatMap((t) => t.artifacts || []);
        const observe = paths.length && ['read_file', 'run_command'].includes(call.name);
        const before = observe ? await stamp(ctx.files, paths) : undefined;
        const output = await this.invoke(run, call, ctx, images);
        const after = observe ? await stamp(ctx.files, paths) : undefined;
        let passed = call.name === 'read_file' && !output.startsWith('Tool error:');
        if (call.name === 'run_command')
          try {
            const parsed = JSON.parse(output);
            passed = parsed.code === 0 && !parsed.timedOut && !parsed.aborted;
          } catch {
            passed = false;
          }
        const checkedPaths: string[] = [];
        if (observe)
          for (const path of paths) {
            if (call.name === 'run_command') checkedPaths.push(path);
            else
              try {
                if (
                  (await ctx.files.resolve(path)) ===
                  (await ctx.files.resolve(String(call.arguments.path)))
                )
                  checkedPaths.push(path);
              } catch {}
          }
        if (observe) observations.set(call.id, { before, after, passed, checkedPaths });
        return output;
      },
      (call, output) => {
        run.status = 'running';
        run.checkpoints.push({
          role: 'tool',
          callId: call.id,
          content: output,
          ...(images.has(call.id) ? { images: images.get(call.id) } : {}),
        });
        this.store.put('run', run);
        this.store.event(run.conversationId, run.id, 'tool.completed', {
          callId: call.id,
          name: call.name,
          output,
          verification: observations.get(call.id),
        });
      },
      ctx.signal,
    );
  }
  private async invoke(
    run: Run,
    call: ToolCall,
    ctx: ToolContext,
    images: Map<string, string[]>,
  ): Promise<string> {
    const signal = ctx.signal;
    if (signal.aborted) throw abortError();
    this.store.transaction(() => {
      const mode = this.registry.coordinationMode(call.name);
      if (mode)
        prepareCoordination(this.store, run, call.id, call.name, call.arguments, mode === 'atomic');
      this.store.event(run.conversationId, run.id, 'tool.started', {
        callId: call.id,
        name: call.name,
        arguments: call.arguments,
      });
    });
    const effect = this.registry.effect(call.name);
    let effectId: string | undefined;
    // Persist intent before side effects. Unknown outcomes remain visible after crashes.
    if (effect === 'write') effectId = this.store.beginEffect(run.id, call.name, call.arguments);
    let output: string;
    try {
      const result = await this.registry.invoke(call.name, call.arguments, {
        ...ctx,
        callId: call.id,
        beforeExecution: () => {
          if (!effectId) effectId = this.store.beginEffect(run.id, call.name, call.arguments);
        },
      });
      output = result.content;
      if (result.images?.length) images.set(call.id, result.images);
      if (effectId) this.store.endEffect(effectId, output.slice(0, 20000));
    } catch (error) {
      output = 'Tool error: ' + errorMessage(error);
      if (effectId && error instanceof NotStartedError)
        this.store.endEffect(effectId, output, 'not_started');
      else if (effectId && !signal.aborted)
        this.store.event(run.conversationId, run.id, 'effect.unknown', {
          effectId,
          tool: call.name,
          reason: output,
        });
      if (signal.aborted) throw error;
    }
    if (output.length > 24000) {
      const folder = join(this.directory, 'spills', run.conversationId);
      await mkdir(folder, { recursive: true });
      const spill = id();
      await writeFile(join(folder, spill + '.txt'), output);
      this.store.put('spill', {
        id: spill,
        conversationId: run.conversationId,
        text: output,
      });
      output =
        output.slice(0, 18000) +
        '\n[Output truncated. Spill ID: ' +
        spill +
        '. Ask for a narrower read rather than repeating the entire output.]';
    }
    return output;
  }
}
