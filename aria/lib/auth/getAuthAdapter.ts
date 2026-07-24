/**
 * Automatically detects Cloudflare vs local mode and returns the appropriate adapter.
 * Uses dynamic imports to avoid bundling @libsql/client in Cloudflare deployments.
 */

import type { AuthAdapter, D1Database, KVNamespace } from "./adapter";
import {
  getCloudflareEnv,
  getStringRuntimeSetting,
  type RuntimeLocals,
} from "../cloudflare/env";

// Re-export RuntimeLocals from storage for convenience
export type { RuntimeLocals } from "../cloudflare/env";

// Per-isolate adapter caches. Cloudflare KV/D1 binding objects are isolate-
// scoped (stable across requests in the same isolate) so memoizing the
// CloudflareAdapter is safe and avoids re-running its `initialize()` ALTERs
// + dynamic imports on every request — mirrors the storage adapter pattern.
let cachedCloudflareAdapter: AuthAdapter | null = null;
let cloudflareInitPromise: Promise<AuthAdapter> | null = null;
let cachedLibSQLAdapter: AuthAdapter | null = null;
let libsqlInitPromise: Promise<AuthAdapter> | null = null;

function readAuthBackendSetting(
  env: ReturnType<typeof getCloudflareEnv>,
  locals?: RuntimeLocals,
): string | undefined {
  const authBackend = getStringRuntimeSetting("ARIA_AUTH_BACKEND", locals);
  if (typeof authBackend === "string") {
    return authBackend;
  }

  const runtimeAuthBackend = env?.ARIA_AUTH_BACKEND;
  return typeof runtimeAuthBackend === "string"
    ? runtimeAuthBackend
    : undefined;
}

function wantsLocalAuthBackend(authBackend?: string): boolean {
  return (
    authBackend === "sqlite" ||
    authBackend === "local-sqlite" ||
    authBackend === "libsql" ||
    authBackend === "local-libsql"
  );
}

function hasCloudflareAuthBindings(
  env: ReturnType<typeof getCloudflareEnv>,
): env is ReturnType<typeof getCloudflareEnv> & {
  aria_db: NonNullable<ReturnType<typeof getCloudflareEnv>["aria_db"]>;
  session: NonNullable<ReturnType<typeof getCloudflareEnv>["session"]>;
} {
  return Boolean(env?.aria_db && env?.session);
}

function isWorkerdRuntime(env: ReturnType<typeof getCloudflareEnv>): boolean {
  return hasCloudflareAuthBindings(env);
}

/**
 * Get the appropriate auth adapter for the current environment
 *
 * - Cloudflare: Uses D1 + KV (CloudflareAdapter) - fresh instance per request
 * - Local: Uses LibSQL (pure JS, no native bindings) - cached
 *
 * @param locals - Astro context.locals with runtime bindings
 * @returns Initialized auth adapter
 *
 * @example
 * const adapter = await getAuthAdapterAsync(context.locals);
 * const user = await adapter.getUserById(id);
 */
export async function getAuthAdapterAsync(
  locals?: RuntimeLocals,
): Promise<AuthAdapter> {
  const env = getCloudflareEnv(locals);
  const authBackend = readAuthBackendSetting(env, locals);
  const preferLocalAuth = wantsLocalAuthBackend(authBackend);
  const forceCloudflare =
    authBackend === "cloudflare" ||
    getStringRuntimeSetting("ARIA_FORCE_CLOUDFLARE", locals) === "1";

  if (preferLocalAuth && isWorkerdRuntime(env)) {
    throw new Error(
      "Local SQLite auth is not supported under Astro 6 Cloudflare/workerd dev. Run `npm run dev` for Node + SQLite local mode, or use Cloudflare-backed dev without ARIA_AUTH_BACKEND=local-libsql.",
    );
  }

  // Astro 6 Cloudflare dev runs in workerd, so prefer the real bindings whenever
  // they are available unless local SQLite/LibSQL was explicitly requested.
  if (hasCloudflareAuthBindings(env) && (!preferLocalAuth || forceCloudflare)) {
    if (cachedCloudflareAdapter) {
      return cachedCloudflareAdapter;
    }

    if (cloudflareInitPromise) {
      return cloudflareInitPromise;
    }

    cloudflareInitPromise = (async () => {
      try {
        const { drizzle } = await import("drizzle-orm/d1");
        const schema = await import("./schema");
        const db = drizzle(env.aria_db, { schema });

        const { CloudflareAdapter } = await import("./cloudflare-adapter");
        const adapter = new CloudflareAdapter(
          db,
          env.aria_db as D1Database,
          env.session as KVNamespace,
        );
        await adapter.initialize();

        cachedCloudflareAdapter = adapter;
        return adapter;
      } catch (error) {
        cloudflareInitPromise = null;
        throw error;
      }
    })();

    return cloudflareInitPromise;
  }

  // Local mode: LibSQL (can be cached)
  if (cachedLibSQLAdapter) {
    return cachedLibSQLAdapter;
  }

  if (libsqlInitPromise) {
    return libsqlInitPromise;
  }

  libsqlInitPromise = initializeLibSQLAdapter();

  try {
    cachedLibSQLAdapter = await libsqlInitPromise;
    return cachedLibSQLAdapter;
  } finally {
    libsqlInitPromise = null;
  }
}

/**
 * Initialize LibSQL adapter for local development
 */
async function initializeLibSQLAdapter(): Promise<AuthAdapter> {
  const { createClient } = await import("@libsql/client/node");
  const { drizzle } = await import("drizzle-orm/libsql");
  const schema = await import("./schema");

  const { mkdir } = await import("fs/promises");
  const { dirname, resolve } = await import("path");

  const dbPath = resolve(process.cwd(), "aria/storage/aria.db");
  await mkdir(dirname(dbPath), { recursive: true });

  const client = createClient({
    url: `file:${dbPath}`,
  });

  const db = drizzle(client, { schema });

  const { LibSQLAdapter } = await import("./libsql-adapter");
  const adapter = new LibSQLAdapter(db, client);
  await adapter.initialize();

  console.log("[Auth] Using LibSQL adapter (local SQLite)");
  return adapter;
}

/**
 * Clear the cached adapter instance (useful for testing or hot module reload)
 */
export function clearAuthAdapterCache() {
  cachedCloudflareAdapter = null;
  cloudflareInitPromise = null;
  cachedLibSQLAdapter = null;
  libsqlInitPromise = null;
}
