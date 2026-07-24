import { createClient, type Client, type InValue } from "@libsql/client";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildIntegrationEventStatements,
  createIntegrationEvent,
} from "../../lib/integrations/events";

describe("integration event transaction primitives", () => {
  let client: Client;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    for (const migration of [
      "0001_baseline_schema.sql",
      "0002_api_foundation.sql",
      "0003_api_idempotency_leases.sql",
      "0004_api_lifecycle_hardening.sql",
      "0005_integration_events.sql",
    ]) {
      await client.executeMultiple(
        await readFile(
          resolve(process.cwd(), `aria/migrations/${migration}`),
          "utf8",
        ),
      );
    }
  });

  afterEach(() => client.close());

  async function commit(type: "cms.entry.created.v1" | "cms.entry.updated.v1") {
    const event = createIntegrationEvent({
      type,
      aggregateType: "cms.entry",
      aggregateId: "entry-1",
      aggregateVersion: type.endsWith("created.v1") ? "v1" : "v2",
      actorId: "actor-1",
      source: "studio",
      occurredAt: "2026-07-20T12:00:00.000Z",
      payload: { entryId: "entry-1" },
    });
    await client.batch(
      buildIntegrationEventStatements(event).map((statement) => ({
        sql: statement.sql,
        args: [...statement.args] as InValue[],
      })),
      "write",
    );
    return event;
  }

  it("allocates gapless per-aggregate sequence numbers and durable outbox rows", async () => {
    const first = await commit("cms.entry.created.v1");
    const second = await commit("cms.entry.updated.v1");
    const events = await client.execute(
      `SELECT id, aggregate_sequence FROM aria_events ORDER BY aggregate_sequence`,
    );
    expect(events.rows).toEqual([
      { id: first.id, aggregate_sequence: 1 },
      { id: second.id, aggregate_sequence: 2 },
    ]);
    const outbox = await client.execute(
      `SELECT event_id, state FROM aria_event_outbox ORDER BY created_at, id`,
    );
    expect(outbox.rows).toEqual(
      expect.arrayContaining([
        { event_id: first.id, state: "pending" },
        { event_id: second.id, state: "pending" },
      ]),
    );
  });

  it("rolls sequence allocation back when the transaction cannot finish", async () => {
    await commit("cms.entry.created.v1");
    const event = createIntegrationEvent({
      type: "cms.entry.updated.v1",
      aggregateType: "cms.entry",
      aggregateId: "entry-1",
      aggregateVersion: "v2",
      source: "studio",
      payload: { entryId: "entry-1" },
    });
    const statements = buildIntegrationEventStatements(event).map(
      (statement) => ({
        sql: statement.sql,
        args: [...statement.args] as InValue[],
      }),
    );
    statements.push({
      sql: "INSERT INTO aria_events (id) VALUES (?)",
      args: ["invalid"],
    });
    await expect(client.batch(statements, "write")).rejects.toThrow();

    const head = await client.execute(
      `SELECT last_sequence FROM aria_event_aggregate_heads
       WHERE aggregate_type = 'cms.entry' AND aggregate_id = 'entry-1'`,
    );
    expect(head.rows[0]?.last_sequence).toBe(1);
    expect(
      (
        await client.execute({
          sql: "SELECT id FROM aria_events WHERE id = ?",
          args: [event.id],
        })
      ).rows,
    ).toHaveLength(0);
  });
});
