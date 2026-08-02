import { resolve } from "node:path";

import {
  isMainModule,
  runPackageBin,
  runTypeScript,
} from "./lib/node-command";

const workspaceRoot = resolve(import.meta.dirname, "../..");

/** Runs the complete Phase 1 Node/workerd fixture and bundle boundary gate. */
export async function testRenderingFoundation(): Promise<void> {
  for (const configPath of [
    "vitest.rendering-foundation.node.config.ts",
    "vitest.rendering-foundation.workerd.config.ts",
  ]) {
    await runPackageBin("vitest", "vitest", ["run", "--config", configPath], {
      cwd: workspaceRoot,
      stdio: "inherit",
    });
  }
  await runTypeScript(
    "aria/scripts/check-rendering-foundation-boundaries.ts",
    [],
    {
      cwd: workspaceRoot,
      stdio: "inherit",
    },
  );
}

if (isMainModule(import.meta.url)) {
  await testRenderingFoundation();
}
