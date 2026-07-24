import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import type { SessionUser } from "../../../lib/auth/types";
import { createCollectionOnAdapter } from "../../../lib/cms/services/collections";
import { SQLiteStorageAdapter } from "../../../lib/storage/sqlite";
import {
  analyzeWordPressImport,
  applyWxrWordPressImport,
  buildWordPressImportFile,
  createWordPressImportBatch,
  type WordPressImportScope,
} from "../../../lib/wordpress-import/service";

const actor = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "importer",
  email: "importer@example.test",
  role: "administrator",
  totpEnabled: false,
  preferences: {},
} as SessionUser;

const wxrSource = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:wp="http://wordpress.org/export/1.2/"
  xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Example Site</title>
    <link>https://example.test</link>
    <wp:base_site_url>https://example.test</wp:base_site_url>
    <wp:base_blog_url>https://example.test</wp:base_blog_url>
    <wp:wxr_version>1.2</wp:wxr_version>
    <wp:author>
      <wp:author_login>jane</wp:author_login>
      <wp:author_email>jane@example.test</wp:author_email>
      <wp:author_display_name>Jane Editor</wp:author_display_name>
      <wp:author_first_name>Jane</wp:author_first_name>
      <wp:author_last_name>Editor</wp:author_last_name>
    </wp:author>
    <item>
      <title>Hello World</title>
      <wp:post_id>10</wp:post_id>
      <wp:post_name>hello-world</wp:post_name>
      <wp:post_type>post</wp:post_type>
      <wp:status>publish</wp:status>
      <dc:creator>jane</dc:creator>
      <content:encoded><![CDATA[<p>Hello from WordPress</p>]]></content:encoded>
      <excerpt:encoded><![CDATA[First imported post]]></excerpt:encoded>
      <category domain="category" nicename="news"><![CDATA[News]]></category>
      <category domain="post_tag" nicename="featured"><![CDATA[Featured]]></category>
      <category domain="wp_theme" nicename="twentytwentyfive"><![CDATA[twentytwentyfive]]></category>
      <wp:postmeta>
        <wp:meta_key>_thumbnail_id</wp:meta_key>
        <wp:meta_value>20</wp:meta_value>
      </wp:postmeta>
      <wp:postmeta>
        <wp:meta_key>subtitle</wp:meta_key>
        <wp:meta_value>Clean custom field</wp:meta_value>
      </wp:postmeta>
      <wp:comment>
        <wp:comment_id>1</wp:comment_id>
        <wp:comment_content>Deferred comment</wp:comment_content>
      </wp:comment>
    </item>
    <item>
      <title>Hero Image</title>
      <wp:post_id>20</wp:post_id>
      <wp:post_name>hero-image</wp:post_name>
      <wp:post_type>attachment</wp:post_type>
      <wp:attachment_url>https://example.test/wp-content/uploads/hero.jpg</wp:attachment_url>
    </item>
    <item>
      <title>Home</title>
      <wp:post_id>30</wp:post_id>
      <wp:post_name>home</wp:post_name>
      <wp:post_type>nav_menu_item</wp:post_type>
      <wp:postmeta>
        <wp:meta_key>_menu_item_url</wp:meta_key>
        <wp:meta_value>/</wp:meta_value>
      </wp:postmeta>
      <wp:postmeta>
        <wp:meta_key>_menu_item_object_id</wp:meta_key>
        <wp:meta_value>10</wp:meta_value>
      </wp:postmeta>
      <wp:postmeta>
        <wp:meta_key>_menu_item_object</wp:meta_key>
        <wp:meta_value>post</wp:meta_value>
      </wp:postmeta>
    </item>
    <item>
      <title>Global Styles</title>
      <wp:post_id>40</wp:post_id>
      <wp:post_name>wp-global-styles</wp:post_name>
      <wp:post_type>wp_global_styles</wp:post_type>
    </item>
    <item>
      <title>Pricing Table</title>
      <wp:post_id>41</wp:post_id>
      <wp:post_name>pricing-table</wp:post_name>
      <wp:post_type>tablepress_table</wp:post_type>
    </item>
  </channel>
