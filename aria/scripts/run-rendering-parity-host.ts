import { spawn } from "node:child_process";
import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { z } from "zod";
import { resolveNpmCli } from "./lib/node-command";

const ArgumentsSchema = z
  .object({
    runtime: z.enum(["node", "workerd"]),
    port: z.coerce.number().int().min(1024).max(65535),
  })
  .strict();

const parsedArgs = parseArgs({
  options: {
    runtime: { type: "string" },
    port: { type: "string" },
  },
  strict: true,
});
const args = ArgumentsSchema.parse(parsedArgs.values);
const workspaceRoot = resolve(import.meta.dirname, "../..");
const temporaryRoot = await mkdtemp(
  join(tmpdir(), `aria-rendering-parity-${args.runtime}-`),
);

const ignoredDirectoryNames = new Set([
  ".astro",
  ".git",
  ".wrangler",
  "dist",
  "node_modules",
]);

await cp(workspaceRoot, temporaryRoot, {
  recursive: true,
  filter: (source) => {
    const relative = source.slice(workspaceRoot.length).replace(/^[/\\]/u, "");
    if (!relative) {
      return true;
    }
    const segments = relative.split(/[/\\]/u);
    if (segments.some((segment) => ignoredDirectoryNames.has(segment))) {
      return false;
    }
    return relative !== "aria/storage/aria.db";
  },
});
await symlink(
  resolve(workspaceRoot, "node_modules"),
  resolve(temporaryRoot, "node_modules"),
  "dir",
);

const npmExecutable = resolveNpmCli();

const script = args.runtime === "node" ? "dev:local" : "dev:edge";
const child = spawn(
  process.execPath,
  [
    npmExecutable,
    "run",
    script,
    "--",
    "--host",
    "127.0.0.1",
    "--port",
    String(args.port),
  ],
  {
    cwd: temporaryRoot,
    env: {
      ...process.env,
      ARIA_RENDERING_PARITY_RUNTIME: args.runtime,
      ASTRO_DEV_BACKGROUND: "0",
    },
    stdio: "inherit",
  },
);

let cleaningUp = false;
async function cleanup(signal?: NodeJS.Signals): Promise<void> {
  if (cleaningUp) {
    return;
  }
  cleaningUp = true;
  if (!child.killed) {
    child.kill(signal ?? "SIGTERM");
  }
  await rm(temporaryRoot, { recursive: true, force: true });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void cleanup(signal).finally(() => process.exit(0));
  });
}

child.once("error", (error) => {
  void cleanup().finally(() => {
    throw error;
  });
});

child.once("exit", (code, signal) => {
  void cleanup().finally(() => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
});

process.title = `aria-parity-${basename(temporaryRoot)}`;
