import { normalizeImage } from '../services/images.js';
import { matchModel } from '../../shared/model-metadata.js';
import { automationInput } from '../services/team-automation.js';
import type { Run } from '../../shared/types.js';
import { Teams } from '../services/team-space.js';
import { rootRun, TaskBoard } from '../services/task-board.js';
import { inspectEffects } from '../services/recovery.js';
import { execute as executeCommand } from '../services/process.js';
import { inspectionRoutes } from './inspection.js';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import Fastify from 'fastify';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { z } from 'zod';
import type { Attachment, Conversation, Memory, Project, Skill } from '../../shared/types.js';
import { AppError, assert, errorMessage } from '../core/errors.js';
import { terminal } from '../core/lifecycle.js';
import { Runtime } from '../core/runtime.js';
import { discoverModels, providerFor } from '../providers/registry.js';
import { extract } from '../services/documents.js';
import { pickFolder } from '../services/folder-picker.js';
import { validateRoots } from '../services/paths.js';
import { Configuration, profileSchema } from '../services/settings.js';
import { Skills } from '../services/skills.js';
import { Store, id } from '../storage/store.js';
export async function createApp(options: { directory: string; dist?: string; runtime?: Runtime }) {
  const directory = resolve(options.directory);
  await mkdir(directory, { recursive: true });
  const config = options.runtime?.config || new Configuration(join(directory, 'settings.json'));
  const store = options.runtime?.store || new Store(join(directory, 'agent.sqlite'));
  if (!options.runtime) store.recover();
  const runtime = options.runtime || new Runtime(store, config, directory),
    skills = new Skills(store);
  runtime.startTeamMaintenance();
  const app = Fastify({ logger: false, bodyLimit: 8 * 1024 * 1024 });
  const cookie = randomBytes(32).toString('hex'),
    csrf = randomBytes(32).toString('hex');
  app.setErrorHandler((error, _request, reply) => {
    const code = error instanceof AppError ? error.status : error instanceof z.ZodError ? 400 : 500;
    reply.code(code).send({
      error:
        error instanceof z.ZodError
          ? error.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; ')
          : errorMessage(error),
    });
  });
  app.addHook('onRequest', async (req, reply) => {
    const host = req.headers.host || '';
    assert(
      /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host),
      'HOST_DENIED',
      'Loopback host required.',
      403,
    );
    const origin = req.headers.origin;
    if (origin) {
      const u = new URL(origin);
      assert(
        ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname),
        'ORIGIN_DENIED',
        'Cross-origin request denied.',
        403,
      );
    }
    reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'no-referrer')
      .header('X-Frame-Options', 'DENY');
    if (!req.url.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    if (req.url === '/api/bootstrap' || req.url === '/api/health') return;
    const candidate = (req.headers.cookie || '')
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('agentdemo='))
      ?.slice(10);
    assert(candidate === cookie, 'LOGIN_REQUIRED', 'Reload AgentDemo in the local browser.', 401);
    if (!['GET', 'HEAD'].includes(req.method))
      assert(
        req.headers['x-csrf-token'] === csrf,
        'CSRF_DENIED',
        'Reload the page before making changes.',
        403,
      );
  });
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
  app.get('/api/health', async () => ({ application: 'AgentDemo', version: '0.1.0', ready: true }));
  app.get('/api/bootstrap', async (req, reply) => {
    const origin = req.headers.origin;
    assert(
      !origin || ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname),
      'ORIGIN_DENIED',
      'Local browser required.',
      403,
    );
    reply.header('Set-Cookie', 'agentdemo=' + cookie + '; HttpOnly; SameSite=Strict; Path=/');
    return { csrf, version: '0.1.0', settings: config.public() };
  });
  const state = () => ({
    pendingInputs: store
      .list<any>('input')
      .filter((q) => q.status === 'pending')
      .map((q) => ({
        ...q,
        title: store.get<Conversation>('conversation', q.conversationId)?.title,
      })),
    conversations: store.conversations(),
    projects: store.list('project'),
    runs: store.runs().map(({ checkpoints, ...r }) => r),
    skills: store.list<Skill>('skill').map(({ content, source, ...s }) => s),
    memories: store.list('memory'),
    documents: store.list('document'),
    settings: config.public(),
  });
  app.get('/api/state', async () => state());
  app.get<{ Params: { id: string } }>('/api/conversations/:id', async (req) => {
    const c = store.get<Conversation>('conversation', req.params.id);
    return {
      conversation: c,
      events: store.events(c.id),
      inputs: store.list<any>('input').filter((q) => q.conversationId === c.id),
      attachments: store
        .list<Attachment>('attachment')
        .filter((a) => a.conversationId === c.id)
        .map(({ path, text, ...a }) => a),
      teamAutomation: store.runs(c.id).at(-1)
        ? store.maybe('team-automation', rootRun(store, store.runs(c.id).at(-1)!))
        : null,
      teamRecovery: store.runs(c.id).at(-1)
        ? (new Teams(store).get(store.runs(c.id).at(-1)!)?.members || []).map((key) =>
            runtime.teamAutomation.plan(store.get<Run>('run', key)),
          )
        : [],
      teamControlEvents: store.runs(c.id).at(-1)
        ? store
            .list<any>('team-control-event')
            .filter((e) => e.root === rootRun(store, store.runs(c.id).at(-1)!))
            .slice(-20)
        : [],
      teamSpace: store.runs(c.id).at(-1)
        ? new Teams(store).project(store.runs(c.id).at(-1)!)
        : null,
      teamMembers: store.runs(c.id).at(-1)
        ? new TaskBoard(store).members(store.runs(c.id).at(-1)!)
        : [],
      teamScheduling: store.runs(c.id).at(-1)
        ? store.maybe('team-scheduling', rootRun(store, store.runs(c.id).at(-1)!))
        : null,
      taskBoard: store.runs(c.id).at(-1)
        ? new TaskBoard(store).get(store.runs(c.id).at(-1)!)
        : null,
      unknownEffects: store.unknownEffects(c.id),
      streams: [...runtime.streams.entries()]
        .filter(([, v]) => v.conversationId === c.id)
        .map(([runId, v]) => ({ runId, ...v })),
    };
  });
  inspectionRoutes(app, runtime);
  app.post<{ Params: { id: string } }>('/api/conversations/:id/recovery/check', async (req) => {
    const c = store.get<Conversation>('conversation', req.params.id);
    return inspectEffects(store, await runtime.filesForConversation(c), c.id);
  });

  app.post('/api/conversations', async (req) => {
    const data = z
      .object({
        projectId: z.string().nullable().default(null),
        title: z.string().max(120).default('New chat'),
        profileId: z.string().optional(),
      })
      .parse(req.body);
    if (data.projectId) store.get('project', data.projectId);
    const now = Date.now();
    const c: Conversation = {
      id: id(),
      title: data.title,
      projectId: data.projectId,
      profileId: data.profileId || config.get().defaultProfileId,
      reasoning: 'auto',
      permission: 'ask',
      createdAt: now,
      updatedAt: now,
      pinned: false,
      archived: false,
      parentId: null,
      forkEvent: null,
      skillIds: [],
      knowledge: true,
      memory: true,
    };
    return store.put('conversation', c);
  });
  app.patch<{ Params: { id: string } }>('/api/conversations/:id', async (req) => {
    const c = store.get<Conversation>('conversation', req.params.id);
    const data = z
      .object({
        title: z.string().min(1).max(120).optional(),
        pinned: z.boolean().optional(),
        archived: z.boolean().optional(),
        profileId: z.string().optional(),
        reasoning: z.enum(['auto', 'none', 'low', 'medium', 'high', 'max']).optional(),
        permission: z.enum(['read-only', 'ask', 'trusted']).optional(),
        teamMode: z.enum(['hierarchy', 'host', 'creative']).optional(),
        teamStrategy: z.enum(['off', 'auto', 'prefer']).optional(),
        skillIds: z.array(z.string()).max(30).optional(),
        knowledge: z.boolean().optional(),
        memory: z.boolean().optional(),
      })
      .parse(req.body);
    if (runtime.active(c.id))
      assert(
        Object.keys(data).every((k) => ['title', 'pinned'].includes(k)),
        'RUN_ACTIVE',
        'Stop the current run before changing its configuration.',
        409,
      );
    if (data.profileId) config.profile(data.profileId);
    if (data.skillIds) for (const key of data.skillIds) store.get('skill', key);
    return store.put('conversation', { ...c, ...data, updatedAt: Date.now() });
  });
  app.post<{ Params: { id: string } }>('/api/conversations/:id/fork', async (req) => {
    const c = store.get<Conversation>('conversation', req.params.id),
      { eventId } = z.object({ eventId: z.number().int().min(1) }).parse(req.body);
    const events = store.events(c.id);
    assert(
      events.some((e) => e.id === eventId && e.type === 'assistant.message'),
      'FORK_BOUNDARY',
      'Choose a completed assistant message.',
    );
    const now = Date.now(),
      fork = {
        ...c,
        id: id(),
        title: c.title + ' 路 branch',
        parentId: c.id,
        forkEvent: eventId,
        pinned: false,
        archived: false,
        createdAt: now,
        updatedAt: now,
      };
    store.put('conversation', fork);
    const messages = [];
    for (const e of events.filter(
      (e) => e.id <= eventId && ['user.message', 'assistant.message'].includes(e.type),
    )) {
      store.event(fork.id, null, e.type, e.data);
      messages.push({
        role: e.type === 'user.message' ? 'user' : 'assistant',
        content: e.data.text,
      });
    }
    const template = store.runs(c.id).at(-1);
    if (template)
      store.put('run', {
        ...template,
        id: id(),
        conversationId: fork.id,
        parentRunId: null,
        depth: 0,
        status: 'completed',
        checkpoints: messages,
        createdAt: now,
        updatedAt: now,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        modelCalls: 0,
        estimatedUsd: null,
      });
    // Chat branches share project files; they are not Git worktrees or file snapshots.
    return fork;
  });
  app.post<{ Params: { id: string } }>('/api/conversations/:id/message', async (req) => {
    const data = z
      .object({
        text: z.string().trim().min(1).max(100000),
        maxSteps: z.number().int().min(0).max(10000).default(0),
      })
      .parse(req.body);
    if (runtime.active(req.params.id)) {
      runtime.steer(req.params.id, data.text);
      return { queued: true };
    }
    return runtime.start(req.params.id, data.text, data.maxSteps);
  });
  app.post<{ Params: { id: string } }>('/api/runs/:id/stop', async (req) => {
    runtime.stop(req.params.id);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>('/api/runs/:id/team-automation', async (req) => {
    return runtime.teamAutomation.configure(
      store.get<Run>('run', req.params.id),
      automationInput.parse(req.body),
    );
  });
  app.post<{ Params: { id: string } }>('/api/runs/:id/team-recovery-check', async (req) => {
    const run = store.get<Run>('run', req.params.id);
    await inspectEffects(
      store,
      await runtime.filesForConversation(
        store.get<Conversation>('conversation', run.conversationId),
      ),
      run.conversationId,
    );
    return runtime.teamAutomation.plan(run);
  });
  app.post<{ Params: { id: string } }>('/api/runs/:id/team-recover', async (req) => {
    const run = store.get<Run>('run', req.params.id);
    const c = store.get<Conversation>('conversation', run.conversationId);
    await inspectEffects(store, await runtime.filesForConversation(c), run.conversationId);
    return runtime.teamAutomation.recover(run);
  });
  app.post<{ Params: { id: string } }>('/api/runs/:id/stop-team', async (req) => {
    runtime.stopTeam(req.params.id);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>('/api/runs/:id/team-role', async (req) => {
    const a = z
      .object({
        role: z.enum(['coordinator', 'planner', 'reviewer', 'summarizer']),
        targetRunId: z.string(),
        revision: z.number().int(),
      })
      .parse(req.body);
    const service = new Teams(store),
      team = service.get(store.get<Run>('run', req.params.id));
    assert(team, 'TEAM_MISSING', 'No team.');
    return service.handoff(
      store.get<Run>('run', team.roles[a.role]),
      a.role,
      a.targetRunId,
      a.revision,
      'Explicit user transfer from team panel.',
    );
  });
  app.post<{ Params: { id: string } }>('/api/runs/:id/stop-member', async (req) => {
    runtime.stop(req.params.id, false);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>('/api/inputs/:id', async (req) => {
    const data = z.object({ answer: z.string().max(12000), allow: z.boolean() }).parse(req.body);
    runtime.inputs.answer(req.params.id, data.answer, data.allow);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>('/api/effects/:id/allow-retry', async (req) => {
    const effect = store.db
      .prepare("SELECT * FROM effects WHERE id=? AND state='started'")
      .get(req.params.id) as any;
    assert(effect, 'EFFECT_NOT_PENDING', 'Operation is no longer awaiting a decision.', 409);
    const run = store.get<any>('run', effect.run_id);
    assert(
      !runtime.active(run.conversationId),
      'RUN_ACTIVE',
      'Wait for the active run to finish.',
      409,
    );
    store.endEffect(
      effect.id,
      'User explicitly permits another attempt. Prior outcome remains unknown; no command was replayed by this action.',
      'retry_authorized',
    );
    store.event(run.conversationId, run.id, 'effect.retry-authorized', {
      effectId: effect.id,
      tool: effect.tool,
      args: JSON.parse(effect.args),
    });
    return { ok: true, executed: false };
  });
  app.post<{ Params: { id: string } }>('/api/effects/:id/resolve', async (req) => {
    const { note } = z.object({ note: z.string().trim().min(5).max(4000) }).parse(req.body);
    store.resolveEffect(req.params.id, note);
    return { ok: true };
  });
  app.post('/api/feedback', async (req) => {
    const data = z
      .object({
        conversationId: z.string(),
        eventId: z.number().int(),
        rating: z.enum(['up', 'down']),
        note: z.string().max(4000).default(''),
      })
      .parse(req.body);
    assert(
      store.events(data.conversationId).some((e) => e.id === data.eventId),
      'NOT_FOUND',
      'Message not found',
    );
    return store.put('feedback', { id: id(), ...data, createdAt: Date.now() });
  });
  app.post('/api/pick-folder', async () => ({ path: await pickFolder() }));
  app.post('/api/projects', async (req) => {
    const data = z
      .object({
        name: z.string().trim().min(1).max(100),
        folders: z.array(z.string()).min(1).max(12),
      })
      .parse(req.body);
    return store.put('project', {
      id: id(),
      name: data.name,
      folders: await validateRoots(data.folders, directory),
      createdAt: Date.now(),
    });
  });
  app.patch<{ Params: { id: string } }>('/api/projects/:id', async (req) => {
    const data = z
      .object({
        name: z.string().trim().min(1).max(100),
        folders: z.array(z.string()).min(1).max(12),
      })
      .parse(req.body);
    const project = store.get<Project>('project', req.params.id);
    const conversations = store.conversations().filter((c) => c.projectId === project.id);
    assert(
      !conversations.some((c) => runtime.active(c.id)),
      'RUN_ACTIVE',
      'Stop project tasks before changing folders.',
    );
    return store.put('project', {
      ...project,
      name: data.name,
      folders: await validateRoots(data.folders, directory),
    });
  });
  app.post('/api/skills/import', async (req) => {
    const { path } = z.object({ path: z.string().min(1) }).parse(req.body);
    return skills.import(path);
  });
  app.delete<{ Params: { id: string } }>('/api/skills/:id', async (req) => {
    store.remove('skill', req.params.id);
    return { ok: true };
  });
  app.post('/api/memories/index', async () => runtime.memories.index());
  app.post('/api/memories', async (req) => {
    const data = z
      .object({
        content: z.string().trim().min(1).max(4000),
        scope: z.string(),
        source: z.string().max(1000).default('User'),
        active: z.boolean().default(true),
        expiresAt: z.number().nullable().default(null),
      })
      .parse(req.body);
    assert(
      data.scope === 'user' ||
        (data.scope.startsWith('project:') && store.maybe('project', data.scope.slice(8))),
      'SCOPE',
      'Select a valid memory scope.',
    );
    return store.put('memory', { id: id(), ...data, revision: 1, createdAt: Date.now() });
  });
  app.patch<{ Params: { id: string } }>('/api/memories/:id', async (req) => {
    const old = store.get<Memory>('memory', req.params.id);
    const data = z
      .object({
        content: z.string().min(1).max(4000).optional(),
        active: z.boolean().optional(),
        expiresAt: z.number().nullable().optional(),
      })
      .parse(req.body);
    return store.put('memory', { ...old, ...data, revision: old.revision + 1 });
  });
  app.delete<{ Params: { id: string } }>('/api/memories/:id', async (req) => {
    store.remove('memory', req.params.id);
    store.remove('memory-vector', req.params.id);
    return { ok: true };
  });
  function checkScope(scope: string) {
    assert(
      (scope.startsWith('project:') && store.maybe('project', scope.slice(8))) ||
        (scope.startsWith('session:') && store.maybe('conversation', scope.slice(8))),
      'SCOPE',
      'Select a conversation or project knowledge scope.',
    );
  }
  app.post('/api/knowledge/text', async (req) => {
    const data = z
      .object({ scope: z.string(), name: z.string().min(1), text: z.string().min(1).max(5000000) })
      .parse(req.body);
    checkScope(data.scope);
    return runtime.knowledge.import(data.scope, data.name, data.text);
  });
  app.post('/api/knowledge/search', async (req) => {
    const data = z.object({ scope: z.string(), query: z.string().min(1) }).parse(req.body);
    checkScope(data.scope);
    return runtime.knowledge.hybrid([data.scope], data.query);
  });
  app.post<{ Params: { id: string } }>('/api/knowledge/:id/index', async (req) =>
    runtime.knowledge.index(req.params.id),
  );
  app.delete<{ Params: { id: string } }>('/api/knowledge/:id', async (req) => {
    runtime.knowledge.remove(req.params.id);
    return { ok: true };
  });
  app.post<{ Querystring: { conversationId?: string; scope?: string } }>(
    '/api/upload',
    async (req) => {
      const file = await req.file();
      assert(file, 'FILE_REQUIRED', 'Choose a file.');
      const bytes = await file.toBuffer();
      assert(!file.file.truncated, 'FILE_TOO_LARGE', 'Maximum file size is 25 MB.');
      const key = id(),
        name = basename(file.filename).replace(/[<>:"|?*]/g, '_'),
        folder = join(directory, 'attachments', key);
      await mkdir(folder, { recursive: true });
      const path = join(folder, name);
      await writeFile(path, bytes, { flag: 'wx' });
      const text = await extract(path);
      if (req.query.scope) {
        checkScope(req.query.scope);
        return runtime.knowledge.import(req.query.scope, name, text);
      }
      const c = store.get<Conversation>('conversation', req.query.conversationId || '');
      const attachment: Attachment = {
        id: key,
        conversationId: c.id,
        name,
        mime: file.mimetype,
        size: bytes.length,
        path,
        text,
        createdAt: Date.now(),
      };
      store.put('attachment', attachment);
      store.event(c.id, null, 'attachment.added', { id: key, name, size: bytes.length });
      return { id: key, name, size: bytes.length };
    },
  );
  app.get<{ Params: { id: string }; Querystring: { preview?: string } }>(
    '/api/attachments/:id',
    async (req, reply) => {
      const a = store.get<Attachment>('attachment', req.params.id);
      if (req.query.preview === '1') {
        const image = await normalizeImage(await readFile(a.path));
        reply
          .header(
            'Content-Type',
            image.url.startsWith('data:image/png') ? 'image/png' : 'image/jpeg',
          )
          .header('X-Content-Type-Options', 'nosniff');
        return Buffer.from(image.url.split(',')[1], 'base64');
      }
      reply
        .header('Content-Type', 'application/octet-stream')
        .header(
          'Content-Disposition',
          "attachment; filename*=UTF-8''" + encodeURIComponent(a.name),
        );
      return readFile(a.path);
    },
  );
  app.delete<{ Params: { id: string } }>('/api/attachments/:id', async (req) => {
    const a = store.get<Attachment>('attachment', req.params.id);
    assert(
      !a.messageEventId,
      'ATTACHMENT_SENT',
      'Sent attachments belong to message history and cannot be removed from the draft.',
      409,
    );
    store.remove('attachment', a.id);
    store.event(a.conversationId, null, 'attachment.removed', { id: a.id });
    await rm(a.path, { force: true });
    return { ok: true };
  });
  app.post('/api/execution/check', async () => {
    const settings = config.get(),
      folder = await mkdtemp(join(directory, 'execution-check-'));
    try {
      const result = await executeCommand(
        'echo AgentDemo-backend-ready',
        folder,
        AbortSignal.timeout(30000),
        10000,
        settings,
      );
      return {
        backend: settings.commandBackend,
        network:
          settings.commandBackend === 'docker'
            ? 'deny'
            : settings.commandBackend === 'native-windows'
              ? settings.nativeNetwork
              : 'host',
        ready: result.code === 0,
        ...result,
        note: 'Readiness check only, not proof of sandbox security.',
      };
    } catch (error) {
      return { backend: settings.commandBackend, ready: false, error: errorMessage(error) };
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
  app.get('/api/settings', async () => config.public());
  app.put('/api/settings', async (req) => {
    assert(
      !store.runs().some((r) => !terminal(r.status)),
      'RUN_ACTIVE',
      'Stop running tasks before changing model settings.',
    );
    const saved = config.save(req.body);
    await runtime.mcp.close();
    return saved;
  });
  const candidate = (raw: any) => {
    const old = config.get().profiles.find((p) => p.id === raw.id);
    const p = profileSchema.parse({
      ...raw,
      apiKey: raw.apiKey === undefined ? old?.apiKey || '' : raw.apiKey,
    });
    const u = new URL(p.baseUrl);
    assert(
      !u.username &&
        !u.password &&
        !u.search &&
        !u.hash &&
        (u.protocol === 'https:' ||
          (u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname))),
      'ENDPOINT',
      'Use HTTPS or a local HTTP endpoint without query parameters.',
    );
    return p;
  };
  app.post('/api/models', async (req) =>
    discoverModels(
      candidate({ ...(req.body as any), model: (req.body as any)?.model || '__discovery__' }),
    ),
  );
  app.post('/api/models/import', async (req) => {
    assert(
      !store.runs().some((r) => !terminal(r.status)),
      'RUN_ACTIVE',
      'Stop running tasks before changing model settings.',
    );
    const source = candidate({
        ...(req.body as any),
        model: (req.body as any)?.model || '__discovery__',
      }),
      models = await discoverModels(source),
      settings = config.get();
    // The lookup is asynchronous: check again before committing configuration.
    assert(
      !store.runs().some((r) => !terminal(r.status)),
      'RUN_ACTIVE',
      'A task started during discovery; settings were not changed.',
    );
    const added: string[] = [];
    for (const metadata of models) {
      if (
        !metadata.id ||
        settings.profiles.some(
          (p) =>
            p.baseUrl === source.baseUrl &&
            p.transport === source.transport &&
            p.model === metadata.id,
        )
      )
        continue;
      const profile = matchModel(
        { ...source, id: id(), name: metadata.name || metadata.id },
        metadata,
      );
      settings.profiles.push(profile);
      added.push(profile.model);
    }
    config.save(settings);
    return { added, models, settings: config.public() };
  });

  app.post('/api/test-connection', async (req) => {
    const profile = candidate(req.body);
    const result = await providerFor(profile).complete({
      profile,
      messages: [{ role: 'user', content: 'Reply with exactly: Connected' }],
      tools: [],
      signal: AbortSignal.timeout(profile.timeoutMs),
      onText: () => {},
    });
    return { text: result.message.content, usage: result.usage, model: profile.model };
  });
  app.get('/api/events', async (req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (type: string, data: any) => {
      if (!reply.raw.destroyed)
        reply.raw.write('event: ' + type + '\ndata: ' + JSON.stringify(data) + '\n\n');
    };
    const event = (e: any) => send('agent', e),
      delta = (e: any) => send('delta', e);
    runtime.bus.on('event', event);
    runtime.bus.on('delta', delta);
    send('ready', {});
    const timer = setInterval(() => send('heartbeat', { at: Date.now() }), 15000);
    req.raw.on('close', () => {
      clearInterval(timer);
      runtime.bus.off('event', event);
      runtime.bus.off('delta', delta);
    });
  });
  if (options.dist && existsSync(options.dist)) {
    await app.register(staticPlugin, { root: resolve(options.dist), prefix: '/' });
    app.setNotFoundHandler(async (req, reply) =>
      req.url.startsWith('/api/')
        ? reply.code(404).send({ error: 'Route not found' })
        : reply.sendFile('index.html'),
    );
  }
  app.addHook('onClose', async () => {
    await runtime.shutdown();
    store.close();
  });
  return { app, runtime, store, config };
}
