import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import type { SessionUser } from "../../lib/auth/types";
import { buildAuthorshipSaveContext } from "../../lib/authorship/stamping";
import { ContentMutationKindSchema } from "../../lib/storage/adapter";
import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";

const editor: SessionUser = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  username: "editor-a",
  email: "editor-a@example.com",
  role: "content-editor",
  totpEnabled: false,
};

const REDIRECT_MUTATION_KINDS = [
  "redirect-create",
  "redirect-update",
  "redirect-delete",
  "redirect-flatten",
  "redirect-import-csv",
] as const;

describe("redirect authorship mutation kinds", () => {
  it("registers all redirect mutation kinds in ContentMutationKindSchema", () => {
    for (const kind of REDIRECT_MUTATION_KINDS) {
      expect(ContentMutationKindSchema.safeParse(kind).success).toBe(true);
    }
  });

  it("builds authorship context for redirect-create without throwing", () => {
    const authorship = buildAuthorshipSaveContext(editor, "redirect-create");
    expect(authorship.actor.id).toBe(editor.id);
    expect(authorship.mutationKind).toBe("redirect-create");
  });
});

describe("SQLite redirect storage", () => {
  let tempDir: string;
  let client: Client;
  let adapter: SQLiteStorageAdapter;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-redirects-"));
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

  it("creates and lists a redirect rule", async () => {
    const created = await adapter.createRedirect(
      {
        fromPath: "/old-path",
        toPath: "/",
        statusCode: 301,
        enabled: true,
      },
      editor.id,
    );

    expect(created.fromPath).toBe("/old-path");
    expect(created.toPath).toBe("/");
    expect(created.createdById).toBe(editor.id);

    const listed = await adapter.listRedirects({ includeDisabled: true });
    expect(listed.some((rule) => rule.id === created.id)).toBe(true);
  });
});
