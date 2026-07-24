import { D1ApiSqlDatabase } from "../lib/api/database";
import type { AriaCloudflareEnv } from "../lib/cloudflare/env";
import { runOAuthMaintenance } from "../lib/oauth/maintenance";

function database(env: AriaCloudflareEnv): D1ApiSqlDatabase {
  if (!env.aria_db) throw new Error("ARIA_DB_UNAVAILABLE");
  return new D1ApiSqlDatabase(
    env.aria_db as unknown as ConstructorParameters<typeof D1ApiSqlDatabase>[0],
  );
}

/** Bounded OAuth expiry and retention, isolated from webhook reconciliation. */
export async function reconcileOAuthMaintenance(
  env: AriaCloudflareEnv,
): Promise<void> {
  await runOAuthMaintenance({
    database: database(env),
    now: new Date().toISOString(),
    limit: 250,
  });
}
