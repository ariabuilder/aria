#!/usr/bin/env -S npx tsx

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  readWorkerNameFromWranglerConfig,
  resolveWranglerConfigPath,
} from "../lib/storage/wrangler-config";

const DEPLOY_CONFIG = "dist/server/wrangler.json";
const DEFAULT_D1_BINDING = "aria_db";
const ACTIVE_KEY_ID_SECRET = "ARIA_API_KEYRING_KEY_ID";
const NUMBERED_KEY_PREFIX = "ARIA_API_KEYRING_KEY_";
const INITIAL_KEY_ID = "v1";
const INITIAL_KEY_SECRET = `${NUMBERED_KEY_PREFIX}V1`;
const OAUTH_ENABLED_SECRET = "ARIA_OAUTH_ENABLED";
const OAUTH_ORIGIN_SECRET = "ARIA_CANONICAL_ORIGIN";
const EMAIL_QUEUE = "aria-email-delivery";
const EMAIL_DLQ = "aria-email-delivery-dlq";
const THUMBNAIL_QUEUE = "aria-thumbnail-generation";
const INTEGRATION_QUEUE = "aria-integration-delivery";
const INTEGRATION_DLQ = "aria-integration-delivery-dlq";
const DEFAULT_WORKER_NAME = "aria-builder";
// Template producer bindings → template queue names, used to reapply the
// Deploy-button rename to dead-letter queue references the rename misses.
const TEMPLATE_QUEUE_BINDINGS: Readonly<Record<string, string>> = {
  aria_email_queue: EMAIL_QUEUE,
  aria_thumbnail_queue: THUMBNAIL_QUEUE,
  aria_integration_queue: INTEGRATION_QUEUE,
};
// Fallback ensure/verify list matching the committed wrangler.jsonc. The
// authoritative list is read from the built config after `npm run build` so
// queues renamed in the Deploy-button setup page are still honored.
const QUEUE_ENSURE_LIST: readonly QueueExpectation[] = [
  { name: EMAIL_QUEUE, deadLetterQueue: EMAIL_DLQ, requiresConsumer: true },
  { name: EMAIL_DLQ, deadLetterQueue: undefined, requiresConsumer: true },
  { name: THUMBNAIL_QUEUE, deadLetterQueue: undefined, requiresConsumer: true },
  {
    name: INTEGRATION_QUEUE,
    deadLetterQueue: INTEGRATION_DLQ,
    requiresConsumer: true,
  },
  { name: INTEGRATION_DLQ, deadLetterQueue: undefined, requiresConsumer: true },
];

export type QueueExpectation = Readonly<{
  name: string;
  deadLetterQueue?: string;
  /**
   * True when the Worker must consume this queue (it appears in the config's
   * `queues.consumers`). False for queues only referenced as another queue's
   * dead-letter target: they must exist, but nothing has to consume them.
   */
  requiresConsumer: boolean;
}>;

/**
 * Derive the queues to ensure/verify from a Wrangler config's
 * `queues.consumers` section: every consumed queue plus any referenced
 * dead-letter queues. DLQs that nothing consumes are ensured but not
 * consumer-verified. Returns null when the config has no consumers so the
 * caller can fall back to the template defaults.
 */
export function parseQueueExpectations(
  configJson: string,
): QueueExpectation[] | null {
  const parsed: unknown = JSON.parse(configJson);
  if (!isRecord(parsed) || !isRecord(parsed.queues)) {
    return null;
  }
  const consumers = parsed.queues.consumers;
  if (!Array.isArray(consumers) || consumers.length === 0) {
    return null;
  }

  const expectations = new Map<string, QueueExpectation>();
  for (const consumer of consumers) {
    if (!isRecord(consumer) || typeof consumer.queue !== "string") {
      return null;
    }
    const deadLetterQueue =
      typeof consumer.dead_letter_queue === "string" &&
      consumer.dead_letter_queue
        ? consumer.dead_letter_queue
        : undefined;
    expectations.set(consumer.queue, {
      name: consumer.queue,
      deadLetterQueue,
      requiresConsumer: true,
    });
  }
  for (const expectation of [...expectations.values()]) {
    if (
      expectation.deadLetterQueue &&
      !expectations.has(expectation.deadLetterQueue)
    ) {
      expectations.set(expectation.deadLetterQueue, {
        name: expectation.deadLetterQueue,
        deadLetterQueue: undefined,
        requiresConsumer: false,
      });
    }
  }
  return [...expectations.values()];
}

