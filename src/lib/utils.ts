import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Only allow links we are willing to render as clickable anchor targets. */
export function safeHref(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function hostname(raw: string | undefined | null): string {
  try {
    return raw ? new URL(raw).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

export function faviconFor(raw: string | undefined | null): string | null {
  const href = safeHref(raw);
  if (!href) return null;
  try {
    return new URL("/favicon.ico", new URL(href).origin).href;
  } catch {
    return null;
  }
}

export function uid(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
