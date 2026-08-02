import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

vi.mock("astro:actions", () => ({
  ActionError: class MockActionError extends Error {
    code: string;
    constructor(input: { code: string; message: string }) {
      super(input.message);
      this.code = input.code;
    }
  },
}));

import {
  parseAuthorshipSaveContext,
} from "../../lib/authorship/stamping";
import { resolveAuthorizedMutation } from "../../actions/_shared";
import type { PageDSL } from "../../lib/types/nodes";
import type { SessionUser } from "../../lib/auth/types";
import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";

const draftEditor: SessionUser = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  username: "draft-editor",
  email: "draft@example.com",
  role: "content-editor",
  totpEnabled: false,
};

const publisher: SessionUser = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  username: "publisher",
  email: "publish@example.com",
  role: "manager",
  totpEnabled: false,
};

const samplePage: PageDSL = {
  id: "publish-auth-page",
  title: "Publish Auth",
  slug: "publish-auth-page",
  status: "draft",
  nodes: [],
};

function createContext(user: SessionUser) {
  return {
    cookies: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
      headers: vi.fn(),
    },
    locals: { user },
  } as never;
}

describe("publish authorship via authorized mutation context", () => {
  let tempDir: string;
  let client: Client;
  let adapter: SQLiteStorageAdapter;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-publish-auth-"));
    client = createClient({ url: `file:${path.join(tempDir, "aria.db")}` });
    adapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: false,
      seedStarterDesign: false,
      seedStarterSiteSettings: false,
    });
    await adapter.listPagesDSL();
  });

  afterEach(async () => {
    client.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("promotes the authored draft without manufacturing a publish revision", async () => {
    const { authorship: draftAuthorship } = await resolveAuthorizedMutation(
      createContext(draftEditor),
      "save.page",
      "save-page",
    );
    const parsedDraftAuthorship = parseAuthorshipSaveContext(draftAuthorship);

    await adapter.savePageDSL(
      samplePage.id,
      samplePage,
      { preserveVersion: true, versionHint: "action-draft-v1" },
      parsedDraftAuthorship,
    );

    const { authorship: publishAuthorship } = await resolveAuthorizedMutation(
      createContext(publisher),
      "publishing.publish",
      "save-page",
    );
    const parsedPublishAuthorship =
      parseAuthorshipSaveContext(publishAuthorship);

    const publishedVersion = await adapter.publishPageDSL(
      samplePage.id,
      parsedPublishAuthorship,
      { versionHint: "action-pub-v1" },
    );

    expect(publishedVersion).toBe("action-draft-v1");

    const draftRow = await client.execute({
      sql: `SELECT created_by_id FROM aria_page_versions WHERE id = ? AND version = ?`,
      args: [samplePage.id, "action-draft-v1"],
    });
    const versionRows = await client.execute({
      sql: `SELECT version FROM aria_page_versions WHERE id = ? ORDER BY created_at`,
      args: [samplePage.id],
    });

    expect(String(draftRow.rows[0]?.created_by_id)).toBe(draftEditor.id);
    expect(versionRows.rows.map((row) => String(row.version))).toEqual([
      "action-draft-v1",
    ]);

    const assetAuthorship = await adapter.getPageAuthorship(samplePage.id);
    expect(assetAuthorship?.publishedBy?.id).toBe(draftEditor.id);
    expect(assetAuthorship?.updatedBy?.id).toBe(draftEditor.id);
  });
});
