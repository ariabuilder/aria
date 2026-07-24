/**
 * In-flight request deduplication for metrics fetches.
 */

const inFlightLoads = new Map<string, Promise<unknown>>();

export function dedupeInFlight<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const existing = inFlightLoads.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = loader().finally(() => {
    inFlightLoads.delete(key);
  });
  inFlightLoads.set(key, promise);
  return promise;
}

export function clearInFlightMetrics(keysPrefix?: string): void {
  if (!keysPrefix) {
    inFlightLoads.clear();
    return;
  }
  for (const key of inFlightLoads.keys()) {
    if (key.startsWith(keysPrefix)) {
      inFlightLoads.delete(key);
    }
  }
}
