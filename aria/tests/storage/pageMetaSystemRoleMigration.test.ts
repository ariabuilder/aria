import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { ensurePageMetaSystemRoleConstraint } from "../../lib/storage/pageMetaSystemRoleMigration";

function executor(client: Client) {
  return {
    queryFirst: async <T extends Record<string, unknown>>(
      sql: string,
      args: unknown[] = [],
    ) => {
      const result = await client.execute({ sql, args: args as never[] });
      return (result.rows[0] as unknown as T | undefined) ?? null;
    },
    run: async (sql: string, args: unknown[] = []) => {
      await client.execute({ sql, args: args as never[] });
    },
  };
}

async function createLegacyPageMeta(client: Client): Promise<void> {
  await client.executeMultiple(`
    CREATE TABLE aria_page_meta (
      id TEXT PRIMARY KEY,
      slug TEXT,
      title TEXT,
      status TEXT,
      parent TEXT,
      layout TEXT,
      draft_version TEXT,
      published_version TEXT,
      current_version TEXT NOT NULL,
      system_role TEXT NOT NULL DEFAULT 'standard' CHECK (system_role IN ('standard', 'not-found')),
      access_mode TEXT NOT NULL DEFAULT 'public' CHECK (access_mode IN ('public', 'password', 'private', 'unlisted')),
      access_password_hash TEXT,
      access_prompt_title TEXT,
      access_prompt_description TEXT,
      access_remember_for_days INTEGER CHECK (access_remember_for_days IS NULL OR access_remember_for_days BETWEEN 1 AND 30),
      access_policy_version INTEGER NOT NULL DEFAULT 1,
      scheduled_for TEXT,
      schedule_lease_token TEXT,
      schedule_lease_expires_at TEXT,
      schedule_attempt_count INTEGER NOT NULL DEFAULT 0,
      last_schedule_error TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX idx_aria_page_meta_slug
      ON aria_page_meta (slug);
    CREATE INDEX idx_aria_page_meta_access_mode
      ON aria_page_meta(access_mode);
    CREATE INDEX idx_aria_page_meta_scheduled_for
      ON aria_page_meta (scheduled_for)
      WHERE status = 'scheduled';
    CREATE UNIQUE INDEX idx_aria_page_meta_system_role_unique
      ON aria_page_meta(system_role)
      WHERE system_role != 'standard';

    INSERT INTO aria_page_meta (
      id,
      slug,
      title,
      status,
      parent,
      layout,
      draft_version,
      published_version,
      current_version,
      system_role,
      access_mode,
      access_password_hash,
      access_prompt_title,
      access_prompt_description,
      access_remember_for_days,
      access_policy_version,
      scheduled_for,
      schedule_lease_token,
      schedule_lease_expires_at,
      schedule_attempt_count,
      last_schedule_error,
      updated_at
    )
    VALUES (
      'page-one',
      'page-one',
      'Page One',
      'draft',
      NULL,
      'main-layout',
      'v1',
      NULL,
      'v1',
      'standard',
      'public',
      NULL,
      NULL,
      NULL,
      NULL,
      1,
      NULL,
      NULL,
      NULL,
      0,
      NULL,
      '2026-07-05T00:00:00.000Z'
    );
  `);
}

describe("page meta system role constraint migration", () => {
  let tempDir: string;
  let client: Client;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-page-meta-role-"));
    client = createClient({ url: `file:${path.join(tempDir, "aria.db")}` });
  });

  afterEach(async () => {
    client.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("widens legacy system_role checks and preserves page metadata", async () => {
    await createLegacyPageMeta(client);

    await ensurePageMetaSystemRoleConstraint(executor(client));

    const ddl = await client.execute(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'aria_page_meta' LIMIT 1`,
    );
    expect(String(ddl.rows[0]?.sql)).toContain("'cms-entry'");
    expect(String(ddl.rows[0]?.sql)).toContain("'cms-collection'");

    await client.execute({
      sql: `UPDATE aria_page_meta SET system_role = ? WHERE id = ?`,
      args: ["cms-entry", "page-one"],
    });

    const row = await client.execute({
      sql: `SELECT slug, layout, current_version, system_role
            FROM aria_page_meta
            WHERE id = ?`,
      args: ["page-one"],
    });
    expect(row.rows[0]).toEqual(
      expect.objectContaining({
        slug: "page-one",
        layout: "main-layout",
        current_version: "v1",
        system_role: "cms-entry",
      }),
    );

    const indexes = await client.execute(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'aria_page_meta'`,
    );
    expect(indexes.rows.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        "idx_aria_page_meta_slug",
        "idx_aria_page_meta_access_mode",
        "idx_aria_page_meta_scheduled_for",
        "idx_aria_page_meta_system_role_unique",
      ]),
    );
  });
});
