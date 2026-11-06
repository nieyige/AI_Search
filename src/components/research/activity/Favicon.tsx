import { useState } from "react";
import { Globe2 } from "lucide-react";
import { cn, faviconFor, safeHref } from "@/lib/utils";

interface FaviconProps {
  url?: string | null;
  favicon?: string | null;
  className?: string;
}

export function Favicon({ url, favicon, className }: FaviconProps) {
  const [failed, setFailed] = useState(false);
  const source = safeHref(favicon) ?? faviconFor(url);
  if (!source || failed) {
    return <Globe2 className={cn("size-4 shrink-0 text-slate-400", className)} aria-hidden />;
  }
  return (
    <img
      src={source}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("size-4 shrink-0 rounded-[3px] object-contain", className)}
    />
  );
}
