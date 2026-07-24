import { createClient, type Client, type InValue } from "@libsql/client";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiKeyring } from "../../lib/api/crypto";
import { LibSqlApiSqlDatabase } from "../../lib/api/database";
import {
  buildIntegrationEventStatements,
  createIntegrationEvent,
} from "../../lib/integrations/events";
import { scheduleIntegrationEventWakeup } from "../../lib/integrations/wakeup";
import {
  deliverWebhook,
  fanoutIntegrationOutbox,
  readWebhookResponseExcerpt,
} from "../../lib/integrations/webhooks/delivery";
import {
  normalizeWebhookUrl,
  readWebhookEgressPolicy,
} from "../../lib/integrations/webhooks/egress";
import { WebhookRepository } from "../../lib/integrations/webhooks/repository";
import {
  listRecentWebhookDeliveries,
  retryTerminalWebhookDelivery,
} from "../../lib/integrations/webhooks/maintenance";
import {
  drainNodeIntegrationWork,
  isNodeIntegrationWorkerReady,
  runNodeIntegrationWorker,
  waitForIntegrationWorkerInterval,
} from "../../lib/integrations/nodeWorker";
import { getEventListeners } from "node:events";

describe("durable webhook delivery", () => {
  let client: Client;
  let database: LibSqlApiSqlDatabase;
  const rootKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  const keyring: ApiKeyring = { keyId: "v1", rootKey };
  let encodedKey = "";

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    database = new LibSqlApiSqlDatabase(client);
    for (const migration of [
      "0001_baseline_schema.sql",
      "0002_api_foundation.sql",
      "0003_api_idempotency_leases.sql",
      "0004_api_lifecycle_hardening.sql",
      "0005_integration_events.sql",
      "0006_webhook_delivery.sql",
    ]) {
      await client.executeMultiple(
        await readFile(
          resolve(process.cwd(), `aria/migrations/${migration}`),
          "utf8",
        ),
      );
    }
    await client.execute({
      sql: `INSERT INTO aria_users (
        id, username, email, password_hash, role, created_at
      ) VALUES ('actor-1', 'admin', 'admin@example.test', 'unused',
                'administrator', '2026-07-20T12:00:00.000Z')`,
      args: [],
    });
    let binary = "";
    for (const byte of rootKey) binary += String.fromCharCode(byte);
    encodedKey = btoa(binary);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    client.close();
  });

  it("fails closed without an explicit egress mode", () => {
    expect(() => readWebhookEgressPolicy({ cfBindings: {} })).toThrow(
      "WEBHOOK_EGRESS_NOT_READY",
    );
  });

  it("sends the committed outbox ID through the request lifetime", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const waitUntil = vi.fn();
    const event = createIntegrationEvent({
      type: "cms.entry.created.v1",
      aggregateType: "cms.entry",
      aggregateId: "entry-wakeup",
      source: "studio",
      payload: { entryId: "entry-wakeup" },
    });

    await scheduleIntegrationEventWakeup(
      {
        cfBindings: { aria_integration_queue: { send } as never },
        cfContext: { waitUntil },
      },
      event,
    );

    expect(send).toHaveBeenCalledWith({ outboxId: event.outboxId });
    expect(waitUntil).toHaveBeenCalledOnce();
    await expect(waitUntil.mock.calls[0]?.[0]).resolves.toBeUndefined();
  });

  it("bounds webhook response reads and cancels the remaining stream", async () => {
    const cancelled = vi.fn();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("x".repeat(4_096)));
        },
        cancel: cancelled,
      }),
    );

    await expect(readWebhookResponseExcerpt(response)).resolves.toBe(
      "x".repeat(1_000),
    );
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it("permits loopback delivery only in an explicit development environment", () => {
    expect(() =>
      readWebhookEgressPolicy({
        cfBindings: { ARIA_WEBHOOK_EGRESS_MODE: "loopback-development" },
      }),
    ).toThrow("WEBHOOK_EGRESS_NOT_READY");
    expect(
      readWebhookEgressPolicy({
        cfBindings: {
          ARIA_WEBHOOK_EGRESS_MODE: "loopback-development",
          NODE_ENV: "development",
        },
      }),
    ).toEqual({ mode: "loopback-development" });
  });

  it("pins URL, body, and signing-key version through fanout and delivery", async () => {
    const site = await database.queryFirst<{ site_id: string }>(
      `SELECT site_id FROM aria_site_identity WHERE singleton_id = 1`,
    );
    const repository = new WebhookRepository(database);
    const endpoint = await repository.createEndpoint({
      siteId: site!.site_id,
      actorId: "actor-1",
      name: "Notion automation",
      normalizedUrl: normalizeWebhookUrl("https://hooks.example.test/aria", {
        mode: "allowlist",
        hosts: ["hooks.example.test"],
      }),
      payloadMode: "reference",
      eventTypes: ["cms.entry.published.v1"],
      keyring,
      now: "2026-07-20T12:00:00.000Z",
    });
    expect(JSON.stringify(await repository.listEndpoints())).not.toContain(
      endpoint.secret,
    );

    const event = createIntegrationEvent({
      type: "cms.entry.published.v1",
      aggregateType: "cms.entry",
      aggregateId: "entry-1",
      aggregateVersion: "v1",
      actorId: "actor-1",
      source: "studio",
      occurredAt: "2026-07-20T12:01:00.000Z",
      payload: { entryId: "entry-1", collectionId: "posts" },
    });
    await client.batch(
      buildIntegrationEventStatements(event).map((statement) => ({
        sql: statement.sql,
        args: [...statement.args] as InValue[],
      })),
      "write",
    );
    const leaseToken = crypto.randomUUID();
    await database.execute(
      `UPDATE aria_event_outbox SET state = 'claimed', lease_token = ?,
              lease_expires_at = '2026-07-20T12:10:00.000Z'
       WHERE id = ?`,
      [leaseToken, event.outboxId],
    );
    const deliveries = await fanoutIntegrationOutbox(
      database,
      event.outboxId,
      leaseToken,
      "2026-07-20T12:01:00.000Z",
    );
    expect(deliveries).toHaveLength(1);
    const replayLease = crypto.randomUUID();
    await database.execute(
      `UPDATE aria_event_outbox
       SET state = 'claimed', lease_token = ?, lease_expires_at = ?
       WHERE id = ?`,
      [replayLease, "2026-07-20T12:10:00.000Z", event.outboxId],
    );
    await expect(
      fanoutIntegrationOutbox(
        database,
        event.outboxId,
        replayLease,
        "2026-07-20T12:01:00.000Z",
      ),
    ).resolves.toEqual(deliveries);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await repository.setEndpointStatus({
      endpointId: endpoint.id,
      actorId: "actor-1",
      status: "paused",
      now: "2026-07-20T12:01:00.500Z",
    });
    await expect(
      deliverWebhook(
        database,
        {
          cfBindings: {
            ARIA_API_KEYRING_KEY_ID: "v1",
            ARIA_API_KEYRING_KEY_V1: encodedKey,
            ARIA_WEBHOOK_EGRESS_MODE: "allowlist",
            ARIA_WEBHOOK_EGRESS_ALLOWLIST: "hooks.example.test",
          },
        },
        deliveries[0]!,
        "2026-07-20T12:01:01.000Z",
      ),
    ).resolves.toBe("leased");
    expect(fetchMock).not.toHaveBeenCalled();
    await repository.setEndpointStatus({
      endpointId: endpoint.id,
      actorId: "actor-1",
      status: "active",
      now: "2026-07-20T12:01:00.750Z",
    });
    await expect(
      deliverWebhook(
        database,
        {
          cfBindings: {
            ARIA_API_KEYRING_KEY_ID: "v1",
            ARIA_API_KEYRING_KEY_V1: encodedKey,
            ARIA_WEBHOOK_EGRESS_MODE: "allowlist",
            ARIA_WEBHOOK_EGRESS_ALLOWLIST: "hooks.example.test",
          },
        },
        deliveries[0]!,
        "2026-07-20T12:01:01.000Z",
      ),
    ).resolves.toBe("retry");
    await database.execute(
      `UPDATE aria_webhook_deliveries SET available_at = ? WHERE id = ?`,
      ["2026-07-20T12:01:02.000Z", deliveries[0]!],
    );
    await expect(
      deliverWebhook(
        database,
        {
          cfBindings: {
            ARIA_API_KEYRING_KEY_ID: "v1",
            ARIA_API_KEYRING_KEY_V1: encodedKey,
            ARIA_WEBHOOK_EGRESS_MODE: "allowlist",
            ARIA_WEBHOOK_EGRESS_ALLOWLIST: "hooks.example.test",
          },
        },
        deliveries[0]!,
        "2026-07-20T12:01:03.000Z",
      ),
    ).resolves.toBe("delivered");
    const request = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(request[0]).toBe("https://hooks.example.test/aria");
    expect(new Headers(request[1].headers).get("X-Aria-Signature")).toMatch(
      /^v1=[a-f0-9]{64}$/u,
    );
    const persisted = await database.queryFirst<{
      state: string;
      body_json: string;
      webhook_signing_key_id: string;
      attempt_count: number;
    }>(
      `SELECT state, body_json, webhook_signing_key_id, attempt_count
       FROM aria_webhook_deliveries`,
    );
    expect(persisted?.state).toBe("delivered");
    expect(persisted?.attempt_count).toBe(2);
    expect(persisted?.body_json).toContain('"sequence":1');
    expect(persisted?.webhook_signing_key_id).toBeTruthy();
    await expect(listRecentWebhookDeliveries(database)).resolves.toMatchObject([
      {
        id: deliveries[0],
        endpointName: "Notion automation",
        eventType: "cms.entry.published.v1",
        state: "delivered",
        attemptCount: 2,
        lastStatus: 200,
      },
    ]);
    await database.execute(
      `UPDATE aria_webhook_deliveries
       SET state = 'terminal', terminal_at = ?, last_error_code = 'test_terminal'
       WHERE id = ?`,
      ["2026-07-20T12:02:00.000Z", deliveries[0]!],
    );
    await expect(
      retryTerminalWebhookDelivery({
        database,
        deliveryId: deliveries[0]!,
        actorId: "actor-1",
        reason: "operator retry",
        now: "2026-07-20T12:03:00.000Z",
      }),
    ).resolves.toBe(true);
    await expect(
      database.queryFirst<{ state: string }>(
        `SELECT state FROM aria_webhook_deliveries WHERE id = ?`,
        [deliveries[0]!],
      ),
    ).resolves.toMatchObject({ state: "pending" });
    await repository.setEndpointStatus({
      endpointId: endpoint.id,
      actorId: "actor-1",
      status: "disabled",
      reason: "disconnect",
      now: "2026-07-20T12:04:00.000Z",
    });
    await expect(
      database.queryFirst<{ last_error_code: string; state: string }>(
        `SELECT state, last_error_code FROM aria_webhook_deliveries WHERE id = ?`,
        [deliveries[0]!],
      ),
    ).resolves.toMatchObject({
      state: "cancelled",
      last_error_code: "endpoint_disabled",
    });
  });

  it("lists and updates subscriptions without exposing signing secrets", async () => {
    const site = await database.queryFirst<{ site_id: string }>(
      `SELECT site_id FROM aria_site_identity WHERE singleton_id = 1`,
    );
    const repository = new WebhookRepository(database);
    const endpoint = await repository.createEndpoint({
      siteId: site!.site_id,
      actorId: "actor-1",
      name: "Editorial automation",
      normalizedUrl: "https://hooks.example.test/aria",
      payloadMode: "reference",
      eventTypes: ["cms.entry.created.v1"],
      keyring,
      now: "2026-07-20T12:00:00.000Z",
    });

    await expect(repository.listEndpoints()).resolves.toMatchObject([
      {
        id: endpoint.id,
        name: "Editorial automation",
        secretPrefix: endpoint.secretPrefix,
        eventTypes: ["cms.entry.created.v1"],
      },
    ]);
    expect(JSON.stringify(await repository.listEndpoints())).not.toContain(
      endpoint.secret,
    );
    await expect(
      repository.updateSubscriptions({
        endpointId: endpoint.id,
        actorId: "actor-1",
        eventTypes: [
          "cms.entry.published.v1",
          "cms.entry.updated_published.v1",
        ],
        now: "2026-07-20T12:01:00.000Z",
      }),
    ).resolves.toBe(true);
    await expect(repository.listEndpoints()).resolves.toMatchObject([
      {
        eventTypes: [
          "cms.entry.published.v1",
          "cms.entry.updated_published.v1",
        ],
      },
    ]);

    const rotated = await repository.rotateSigningKey({
      endpointId: endpoint.id,
      actorId: "actor-1",
      keyring,
      now: "2026-07-20T12:02:00.000Z",
    });
    expect(rotated.version).toBe(2);
    const audit = await database.queryAll<{ event_type: string }>(
      `SELECT event_type FROM aria_integration_audit
       WHERE resource_id = ? ORDER BY created_at`,
      [endpoint.id],
    );
    expect(audit.map((row) => row.event_type)).toEqual([
      "webhook.endpoint.created",
      "webhook.subscriptions.updated",
      "webhook.signing_key.rotated",
    ]);
  });

  it("requires proxy mode and a valid interval for the Node worker", async () => {
    await expect(
      drainNodeIntegrationWork({
        database,
        locals: {
          cfBindings: {
            ARIA_WEBHOOK_EGRESS_MODE: "allowlist",
            ARIA_WEBHOOK_EGRESS_ALLOWLIST: "hooks.example.test",
          },
        },
      }),
    ).rejects.toThrow("NODE_WEBHOOK_EGRESS_PROXY_REQUIRED");
    await expect(
      runNodeIntegrationWorker({
        database,
        signal: new AbortController().signal,
        intervalMs: Number.NaN,
      }),
    ).rejects.toThrow("INTEGRATION_WORKER_INTERVAL_INVALID");
  });

  it("removes timer abort listeners after every completed interval", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    for (let index = 0; index < 12; index += 1) {
      const waiting = waitForIntegrationWorkerInterval(
        controller.signal,
        1_000,
      );
      await vi.advanceTimersByTimeAsync(1_000);
      await waiting;
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    }
  });

  it("marks a gracefully stopped Node worker as not ready", async () => {
    const controller = new AbortController();
    controller.abort();
    await runNodeIntegrationWorker({
      database,
      signal: controller.signal,
      intervalMs: 1_000,
      workerId: "test-worker",
    });
    await expect(isNodeIntegrationWorkerReady(database)).resolves.toBe(false);
  });
});
