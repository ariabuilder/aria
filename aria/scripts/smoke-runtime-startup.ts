import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "node:net";

import { applyD1Migrations } from "./apply-d1-migrations";
import {
  isMainModule,
  runPackageBin,
  type CommandResult,
} from "./lib/node-command";

const HOST = "127.0.0.1";
const STARTUP_PATH = "/api/v1/openapi.json";
const STARTUP_TIMEOUT_MS = 90_000;
type RuntimeTarget = "cloudflare" | "node";

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, HOST, resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Unable to reserve a runtime smoke-test port");
  }
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

function commandOutput(label: string, output: string): string {
  return `${label}:\n${output.trim() || "(none)"}`;
}

export function assertServerStillRunning(input: {
  result: CommandResult | undefined;
  runtime: RuntimeTarget;
  url: string;
}): void {
  if (!input.result) {
    return;
  }

  const exitReason =
    input.result.status !== null
      ? `status ${input.result.status}`
      : `signal ${input.result.signal ?? "unknown"}`;
  throw new Error(
    [
      `Development server for ${input.runtime} exited before becoming ready at ${input.url} (${exitReason}).`,
      commandOutput("stdout", input.result.stdout),
      commandOutput("stderr", input.result.stderr),
    ].join("\n"),
  );
}

export function isReadyResponse(status: number): boolean {
  return status < 500;
}

async function waitForServer(input: {
  result: () => CommandResult | undefined;
  runtime: RuntimeTarget;
  url: string;
}): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastStatus: number | undefined;

  while (Date.now() < deadline) {
    assertServerStillRunning({
      result: input.result(),
      runtime: input.runtime,
      url: input.url,
    });
    try {
      const response = await fetch(input.url, {
        redirect: "manual",
        signal: AbortSignal.timeout(2_000),
      });
      lastStatus = response.status;
      if (isReadyResponse(response.status)) {
        return;
      }
    } catch {
      // Startup races are expected until Astro begins listening.
    }
    await delay(250);
  }
  throw new Error(
    `Development server for ${input.runtime} did not become ready at ${input.url}${
      lastStatus === undefined ? "" : ` (last HTTP status ${lastStatus})`
    }`,
  );
}

async function smokeRuntime(input: {
  port: number;
  runtime: RuntimeTarget;
}): Promise<void> {
  if (input.runtime === "cloudflare") {
    await applyD1Migrations("local");
  }
  const controller = new AbortController();
  let completed: CommandResult | undefined;
  const completion = runPackageBin(
    "astro",
    "astro",
    ["dev", "--host", HOST, "--port", String(input.port)],
    {
      allowFailure: true,
      env: {
        ARIA_RUNTIME: input.runtime,
        ASTRO_DEV_BACKGROUND: "0",
      },
      signal: controller.signal,
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).then((result) => {
    completed = result;
    return result;
  });

  try {
    await waitForServer({
      result: () => completed,
      runtime: input.runtime,
      url: `http://${HOST}:${input.port}${STARTUP_PATH}`,
    });
    console.log(
      `Runtime startup smoke passed: ${input.runtime} on port ${input.port}.`,
    );
  } finally {
    controller.abort();
    await completion;
  }
}

if (isMainModule(import.meta.url)) {
  if (process.env.ARIA_SKIP_RUNTIME_SMOKE === "1") {
    console.log("Runtime startup smoke skipped by ARIA_SKIP_RUNTIME_SMOKE.");
  } else {
    await smokeRuntime({ runtime: "node", port: await availablePort() });
    await smokeRuntime({ runtime: "cloudflare", port: await availablePort() });
  }
}
