import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useDeferredValue } from 'react';
import { mathDelimiters } from '../markdown-source';
import 'katex/dist/katex.min.css';

// Drafts never run interactive HTML or load remote images before the user sends.
export function DraftPreview({ text }: { text: string }) {
  const deferred = useDeferredValue(text);
  return (
    <div className="markdown draft-preview" aria-label="Draft preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [rehypeKatex, { trust: false, strict: 'ignore', maxExpand: 200, maxSize: 20 }],
        ]}
        components={{
          img: ({ alt }) => <span>[{alt || 'image'}]</span>,
          a: ({ children }) => <span className="draft-link">{children}</span>,
        }}
      >
        {mathDelimiters(deferred)}
      </ReactMarkdown>
    </div>
  );
}
