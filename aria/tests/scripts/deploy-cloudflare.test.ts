import { readFileSync, statSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  decideApiKeyringDeployment,
  deployCloudflare,
  isWranglerQueueNotFound,
  isWranglerWorkerNotFound,
  mergeProtectedKeyStates,
  parseCredentialKeyState,
  parseDeployedWorkerOrigin,
  parseQueueConsumers,
  parseQueueExpectations,
  parseWorkerSecretNames,
  repairDeadLetterQueueRenames,
  resolveDeployWorkerName,
  type CapturedCommandResult,
  type DeployCommandRunner,
} from "../../scripts/deploy-cloudflare";

const KEY_ID = "ARIA_API_KEYRING_KEY_ID";
const KEY_V1 = "ARIA_API_KEYRING_KEY_V1";
const OAUTH_ENABLED = "ARIA_OAUTH_ENABLED";
const OAUTH_ORIGIN = "ARIA_CANONICAL_ORIGIN";
const ANALYTICS_TOKEN = "ARIA_CLOUDFLARE_ANALYTICS_TOKEN";
const DEPLOY_ORIGIN = "https://aria-builder.test-account.workers.dev";
const DEFAULT_DEPLOY_STDOUT = `Uploaded aria-builder (1.23 sec)\nDeployed aria-builder triggers (0.12 sec)\n  ${DEPLOY_ORIGIN}\n`;

function success(stdout = ""): CapturedCommandResult {
  return { status: 0, stderr: "", stdout };
}

function d1KeyState(
  ...rows: Array<{ keyId: string; requiresKey?: boolean }>
): string {
  return JSON.stringify([
    {
      results: rows.map(({ keyId, requiresKey = true }) => ({
        key_id: keyId,
        requires_key: requiresKey ? 1 : 0,
      })),
      success: true,
    },
  ]);
}

function createRunner(options: {
  credentialKeys?: Array<{ keyId: string; requiresKey?: boolean }>;
  deployError?: Error;
  deployStdout?: string;
  protectedKeyStates?: CapturedCommandResult[];
  secretList?: CapturedCommandResult;
  queueConsumers?: Record<string, CapturedCommandResult>;
}) {
  const captured: Array<{
    args: readonly string[];
    command: string;
    sql?: string;
  }> = [];
  const inherited: Array<{ args: readonly string[]; command: string }> = [];
  let uploadedSecrets:
    | { contents: Record<string, string>; fileMode: number }
    | undefined;
  const uploadedBulkSecrets: Array<Record<string, string>> = [];
  let deployed = false;
  let protectedKeyQueryIndex = 0;

  const runner: DeployCommandRunner = {
    async build() {
      inherited.push({ command: "aria", args: ["build"] });
    },
    capture(command, args) {
      const commandIndex = args.indexOf("--command");
      captured.push({
        command,
        args: [...args],
        sql:
          commandIndex >= 0 && args[commandIndex + 1]
            ? args[commandIndex + 1]
            : undefined,
      });
      if (args.includes("deploy")) {
        if (options.deployError) {
          return {
            status: 1,
            stdout: "",
            stderr: options.deployError.message,
          };
        }
        const secretsFlag = args.indexOf("--secrets-file");
        if (secretsFlag >= 0) {
          const secretsPath = args[secretsFlag + 1];
          if (!secretsPath) throw new Error("Missing test secrets path");
          uploadedSecrets = {
            contents: JSON.parse(readFileSync(secretsPath, "utf8")) as Record<
              string,
              string
            >,
            fileMode: statSync(secretsPath).mode & 0o777,
          };
        }
        deployed = true;
        return success(options.deployStdout ?? DEFAULT_DEPLOY_STDOUT);
      }
      if (args.includes("secret")) {
        return options.secretList ?? success("[]");
      }
      if (args.includes("consumer") && args.includes("list")) {
        const listIndex = args.indexOf("list");
        const queueName = args[listIndex + 1] ?? "";
        const configured = options.queueConsumers?.[queueName];
        if (configured) return configured;
        return success(
          deployed
            ? JSON.stringify([
                {
                  script: "aria-builder",
                  dead_letter_queue:
                    queueName === "aria-integration-delivery"
                      ? "aria-integration-delivery-dlq"
                      : queueName === "aria-email-delivery"
                        ? "aria-email-delivery-dlq"
                        : null,
                },
              ])
            : "[]",
        );
      }
      if (args.includes("d1") && args.includes("execute")) {
        return (
          options.protectedKeyStates?.[protectedKeyQueryIndex++] ??
          success(d1KeyState(...(options.credentialKeys ?? [])))
        );
      }
      return success(d1KeyState(...(options.credentialKeys ?? [])));
    },
    inherit(command, args) {
      inherited.push({ command, args: [...args] });
      if (args.includes("secret") && args.includes("bulk")) {
        const secretsPath = args[args.indexOf("bulk") + 1];
        if (!secretsPath) throw new Error("Missing test bulk secrets path");
        uploadedBulkSecrets.push(
          JSON.parse(readFileSync(secretsPath, "utf8")) as Record<
            string,
            string
          >,
        );
      }
    },
    async migrate() {
      inherited.push({ command: "aria", args: ["migrate"] });
    },
  };

  return {
    captured,
    inherited,
    runner,
    uploadedSecrets: () => uploadedSecrets,
    uploadedBulkSecrets: () => uploadedBulkSecrets,
  };
}

