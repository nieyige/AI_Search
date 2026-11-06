import { useEffect, useRef, useState } from "react";

/**
 * Throttles a rapidly changing value (e.g. streamed markdown) to at most one
 * update per `interval` ms. Markdown parsing is expensive; re-parsing it on
 * every token causes layout thrash on long reports.
 */
export function useThrottledValue<T>(value: T, interval = 50, immediate = false): T {
  const [throttled, setThrottled] = useState(value);
  const lastUpdate = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (immediate) {
      lastUpdate.current = performance.now();
      // Deliberate: the hook's whole job is to mirror a prop into throttled
      // display state; this is the non-throttled (stream finished) path.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setThrottled(value);
      return;
    }
    const now = performance.now();
    const elapsed = now - lastUpdate.current;
    if (elapsed >= interval) {
      lastUpdate.current = now;
      setThrottled(value);
      return;
    }
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      lastUpdate.current = performance.now();
      timer.current = undefined;
      setThrottled(value);
    }, interval - elapsed);
    return () => {
      if (timer.current !== undefined) {
        window.clearTimeout(timer.current);
        timer.current = undefined;
      }
    };
  }, [value, interval, immediate]);

  return throttled;
}
