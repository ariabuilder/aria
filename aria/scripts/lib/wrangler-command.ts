import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  runPackageBin,
  runPackageBinSync,
  type CommandOptions,
  type CommandResult,
} from "./node-command";

/** Adds Wrangler-specific defaults while preserving caller options. */
function wranglerOptions(options: CommandOptions): CommandOptions {
  return {
    ...options,
    env: {
      WRANGLER_LOG_PATH:
        process.env.WRANGLER_LOG_PATH ??
        join(options.cwd ?? process.cwd(), ".wrangler", "logs"),
      ...options.env,
    },
  };
}

/** Runs Wrangler synchronously through its installed JavaScript entrypoint. */
export function runWranglerSync(
  args: readonly string[],
  options: CommandOptions = {},
): CommandResult {
  return runPackageBinSync(
    "wrangler",
    "wrangler",
    args,
    wranglerOptions(options),
  );
}

/** Runs Wrangler asynchronously through its installed JavaScript entrypoint. */
export function runWrangler(
  args: readonly string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  return runPackageBin("wrangler", "wrangler", args, wranglerOptions(options));
}

/** Restricts a temporary directory to its owner on supported platforms. */
function protectDirectorySync(directory: string): void {
  if (process.platform !== "win32") {
    chmodSync(directory, 0o700);
  }
}

/** Restricts a temporary directory to its owner on supported platforms. */
async function protectDirectory(directory: string): Promise<void> {
  if (process.platform !== "win32") {
    await chmod(directory, 0o700);
  }
}

/** Runs a synchronous operation with SQL stored in a protected temporary file. */
export function withTemporarySqlFileSync<T>(
  sql: string,
  operation: (sqlPath: string) => T,
  root = tmpdir(),
): T {
  const directory = mkdtempSync(join(root, "aria-wrangler-sql-"));
  const sqlPath = join(directory, "query.sql");
  try {
    protectDirectorySync(directory);
    writeFileSync(sqlPath, sql, {
      encoding: "utf8",
      flag: "wx",
      mode: process.platform === "win32" ? undefined : 0o600,
    });
    return operation(sqlPath);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

/** Runs an asynchronous operation with SQL stored in a protected temporary file. */
export async function withTemporarySqlFile<T>(
  sql: string,
  operation: (sqlPath: string) => Promise<T>,
  root = tmpdir(),
): Promise<T> {
  const directory = await mkdtemp(join(root, "aria-wrangler-sql-"));
  const sqlPath = join(directory, "query.sql");
  try {
    await protectDirectory(directory);
    await writeFile(sqlPath, sql, {
      encoding: "utf8",
      flag: "wx",
      mode: process.platform === "win32" ? undefined : 0o600,
    });
    return await operation(sqlPath);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}