export type DeadLetterQueueRepair = Readonly<{ from: string; to: string }>;

/**
 * The Deploy-button rename rewrites producer and consumer `queue` names but
 * leaves consumer `dead_letter_queue` references pointing at the template
 * queue names. Reapply the rename observed on each producer binding to those
 * references so dead letters flow to the renamed DLQs the Worker actually
 * consumes. Returns null when there is nothing to repair.
 */
export function repairDeadLetterQueueRenames(
  configJson: string,
): { configJson: string; repairs: readonly DeadLetterQueueRepair[] } | null {
  const parsed: unknown = JSON.parse(configJson);
  if (!isRecord(parsed) || !isRecord(parsed.queues)) {
    return null;
  }
  const producers = parsed.queues.producers;
  const consumers = parsed.queues.consumers;
  if (!Array.isArray(producers) || !Array.isArray(consumers)) {
    return null;
  }

  const renames = new Map<string, string>();
  for (const producer of producers) {
    if (!isRecord(producer)) {
      return null;
    }
    const { binding, queue } = producer;
    if (typeof binding !== "string" || typeof queue !== "string") {
      return null;
    }
    const templateQueue = TEMPLATE_QUEUE_BINDINGS[binding];
    if (templateQueue && queue !== templateQueue) {
      renames.set(templateQueue, queue);
    }
  }
  if (renames.size === 0) {
    return null;
  }

  // Longest template name first so prefix replacement can never clip a
  // longer queue name that shares a prefix with a shorter one.
  const orderedRenames = [...renames.entries()].sort(
    (left, right) => right[0].length - left[0].length,
  );
  const repairs: DeadLetterQueueRepair[] = [];
  for (const consumer of consumers) {
    if (!isRecord(consumer)) {
      return null;
    }
    const deadLetterQueue = consumer.dead_letter_queue;
    if (typeof deadLetterQueue !== "string" || !deadLetterQueue) {
      continue;
    }
    for (const [from, to] of orderedRenames) {
      if (deadLetterQueue === from || deadLetterQueue.startsWith(`${from}-`)) {
        const repaired = `${to}${deadLetterQueue.slice(from.length)}`;
        if (repaired !== deadLetterQueue) {
          consumer.dead_letter_queue = repaired;
          repairs.push({ from: deadLetterQueue, to: repaired });
        }
        break;
      }
    }
  }
  if (repairs.length === 0) {
    return null;
  }
  return { configJson: JSON.stringify(parsed), repairs };
}

async function readDeployQueueExpectations(): Promise<
  QueueExpectation[] | null
