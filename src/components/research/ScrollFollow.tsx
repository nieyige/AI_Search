import { useCallback, useLayoutEffect, useRef, useState } from "react";

const NEAR_BOTTOM = 56;

/**
 * Keeps a scroll container pinned to the bottom while content streams, unless
 * the user has scrolled away. The caller renders the “back to latest” affordance
 * based on `paused`.
 */
export function useScrollFollow(follow: boolean, deps: readonly unknown[]) {
  const ref = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const element = ref.current;
    if (!element) return;
    pausedRef.current = false;
    setPaused(false);
    element.scrollTo({ top: element.scrollHeight, behavior });
  }, []);

  useLayoutEffect(() => {
    if (!follow || pausedRef.current) return;
    const element = ref.current;
    if (!element) return;
    // Jump rather than animate: smooth scrolling on every token would lag.
    element.scrollTop = element.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, ...deps]);

  const onScroll = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distance <= NEAR_BOTTOM) {
      if (pausedRef.current) {
        pausedRef.current = false;
        setPaused(false);
      }
    } else if (distance > NEAR_BOTTOM * 2 && !pausedRef.current) {
      pausedRef.current = true;
      setPaused(true);
    }
  }, []);

  return { ref, paused, onScroll, scrollToBottom };
}
