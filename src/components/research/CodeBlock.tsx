import { useMemo } from "react";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import { cn } from "@/lib/utils";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
  /** Max height in px; the spec asks for 400px on Python cards. */
  maxHeight?: number;
  showHeader?: boolean;
}

export function CodeBlock({
  code,
  language,
  className,
  maxHeight,
  showHeader = true,
}: CodeBlockProps) {
  const { html, label } = useMemo(() => {
    const lang = language?.toLowerCase();
    if (lang && hljs.getLanguage(lang)) {
      return {
        html: hljs.highlight(code, { language: lang, ignoreIllegals: true }).value,
        label: lang,
      };
    }
    const auto = hljs.highlightAuto(code);
    return { html: auto.value, label: auto.language ?? "text" };
  }, [code, language]);

  return (
    <div className={cn("overflow-hidden rounded-lg border border-line bg-[#fbfcfd]", className)}>
      {showHeader && (
        <div className="flex items-center justify-between border-b border-line/80 bg-slate-50/80 px-3 py-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted">{label}</span>
        </div>
      )}
      <pre
        className="hljs overflow-auto bg-transparent p-3 text-[12px] leading-relaxed"
        style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
      >
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}

/** Pretty-print JSON when possible; plain text otherwise. */
// eslint-disable-next-line react-refresh/only-export-components -- small pure helper used by the tool cards
export function prettyPayload(raw: string | undefined): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