const temporaryRoots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("Cloudflare API keyring deploy state", () => {
  it("parses Wrangler secret and D1 query output strictly", () => {
    expect(
      parseWorkerSecretNames(
        JSON.stringify([
          { name: KEY_V1, type: "secret_text" },
          { name: KEY_ID, type: "secret_text" },
          { name: KEY_ID, type: "secret_text" },
        ]),
      ),
    ).toEqual([KEY_ID, KEY_V1]);
    expect(
      parseCredentialKeyState(
        d1KeyState(
          { keyId: "v2" },
          { keyId: "v1" },
          { keyId: "v1", requiresKey: false },
        ),
      ),
    ).toEqual({ protectedRecordCount: 3, requiredKeyIds: ["v1", "v2"] });
    expect(
      mergeProtectedKeyStates([
        { protectedRecordCount: 1, requiredKeyIds: [] },
        { protectedRecordCount: 2, requiredKeyIds: ["v2"] },
        { protectedRecordCount: 3, requiredKeyIds: ["v1", "v2"] },
      ]),
    ).toEqual({ protectedRecordCount: 6, requiredKeyIds: ["v1", "v2"] });
    expect(() => parseWorkerSecretNames("{}")).toThrow("invalid response");
    expect(() => parseCredentialKeyState('[{"results":[{}]}]')).toThrow(
      "invalid response",
    );
    expect(() =>
      parseCredentialKeyState('[{"success":true,"results":[{"key_id":"v1"}]}]'),
    ).toThrow("invalid row");
  });

  it("only recognizes Wrangler's explicit missing-Worker error", () => {
    expect(
      isWranglerWorkerNotFound(
        `Worker "aria-builder" not found.\n\nIf this is a new Worker, run \`wrangler deploy\` first to create it.`,
      ),
    ).toBe(true);
    expect(
      isWranglerWorkerNotFound("Authentication failed: Worker not found"),
    ).toBe(false);
  });

  it("parses queue consumers and recognizes only explicit missing queues", () => {
    expect(
      parseQueueConsumers(
        JSON.stringify([
          {
            script: "aria-builder",
            dead_letter_queue: "aria-integration-delivery-dlq",
          },
        ]),
      ),
    ).toEqual([
      {
        scriptName: "aria-builder",
        deadLetterQueue: "aria-integration-delivery-dlq",
      },
    ]);
    expect(
      isWranglerQueueNotFound(
        'Queue "aria-integration-delivery" could not be found.',
      ),
    ).toBe(true);
    expect(isWranglerQueueNotFound("Authentication failed")).toBe(false);
    expect(() => parseQueueConsumers("{}")).toThrow("invalid response");
  });

  it("derives queue expectations, including renamed queues and DLQs, from config", () => {
    expect(
      parseQueueExpectations(
        JSON.stringify({
          queues: {
            consumers: [
              { queue: "custom-email", dead_letter_queue: "custom-email-dlq" },
              { queue: "custom-thumbs" },
              { queue: "custom-email-dlq" },
            ],
          },
        }),
      ),
    ).toEqual([
      {
        name: "custom-email",
        deadLetterQueue: "custom-email-dlq",
        requiresConsumer: true,
      },
      {
        name: "custom-thumbs",
        deadLetterQueue: undefined,
        requiresConsumer: true,
      },
      {
        name: "custom-email-dlq",
        deadLetterQueue: undefined,
        requiresConsumer: true,
      },
    ]);
    // A DLQ referenced but not consumed is still ensured, but only its
    // existence is verified — nothing has to consume it.
    expect(
      parseQueueExpectations(
        JSON.stringify({
          queues: {
            consumers: [{ queue: "q", dead_letter_queue: "q-dlq" }],
          },
        }),
      ),
    ).toEqual([
      { name: "q", deadLetterQueue: "q-dlq", requiresConsumer: true },
      { name: "q-dlq", deadLetterQueue: undefined, requiresConsumer: false },
    ]);
    expect(parseQueueExpectations("{}")).toBeNull();
    expect(parseQueueExpectations('{"queues":{"consumers":[]}}')).toBeNull();
  });

  it("reapplies Deploy-button queue renames to dead-letter queue references", () => {
    // The 1-click rename rewrites producer/consumer queue names but leaves
    // consumer dead_letter_queue values pointing at the template names.
    const renamedConfig = JSON.stringify({
      queues: {
        producers: [
          { binding: "aria_email_queue", queue: "so-email-delivery" },
          { binding: "aria_thumbnail_queue", queue: "so-thumbnail-generation" },
          {
            binding: "aria_integration_queue",
            queue: "so-integration-delivery",
          },
        ],
        consumers: [
          {
            queue: "so-email-delivery",
            dead_letter_queue: "aria-email-delivery-dlq",
          },
          { queue: "so-email-delivery-dlq" },
          { queue: "so-thumbnail-generation" },
          {
            queue: "so-integration-delivery",
            dead_letter_queue: "aria-integration-delivery-dlq",
          },
          { queue: "so-integration-delivery-dlq" },
        ],
      },
    });
    const repaired = repairDeadLetterQueueRenames(renamedConfig);
    expect(repaired?.repairs).toEqual([
      { from: "aria-email-delivery-dlq", to: "so-email-delivery-dlq" },
      {
        from: "aria-integration-delivery-dlq",
        to: "so-integration-delivery-dlq",
      },
    ]);
    expect(parseQueueExpectations(repaired?.configJson ?? "")).toEqual([
      {
        name: "so-email-delivery",
        deadLetterQueue: "so-email-delivery-dlq",
        requiresConsumer: true,
      },
      {
        name: "so-email-delivery-dlq",
        deadLetterQueue: undefined,
        requiresConsumer: true,
      },
      {
        name: "so-thumbnail-generation",
        deadLetterQueue: undefined,
        requiresConsumer: true,
      },
      {
        name: "so-integration-delivery",
        deadLetterQueue: "so-integration-delivery-dlq",
        requiresConsumer: true,
      },
      {
        name: "so-integration-delivery-dlq",
        deadLetterQueue: undefined,
        requiresConsumer: true,
      },
    ]);

    // Default (unrenamed) configs and custom DLQ names stay untouched.
    expect(
      repairDeadLetterQueueRenames(
        JSON.stringify({
          queues: {
            producers: [
              { binding: "aria_email_queue", queue: "aria-email-delivery" },
            ],
            consumers: [
              {
                queue: "aria-email-delivery",
                dead_letter_queue: "aria-email-delivery-dlq",
              },
            ],
          },
        }),
      ),
    ).toBeNull();
    expect(
      repairDeadLetterQueueRenames(
        JSON.stringify({
          queues: {
            producers: [
              { binding: "aria_email_queue", queue: "so-email-delivery" },
            ],
            consumers: [
              { queue: "so-email-delivery", dead_letter_queue: "central-dlq" },
            ],
          },
        }),
      ),
    ).toBeNull();
    expect(repairDeadLetterQueueRenames("{}")).toBeNull();
  });

  it("bootstraps only a completely absent keyring with no credentials", () => {
    expect(
      decideApiKeyringDeployment([], {
        protectedRecordCount: 0,
        requiredKeyIds: [],
      }),
    ).toBe("bootstrap");
    expect(
      decideApiKeyringDeployment([KEY_ID, KEY_V1], {
        protectedRecordCount: 1,
        requiredKeyIds: ["v1"],
      }),
    ).toBe("preserve");
  });

  it("rejects lost, partial, or historically incomplete keyrings", () => {
    expect(() =>
      decideApiKeyringDeployment([], {
        protectedRecordCount: 1,
        requiredKeyIds: [],
      }),
    ).toThrow("OAuth records exist");
    expect(() =>
      decideApiKeyringDeployment([KEY_ID], {
        protectedRecordCount: 0,
        requiredKeyIds: [],
      }),
    ).toThrow("incomplete");
    expect(() =>
      decideApiKeyringDeployment([KEY_V1], {
        protectedRecordCount: 0,
        requiredKeyIds: [],
      }),
    ).toThrow("incomplete");
    expect(() =>
      decideApiKeyringDeployment([KEY_ID, KEY_V1], {
        protectedRecordCount: 2,
        requiredKeyIds: ["v1", "v2"],
      }),
    ).toThrow("ARIA_API_KEYRING_KEY_V2");
    expect(
      decideApiKeyringDeployment([KEY_ID, "ARIA_API_KEYRING_KEY_V2"], {
        protectedRecordCount: 1,
        requiredKeyIds: [],
      }),
    ).toBe("preserve");
  });
});

