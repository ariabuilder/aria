/**
 * Apply D1 migrations via wrangler, reconciling legacy local wrangler state first.
 */

import { reconcileLegacyWranglerD1Migrations } from "../lib/storage/reconcileWranglerD1Migrations";
import {
  resolveLocalWranglerD1SqlitePath,
  resolveWranglerConfigPath,
} from "../lib/storage/wrangler-config";
import { isMainModule, runTypeScriptSync } from "./lib/node-command";
import { runWranglerSync } from "./lib/wrangler-command";

export async function applyD1Migrations(
  target: "local" | "remote",
  databaseBinding = process.env.ARIA_D1_BINDING || "aria_db",
): Promise<void> {
  const local = target === "local";
  if (local) {
    const sqlitePath = resolveLocalWranglerD1SqlitePath();
    if (sqlitePath) {
      const reconciled = await reconcileLegacyWranglerD1Migrations(sqlitePath);
      if (reconciled === "stale_baseline") {
        throw new Error(
          "Local wrangler D1 predates the consolidated baseline. Reset/reprovision it from 0001_baseline_schema.sql; migration repair is intentionally unavailable.",
        );
      }
    }
  }

  // Migrations run BEFORE the Astro build, so dist/server/wrangler.json does
  // not exist yet. Always target the active root config (private wrangler.toml
  // wins; committed wrangler.jsonc is the OSS fallback) so the Deploy button's
  // rewritten resource IDs are used.
  const configPath = resolveWranglerConfigPath();
  if (!configPath) {
    throw new Error(
      "No Wrangler config found. Expected wrangler.toml, wrangler.json, or wrangler.jsonc in the project root.",
    );
  }

  runWranglerSync(
    [
      "d1",
      "migrations",
      "apply",
      databaseBinding,
      local ? "--local" : "--remote",
      "--config",
      configPath,
    ],
    {
      stdio: "inherit",
      env: { ...process.env, CI: "true" },
    },
  );

  const verificationArgs: string[] = [];
  if (local) {
    const sqlitePath = resolveLocalWranglerD1SqlitePath();
    if (!sqlitePath) {
      throw new Error(
        "Local wrangler D1 database was not created by migration apply; cannot verify the baseline schema.",
      );
    }
    verificationArgs.push(`--db=${sqlitePath}`);
  } else {
    verificationArgs.push("--remote");
  }

  runTypeScriptSync(
    "aria/scripts/verify-localization-schema.ts",
    verificationArgs,
    {
      stdio: "inherit",
      env: { ...process.env, CI: "true" },
    },
  );
}

if (isMainModule(import.meta.url)) {
  const local = process.argv.includes("--local");
  const remote = process.argv.includes("--remote");
  if (local === remote) {
    throw new Error("Specify exactly one of --local or --remote");
  }
  await applyD1Migrations(local ? "local" : "remote");
}
