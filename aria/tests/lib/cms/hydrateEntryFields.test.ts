import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { hydrateResolvedEntryFrontmatter } from "../../../lib/cms/hydrateEntryFields";
import { createCollectionOnAdapter } from "../../../lib/cms/services/collections";
import {
  createEntryOnAdapter,
  publishEntryOnAdapter,
} from "../../../lib/cms/services/entries";
import { SQLiteStorageAdapter } from "../../../lib/storage/sqlite";
import type { ActorRef } from "../../../lib/auth/types";
import type { FieldSchema } from "../../../lib/cms/fieldSchema";
import type { AriaEntryRecord } from "../../../lib/cms/schemas";

const testActor: ActorRef = {
  id: "author-1",
  username: "admin",
  email: "admin@example.test",
};

vi.mock("astro:actions", () => ({
  ActionError: class MockActionError extends Error {
    code: string;
    constructor(input: { code: string; message: string }) {
      super(input.message);
      this.code = input.code;
    }
  },
}));

function mapEntry(record: AriaEntryRecord, locale = "en") {
  const entryLocale =
    record.locales.find((item) => item.locale === locale) ??
    record.locales.find((item) => item.isSource) ??
    record.locales[0];
  if (!entryLocale) {
    throw new Error("Entry has no locale rows");
  }
  return {
    id: record.entry.id,
    collectionId: record.entry.collectionId,
    slug: entryLocale.slug,
    title: entryLocale.title,
    status: record.entry.status,
    frontmatter: entryLocale.frontmatter,
    body: entryLocale.body,
    updatedAt: record.entry.updatedAt,
    publishedAt: record.entry.publishedAt,
    record,
  };
}

describe("hydrateResolvedEntryFrontmatter", () => {
  let client: Client;
  let dbPath: string;
  let adapter: SQLiteStorageAdapter;

  beforeEach(async () => {
    dbPath = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), "aria-hydrate-entry-")),
      "cms.sqlite",
    );
    client = createClient({ url: `file:${dbPath}` });
    adapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: false,
    });
  });

  afterEach(async () => {
    client.close();
    await fs.rm(path.dirname(dbPath), { recursive: true, force: true });
  });

  it("hydrates reference fields with related entry data", async () => {
    const authorFields = [
      {
        key: "role",
        label: "Role",
        type: "string",
        required: true,
      },
    ] satisfies FieldSchema[];

    const authors = await createCollectionOnAdapter(adapter, {
      name: "authors",
      label: "Authors",
      kind: "data",
      fields: authorFields,
    });
    const author = await createEntryOnAdapter(
      adapter,
      {
        collectionId: authors.id,
        title: "Michael Chen",
        slug: "michael-chen",
        frontmatter: { role: "Senior Tech Writer" },
      },
      testActor,
    );
    await publishEntryOnAdapter(
      adapter,
      {
        collectionId: authors.id,
        id: author.entry.id,
        version: author.entry.version,
      },
      testActor,
    );

    const blogFields = [
      {
        key: "author",
        label: "Author",
        type: "reference",
        targetCollection: authors.id,
        required: true,
      },
    ] satisfies FieldSchema[];

    const blog = await createCollectionOnAdapter(adapter, {
      name: "blog",
      label: "Blog",
      kind: "content",
      fields: blogFields,
    });
    const post = await createEntryOnAdapter(
      adapter,
      {
        collectionId: blog.id,
        title: "Binding Fields",
        slug: "binding-fields",
        frontmatter: { author: author.entry.id },
      },
      testActor,
    );

    const collections = await adapter.listCollections();
    const resolved = mapEntry(post, "en");
    const hydrated = await hydrateResolvedEntryFrontmatter(
      adapter,
      blog,
      resolved,
      "en",
      collections,
    );

    const authorValue = hydrated.frontmatter.author;
    expect(authorValue).toMatchObject({
      id: author.entry.id,
      title: "Michael Chen",
      slug: "michael-chen",
      role: "Senior Tech Writer",
    });
  });
});
