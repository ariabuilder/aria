/**
 * Combine two AbortSignals into one. Fires when EITHER signal fires.
 */

export function combineAbortSignals(
  s1: AbortSignal | undefined,
  s2: AbortSignal,
): AbortSignal {
  if (!s1) return s2;
  if (s1.aborted) return s1;
  if (s2.aborted) return s2;

  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([s1, s2]);
  }

  // Fallback for older environments
  const controller = new AbortController();
  const abort = () => controller.abort();
  s1.addEventListener("abort", abort, { once: true });
  s2.addEventListener("abort", abort, { once: true });
  return controller.signal;
}
