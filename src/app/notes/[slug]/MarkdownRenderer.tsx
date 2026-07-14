"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        h1: ({ children, ...props }) => (
          <h1
            className="mb-6 mt-10 text-2xl font-bold text-foreground first:mt-0 sm:text-3xl"
            {...props}
          >
            {children}
          </h1>
        ),
        h2: ({ children, ...props }) => (
          <h2
            className="mb-4 mt-8 text-xl font-semibold text-foreground sm:text-2xl"
            {...props}
          >
            {children}
          </h2>
        ),
        h3: ({ children, ...props }) => (
          <h3
            className="mb-3 mt-6 text-lg font-semibold text-foreground sm:text-xl"
            {...props}
          >
            {children}
          </h3>
        ),
        p: ({ children, ...props }) => (
          <p
            className="mb-4 leading-relaxed text-muted-foreground"
            {...props}
          >
            {children}
          </p>
        ),
        ul: ({ children, ...props }) => (
          <ul className="mb-4 list-disc space-y-1.5 pl-6 text-muted-foreground" {...props}>
            {children}
          </ul>
        ),
        ol: ({ children, ...props }) => (
          <ol className="mb-4 list-decimal space-y-1.5 pl-6 text-muted-foreground" {...props}>
            {children}
          </ol>
        ),
        li: ({ children, ...props }) => (
          <li className="leading-relaxed" {...props}>
            {children}
          </li>
        ),
        blockquote: ({ children, ...props }) => (
          <blockquote
            className="mb-4 border-l-4 border-blue-400/40 bg-blue-400/5 py-2 pl-4 italic text-muted-foreground"
            {...props}
          >
            {children}
          </blockquote>
        ),
        code: ({
          className,
          children,
          ...props
        }: React.HTMLAttributes<HTMLElement>) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code
                className="rounded bg-secondary/60 px-1.5 py-0.5 text-sm font-mono text-blue-200"
                {...props}
              >
                {children}
              </code>
            );
          }
          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        pre: ({ children, ...props }) => (
          <pre
            className="mb-4 overflow-x-auto rounded-lg border border-border/40 bg-secondary/40 p-4 text-sm leading-relaxed"
            {...props}
          >
            {children}
          </pre>
        ),
        table: ({ children, ...props }) => (
          <div className="mb-4 overflow-x-auto rounded-lg border border-border/40">
            <table className="w-full text-sm" {...props}>
              {children}
            </table>
          </div>
        ),
        thead: ({ children, ...props }) => (
          <thead className="border-b border-border/40 bg-secondary/40" {...props}>
            {children}
          </thead>
        ),
        th: ({ children, ...props }) => (
          <th className="px-4 py-2 text-left font-medium text-foreground" {...props}>
            {children}
          </th>
        ),
        td: ({ children, ...props }) => (
          <td className="px-4 py-2 text-muted-foreground" {...props}>
            {children}
          </td>
        ),
        a: ({ children, href, ...props }) => (
          <a
            href={href}
            className="text-blue-300 underline underline-offset-2 transition-colors hover:text-blue-200"
            target="_blank"
            rel="noopener noreferrer"
            {...props}
          >
            {children}
          </a>
        ),
        hr: (props) => (
          <hr className="my-8 border-border/40" {...props} />
        ),
        strong: ({ children, ...props }) => (
          <strong className="font-semibold text-foreground" {...props}>
            {children}
          </strong>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
