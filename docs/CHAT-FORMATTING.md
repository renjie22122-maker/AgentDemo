# Rich conversation content

The renderer supports standard Markdown headings, lists, task lists, tables, links, images, syntax-highlighted fenced code and KaTeX math. Code blocks have copy and collapse controls. Large formulas scroll horizontally.

## Bold text and literal syntax

Complete bold spans next to Chinese punctuation have a compatibility pass when ordinary Markdown leaves the stars visible. Code blocks, inline code, explicitly escaped stars and unfinished streaming spans are preserved. This is intentionally conservative: it does not attempt to repair every malformed Markdown document or rewrite stored messages.

## Attributed quotations

Use an explicit, general-purpose speaker label:

```markdown
> [speaker: Reviewer]
> The evidence supports this conclusion.

> [speaker: Author]
> I will update the implementation.
```

The UI shows a name and a deterministic color. Chinese `[角色: 名字]` is also accepted. This works for interviews, discussions, reviews, fiction and other attributed quotations. Ordinary blockquotes stay ordinary; no speaker is inferred. Colors use a six-color palette and can repeat, so names remain the primary identity.

## Math and interactive examples

Use `$x^2$` / `$$...$$` or LaTeX `\( ... \)` / `\[ ... \]` delimiters. KaTeX is not a complete TeX document compiler.

A fenced `html` or `html-preview` block displays its interactive preview by default. Switch between Preview and Code in the same-sized panel; code scrolls internally. Switching preserves the iframe state; Reset reloads it. Choose compact, standard or tall height, or resize vertically. A fenced `mermaid` block renders local relationship, flow, sequence, state and entity diagrams with the same preview/code switch. Mermaid uses strict mode and an inert SVG image; parse errors leave the source accessible.

The iframe has an opaque origin, scripts only (no same-origin, top-navigation, popup or form sandbox privileges), and a CSP restricting resource loads and connections. It cannot access the parent application's DOM/storage. This is a browser preview boundary, not an OS sandbox: it does not guarantee resource limits or prevent every possible navigation. Do not use it as a general execution environment for hostile programs. Remote dependencies, arbitrary Python execution, package installation and full development-server projects are not supported. Raw HTML in ordinary Markdown remains escaped/ignored.

## Media and dictation

Generated image, video and audio outputs stay anchored to the first media-task event. Subsequent updates replace that card in place rather than moving it to a later turn. Existing generated-media cards provide players, downloads and collapse controls. Recognized local conversation media links with audio/video extensions can also embed a player; arbitrary remote links are not automatically converted into players.

The microphone icon is next to **Send**. Configure a transcription connection in Settings first. Recording requires browser microphone permission and a supported browser on localhost or HTTPS. Stop recording, then choose Upload & transcribe. The result enters an editable draft; it is not sent as a chat message automatically. This is dictation, not real-time voice conversation.

## Validation

332 regression tests passed, with 2 environment-dependent skips. A real headless Edge fixture verified default previews, state-preserving switches, same-sized scrolling code, two Mermaid diagrams and mobile width. TypeScript and the production build passed. No paid media service was called.
