import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Markdown from 'react-markdown';
import { renderToStaticMarkup } from 'react-dom/server';
import { richMarkdown, localMediaKind, previewDocument } from '../src/markdown-rich.js';
import { mediaTimeline } from '../src/media-timeline.js';
const render = (s: string) =>
  renderToStaticMarkup(
    React.createElement(Markdown, { remarkPlugins: [richMarkdown], children: s }),
  );
test('CJK punctuation bold compatibility preserves escapes, code and unfinished streaming text', () => {
  assert.match(
    render('**工具收在闸门上，归看闸的管。**贺叔对外说。'),
    /<strong>工具收在闸门上，归看闸的管。<\/strong>/,
  );
  assert.match(render('**那年雨季前第十七天，信到了。**四个人来了。'), /<strong>/);
  assert.doesNotMatch(render('\\*\\*中文\\*\\*'), /<strong>/);
  assert.doesNotMatch(render('`**中文。**接续`'), /<strong>/);
  assert.doesNotMatch(render('~~~txt\n**中文。**接续\n~~~'), /<strong>/);
  assert.doesNotMatch(render('**未完成'), /<strong>/);
  assert.match(render('**English**'), /<strong>English<\/strong>/);
});
test('speaker quotes use explicit stable labels without inferring speaker identity', () => {
  const a = render('> [speaker: Analyst]\n> A claim.');
  assert.match(a, /data-speaker="Analyst"/);
  assert.match(a, /speaker-color-/);
  assert.doesNotMatch(render('> Ordinary quotation'), /speaker-color-/);
  assert.doesNotMatch(a, /\[speaker:/);
  assert.match(render('> [角色: 贺叔]\n> 台词'), /data-speaker="贺叔"/);
  assert.doesNotMatch(render('<script>alert(1)</script>'), /<script>/);
});
test('media classification does not auto-embed remote URLs and preview denies host access', () => {
  assert.equal(localMediaKind('https://example.com/x.mp4'), null);
  assert.equal(localMediaKind('/api/conversations/a/media/x.mp4'), 'video');
  assert.equal(localMediaKind('/api/conversations/a/media/x.mp3'), 'audio');
  const html = previewDocument('<button>Simulate</button>');
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
});
test('media updates retain original position even after a later user turn', () => {
  const events: any[] = [
    { id: 1, type: 'media.updated', data: { job: { id: 'm', status: 'running' } } },
    { id: 2, type: 'user.message', data: { text: 'next' } },
    { id: 3, type: 'media.updated', data: { job: { id: 'm', status: 'completed' } } },
  ];
  const timeline = mediaTimeline(events);
  assert.equal(timeline.get(1)?.status, 'completed');
  assert.equal(timeline.has(3), false);
});
