import { describe, expect, it } from "vitest";
import {
  assertCmsFieldMutationAllowed,
  changedEntryPatchFields,
  evaluateCmsPolicy,
  projectCmsEntryRecord,
} from "../../../lib/cms/services/accessPolicy";
import { saveCollectionPolicyOnAdapter } from "../../../lib/cms/services/collectionAccessPolicy";
import type { AriaEntryRecord } from "../../../lib/cms/schemas";
import type { StorageAdapter } from "../../../lib/storage/adapter";

const record: AriaEntryRecord = {
  entry: {
    id: "entry-1",
    collectionId: "collection-posts",
    status: "draft",
    version: "version-1",
    authorId: "author-1",
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
    publishedAt: null,
    scheduledFor: null,
  },
  locales: [
    {
      entryId: "entry-1",
      collectionId: "collection-posts",
      locale: "en",
      slug: "hello",
      title: "Hello",
      frontmatter: { audience: "Developers", privateNote: "Do not show" },
      body: [{ _type: "block", children: [] }],
      isSource: true,
    },
    {
      entryId: "entry-1",
      collectionId: "collection-posts",
      locale: "fr",
      slug: "bonjour",
      title: "Bonjour",
      frontmatter: { audience: "Developpeurs", privateNote: "Ne pas montrer" },
      body: [{ _type: "block", children: [] }],
      isSource: false,
    },
  ],
};

function adapterForPolicy(policy: unknown): StorageAdapter {
  return {
    getCollection: async () => ({ id: "collection-posts" }),
    getCollectionPolicy: async () => policy,
  } as unknown as StorageAdapter;
}

describe("CMS collection access policy", () => {
  it("keeps existing collections open while their policy is inherited", async () => {
    const decision = await evaluateCmsPolicy(
      adapterForPolicy({
        collectionId: "collection-posts",
        mode: "inherit",
        rules: [],
        updatedAt: "2026-07-13T00:00:00.000Z",
      }),
      {
        actor: { id: "editor-1", role: "content-editor" },
        collectionId: "collection-posts",
        action: "read",
        entry: record,
      },
    );

    expect(decision.allowed).toBe(true);
    expect(decision.visibleFields).toBeNull();
  });

  it("enforces own-document, locale, and field rules together", async () => {
    const adapter = adapterForPolicy({
      collectionId: "collection-posts",
      mode: "restricted",
      rules: [
        {
          principalId: "author-1",
          actions: ["read", "update"],
          documentScope: "own",
          locales: ["en"],
          visibleFields: ["title", "slug", "audience"],
          editableFields: ["title", "audience"],
        },
      ],
      updatedAt: "2026-07-13T00:00:00.000Z",
    });
    const read = await evaluateCmsPolicy(adapter, {
      actor: { id: "author-1", role: "content-editor" },
      collectionId: "collection-posts",
      action: "read",
      locale: "en",
      entry: record,
    });
    const projected = projectCmsEntryRecord(record, read);

    expect(read.allowed).toBe(true);
    expect(projected?.locales).toHaveLength(1);
    expect(projected?.locales[0]).toMatchObject({
      locale: "en",
      title: "Hello",
      slug: "hello",
      body: null,
      frontmatter: { audience: "Developers" },
    });
    expect(() =>
      assertCmsFieldMutationAllowed(read, ["audience"]),
    ).not.toThrow();
    expect(() => assertCmsFieldMutationAllowed(read, ["body"])).toThrow(
      "does not allow editing body",
    );

    const wrongLocale = await evaluateCmsPolicy(adapter, {
      actor: { id: "author-1", role: "content-editor" },
      collectionId: "collection-posts",
      action: "read",
      locale: "fr",
      entry: record,
    });
    const otherEntry = await evaluateCmsPolicy(adapter, {
      actor: { id: "author-1", role: "content-editor" },
      collectionId: "collection-posts",
      action: "read",
      locale: "en",
      entry: { entry: { ...record.entry, authorId: "someone-else" } },
    });

    expect(wrongLocale.allowed).toBe(false);
    expect(otherEntry.allowed).toBe(false);
  });

  it("keeps a redacted record schema-valid and denies omitted explicit locales", async () => {
    const adapter = adapterForPolicy({
      collectionId: "collection-posts",
      mode: "restricted",
      rules: [
        {
          principalId: "author-1",
          actions: ["read", "update"],
          documentScope: "all",
          locales: ["en"],
          visibleFields: ["title"],
          editableFields: ["title"],
        },
      ],
      updatedAt: "2026-07-13T00:00:00.000Z",
    });
    const omittedLocale = await evaluateCmsPolicy(adapter, {
      actor: { id: "author-1", role: "content-editor" },
      collectionId: "collection-posts",
      action: "read",
      entry: record,
    });
    const explicitLocale = await evaluateCmsPolicy(adapter, {
      actor: { id: "author-1", role: "content-editor" },
      collectionId: "collection-posts",
      action: "read",
      locale: "en",
      entry: record,
    });

    expect(omittedLocale.allowed).toBe(false);
    expect(
      projectCmsEntryRecord(record, explicitLocale)?.locales[0]?.slug,
    ).toBe("restricted");
  });

  it("includes relation field keys in restricted mutation checks", () => {
    expect(
      changedEntryPatchFields({
        relations: [{ fieldKey: "authors" }, { fieldKey: "relatedPosts" }],
        translationMeta: null,
      }),
    ).toEqual(["authors", "relatedPosts"]);
  });

  it("keeps administrators as the restricted-policy recovery principal", async () => {
    const decision = await evaluateCmsPolicy(
      adapterForPolicy({
        collectionId: "collection-posts",
        mode: "restricted",
        rules: [],
        updatedAt: "2026-07-13T00:00:00.000Z",
      }),
      {
        actor: { id: "admin-1", role: "administrator" },
        collectionId: "collection-posts",
        action: "schema_edit",
      },
    );

    expect(decision.allowed).toBe(true);
  });

  it("rejects policy fields and locales outside the target collection", async () => {
    const adapter = {
      getCollection: async () => ({
        id: "collection-posts",
        supports: ["body"],
        schema: { fields: [{ key: "audience" }] },
      }),
      getSiteSettings: async () => ({
        localization: { content: { defaultLocale: "en", locales: ["en"] } },
      }),
      saveCollectionPolicy: async (policy: unknown) => policy,
    } as unknown as StorageAdapter;

    await expect(
      saveCollectionPolicyOnAdapter(adapter, {
        collectionId: "collection-posts",
        mode: "restricted",
        rules: [
          {
            principalId: "editor-1",
            actions: ["read"],
            documentScope: "all",
            locales: ["fr"],
            visibleFields: ["privateNote"],
          },
        ],
      }),
    ).rejects.toThrow("Policy locale is not configured: fr");
  });
});
