import { isValidElement, memo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { cn, safeHref } from "@/lib/utils";
import { CodeBlock } from "./CodeBlock";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return "";
}

const components: Components = {
  a({ href, children, node: _node, ...props }) {
    const safe = safeHref(href);
    if (!safe) {
      return <span className="text-ink underline decoration-slate-300">{children}</span>;
    }
    return (
      <a
        href={safe}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-brand underline decoration-brand/30 underline-offset-2 transition-colors hover:text-brand-ink hover:decoration-brand/70"
        {...props}
      >
        {children}
      </a>
    );
  },
  pre({ children }) {
    // react-markdown v9 no longer passes `inline` to `code`; the parent `pre`
    // is the reliable place to distinguish fenced blocks from inline code.
    const child = Array.isArray(children) ? children[0] : children;
    if (!isValidElement(child)) {
      return <pre>{children}</pre>;
    }
    const props = child.props as { className?: string; children?: ReactNode };
    const code = textOf(props.children).replace(/\n$/, "");
    const language = /language-([\w-]+)/.exec(props.className ?? "")?.[1];
    return <CodeBlock code={code} language={language} maxHeight={480} className="my-3" />;
  },
  code({ className, children, node: _node, ...props }) {
    return (
      <code
        className={cn(
          "rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.86em] text-slate-800",
          className,
        )}
        {...props}
      >
        {children}
      </code>
    );
  },
  table({ children }) {
    return (
      <div className="my-3 overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    );
  },
};

interface MarkdownProps {
  content: string;
  className?: string;
  streaming?: boolean;
}

export const Markdown = memo(function Markdown({ content, className, streaming }: MarkdownProps) {
  return (
    <div className={cn("markdown", streaming && "markdown-streaming", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        urlTransform={(url) => safeHref(url) ?? ""}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