</rss>`;

describe("WordPress WXR apply import", () => {
  let client: Client;
  let adapter: SQLiteStorageAdapter;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-wp-import-"));
    client = createClient({ url: `file:${path.join(tempDir, "aria.db")}` });
    adapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: false,
      seedStarterDesign: false,
      seedStarterSiteSettings: false,
      snapshotDir: path.join(tempDir, "snapshots"),
      uploadDir: path.join(tempDir, "uploads"),
      thumbnailsDir: path.join(tempDir, "thumbnails"),
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    client.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function analyzeAndApply(
    batchId: string,
    sourceText = wxrSource,
    scope?: Partial<WordPressImportScope>,
  ) {
    const batch = createWordPressImportBatch({
      id: batchId,
      sourceType: "wxr",
      actorId: actor.id,
    });
    await adapter.saveWordPressImportBatch(batch);
    const analyzed = await analyzeWordPressImport({
      adapter,
      batch,
      sourceText,
      sourceType: "wxr",
    });
    return applyWxrWordPressImport({
      adapter,
      batch: analyzed.batch,
      sourceText,
      actor,
      scope,
    });
  }

  it("imports WXR content and re-imports idempotently", async () => {
    const firstBatch = await analyzeAndApply("batch-first");

    expect(firstBatch.status).toBe("completed");
    expect(firstBatch.summary.warnings).toEqual([]);
    expect(firstBatch.counts.comments).toBe(1);

    const collections = await adapter.listCollections();
    expect(collections.map((collection) => collection.name).sort()).toEqual([
      "authors",
      "category",
      "main-nav",
      "post-tag",
      "posts",
    ]);

    const postsCollection = await adapter.getCollection("posts");
    const authorsCollection = await adapter.getCollection("authors");
    const categoryCollection = await adapter.getCollection("category");
    const tagCollection = await adapter.getCollection("post-tag");
    const navCollection = await adapter.getCollection("main-nav");
    expect(postsCollection).toBeTruthy();
    expect(authorsCollection).toBeTruthy();
    expect(categoryCollection).toBeTruthy();
    expect(tagCollection).toBeTruthy();
    expect(navCollection).toBeTruthy();
    expect(categoryCollection?.kind).toBe("tags");
    expect(tagCollection?.kind).toBe("tags");
    expect(postsCollection?.schema.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "wp_category",
          type: "relation",
          targetCollection: categoryCollection!.id,
        }),
        expect.objectContaining({
          key: "wp_post_tag",
          type: "relation",
          targetCollection: tagCollection!.id,
        }),
      ]),
    );

    const posts = await adapter.listEntries({ collectionId: postsCollection!.id });
    const authors = await adapter.listEntries({ collectionId: authorsCollection!.id });
    const categories = await adapter.listEntries({
      collectionId: categoryCollection!.id,
    });
    const tags = await adapter.listEntries({ collectionId: tagCollection!.id });
    const navItems = await adapter.listEntries({ collectionId: navCollection!.id });
    expect(posts.total).toBe(1);
    expect(authors.total).toBe(1);
    expect(categories.total).toBe(1);
    expect(tags.total).toBe(1);
    expect(navItems.total).toBe(1);

    const post = posts.items[0]!;
    const postLocale = post.locales[0]!;
    const frontmatter = postLocale.frontmatter as Record<string, unknown>;
    expect(postLocale.title).toBe("Hello World");
    expect(postLocale.body).toBe("<p>Hello from WordPress</p>");
    expect(frontmatter).toMatchObject({
      author: "jane",
      subtitle: "Clean custom field",
      featured_image: {
        mediaId: "/uploads/wordpress/20-hero.jpg",
        alt: "Hello World",
      },
    });
    expect(frontmatter).not.toHaveProperty("terms");
    const postWithRelations = await adapter.getEntry({
      collectionId: postsCollection!.id,
      idOrSlug: post.entry.id,
      includeRelations: true,
    });
    expect(postWithRelations?.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldKey: "wp_category",
          targetEntryId: categories.items[0]!.entry.id,
          position: 0,
        }),
        expect.objectContaining({
          fieldKey: "wp_post_tag",
          targetEntryId: tags.items[0]!.entry.id,
          position: 0,
        }),
      ]),
    );
    expect(postWithRelations?.relations).toHaveLength(2);
    expect(await adapter.getMedia("wordpress/20-hero.jpg")).toEqual(
      Buffer.from([1, 2, 3, 4]),
    );

    const firstItems = await adapter.listWordPressImportItems(firstBatch.id);
    expect(firstItems.some((item) => item.sourceKind === "comment")).toBe(false);
    const firstMappings = await adapter.listWordPressImportMappings(firstBatch.id);
    const firstTargets = new Map(
      firstMappings.map((mapping) => [
        `${mapping.sourceKind}:${mapping.sourceId}`,
        mapping.targetId,
      ]),
    );
    expect(firstTargets.has("post:10")).toBe(true);
    expect(firstTargets.has("author:jane")).toBe(true);
    expect(firstTargets.has("term:category:news")).toBe(true);
    expect(firstTargets.has("term:post_tag:featured")).toBe(true);
    expect(firstTargets.has("attachment:20")).toBe(true);
    expect(firstTargets.has("menu-item:30")).toBe(true);

    const renamedSource = wxrSource.replace(
      "<title>Example Site</title>",
      "<title>Renamed Site</title>",
    );
    const secondBatch = await analyzeAndApply("batch-second", renamedSource);
    expect(secondBatch.status).toBe("completed");
    expect(secondBatch.summary.warnings).toEqual([]);

    await expect(
      adapter.listEntries({ collectionId: postsCollection!.id }),
    ).resolves.toMatchObject({ total: 1 });
    await expect(
      adapter.listEntries({ collectionId: authorsCollection!.id }),
    ).resolves.toMatchObject({ total: 1 });
    await expect(
      adapter.listEntries({ collectionId: categoryCollection!.id }),
    ).resolves.toMatchObject({ total: 1 });
    await expect(
      adapter.listEntries({ collectionId: tagCollection!.id }),
    ).resolves.toMatchObject({ total: 1 });
    await expect(
      adapter.listEntries({ collectionId: navCollection!.id }),
    ).resolves.toMatchObject({ total: 1 });
    const updatedPost = await adapter.getEntry({
      collectionId: postsCollection!.id,
      idOrSlug: post.entry.id,
      includeRelations: true,
    });
    const updatedPostsCollection = await adapter.getCollection("posts");
    expect(updatedPost?.relations).toHaveLength(2);
    expect(
      updatedPostsCollection?.schema.fields.filter(
        (field) => field.key === "wp_category",
      ),
    ).toHaveLength(1);

    const secondMappings = await adapter.listWordPressImportMappings(secondBatch.id);
    const secondTargets = new Map(
      secondMappings.map((mapping) => [
        `${mapping.sourceKind}:${mapping.sourceId}`,
        mapping.targetId,
      ]),
    );
    expect(secondTargets).toEqual(firstTargets);

    const secondItems = await adapter.listWordPressImportItems(secondBatch.id);
    expect(secondItems.some((item) => item.sourceKind === "comment")).toBe(false);
    expect(
      secondItems
        .filter((item) =>
          item.status === "imported" &&
          ["post", "author", "term", "menu-item"].includes(item.sourceKind),
        )
        .every((item) => item.action === "update"),
    ).toBe(true);
  });

  it("discards the uploaded source after a successful import", async () => {
    const batch = createWordPressImportBatch({
      id: "batch-discard-source",
      sourceType: "wxr",
      actorId: actor.id,
    });
    const objectKey = "_imports/wordpress/batch-discard-source/export.xml";
    const sourceBytes = Buffer.from(wxrSource, "utf8");
    await adapter.saveWordPressImportBatch(batch);
    await adapter.saveMedia(objectKey, sourceBytes, {
      contentType: "application/xml",
    });
    await adapter.saveWordPressImportFile(
      buildWordPressImportFile({
        batchId: batch.id,
        filename: "export.xml",
        objectKey,
        contentType: "application/xml",
        sizeBytes: sourceBytes.byteLength,
        sha256: "test-source-sha256",
      }),
    );

    const analyzed = await analyzeWordPressImport({
      adapter,
      batch,
      sourceText: wxrSource,
      sourceType: "wxr",
    });
    const completed = await applyWxrWordPressImport({
      adapter,
      batch: analyzed.batch,
      sourceText: wxrSource,
      actor,
    });

    expect(completed.status).toBe("completed");
    await expect(adapter.getMedia(objectKey)).resolves.toBeNull();
    await expect(adapter.listWordPressImportFiles(batch.id)).resolves.toEqual([]);
  });

  it("respects deselected authors and terms for both collections and post fields", async () => {
    const batch = await analyzeAndApply("batch-scope", wxrSource, {
      authors: false,
      terms: false,
    });

    expect(batch.status).toBe("completed");
    expect(batch.summary.warnings).toContain(
      "Skipped by import selection: Authors, Terms.",
    );
    const collections = await adapter.listCollections();
    expect(collections.map((collection) => collection.name).sort()).toEqual([
      "main-nav",
      "posts",
    ]);

    const postsCollection = await adapter.getCollection("posts");
    expect(postsCollection).toBeTruthy();
    const posts = await adapter.listEntries({ collectionId: postsCollection!.id });
    expect(
      postsCollection!.schema.fields.some((field) => field.key.startsWith("wp_")),
    ).toBe(false);
    const frontmatter = posts.items[0]?.locales[0]?.frontmatter as
      | Record<string, unknown>
      | undefined;
    expect(frontmatter).toBeTruthy();
    expect(frontmatter).not.toHaveProperty("author");
    expect(frontmatter).not.toHaveProperty("terms");
    const post = await adapter.getEntry({
      collectionId: postsCollection!.id,
      idOrSlug: posts.items[0]!.entry.id,
      includeRelations: true,
    });
    expect(post?.relations ?? []).toEqual([]);
  });

  it("upgrades existing content collections with missing taxonomy relation fields", async () => {
    const seededPosts = await createCollectionOnAdapter(adapter, {
      name: "posts",
      label: "Posts",
      kind: "content",
      fields: [{ key: "legacy", label: "Legacy", type: "string" }],
      supports: ["body", "drafts"],
    });

    const batch = await analyzeAndApply("batch-upgrade");

    expect(batch.status).toBe("completed");
    const postsCollection = await adapter.getCollection("posts");
    const categoryCollection = await adapter.getCollection("category");
    const tagCollection = await adapter.getCollection("post-tag");
    expect(postsCollection?.id).toBe(seededPosts.id);
    expect(postsCollection?.supports).toEqual(["body", "drafts"]);
    expect(postsCollection?.schema.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "legacy", type: "string" }),
        expect.objectContaining({
          key: "wp_category",
          type: "relation",
          targetCollection: categoryCollection!.id,
        }),
        expect.objectContaining({
          key: "wp_post_tag",
          type: "relation",
          targetCollection: tagCollection!.id,
        }),
      ]),
    );
    expect(
      postsCollection!.schema.fields.filter((field) => field.key === "legacy"),
    ).toHaveLength(1);
  });

  it("repairs legacy WordPress taxonomy target collection names on re-import", async () => {
    const seededPosts = await createCollectionOnAdapter(adapter, {
      name: "posts",
      label: "Posts",
      kind: "content",
      fields: [
        {
          key: "wp_category",
          label: "Legacy Category",
          type: "relation",
          targetCollection: "category",
          showInEntryList: true,
        },
      ],
      supports: ["body", "drafts"],
    });

    const batch = await analyzeAndApply("batch-repair-taxonomy-targets");

    expect(batch.status).toBe("completed");
    const postsCollection = await adapter.getCollection("posts");
    const categoryCollection = await adapter.getCollection("category");
    const tagCollection = await adapter.getCollection("post-tag");
    expect(postsCollection?.id).toBe(seededPosts.id);
    expect(postsCollection?.schema.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "wp_category",
          label: "Legacy Category",
          type: "relation",
          targetCollection: categoryCollection!.id,
          showInEntryList: true,
        }),
        expect.objectContaining({
          key: "wp_post_tag",
          type: "relation",
          targetCollection: tagCollection!.id,
        }),
      ]),
    );
    expect(
      postsCollection!.schema.fields.filter((field) => field.key === "wp_category"),
    ).toHaveLength(1);
    expect(
      postsCollection!.schema.fields.filter((field) => field.key === "wp_post_tag"),
    ).toHaveLength(1);
  });

  it("keeps media download failures as skipped report rows", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("fetch failed"));

    const batch = await analyzeAndApply("batch-media-skip");

    expect(batch.status).toBe("completed");
    expect(batch.summary.failed).toBe(0);
    expect(batch.summary.skipped).toBe(1);
    expect(batch.summary.warnings).toContain(
      "Skipped 1 media file(s) because the source URLs could not be reached.",
    );
    const media = (await adapter.listWordPressImportMedia(batch.id)).filter(
      (item) => item.status !== "planned",
    );
    expect(media).toMatchObject([
      {
        sourceAttachmentId: "20",
        status: "skipped",
        errorMessage: "fetch failed",
      },
    ]);
  });

  it("does not apply a batch that was already cancelled", async () => {
    const batch = createWordPressImportBatch({
      id: "batch-cancelled",
      sourceType: "wxr",
      actorId: actor.id,
    });
    const cancelledBatch = {
      ...batch,
      status: "cancelled" as const,
      currentMessage: "Import cancelled.",
      completedAt: new Date().toISOString(),
    };
    await adapter.saveWordPressImportBatch(cancelledBatch);

    const result = await applyWxrWordPressImport({
      adapter,
      batch: cancelledBatch,
      sourceText: wxrSource,
      actor,
    });

    expect(result.status).toBe("cancelled");
    expect(await adapter.listCollections()).toEqual([]);
  });
});
