import type { StorageAdapter } from "./adapter";

export async function touchLastSyncResource(
  adapter: StorageAdapter,
  resourceName: string,
  timestamp?: string
): Promise<string | null> {
  const iso = timestamp ?? new Date().toISOString();
  try {
    await adapter.touchResource(resourceName, iso);
    return iso;
  } catch (error) {
    console.warn(
      `[storage/last-sync] Failed to update last-sync for ${resourceName}:`,
      error
    );
    return null;
  }
}
