#!/usr/bin/env node
/**
 * Apply D1 migrations via wrangler, reconciling legacy local wrangler state first.
 */

import { execFileSync } from "node:child_process";

import { reconcileLegacyWranglerD1Migrations } from "../lib/storage/reconcileWranglerD1Migrations";
import {
  resolveLocalWranglerD1SqlitePath,
  resolveWranglerConfigPath,
} from "../lib/storage/wrangler-config";

const DATABASE_BINDING = process.env.ARIA_D1_BINDING || "aria_db";
const local = process.argv.includes("--local");
const remote = process.argv.includes("--remote");

if (local === remote) {
  console.error("Specify exactly one of --local or --remote");
  process.exitCode = 1;
} else {
  await main();
}

async function main(): Promise<void> {
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

  execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "migrations",
      "apply",
      DATABASE_BINDING,
      local ? "--local" : "--remote",
      "--config",
      configPath,
    ],
    {
      stdio: "inherit",
      env: { ...process.env, CI: "true" },
    },
  );

  const verificationArgs = ["tsx", "aria/scripts/verify-localization-schema.ts"];
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

  execFileSync(
    "npx",
    verificationArgs,
    {
      stdio: "inherit",
      env: { ...process.env, CI: "true" },
    },
  );
}