> {
  try {
    return parseQueueExpectations(await readFile(DEPLOY_CONFIG, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Rewrite un-renamed `dead_letter_queue` references in the built Wrangler
 * config before Wrangler deploys it. A missing or unreadable config is left
 * to the expectation fallback and the deploy itself to report.
 */
async function repairDeployDeadLetterQueues(): Promise<void> {
  try {
    const repaired = repairDeadLetterQueueRenames(
      await readFile(DEPLOY_CONFIG, "utf8"),
    );
    if (!repaired) {
      return;
    }
    for (const { from, to } of repaired.repairs) {
      console.log(
        `Rewriting dead-letter queue ${from} -> ${to} to match the renamed queues.`,
      );
    }
    await writeFile(DEPLOY_CONFIG, repaired.configJson, "utf8");
  } catch {
    // No built config to repair; the template fallback still applies.
  }
}
const PROTECTED_KEY_STATE_QUERIES = [
  {
    source: "API credentials",
    sql: `
      SELECT key_id,
        CASE WHEN revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        THEN 1 ELSE 0 END AS requires_key
      FROM aria_api_credentials
    `,
  },
  {
    source: "webhook signing keys",
    sql: `
      SELECT key_id, 1 AS requires_key
      FROM aria_webhook_signing_keys
      WHERE secret_ciphertext <> ''
    `,
  },
  {
    source: "OAuth device-code keys",
    sql: `
      SELECT device_code_key_id AS key_id, 1 AS requires_key
      FROM aria_oauth_device_authorizations
    `,
  },
  {
    source: "OAuth user-code keys",
    sql: `
      SELECT user_code_key_id AS key_id, 1 AS requires_key
      FROM aria_oauth_device_authorizations
    `,
  },
  {
    source: "OAuth access tokens",
    sql: `
      SELECT key_id, 1 AS requires_key
      FROM aria_oauth_access_tokens
    `,
  },
  {
    source: "OAuth refresh tokens",
    sql: `
      SELECT key_id, 1 AS requires_key
      FROM aria_oauth_refresh_tokens
    `,
  },
] as const;
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/u;

export type CapturedCommandResult = Readonly<{
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}>;

export type DeployCommandRunner = Readonly<{
  capture(command: string, args: readonly string[]): CapturedCommandResult;
  inherit(command: string, args: readonly string[]): void;
}>;

export type ApiKeyringDeploymentDecision = "bootstrap" | "preserve";
export type ProtectedKeyState = Readonly<{
  protectedRecordCount: number;
  requiredKeyIds: readonly string[];
}>;
export type QueueConsumer = Readonly<{
  scriptName: string | null;
  deadLetterQueue: string | null;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createCommandRunner(): DeployCommandRunner {
  const environment = { ...process.env, CI: "true" };
  return {
    capture(command, args) {
      const result = spawnSync(command, [...args], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: environment,
        stdio: ["ignore", "pipe", "pipe"],
      });
      return {
        status: result.status,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        error: result.error,
      };
    },
    inherit(command, args) {
      const result = spawnSync(command, [...args], {
        cwd: process.cwd(),
        env: environment,
        stdio: "inherit",
      });
      if (result.error) throw result.error;
      if (result.status !== 0) {
        throw new Error(
          `Command failed (${result.status ?? "unknown status"}): ${command} ${args.join(" ")}`,
        );
      }
    },
  };
}

export function parseWorkerSecretNames(json: string): string[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error("Wrangler secret list returned an invalid response");
  }

  const names = parsed.map((item) => {
    if (!isRecord(item) || typeof item.name !== "string" || !item.name) {
      throw new Error("Wrangler secret list returned an invalid secret entry");
    }
    return item.name;
  });
  return [...new Set(names)].sort();
}

export function parseCredentialKeyState(json: string): ProtectedKeyState {
  const parsed: unknown = JSON.parse(json);
  const batches = Array.isArray(parsed) ? parsed : [parsed];
  if (
    batches.length === 0 ||
    batches.some(
      (batch) =>
        !isRecord(batch) ||
        batch.success !== true ||
        !Array.isArray(batch.results),
    )
  ) {
    throw new Error("Remote protected-key query returned an invalid response");
  }
  const rows = batches.flatMap(
    (batch) => (batch as { results: unknown[] }).results,
  );

  const requiredKeyIds = rows.flatMap((row) => {
    if (
      !isRecord(row) ||
      typeof row.key_id !== "string" ||
      (row.requires_key !== 0 && row.requires_key !== 1)
    ) {
      throw new Error("Remote protected-key query returned an invalid row");
    }
    if (!KEY_ID_PATTERN.test(row.key_id)) {
      throw new Error("Remote protected-key query returned an invalid key ID");
    }
    return row.requires_key === 1 ? [row.key_id] : [];
  });
  return {
    protectedRecordCount: rows.length,
    requiredKeyIds: [...new Set(requiredKeyIds)].sort(),
  };
}

export function mergeProtectedKeyStates(
  states: readonly ProtectedKeyState[],
): ProtectedKeyState {
  const requiredKeyIds = new Set<string>();
  let protectedRecordCount = 0;
  for (const state of states) {
    protectedRecordCount += state.protectedRecordCount;
    for (const keyId of state.requiredKeyIds) requiredKeyIds.add(keyId);
  }
  return {
    protectedRecordCount,
    requiredKeyIds: [...requiredKeyIds].sort(),
  };
}

export function isWranglerWorkerNotFound(stderr: string): boolean {
  return (
    /Worker "[^"\r\n]+"(?: \(env: [^)]+\))? not found\./u.test(stderr) &&
    stderr.includes("If this is a new Worker, run `wrangler deploy` first")
  );
}

export function isWranglerQueueNotFound(stderr: string): boolean {
  return /queue[^\r\n]*(?:not found|does not exist|could not be found)/iu.test(
    stderr,
  );
}

export function parseQueueConsumers(json: string): QueueConsumer[] {
  const parsed: unknown = JSON.parse(json);
  const values = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.result)
      ? parsed.result
      : null;
  if (!values) {
    throw new Error(
      "Wrangler queue consumer list returned an invalid response",
    );
  }
  return values.map((value) => {
    if (!isRecord(value)) {
      throw new Error("Wrangler queue consumer list returned an invalid entry");
    }
    const workerNames = [value.script, value.service, value.script_name].filter(
      (name): name is string => typeof name === "string" && name.length > 0,
    );
    const distinctWorkerNames = [...new Set(workerNames)];
    if (distinctWorkerNames.length > 1) {
      throw new Error("Wrangler queue consumer list returned an invalid entry");
    }
    const scriptName = distinctWorkerNames[0] ?? null;
    const deadLetterQueue =
      typeof value.dead_letter_queue === "string" && value.dead_letter_queue
        ? value.dead_letter_queue
        : null;
    if (!scriptName && value.type !== "http_pull") {
      throw new Error("Wrangler queue consumer list returned an invalid entry");
    }
    return { scriptName, deadLetterQueue };
  });
}

function numberedKeySecretName(keyId: string): string {
  return `${NUMBERED_KEY_PREFIX}${keyId.toUpperCase()}`;
}

export function decideApiKeyringDeployment(
  secretNames: readonly string[],
  keyState: ProtectedKeyState,
): ApiKeyringDeploymentDecision {
  const secrets = new Set(secretNames);
  const hasActiveKeyId = secrets.has(ACTIVE_KEY_ID_SECRET);
  const numberedKeys = [...secrets].filter(
    (name) =>
      name.startsWith(NUMBERED_KEY_PREFIX) && name !== ACTIVE_KEY_ID_SECRET,
  );

  if (!hasActiveKeyId && numberedKeys.length === 0) {
    if (keyState.protectedRecordCount > 0) {
      throw new Error(
        "API credentials, webhook signing keys, or OAuth records exist, but the deployment keyring is missing. Restore the original Worker secrets; automatic deployment will not replace lost key material.",
      );
    }
    return "bootstrap";
  }

  if (!hasActiveKeyId || numberedKeys.length === 0) {
    throw new Error(
      "The Site API deployment keyring is incomplete. Restore ARIA_API_KEYRING_KEY_ID and its numbered Worker secret before deploying.",
    );
  }

  const missingProtectedKeys = keyState.requiredKeyIds
    .map(numberedKeySecretName)
    .filter((name) => !secrets.has(name));
  if (missingProtectedKeys.length > 0) {
    throw new Error(
      `The deployment is missing numbered Worker secrets required by stored API credentials, webhook signing keys, or OAuth records: ${[...new Set(missingProtectedKeys)].join(", ")}.`,
    );
  }

  return "preserve";
}

function requireSuccessfulCommand(
  result: CapturedCommandResult,
  description: string,
): string {
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = result.stderr.trim();
    throw new Error(
      detail ? `${description} failed: ${detail}` : `${description} failed`,
    );
  }
  return result.stdout;
}