describe("Cloudflare deployment orchestration", () => {
  it("generates and atomically uploads a private 32-byte initial keyring", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "aria-deploy-test-"));
    temporaryRoots.push(temporaryRoot);
    const harness = createRunner({});
    const generatedBytes = Uint8Array.from({ length: 32 }, (_, index) => index);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      deployCloudflare({
        randomKeyBytes: () => generatedBytes,
        runner: harness.runner,
        temporaryDirectoryRoot: temporaryRoot,
      }),
    ).resolves.toBe("bootstrap");

    const uploaded = harness.uploadedSecrets();
    expect(uploaded?.contents[KEY_ID]).toBe("v1");
    expect(Buffer.from(uploaded?.contents[KEY_V1] ?? "", "base64")).toEqual(
      Buffer.from(generatedBytes),
    );
    if (process.platform !== "win32") {
      expect(uploaded?.fileMode).toBe(0o600);
    }
    expect(await readdir(temporaryRoot)).toEqual([]);
    expect(harness.inherited.map(({ args }) => args)).toEqual([
      ["migrate"],
      ["build"],
      [
        "secret",
        "bulk",
        expect.stringContaining("secrets.json"),
        "--config",
        "dist/server/wrangler.json",
      ],
    ]);
    expect(
      harness.captured.some(
        ({ args }) =>
          args.includes("deploy") && args.includes("--secrets-file"),
      ),
    ).toBe(true);
    // First deploy bootstraps OAuth runtime secrets without rotating keys.
    expect(harness.uploadedBulkSecrets()).toEqual([
      {
        [OAUTH_ENABLED]: "true",
        [OAUTH_ORIGIN]: DEPLOY_ORIGIN,
      },
    ]);
    expect(log.mock.calls.flat().join(" ")).not.toContain(
      uploaded?.contents[KEY_V1],
    );
  });

  it("reads protected key state without compound selects and preserves an existing keyring", async () => {
    const harness = createRunner({
      protectedKeyStates: [
        success(d1KeyState({ keyId: "v1", requiresKey: false })),
        success(d1KeyState({ keyId: "v2" })),
        success(d1KeyState({ keyId: "v2" })),
        success(d1KeyState({ keyId: "v3" })),
        success(d1KeyState({ keyId: "v3" })),
        success(d1KeyState({ keyId: "v2" })),
      ],
      secretList: success(
        JSON.stringify([
          { name: KEY_ID },
          { name: "ARIA_API_KEYRING_KEY_V2" },
          { name: "ARIA_API_KEYRING_KEY_V3" },
        ]),
      ),
    });

    await expect(deployCloudflare({ runner: harness.runner })).resolves.toBe(
      "preserve",
    );
    expect(harness.uploadedSecrets()).toBeUndefined();
    const protectedKeyQueries = harness.captured.filter(({ args }) =>
      args.includes("d1"),
    );
    expect(protectedKeyQueries).toHaveLength(6);
    expect(
      protectedKeyQueries.every(
        ({ args }) => args.includes("--command") && !args.includes("--file"),
      ),
    ).toBe(true);
    const protectedKeySql = protectedKeyQueries.map(({ sql }) => sql);
    expect(protectedKeySql).toEqual(
      expect.arrayContaining([
        expect.stringContaining("aria_api_credentials"),
        expect.stringContaining("aria_webhook_signing_keys"),
        expect.stringContaining("device_code_key_id"),
        expect.stringContaining("user_code_key_id"),
        expect.stringContaining("aria_oauth_access_tokens"),
        expect.stringContaining("aria_oauth_refresh_tokens"),
      ]),
    );
    expect(protectedKeySql).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/UNION/u)]),
    );
    const deployInvocation = harness.captured.find(({ args }) =>
      args.includes("deploy"),
    );
    expect(deployInvocation?.args).toEqual([
      "deploy",
      "--config",
      "dist/server/wrangler.json",
    ]);
    expect(deployInvocation?.args).not.toContain("--secrets-file");
  });

  it("identifies the protected-key source when a D1 read fails", async () => {
    const harness = createRunner({
      protectedKeyStates: [
        success(d1KeyState()),
        { status: 1, stdout: "", stderr: "D1 unavailable" },
      ],
    });

    await expect(deployCloudflare({ runner: harness.runner })).rejects.toThrow(
      "Reading protected key IDs from webhook signing keys failed: D1 unavailable",
    );
  });

  it("treats only the explicit missing-Worker result as a clean install", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "aria-deploy-test-"));
    temporaryRoots.push(temporaryRoot);
    const missingWorker = createRunner({
      secretList: {
        status: 1,
        stdout: "",
        stderr:
          'Worker "aria-builder" not found.\n\nIf this is a new Worker, run `wrangler deploy` first to create it.',
      },
    });
    await expect(
      deployCloudflare({
        runner: missingWorker.runner,
        temporaryDirectoryRoot: temporaryRoot,
      }),
    ).resolves.toBe("bootstrap");

    const authFailure = createRunner({
      secretList: {
        status: 1,
        stdout: "",
        stderr: "Authentication failed",
      },
    });
    await expect(
      deployCloudflare({ runner: authFailure.runner }),
    ).rejects.toThrow("Authentication failed");
  });

  it("removes temporary secrets when deployment fails", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "aria-deploy-test-"));
    temporaryRoots.push(temporaryRoot);
    const harness = createRunner({ deployError: new Error("deploy failed") });

    await expect(
      deployCloudflare({
        runner: harness.runner,
        temporaryDirectoryRoot: temporaryRoot,
      }),
    ).rejects.toThrow("deploy failed");
    expect(await readdir(temporaryRoot)).toEqual([]);
  });

  it("creates missing integration queues and refuses foreign consumers", async () => {
    const missingQueue: CapturedCommandResult = {
      status: 1,
      stdout: "",
      stderr: 'Queue "aria-integration-delivery" could not be found.',
    };
    const harness = createRunner({
      queueConsumers: {
        "aria-integration-delivery": missingQueue,
      },
    });
    await expect(deployCloudflare({ runner: harness.runner })).rejects.toThrow(
      "missing after deployment",
    );
    expect(
      harness.inherited.some(({ args }) =>
        args.includes("aria-integration-delivery"),
      ),
    ).toBe(true);

    const foreign = createRunner({
      queueConsumers: {
        "aria-integration-delivery": success(
          JSON.stringify([{ service: "another-worker" }]),
        ),
      },
    });
    await expect(deployCloudflare({ runner: foreign.runner })).rejects.toThrow(
      "Refusing to replace",
    );
    expect(foreign.captured.some(({ args }) => args.includes("deploy"))).toBe(
      false,
    );
  });

  it("rejects invalid generated key material before invoking Wrangler deploy", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "aria-deploy-test-"));
    temporaryRoots.push(temporaryRoot);
    const harness = createRunner({});

    await expect(
      deployCloudflare({
        randomKeyBytes: () => new Uint8Array(31),
        runner: harness.runner,
        temporaryDirectoryRoot: temporaryRoot,
      }),
    ).rejects.toThrow("must contain 32 bytes");
    expect(harness.captured.some(({ args }) => args.includes("deploy"))).toBe(
      false,
    );
    expect(await readdir(temporaryRoot)).toEqual([]);
  });
});

