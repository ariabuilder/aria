import { rm } from "node:fs/promises";
import { resolve } from "node:path";

import { isMainModule, runPackageBin, runTypeScript } from "./lib/node-command";
import { applyD1Migrations } from "./apply-d1-migrations";

const workspaceRoot = resolve(import.meta.dirname, "../..");

type RuntimeTarget = "cloudflare" | "node";

/** Builds the environment variables needed for an Aria runtime target. */
function runtimeEnvironment(target: RuntimeTarget): NodeJS.ProcessEnv {
  return {
    ARIA_RUNTIME: target,
    ...(target === "cloudflare"
      ? {
          WRANGLER_LOG_PATH:
            process.env.WRANGLER_LOG_PATH ??
            resolve(workspaceRoot, ".wrangler", "logs"),
        }
      : {}),
  };
}

/** Runs a repository TypeScript script from the workspace root. */
async function runScript(
  script: string,
  args: readonly string[] = [],
): Promise<void> {
  await runTypeScript(script, args, {
    cwd: workspaceRoot,
    stdio: "inherit",
  });
}

/** Runs Astro with the selected Aria runtime environment. */
async function runAstro(
  args: readonly string[],
  runtime?: RuntimeTarget,
): Promise<void> {
  await runPackageBin("astro", "astro", args, {
    cwd: workspaceRoot,
    env: runtime ? runtimeEnvironment(runtime) : undefined,
    stdio: "inherit",
  });
}

/** Builds the Cloudflare bundle and runs its post-build validation checks. */
export async function buildCloudflare(): Promise<void> {
  await runScript("aria/scripts/generate-icon-assets.ts");
  await runScript("aria/scripts/check-icon-worker-boundary.ts");
  await rm(resolve(workspaceRoot, "dist"), { recursive: true, force: true });
  await runAstro(["build"], "cloudflare");
  await runScript("aria/scripts/sanitize-deploy-config.ts");
  await runScript("aria/scripts/check-vite-bundle-integrity.ts");
  await runScript("aria/scripts/check-cloudflare-free-limits.ts");
}

/** Builds the production Astro Node bundle with the same source tree. */
export async function buildNode(): Promise<void> {
  await runScript("aria/scripts/generate-icon-assets.ts");
  await runScript("aria/scripts/check-icon-worker-boundary.ts");
  await rm(resolve(workspaceRoot, "dist"), { recursive: true, force: true });
  await runAstro(["build"], "node");
}

/** Dispatches a cross-platform project command to its underlying toolchain. */
export async function runProjectCommand(
  command: string,
  args: readonly string[] = [],
): Promise<void> {
  switch (command) {
    case "dev":
    case "dev:local":
      await runAstro(["dev", ...args], "node");
      return;
    case "dev:edge":
      await applyD1Migrations("local");
      await runAstro(["dev", ...args], "cloudflare");
      return;
    case "build":
    case "build:cloudflare":
      await buildCloudflare();
      return;
    case "build:node":
      await buildNode();
      return;
    case "preview":
      await runAstro(["preview", ...args], "cloudflare");
      return;
    case "check":
      await runAstro(["check", ...args], "cloudflare");
      return;
    case "integrations:worker":
      await runTypeScript("aria/scripts/run-integration-worker.ts", args, {
        cwd: workspaceRoot,
        env: runtimeEnvironment("node"),
        stdio: "inherit",
      });
      return;
    case "astro":
      await runAstro(args);
      return;
    default:
      throw new Error(`Unknown Aria project command: ${command}`);
  }
}

if (isMainModule(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    throw new Error("Specify an Aria project command");
  }
  await runProjectCommand(command, args);
}
