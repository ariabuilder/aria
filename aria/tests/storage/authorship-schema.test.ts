import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import {
  getAuthorshipColumnTargets,
  getAuthorshipColumnsForTable,
} from "../../lib/authorship/schemaMigrations";
import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";

describe("SQLite authorship schema", () => {
  let tempDir: string;
  let client: Client;
  let adapter: SQLiteStorageAdapter;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-authorship-schema-"));
    const dbPath = path.join(tempDir, "aria.db");
    client = createClient({ url: `file:${dbPath}` });
    adapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
    });
    await adapter.listPagesDSL();
  });

  afterEach(async () => {
    client.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("adds authorship columns on initialization", async () => {
    for (const target of getAuthorshipColumnTargets()) {
      const rows = await client.execute(`PRAGMA table_info(${target.table})`);
      const columnNames = rows.rows.map((row) => String(row.name));
      expect(columnNames).toContain(target.column);
    }
  });

  it("is idempotent across repeated initialization", async () => {
    await adapter.listPagesDSL();

    for (const target of getAuthorshipColumnTargets()) {
      const rows = await client.execute(`PRAGMA table_info(${target.table})`);
      const matches = rows.rows.filter((row) => row.name === target.column);
      expect(matches).toHaveLength(1);
    }
  });

  it("backfills version authorship from legacy DSL author fields", async () => {
    const now = "2026-05-26T00:00:00.000Z";
    const dsl = JSON.stringify({
      id: "page-home",
      title: "Home",
      slug: "home",
      author: {
        id: "user-legacy",
        name: "Legacy Author",
        email: "legacy@example.com",
      },
      nodes: [],
    });

    await client.execute({
      sql: `INSERT INTO aria_page_versions (
              id, version, slug, title, status, dsl_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: ["page-home", "1", "home", "Home", "draft", dsl, now],
    });

    const secondAdapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
    });
    await secondAdapter.listPagesDSL();

    const row = await client.execute({
      sql: `SELECT created_by_id, created_by_username, created_by_email
              FROM aria_page_versions
             WHERE id = ? AND version = ?`,
      args: ["page-home", "1"],
    });

    expect(row.rows[0]).toEqual({
      created_by_id: "user-legacy",
      created_by_username: "Legacy Author",
      created_by_email: "legacy@example.com",
    });
  });

  it("does not add authorship columns to meta tables", async () => {
    const metaTables = [
      "aria_page_meta",
      "aria_layout_meta",
      "aria_component_meta",
    ] as const;

    for (const table of metaTables) {
      const rows = await client.execute(`PRAGMA table_info(${table})`);
      const columnNames = rows.rows.map((row) => String(row.name));

      for (const column of getAuthorshipColumnsForTable("aria_styles")) {
        expect(columnNames).not.toContain(column);
      }
    }
  });
});