describe("Cloudflare worker name resolution", () => {
  it("prefers explicit option, then env, then the active Wrangler config", () => {
    expect(resolveDeployWorkerName("custom-worker")).toBe("custom-worker");

    const previous = process.env.ARIA_WORKER_NAME;
    process.env.ARIA_WORKER_NAME = "env-worker";
    try {
      expect(resolveDeployWorkerName()).toBe("env-worker");
      expect(resolveDeployWorkerName("explicit-worker")).toBe(
        "explicit-worker",
      );
    } finally {
      if (previous === undefined) {
        delete process.env.ARIA_WORKER_NAME;
      } else {
        process.env.ARIA_WORKER_NAME = previous;
      }
    }

    // Falls back to the committed wrangler.jsonc name in this checkout.
    expect(resolveDeployWorkerName()).toBe("aria-builder");
  });

  it("threads a renamed Worker through queue ownership checks", async () => {
    const harness = createRunner({
      queueConsumers: {
        "aria-email-delivery": success(
          JSON.stringify([{ script: "aria-builder" }]),
        ),
      },
    });

    await expect(
      deployCloudflare({
        runner: harness.runner,
        workerName: "renamed-worker",
      }),
    ).rejects.toThrow("not renamed-worker");
    expect(harness.captured.some(({ args }) => args.includes("deploy"))).toBe(
      false,
    );
  });
});

