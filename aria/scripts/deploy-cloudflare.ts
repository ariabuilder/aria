import { randomBytes } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  readWorkerNameFromWranglerConfig,
  resolveWranglerConfigPath,
} from "../lib/storage/wrangler-config";
import { applyD1Migrations } from "./apply-d1-migrations";
import { isMainModule } from "./lib/node-command";
import { buildCloudflare } from "./project-command";
import { runWranglerSync } from "./lib/wrangler-command";

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
    /** Orders queue renames by descending source-name length. */
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

/** Reads queue names expected by the generated deployment configuration. */
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
  build(): Promise<void>;
  inherit(command: string, args: readonly string[]): void;
  migrate(): Promise<void>;
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

/** Returns whether a parsed value is a non-null object record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Creates the production command runner used by the deployment workflow. */
function createCommandRunner(databaseBinding: string): DeployCommandRunner {
  const environment = { ...process.env, CI: "true" };
  return {
    build: buildCloudflare,
    /** Runs Wrangler and captures its result for parsing. */
    capture(command, args) {
      if (command !== "wrangler") {
        throw new Error(`Unsupported deployment command: ${command}`);
      }
      return runWranglerSync(args, {
        allowFailure: true,
        env: environment,
        stdio: ["ignore", "pipe", "pipe"],
      });
    },
    /** Runs Wrangler with terminal output inherited by the caller. */
    inherit(command, args) {
      if (command !== "wrangler") {
        throw new Error(`Unsupported deployment command: ${command}`);
      }
      runWranglerSync(args, {
        env: environment,
        stdio: "inherit",
      });
    },
    /** Applies remote D1 migrations to the resolved database binding. */
    migrate: () => applyD1Migrations("remote", databaseBinding),
  };
}

/** Parses secret names from Wrangler's JSON response. */
export function parseWorkerSecretNames(json: string): string[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error("Wrangler secret list returned an invalid response");
  }

  const names = parsed.map(
    /** Validates a Wrangler secret entry and returns its name. */
    (item) => {
      if (!isRecord(item) || typeof item.name !== "string" || !item.name) {
        throw new Error(
          "Wrangler secret list returned an invalid secret entry",
        );
      }
      return item.name;
    },
  );
  return [...new Set(names)].sort();
}

/** Parses protected credential-key state returned from D1. */
export function parseCredentialKeyState(json: string): ProtectedKeyState {
  const parsed: unknown = JSON.parse(json);
  const batches = Array.isArray(parsed) ? parsed : [parsed];
  if (
    batches.length === 0 ||
    batches.some(
      /** Detects malformed protected-key response batches. */
      (batch) =>
        !isRecord(batch) ||
        batch.success !== true ||
        !Array.isArray(batch.results),
    )
  ) {
    throw new Error("Remote protected-key query returned an invalid response");
  }
  const rows = batches.flatMap(
    /** Collects protected-key rows from validated batches. */
    (batch) => (batch as { results: unknown[] }).results,
  );

  const requiredKeyIds = rows.flatMap(
    /** Validates a protected-key row and returns any required key ID. */
    (row) => {
      if (
        !isRecord(row) ||
        typeof row.key_id !== "string" ||
        (row.requires_key !== 0 && row.requires_key !== 1)
      ) {
        throw new Error("Remote protected-key query returned an invalid row");
      }
      if (!KEY_ID_PATTERN.test(row.key_id)) {
        throw new Error(
          "Remote protected-key query returned an invalid key ID",
        );
      }
      return row.requires_key === 1 ? [row.key_id] : [];
    },
  );
  return {
    protectedRecordCount: rows.length,
    requiredKeyIds: [...new Set(requiredKeyIds)].sort(),
  };
}

/** Merges protected key-state results from multiple D1 queries. */
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

/** Detects Wrangler errors produced when a Worker does not exist. */
export function isWranglerWorkerNotFound(stderr: string): boolean {
  return (
    /Worker "[^"\r\n]+"(?: \(env: [^)]+\))? not found\./u.test(stderr) &&
    stderr.includes("If this is a new Worker, run `wrangler deploy` first")
  );
}

/** Detects Wrangler errors produced when a queue does not exist. */
export function isWranglerQueueNotFound(stderr: string): boolean {
  return /queue[^\r\n]*(?:not found|does not exist|could not be found)/iu.test(
    stderr,
  );
}

/** Parses queue-consumer configuration from Wrangler JSON output. */
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
  return values.map(
    /** Converts a validated Wrangler value into a queue consumer. */
    (value) => {
      if (!isRecord(value)) {
        throw new Error(
          "Wrangler queue consumer list returned an invalid entry",
        );
      }
      const workerNames = [
        value.script,
        value.service,
        value.script_name,
      ].filter(
        /** Keeps non-empty Worker names exposed by Wrangler variants. */
        (name): name is string => typeof name === "string" && name.length > 0,
      );
      const distinctWorkerNames = [...new Set(workerNames)];
      if (distinctWorkerNames.length > 1) {
        throw new Error(
          "Wrangler queue consumer list returned an invalid entry",
        );
      }
      const scriptName = distinctWorkerNames[0] ?? null;
      const deadLetterQueue =
        typeof value.dead_letter_queue === "string" && value.dead_letter_queue
          ? value.dead_letter_queue
          : null;
      if (!scriptName && value.type !== "http_pull") {
        throw new Error(
          "Wrangler queue consumer list returned an invalid entry",
        );
      }
      return { scriptName, deadLetterQueue };
    },
  );
}