function readRemoteSecretNames(runner: DeployCommandRunner): string[] {
  const result = runner.capture("npx", [
    "wrangler",
    "secret",
    "list",
    "--config",
    DEPLOY_CONFIG,
    "--format",
    "json",
  ]);
  if (result.status !== 0 && isWranglerWorkerNotFound(result.stderr)) {
    return [];
  }
  return parseWorkerSecretNames(
    requireSuccessfulCommand(result, "Reading Worker secret names"),
  );
}

function readProtectedKeyState(
  runner: DeployCommandRunner,
  databaseBinding: string,
): ProtectedKeyState {
  return mergeProtectedKeyStates(
    PROTECTED_KEY_STATE_QUERIES.map(({ source, sql }) => {
      const result = runner.capture("npx", [
        "wrangler",
        "d1",
        "execute",
        databaseBinding,
        "--remote",
        "--command",
        sql,
        "--json",
        "--config",
        DEPLOY_CONFIG,
      ]);
      return parseCredentialKeyState(
        requireSuccessfulCommand(
          result,
          `Reading protected key IDs from ${source}`,
        ),
      );
    }),
  );
}

function readQueueConsumers(
  runner: DeployCommandRunner,
  queueName: string,
): QueueConsumer[] | null {
  const result = runner.capture("npx", [
    "wrangler",
    "queues",
    "consumer",
    "list",
    queueName,
    "--json",
    "--config",
    DEPLOY_CONFIG,
  ]);
  if (result.status !== 0 && isWranglerQueueNotFound(result.stderr)) {
    return null;
  }
  return parseQueueConsumers(
    requireSuccessfulCommand(
      result,
      `Reading consumers for Cloudflare Queue ${queueName}`,
    ),
  );
}