describe("Cloudflare OAuth runtime bootstrap", () => {
  it("parses the published workers.dev origin from deploy output", () => {
    expect(parseDeployedWorkerOrigin(DEFAULT_DEPLOY_STDOUT)).toBe(
      DEPLOY_ORIGIN,
    );
    expect(
      parseDeployedWorkerOrigin(
        "Deployed my-site triggers\n  https://my-site.my-subdomain.workers.dev\nmore output",
      ),
    ).toBe("https://my-site.my-subdomain.workers.dev");
    expect(parseDeployedWorkerOrigin("no url here")).toBeNull();
    expect(
      parseDeployedWorkerOrigin("https://example.com/not-workers"),
    ).toBeNull();
  });

  it("preserves existing OAuth and analytics secrets on redeploy without re-uploading", async () => {
    const harness = createRunner({
      secretList: success(
        JSON.stringify([
          { name: KEY_ID },
          { name: KEY_V1 },
          { name: OAUTH_ENABLED },
          { name: OAUTH_ORIGIN },
          { name: ANALYTICS_TOKEN },
        ]),
      ),
      credentialKeys: [{ keyId: "v1" }],
    });

    await expect(deployCloudflare({ runner: harness.runner })).resolves.toBe(
      "preserve",
    );
    expect(harness.uploadedSecrets()).toBeUndefined();
    expect(harness.uploadedBulkSecrets()).toEqual([]);
  });

  it("sets OAuth secrets once on the upgrade path without rotating the keyring", async () => {
    const harness = createRunner({
      secretList: success(JSON.stringify([{ name: KEY_ID }, { name: KEY_V1 }])),
      credentialKeys: [{ keyId: "v1" }],
    });

    await expect(deployCloudflare({ runner: harness.runner })).resolves.toBe(
      "preserve",
    );
    expect(harness.uploadedSecrets()).toBeUndefined();
    expect(harness.uploadedBulkSecrets()).toEqual([
      {
        [OAUTH_ENABLED]: "true",
        [OAUTH_ORIGIN]: DEPLOY_ORIGIN,
      },
    ]);
  });

  it("never overwrites an existing canonical origin when completing the pair", async () => {
    const harness = createRunner({
      secretList: success(
        JSON.stringify([
          { name: KEY_ID },
          { name: KEY_V1 },
          { name: OAUTH_ORIGIN },
        ]),
      ),
      credentialKeys: [{ keyId: "v1" }],
    });

    await expect(deployCloudflare({ runner: harness.runner })).resolves.toBe(
      "preserve",
    );
    expect(harness.uploadedBulkSecrets()).toEqual([
      { [OAUTH_ENABLED]: "true" },
    ]);
  });

  it("skips OAuth bootstrap with a warning when the origin is unparseable", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "aria-deploy-test-"));
    temporaryRoots.push(temporaryRoot);
    const harness = createRunner({ deployStdout: "no url in this output" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      deployCloudflare({
        runner: harness.runner,
        temporaryDirectoryRoot: temporaryRoot,
      }),
    ).resolves.toBe("bootstrap");
    expect(harness.uploadedBulkSecrets()).toEqual([]);
    expect(warn.mock.calls.flat().join(" ")).toContain(OAUTH_ORIGIN);
  });
});
