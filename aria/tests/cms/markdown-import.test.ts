import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  applyMarkdownImport,
  previewMarkdownImport,
} from "../../lib/cms/markdown-import";
import { createCollectionOnAdapter } from "../../lib/cms/services/collections";
import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";
import { CloudflareStorageAdapter } from "../../lib/storage/cloudflare";
import { createD1Mock } from "../helpers/d1Mock";
import JSZip from "jszip";
import { extractMarkdownImportSources } from "../../lib/cms/markdown-import";

const actor = {
  id: "markdown-import-test",
  username: "markdown-import-test",
  email: "markdown-import-test@example.com",
};

async function createImportCollection(
  adapter: SQLiteStorageAdapter | CloudflareStorageAdapter,
) {
  return createCollectionOnAdapter(adapter, {
    name: "articles",
    label: "Articles",
    kind: "content",
    supports: ["body"],
    fields: [
      { key: "summary", label: "Summary", type: "text" },
      { key: "featured", label: "Featured", type: "boolean" },
    ],
  });
}

describe("Markdown import", () => {
  let client: Client;
  let tempDir: string;
  let adapter: SQLiteStorageAdapter;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-markdown-import-"));
    client = createClient({ url: `file:${path.join(tempDir, "aria.db")}` });
    adapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: false,
      seedStarterDesign: false,
      seedStarterSiteSettings: false,
    });
    await adapter.getPageDSL("index");
  });

  afterEach(async () => {
    client.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("previews and creates structured Markdown entries without inferring fields", async () => {
    const collection = await createImportCollection(adapter);
    const input = {
      collectionId: collection.id,
      mode: "create" as const,
      sources: [
        {
          path: "posts/edge.md",
          content: `---
title: Edge Import
slug: edge-import
summary: A short summary
featured: true
unknown_key: ignored
---
# Start here

This is **structured** [content](https://example.com).`,
        },
      ],
    };
    const preview = await previewMarkdownImport(adapter, input);
    expect(preview.canApply).toBe(true);
    expect(preview.summary).toMatchObject({ creates: 1, warnings: 2 });
    expect(preview.items[0]?.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["unknown-field", "heading-level-normalized"]),
    );

    const applied = await applyMarkdownImport(adapter, input, actor);
    expect(applied.applied).toBe(true);
    const entry = await adapter.getEntry({
      collectionId: collection.id,
      idOrSlug: "edge-import",
      locale: "en",
    });
    expect(entry?.entry.status).toBe("draft");
    expect(entry?.locales[0]?.frontmatter).toEqual({
      summary: "A short summary",
      featured: true,
    });
    expect(entry?.locales[0]?.body).toMatchObject([
      { _type: "block", style: "h2" },
      { _type: "block", style: "normal" },
    ]);
    await expect(
      adapter.searchCmsSearchDocuments({
        query: "structured",
        locales: ["en", "global"],
        limit: 10,
      }),
    ).resolves.toMatchObject([{ entityId: entry?.entry.id, locale: "en" }]);
  });

  it("skips existing entries by default and updates only when explicitly requested", async () => {
    const collection = await createImportCollection(adapter);
    const initial = {
      collectionId: collection.id,
      mode: "create" as const,
      sources: [
        {
          path: "item.md",
          content: "---\ntitle: First\nslug: item\nsummary: Old\n---\nInitial",
        },
      ],
    };
    await applyMarkdownImport(adapter, initial, actor);
    const replacement = {
      ...initial,
      sources: [
        {
          path: "item.md",
          content:
            "---\ntitle: Updated\nslug: item\nsummary: New\n---\nReplacement",
        },
      ],
    };
    expect(
      (await previewMarkdownImport(adapter, replacement)).items[0]?.action,
    ).toBe("skip");
    const update = await applyMarkdownImport(
      adapter,
      { ...replacement, mode: "update" },
      actor,
    );
    expect(update.applied).toBe(true);
    const entry = await adapter.getEntry({
      collectionId: collection.id,
      idOrSlug: "item",
      locale: "en",
    });
    expect(entry?.locales[0]?.title).toBe("Updated");
    expect(entry?.locales[0]?.frontmatter).toMatchObject({ summary: "New" });
  });

  it("offers safe unknown frontmatter keys and adds only explicitly selected fields", async () => {
    const collection = await createImportCollection(adapter);
    const input = {
      collectionId: collection.id,
      mode: "create" as const,
      sources: [
        {
          path: "field-suggestions.md",
          content:
            "---\ntitle: Suggested fields\naudience: developers\nvisibility: public\nwebsite_nav: docs\n---\nBody",
        },
      ],
    };
    const preview = await previewMarkdownImport(adapter, input);
    expect(preview.fieldSuggestions).toEqual([
      expect.objectContaining({
        key: "audience",
        type: "string",
        allowedTypes: ["string", "text", "slug", "select"],
      }),
      expect.objectContaining({
        key: "visibility",
        type: "string",
        allowedTypes: ["string", "text", "slug", "select"],
      }),
      expect.objectContaining({
        key: "website_nav",
        type: "string",
        allowedTypes: ["string", "text", "slug", "select"],
      }),
    ]);

    const report = await applyMarkdownImport(
      adapter,
      {
        ...input,
        addFields: [
          { key: "audience", type: "text" },
          { key: "visibility", type: "select" },
        ],
      },
      actor,
    );
    expect(report.applied).toBe(true);
    expect(report.addedFieldKeys).toEqual(["audience", "visibility"]);
    const updatedCollection = await adapter.getCollection(collection.id);
    expect(updatedCollection?.schema.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "audience", type: "text" }),
        expect.objectContaining({
          key: "visibility",
          type: "select",
          options: ["public"],
        }),
      ]),
    );
    const entry = await adapter.getEntry({
      collectionId: collection.id,
      idOrSlug: "field-suggestions",
      locale: "en",
    });
    expect(entry?.locales[0]?.frontmatter).toMatchObject({
      audience: "developers",
      visibility: "public",
    });
    expect(entry?.locales[0]?.frontmatter).not.toHaveProperty("website_nav");
  });

  it("rejects a selected type that is incompatible with the source value", async () => {
    const collection = await createImportCollection(adapter);
    await expect(
      applyMarkdownImport(
        adapter,
        {
          collectionId: collection.id,
          mode: "create",
          sources: [
            {
              path: "invalid-field-type.md",
              content:
                "---\ntitle: Invalid field type\naudience: developers\n---\nBody",
            },
          ],
          addFields: [{ key: "audience", type: "boolean" }],
        },
        actor,
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("blocks unsafe and invalid sources before any write", async () => {
    const collection = await createImportCollection(adapter);
    const preview = await previewMarkdownImport(adapter, {
      collectionId: collection.id,
      sources: [
        { path: "broken.md", content: "---\ntitle: [\n---\nBroken" },
        {
          path: "unsafe.mdx",
          content: "---\ntitle: Unsafe\n---\n<Component />",
        },
      ],
      mode: "create",
    });
    expect(preview.canApply).toBe(false);
    expect(preview.summary.errors).toBe(2);
    const applied = await applyMarkdownImport(
      adapter,
      {
        collectionId: collection.id,
        sources: [
          { path: "broken.md", content: "---\ntitle: [\n---\nBroken" },
          {
            path: "unsafe.mdx",
            content: "---\ntitle: Unsafe\n---\n<Component />",
          },
        ],
        mode: "create",
      },
      actor,
    );
    expect(applied.applied).toBe(false);
    expect(
      (
        await adapter.listEntries({
          collectionId: collection.id,
          page: 1,
          limit: 20,
        })
      ).total,
    ).toBe(0);
  });

  it("uses the same service through the Cloudflare D1 adapter", async () => {
    const d1Client = createClient({
      url: `file:${path.join(tempDir, "cloudflare.db")}`,
    });
    for (const migration of [
      "0001_baseline_schema.sql",
      "0002_api_foundation.sql",
      "0003_api_idempotency_leases.sql",
      "0004_api_lifecycle_hardening.sql",
    ]) {
      await d1Client.executeMultiple(
        await fs.readFile(
          path.resolve(process.cwd(), `aria/migrations/${migration}`),
          "utf8",
        ),
      );
    }
    const cloudflareAdapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(d1Client) as never,
    });
    try {
      const collection = await createImportCollection(cloudflareAdapter);
      const report = await applyMarkdownImport(
        cloudflareAdapter,
        {
          collectionId: collection.id,
          mode: "create",
          sources: [
            {
              path: "cloud.md",
              content: "---\ntitle: Cloud Entry\n---\nCloud body",
            },
          ],
        },
        actor,
      );
      expect(report.applied).toBe(true);
      expect(
        (
          await cloudflareAdapter.listEntries({
            collectionId: collection.id,
            page: 1,
            limit: 20,
          })
        ).total,
      ).toBe(1);
    } finally {
      d1Client.close();
    }
  });

  it("extracts Markdown from ZIP archives and rejects unsafe paths", async () => {
    const archive = new JSZip();
    archive.file("posts/one.md", "---\ntitle: One\n---\nBody");
    const sources = await extractMarkdownImportSources({
      filename: "posts.zip",
      bytes: await archive.generateAsync({ type: "uint8array" }),
    });
    expect(sources).toEqual([
      { path: "posts/one.md", content: "---\ntitle: One\n---\nBody" },
    ]);

    const unsafe = new JSZip();
    unsafe.file("../escape.md", "body");
    await expect(
      extractMarkdownImportSources({
        filename: "unsafe.zip",
        bytes: await unsafe.generateAsync({ type: "uint8array" }),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
