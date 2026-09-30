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
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [rehypeKatex, { trust: false, strict: 'ignore', maxSize: 20, maxExpand: 200 }],
          rehypeHighlight,
        ]}
        components={{
          pre: Code,
          a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {mathDelimiters(text)}
      </ReactMarkdown>
    </div>
  );
}