/** Builds the Worker secret name for a numbered key identifier. */
function numberedKeySecretName(keyId: string): string {
  return `${NUMBERED_KEY_PREFIX}${keyId.toUpperCase()}`;
}

/** Decides whether deployment should bootstrap or preserve API key secrets. */
export function decideApiKeyringDeployment(
  secretNames: readonly string[],
  keyState: ProtectedKeyState,
): ApiKeyringDeploymentDecision {
  const secrets = new Set(secretNames);
  const hasActiveKeyId = secrets.has(ACTIVE_KEY_ID_SECRET);
  const numberedKeys = [...secrets].filter(
    /** Keeps numbered secrets while excluding the active ID marker. */
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
    /** Keeps required key secrets that are absent from the Worker. */
    .filter((name) => !secrets.has(name));
  if (missingProtectedKeys.length > 0) {
    throw new Error(
      `The deployment is missing numbered Worker secrets required by stored API credentials, webhook signing keys, or OAuth records: ${[...new Set(missingProtectedKeys)].join(", ")}.`,
    );
  }

  return "preserve";
}

/** Throws when an allowed-to-fail command did not complete successfully. */
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

/** Reads the names of secrets already stored for the remote Worker. */
function readRemoteSecretNames(runner: DeployCommandRunner): string[] {
  const result = runner.capture("wrangler", [
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

/** Reads protected key requirements from every remote credential table. */
function readProtectedKeyState(
  runner: DeployCommandRunner,
  databaseBinding: string,
): ProtectedKeyState {
  return mergeProtectedKeyStates(
    PROTECTED_KEY_STATE_QUERIES.map(({ source, sql }) => {
      const result = runner.capture("wrangler", [
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

/** Reads queue consumers and returns null when the queue does not exist. */
function readQueueConsumers(
  runner: DeployCommandRunner,
  queueName: string,
): QueueConsumer[] | null {
  const result = runner.capture("wrangler", [
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

/** Ensures an existing queue belongs to the Worker being deployed. */
function assertQueueOwnership(
  consumers: readonly QueueConsumer[],
  queueName: string,
  workerName: string,
  requireExpectedConsumer: boolean,
  expectedDeadLetterQueue?: string,
): void {
  const foreign = consumers.filter(
    /** Keeps consumers owned by another Worker. */
    (consumer) => consumer.scriptName !== workerName,
  );
  if (foreign.length > 0) {
    throw new Error(
      `Cloudflare Queue ${queueName} already has a consumer that is not ${workerName}. Refusing to replace another deployment's consumer.`,
    );
  }
  if (
    requireExpectedConsumer &&
    !consumers.some(
      /** Detects the expected Worker consumer. */
      (consumer) => consumer.scriptName === workerName,
    )
  ) {
    throw new Error(
      `Cloudflare Queue ${queueName} is not connected to Worker ${workerName} after deployment.`,
    );
  }
  if (requireExpectedConsumer && expectedDeadLetterQueue) {
    const expectedConsumer = consumers.find(
      /** Finds the deployed Worker's queue consumer configuration. */
      (consumer) => consumer.scriptName === workerName,
    );
    if (expectedConsumer?.deadLetterQueue !== expectedDeadLetterQueue) {
      throw new Error(
        `Cloudflare Queue ${queueName} is not configured with dead-letter queue ${expectedDeadLetterQueue}.`,
      );
    }
  }
}

/** Creates missing queues and protects queues owned by another Worker. */
function ensureQueues(
  runner: DeployCommandRunner,
  workerName: string,
  expectations: readonly QueueExpectation[],
): void {
  for (const { name: queueName, requiresConsumer } of expectations) {
    const consumers = readQueueConsumers(runner, queueName);
    if (consumers === null) {
      console.log(`Creating Cloudflare Queue ${queueName}.`);
      runner.inherit("wrangler", [
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

/** Verifies that deployed queues have the expected Worker consumers. */
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

/** Resolves the Worker name used for Cloudflare deployment. */
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

/** Extracts the published Worker origin from Wrangler deploy output. */
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
  const result = runner.capture("wrangler", [
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
      detail ? `Wrangler deploy failed: ${detail}` : "Wrangler deploy failed",
    );
  }
  return `${result.stdout}\n${result.stderr}`;
}

/** Uploads Worker secrets from a protected file that is always removed. */
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
    if (process.platform !== "win32") {
      await chmod(temporaryDirectory, 0o700);
    }
    await writeFile(secretsPath, JSON.stringify(secrets), {
      encoding: "utf8",
      flag: "wx",
      mode: process.platform === "win32" ? undefined : 0o600,
    });
    runner.inherit("wrangler", [
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

/** Runs the complete Cloudflare provisioning and Worker deployment workflow. */
export async function deployCloudflare(
  options: DeployCloudflareOptions = {},
): Promise<ApiKeyringDeploymentDecision> {
  const databaseBinding = options.databaseBinding ?? DEFAULT_D1_BINDING;
  const runner = options.runner ?? createCommandRunner(databaseBinding);
  const workerName = resolveDeployWorkerName(options.workerName);
  const temporaryRoot = options.temporaryDirectoryRoot ?? tmpdir();

  await runner.migrate();
  await runner.build();
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
    if (process.platform !== "win32") {
      await chmod(temporaryDirectory, 0o700);
    }
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
      mode: process.platform === "win32" ? undefined : 0o600,
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

if (isMainModule(import.meta.url)) {
  await deployCloudflare({
    databaseBinding: process.env.ARIA_D1_BINDING || DEFAULT_D1_BINDING,
  });
}
