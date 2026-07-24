import {
  getCloudflareEnv,
  getStringRuntimeSetting,
  type RuntimeLocals,
} from "../cloudflare/env";

export type { RuntimeLocals } from "../cloudflare/env";

import type { StorageAdapter } from "./adapter";

let sqliteAdapterInstance: StorageAdapter | null = null;
let cloudflareAdapterInstance: StorageAdapter | null = null;
let sqliteAdapterPromise: Promise<StorageAdapter> | null = null;
let cloudflareAdapterPromise: Promise<StorageAdapter> | null = null;

function readStorageEnv(
  locals?: RuntimeLocals,
): Record<string, string | undefined> {
  return {
    ARIA_STORAGE_BACKEND: getStringRuntimeSetting(
      "ARIA_STORAGE_BACKEND",
      locals,
    ),
    ARIA_STORAGE: getStringRuntimeSetting("ARIA_STORAGE", locals),
    ARIA_FORCE_CLOUDFLARE: getStringRuntimeSetting(
      "ARIA_FORCE_CLOUDFLARE",
      locals,
    ),
  };
}

function wantsSQLiteLocal(env: Record<string, string | undefined>): boolean {
  return (
    env.ARIA_STORAGE_BACKEND === "sqlite" ||
    env.ARIA_STORAGE === "sqlite" ||
    env.ARIA_STORAGE_BACKEND === "local-sqlite" ||
    env.ARIA_STORAGE === "local-sqlite"
  );
}

function wantsCloudflareBackend(
  env: Record<string, string | undefined>,
): boolean {
  return (
    env.ARIA_STORAGE_BACKEND === "cloudflare" ||
    env.ARIA_STORAGE === "cloudflare" ||
    env.ARIA_FORCE_CLOUDFLARE === "1"
  );
}

function hasCloudflareStorageBindings(env: Record<string, unknown>): boolean {
  return Boolean(env.aria_db || env.aria_cache || env.aria_r2);
}

function isWorkerdRuntime(env: Record<string, unknown>): boolean {
  return hasCloudflareStorageBindings(env);
}

function toCloudflareBindings(
  env: Record<string, unknown>,
): Record<string, unknown> {
  return {
    aria_db: env.aria_db,
    aria_cache: env.aria_cache,
    aria_r2: env.aria_r2,
    R2_PUBLIC_URL: env.R2_PUBLIC_URL,
    // Cloudflare dev runs in workerd, where Node's filesystem APIs cannot
    // write to public/uploads. The local R2 binding is the canonical media
    // store in this runtime and /uploads/* is served from that binding.
    mirrorMediaLocally: false,
  };
}

export function getStorageAdapter(_locals?: RuntimeLocals): StorageAdapter {
  throw new Error(
    "getStorageAdapter is async now; use await getStorageAdapterAsync(...)",
  );
}

export async function getStorageAdapterAsync(
  locals?: RuntimeLocals,
): Promise<StorageAdapter> {
  const env = getCloudflareEnv(locals);
  const storageEnv = readStorageEnv(locals);
  const forceCloudflare = wantsCloudflareBackend(storageEnv);
  const preferLocalSQLite = wantsSQLiteLocal(storageEnv);

  if (preferLocalSQLite && isWorkerdRuntime(env)) {
    throw new Error(
      "Local SQLite storage is not supported under Astro 6 Cloudflare/workerd dev. Run `npm run dev` for Node + SQLite local mode, or use Cloudflare-backed dev without ARIA_STORAGE_BACKEND=sqlite.",
    );
  }

  // Astro 6 Cloudflare dev runs under workerd, so real bindings should be the
  // default path whenever they exist unless local SQLite was explicitly chosen.
  if (
    hasCloudflareStorageBindings(env) &&
    (!preferLocalSQLite || forceCloudflare)
  ) {
    if (cloudflareAdapterInstance) {
      return cloudflareAdapterInstance;
    }

    if (cloudflareAdapterPromise) {
      return cloudflareAdapterPromise;
    }

    cloudflareAdapterPromise = (async () => {
      try {
        const { CloudflareStorageAdapter } = await import("./cloudflare");
        const adapter = new CloudflareStorageAdapter(toCloudflareBindings(env));
        cloudflareAdapterInstance = adapter;
        return adapter;
      } catch (error) {
        cloudflareAdapterPromise = null;
        throw error;
      }
    })();

    return cloudflareAdapterPromise;
  }

  if (sqliteAdapterInstance) {
    return sqliteAdapterInstance;
  }

  if (sqliteAdapterPromise) {
    return sqliteAdapterPromise;
  }

  sqliteAdapterPromise = (async () => {
    try {
      const { SQLiteStorageAdapter } = await import("./sqlite");
      const adapter = new SQLiteStorageAdapter();
      sqliteAdapterInstance = adapter;
      return adapter;
    } catch (error) {
      sqliteAdapterPromise = null;
      throw error;
    }
  })();

  return sqliteAdapterPromise;
}

export function clearStorageAdapterCache(): void {
  sqliteAdapterInstance = null;
  cloudflareAdapterInstance = null;
  sqliteAdapterPromise = null;
  cloudflareAdapterPromise = null;
}