function assertQueueOwnership(
  consumers: readonly QueueConsumer[],
  queueName: string,
  workerName: string,
  requireExpectedConsumer: boolean,
  expectedDeadLetterQueue?: string,
): void {
  const foreign = consumers.filter(
    (consumer) => consumer.scriptName !== workerName,
  );
  if (foreign.length > 0) {
    throw new Error(
      `Cloudflare Queue ${queueName} already has a consumer that is not ${workerName}. Refusing to replace another deployment's consumer.`,
    );
  }
  if (
    requireExpectedConsumer &&
    !consumers.some((consumer) => consumer.scriptName === workerName)
  ) {
    throw new Error(
      `Cloudflare Queue ${queueName} is not connected to Worker ${workerName} after deployment.`,
    );
  }
  if (requireExpectedConsumer && expectedDeadLetterQueue) {
    const expectedConsumer = consumers.find(
      (consumer) => consumer.scriptName === workerName,
    );
    if (expectedConsumer?.deadLetterQueue !== expectedDeadLetterQueue) {
      throw new Error(
        `Cloudflare Queue ${queueName} is not configured with dead-letter queue ${expectedDeadLetterQueue}.`,
      );
    }
  }
}

function ensureQueues(
  runner: DeployCommandRunner,
  workerName: string,
  expectations: readonly QueueExpectation[],
): void {
  for (const { name: queueName, requiresConsumer } of expectations) {
    const consumers = readQueueConsumers(runner, queueName);
    if (consumers === null) {
      console.log(`Creating Cloudflare Queue ${queueName}.`);
      runner.inherit("npx", [
        "wrangler",
        "queues",
        "create",
        queueName,
        "--config",
        DEPLOY_CONFIG,
      ]);
      continue;
    }
    if (requiresConsumer) {
      assertQueueOwnership(consumers, queueName, workerName, false);
    }
  }
}

function verifyQueueConsumers(
  runner: DeployCommandRunner,
  workerName: string,
  expectations: readonly QueueExpectation[],
): void {
  for (const {
    name: queueName,
    deadLetterQueue,
    requiresConsumer,
  } of expectations) {
    const consumers = readQueueConsumers(runner, queueName);
    if (consumers === null) {
      throw new Error(
        `Cloudflare Queue ${queueName} is missing after deployment.`,
      );
    }
    if (!requiresConsumer) {
      // Dead-letter targets nothing consumes only need to exist.
      continue;
    }
    assertQueueOwnership(
      consumers,
      queueName,
      workerName,
      true,
      deadLetterQueue,
    );
  }
}

