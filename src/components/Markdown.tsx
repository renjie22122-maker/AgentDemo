import { mathDelimiters } from '../markdown-source';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';
import { Check, Copy } from 'lucide-react';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
function plain(node: any): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(plain).join('');
  return node?.props ? plain(node.props.children) : '';
}
function Code({ children }: any) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="code-block">
      <div className="code-bar">
        <span>{children?.props?.className?.replace('language-', '') || 'code'}</span>
        <button
          aria-label="Copy code"
          onClick={async () => {
            await navigator.clipboard.writeText(plain(children));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}
// react-markdown's synchronous export is a pure parser/renderer (no hooks).
// Cache its element tree, not mounted component state. Bound both count and source bytes.
const parsed = new Map<string, React.ReactElement>();
let cachedChars = 0;
const options = {
  remarkPlugins: [remarkGfm, remarkMath],
  rehypePlugins: [
    [rehypeKatex, { trust: false, strict: 'ignore', maxSize: 20, maxExpand: 200 }],
    rehypeHighlight,
  ],
  components: {
    pre: Code,
    a: (props: any) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  },
};
export const Markdown = React.memo(function Markdown({
  text,
  live = false,
}: {
  text: string;
  live?: boolean;
}) {
  let tree = live ? undefined : parsed.get(text);
  if (tree) {
    parsed.delete(text);
    parsed.set(text, tree);
  } else {
    tree = ReactMarkdown({ ...options, children: mathDelimiters(text) } as Parameters<
      typeof ReactMarkdown
    >[0]);
    if (!live && text.length <= 250000) {
      parsed.set(text, tree);
      cachedChars += text.length;
      while (parsed.size > 96 || cachedChars > 2000000) {
        const oldest = parsed.keys().next().value!;
        cachedChars -= oldest.length;
        parsed.delete(oldest);
      }
    }
  }
  return <div className="markdown">{tree}</div>;
});
