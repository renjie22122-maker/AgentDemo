import type { ConversationDetail } from './types';
export function conversationMarkdown(detail: ConversationDetail, agentName: string, zh = false) {
  const parts = ['# ' + detail.conversation.title];
  const fence = (text: string) => {
    const n = Math.max(2, ...Array.from(text.matchAll(/`+/g), (m) => m[0].length)) + 1;
    const f = '`'.repeat(n);
    return f + '\n' + text + '\n' + f;
  };
  const events = [...detail.events].sort((a, b) => a.id - b.id);
  for (const e of events) {
    const d = e.data;
    if (e.type === 'user.message' || e.type === 'assistant.message') {
      parts.push(
        '## ' +
          (e.type === 'user.message' ? (zh ? '用户' : 'You') : agentName) +
          (d.incomplete ? (zh ? '（未完成）' : ' (incomplete)') : ''),
      );
      parts.push(String(d.text ?? d.content ?? ''));
      const attachments = detail.attachments.filter((a) => a.messageEventId === e.id);
      if (attachments.length)
        parts.push(
          (zh ? '附件（文件本体未复制）：' : 'Attachments (file contents not copied):') +
            '\n' +
            attachments.map((a) => '- ' + JSON.stringify(a.name)).join('\n'),
        );
    } else if (e.type === 'input.requested') {
      parts.push(
        '### ' + (zh ? '交互请求' : 'Interaction request'),
        fence(JSON.stringify(d.payload || {}, null, 2)),
      );
    } else if (e.type === 'input.answered') {
      parts.push(
        '### ' + (zh ? '交互回复' : 'Interaction response'),
        String(d.answer || ''),
        d.allow === false
          ? zh
            ? '已拒绝'
            : 'Denied'
          : d.allow === true
            ? zh
              ? '已允许'
              : 'Allowed'
            : '',
      );
    } else if (e.type === 'tool.started' || e.type === 'tool.completed') {
      parts.push(
        '<details>\n<summary>' +
          (zh ? '执行步骤' : 'Activity') +
          ' · ' +
          String(d.name || 'tool').replace(/[<>&]/g, '') +
          ' · ' +
          (e.type === 'tool.started' ? (zh ? '开始' : 'started') : zh ? '结果' : 'result') +
          '</summary>\n\n' +
          fence(
            e.type === 'tool.started'
              ? JSON.stringify(d.arguments || {}, null, 2)
              : String(d.output ?? ''),
          ) +
          '\n\n</details>',
      );
    }
  }
  for (const stream of detail.streams || []) {
    if (
      !stream.text ||
      events.some((e) => e.type === 'assistant.message' && e.data.messageId === stream.messageId)
    )
      continue;
    parts.push(
      '## ' + agentName + (zh ? '（生成中，复制时快照）' : ' (generating, snapshot at copy time)'),
      stream.text,
    );
  }
  return parts.filter((p) => p !== '').join('\n\n') + '\n';
}