export function resolveDeployWorkerName(explicit?: string): string {
  if (explicit?.trim()) {
    return explicit.trim();
  }
  const fromEnv = process.env.ARIA_WORKER_NAME?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  // Resolve from the active root config (private wrangler.toml wins over the
  // committed wrangler.jsonc) so renamed Workers keep queue ownership checks.
  const configPath = resolveWranglerConfigPath();
  if (configPath) {
    const fromConfig = readWorkerNameFromWranglerConfig(configPath);
    if (fromConfig) {
      return fromConfig;
    }
  }
  return DEFAULT_WORKER_NAME;
}

export function parseDeployedWorkerOrigin(output: string): string | null {
  const match = /https:\/\/[a-z0-9][a-z0-9.-]*\.workers\.dev/iu.exec(output);
  if (!match) {
    return null;
  }
  try {
    return new URL(match[0]).origin;
  } catch {
    return null;
  }
}

/**
 * Deploy the Worker while capturing Wrangler's output (echoed through so the
 * operator still sees it). The combined output is returned so the published
 * workers.dev origin can be parsed for OAuth bootstrap.
 */
function deployWorkerAndCapture(
  runner: DeployCommandRunner,
  extraArgs: readonly string[] = [],
): string {
  const result = runner.capture("npx", [
    "wrangler",
    "deploy",
    "--config",
    DEPLOY_CONFIG,
    ...extraArgs,
  ]);
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = result.stderr.trim();
    throw new Error(
      detail
        ? `Wrangler deploy failed: ${detail}`
        : "Wrangler deploy failed",
    );
  }
  return `${result.stdout}\n${result.stderr}`;
}

