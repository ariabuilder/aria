import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import {
  deleteResource,
  ERROR_CODES,
} from "../../actions/_shared";
import { createEmptyCollectionSchema } from "../../lib/cms/storage/db";
import type { AriaCollection } from "../../lib/cms/types";
import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";
import type { PageDSL } from "../../lib/types/nodes";

const now = "2026-07-02T12:00:00.000Z";

const templatePage: PageDSL = {
  id: "page-template",
  title: "Post Template",
  slug: "post-template",
  status: "published",
  systemRole: "standard",
  nodes: [],
};

function createCollection(
  overrides: Partial<AriaCollection> & Pick<AriaCollection, "id" | "name" | "label">,
): AriaCollection {
  const kind = overrides.kind ?? "content";
  return {
    ...overrides,
    id: overrides.id,
    name: overrides.name,
    label: overrides.label,
    kind,
    schema: overrides.schema ?? createEmptyCollectionSchema(overrides.id, overrides.label, kind),
    scope: overrides.scope ?? "global",
    urlPattern: overrides.urlPattern ?? "/blog/{slug}",
    templatePageId: overrides.templatePageId ?? null,
    listPageId: overrides.listPageId ?? null,
    supports: overrides.supports ?? [],
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

describe("deleteResource CMS routing impact", () => {
  let tempDir: string;
  let client: Client;
  let adapter: SQLiteStorageAdapter;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-page-delete-routing-"));
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

  it("blocks deleting a page assigned as an entry template", async () => {
    await adapter.savePageDSL(templatePage.id, templatePage);
    await adapter.saveCollection(
      createCollection({
        id: "collection-blog",
        name: "blog",
        label: "Blog",
        templatePageId: templatePage.id,
      }),
    );

    await expect(
      deleteResource(adapter, { locals: {} }, "pages", templatePage.slug),
    ).rejects.toMatchObject({
      code: ERROR_CODES.RESOURCE_IN_USE,
      message: expect.stringContaining("entry template"),
    });

    expect(await adapter.getPageDSL(templatePage.slug)).not.toBeNull();
  });

  it("allows deleting a page with no CMS routing assignments", async () => {
    await adapter.savePageDSL(templatePage.id, templatePage);

    await deleteResource(adapter, { locals: {} }, "pages", templatePage.slug);

    expect(await adapter.getPageDSL(templatePage.slug)).toBeNull();
  });
});
