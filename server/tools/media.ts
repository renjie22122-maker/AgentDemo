import { z } from 'zod';
import { assert } from '../core/errors.js';
import type { ToolRegistry } from './registry.js';
export function installMedia(registry: ToolRegistry) {
  registry.add({
    name: 'media_services',
    description:
      'List enabled image, video, music, speech and 3D generation services. Model-specific reference image/multi-image options live in each service defaults; do not invent capabilities or pricing.',
    effect: 'read',
    schema: z.object({}),
    run: (_a, c) => ({ content: JSON.stringify(c.media.connections()) }),
  });
  registry.add({
    name: 'generate_media',
    description:
      'Submit a paid image/video/music/speech/3D generation task using a configured service. Approval covers the exact prompt/options. Returns a durable job ID; use media_status, never resubmit because waiting is slow. URLs and data URIs in options are sent to the provider. references maps provider input fields to attachment IDs or media:jobId:outputId handles from media_status (image/audio/video up to 25 MB). Use the actual provider field names and supported formats; data URI support varies. read_image accepts mediaRef for visual QA; export_media saves outputs to the workspace. No arbitrary local paths are read.',
    effect: 'coordinate',
    schema: z.object({
      serviceId: z.string(),
      prompt: z.string().max(20000).default(''),
      options: z.record(z.string(), z.unknown()).default({}),
      references: z.record(z.string(), z.array(z.string()).max(9)).default({}),
      reason: z.string().min(1),
    }),
    run: async (a, c) => {
      assert(
        c.conversation.permission !== 'read-only',
        'MEDIA_READONLY',
        'Generation is unavailable in read-only mode.',
      );
      const service = c.media.connection(a.serviceId);
      assert(
        service.kind !== 'transcription',
        'MEDIA_AUDIO',
        'Use microphone input for transcription.',
      );
      const limit = c.config.get().media?.autoApproveMaxUsd;
      await c.inputs.request(
        c.run,
        'approval',
        {
          command: 'Generate ' + service.kind + ' with ' + service.name,
          reason: a.reason,
          backend: 'media-service',
          cwd: new URL(service.baseUrl).origin,
          request: {
            model: service.model,
            prompt: a.prompt,
            options: { ...service.defaults, ...a.options },
            referenceAttachments: a.references,
          },
          estimatedUsd: service.estimatedUsd,
          forceHuman: limit == null || service.estimatedUsd == null || service.estimatedUsd > limit,
        },
        c.signal,
      );
      c.signal.throwIfAborted();
      return {
        content: JSON.stringify(
          await c.media.submit({
            connectionId: a.serviceId,
            conversationId: c.conversation.id,
            run: c.run,
            operationKey: c.run.id + ':' + c.callId,
            prompt: a.prompt,
            options: a.options,
            references: a.references,
            expectedConnection: JSON.stringify(service),
          }),
        ),
      };
    },
  });
  registry.add({
    name: 'media_status',
    description:
      'Read a media job receipt and locally saved outputs in this conversation. Host polls remote jobs automatically; no need for a rapid tool polling loop.',
    effect: 'read',
    schema: z.object({ jobId: z.string() }),
    run: (a, c) => ({
      content: JSON.stringify(c.media.public(c.media.get(a.jobId, c.conversation.id))),
    }),
  });
  registry.add({
    name: 'inspect_media',
    effect: 'read',
    description:
      'Inspect a completed same-conversation media reference: byte integrity, MIME and MP4 audio/video track declarations. Does not prove audible content or codec compatibility; unsupported containers report unknown. For visual QA use read_image(mediaRef).',
    schema: z.object({ reference: z.string() }),
    run: async (a, c) => {
      const output = await c.media.output(a.reference, c.conversation.id);
      return {
        content: JSON.stringify({
          reference: a.reference,
          mime: output.mime,
          name: output.name,
          bytes: output.bytes.length,
          sha256: output.sha256,
          inspection: output.inspection,
        }),
      };
    },
  });
  registry.add({
    name: 'export_media',
    effect: 'write',
    description:
      'Copy a completed image/video/audio/3D output in this conversation into an authorized workspace path, preserving exact bytes. Never overwrites existing files. Returns hash and audio-track inspection; no model generation or conversion.',
    schema: z.object({ reference: z.string(), path: z.string().min(1) }),
    run: async (a, c) => {
      const output = await c.media.output(a.reference, c.conversation.id);
      c.signal.throwIfAborted();
      const path = await c.files.writeBytes(a.path, output.bytes);
      return {
        content: JSON.stringify({
          path,
          reference: a.reference,
          mime: output.mime,
          bytes: output.bytes.length,
          sha256: output.sha256,
          inspection: output.inspection,
        }),
      };
    },
  });
  registry.add({
    name: 'cancel_media',
    description:
      'Cancel a remote media job in this conversation if the provider supports cancellation. Cancellation does not guarantee a refund.',
    effect: 'coordinate',
    schema: z.object({ jobId: z.string() }),
    run: async (a, c) => ({
      content: JSON.stringify(await c.media.cancel(a.jobId, c.conversation.id)),
    }),
  });
}