async function uploadWorkerSecrets(
  runner: DeployCommandRunner,
  secrets: Record<string, string>,
  temporaryDirectoryRoot: string,
): Promise<void> {
  const temporaryDirectory = await mkdtemp(
    join(temporaryDirectoryRoot, "aria-deploy-secrets-"),
  );
  const secretsPath = join(temporaryDirectory, "secrets.json");
  try {
    await chmod(temporaryDirectory, 0o700);
    await writeFile(secretsPath, JSON.stringify(secrets), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    runner.inherit("npx", [
      "wrangler",
      "secret",
      "bulk",
      secretsPath,
      "--config",
      DEPLOY_CONFIG,
    ]);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

/**
 * Fill in missing OAuth runtime secrets after a successful deploy without
 * ever overwriting existing values (a custom-domain canonical origin must
 * survive redeploys). All-or-nothing on the pair: if the origin cannot be
 * determined, OAuth is left fully manual rather than enabled-but-originless.
 */
async function reconcileOAuthSecrets(
  runner: DeployCommandRunner,
  deployOutput: string,
  temporaryDirectoryRoot: string,
): Promise<void> {
  const secretNames = new Set(readRemoteSecretNames(runner));
  const hasEnabled = secretNames.has(OAUTH_ENABLED_SECRET);
  const hasOrigin = secretNames.has(OAUTH_ORIGIN_SECRET);
  if (hasEnabled && hasOrigin) {
    console.log("OAuth runtime secrets already configured; preserving them.");
    return;
  }

  const origin = parseDeployedWorkerOrigin(deployOutput);
  if (!hasOrigin && !origin) {
    console.warn(
      `Could not determine the workers.dev origin from deploy output; set ${OAUTH_ENABLED_SECRET} and ${OAUTH_ORIGIN_SECRET} manually to enable OAuth.`,
    );
    return;
  }

  const secrets: Record<string, string> = {};
  if (!hasEnabled) {
    secrets[OAUTH_ENABLED_SECRET] = "true";
  }
  if (!hasOrigin) {
    secrets[OAUTH_ORIGIN_SECRET] = origin!;
  }
  console.log("Configuring OAuth runtime secrets for the published origin.");
  await uploadWorkerSecrets(runner, secrets, temporaryDirectoryRoot);
}

export type DeployCloudflareOptions = Readonly<{
  databaseBinding?: string;
  randomKeyBytes?: () => Uint8Array;
  runner?: DeployCommandRunner;
  temporaryDirectoryRoot?: string;
  workerName?: string;
}>;

export async function deployCloudflare(
  options: DeployCloudflareOptions = {},
): Promise<ApiKeyringDeploymentDecision> {
  const runner = options.runner ?? createCommandRunner();
  const databaseBinding = options.databaseBinding ?? DEFAULT_D1_BINDING;
  const workerName = resolveDeployWorkerName(options.workerName);
  const temporaryRoot = options.temporaryDirectoryRoot ?? tmpdir();

  runner.inherit("npm", ["run", "deploy:migrate"]);
  runner.inherit("npm", ["run", "build"]);
  // The Deploy-button rename misses `dead_letter_queue` references; reapply
  // the rename in the built config before anything reads or deploys it.
  await repairDeployDeadLetterQueues();
  // After the build, dist/server/wrangler.json is the config wrangler deploy
  // uses — read queue expectations from it so Deploy-button resource renames
  // are honored. Falls back to the committed template's queue names.
  const parsedQueueExpectations = await readDeployQueueExpectations();
  if (!parsedQueueExpectations) {
    console.warn(
      `Could not read queue expectations from ${DEPLOY_CONFIG}; falling back to the template queue names.`,
    );
  }
  const queueExpectations = parsedQueueExpectations ?? QUEUE_ENSURE_LIST;
  ensureQueues(runner, workerName, queueExpectations);

  const secretNames = readRemoteSecretNames(runner);
  const keyState = readProtectedKeyState(runner, databaseBinding);
  const decision = decideApiKeyringDeployment(secretNames, keyState);

  if (decision === "preserve") {
    console.log("Site API keyring found; preserving existing Worker secrets.");
    const deployOutput = deployWorkerAndCapture(runner);
    await reconcileOAuthSecrets(runner, deployOutput, temporaryRoot);
    verifyQueueConsumers(runner, workerName, queueExpectations);
    return decision;
  }

  const temporaryDirectory = await mkdtemp(
    join(temporaryRoot, "aria-deploy-secrets-"),
  );
  const secretsPath = join(temporaryDirectory, "secrets.json");

  try {
    await chmod(temporaryDirectory, 0o700);
    const keyBytes = options.randomKeyBytes?.() ?? randomBytes(32);
    if (keyBytes.byteLength !== 32) {
      throw new Error("Generated Site API keyring root must contain 32 bytes");
    }
    const secrets = {
      [ACTIVE_KEY_ID_SECRET]: INITIAL_KEY_ID,
      [INITIAL_KEY_SECRET]: Buffer.from(keyBytes).toString("base64"),
    };
    await writeFile(secretsPath, JSON.stringify(secrets), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });

    // Confirm the file contains only the expected bindings without printing
    // either value. This also catches partial writes before Wrangler runs.
    const written = JSON.parse(await readFile(secretsPath, "utf8")) as unknown;
    if (
      !isRecord(written) ||
      Object.keys(written).sort().join(",") !==
        [ACTIVE_KEY_ID_SECRET, INITIAL_KEY_SECRET].sort().join(",")
    ) {
      throw new Error("Temporary Site API secrets file is invalid");
    }

    console.log(
      "Provisioning the initial Site API keyring with the Worker deployment.",
    );
    const deployOutput = deployWorkerAndCapture(runner, [
      "--secrets-file",
      secretsPath,
    ]);
    await reconcileOAuthSecrets(runner, deployOutput, temporaryRoot);
    verifyQueueConsumers(runner, workerName, queueExpectations);
    return decision;
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

const isMain = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMain) {
  await deployCloudflare({
    databaseBinding: process.env.ARIA_D1_BINDING || DEFAULT_D1_BINDING,
  });
}
