import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";
import { buildAuthorshipSaveContext } from "../../lib/authorship/stamping";
import { saveResource } from "../../actions/_shared";
import type { PageDSL } from "../../lib/types/nodes";
import type { SessionUser } from "../../lib/auth/types";

const actor: SessionUser = {
  id: "22222222-2222-4222-8222-222222222222",
  username: "editor",
  email: "editor@example.com",
  role: "content-editor",
  totpEnabled: false,
};

const samplePage: PageDSL = {
  id: "phase6-page",
  title: "Phase 6",
  slug: "phase6-page",
  status: "draft",
  nodes: [],
};

describe("Phase 6 authorship propagation via shared saveResource", () => {
  let tempDir: string;
  let client: Client;
  let adapter: SQLiteStorageAdapter;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-phase6-action-"));
    client = createClient({ url: `file:${path.join(tempDir, "aria.db")}` });
    adapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: false,
      seedStarterDesign: false,
      seedStarterSiteSettings: false,
    });
  });

  afterEach(async () => {
    client.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("stamps created_by_* on page version INSERT", async () => {
    const authorship = buildAuthorshipSaveContext(actor, "save-page");
    const context = { locals: { user: actor } };

    await saveResource(
      adapter,
      context,
      "pages",
      samplePage.id,
      samplePage,
      authorship,
      { versionSaveOptions: { preserveVersion: true, versionHint: "p6-v1" } },
    );

    const row = await client.execute({
      sql: `SELECT created_by_id, created_by_username, created_by_email
            FROM aria_page_versions WHERE id = ? AND version = ?`,
      args: [samplePage.id, "p6-v1"],
    });

    expect(String(row.rows[0]?.created_by_id)).toBe(actor.id);
    expect(String(row.rows[0]?.created_by_username)).toBe(actor.username);
    expect(String(row.rows[0]?.created_by_email)).toBe(actor.email);
  });
});
