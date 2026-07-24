import { createClient } from "@libsql/client/node";
import type { InArgs } from "@libsql/client";
import { z } from "zod";

import { ActorRefSchema, type ActorRef } from "../lib/auth/types";
import { generateId } from "../lib/crypto";
import { cmsActorFromAuthorship } from "../lib/cms/authorship";
import type { FieldSchema } from "../lib/cms/fieldSchema";
import {
  AriaCollectionSchema,
  AriaEntryRecordSchema,
  AriaEntryRevisionSchema,
  CreateCollectionRequestSchema,
  UpdateCollectionRequestSchema,
  type AriaCollection,
  type AriaEntryRecord,
  type AriaEntryRelation,
  type AriaEntryRevision,
  type AriaEntrySnapshot,
} from "../lib/cms/schemas";
import type { StructuredTextDocument } from "../lib/cms/structuredText";
import {
  validateCollectionSchema,
  validateEntryFrontmatter,
} from "../lib/cms/schema/compiler";
import { collectionSchemaForEntryFrontmatter } from "../lib/cms/systemFields";
import {
  cmsGetCollection,
  cmsGetEntry,
  cmsListCollections,
  cmsSaveCollection,
  cmsSaveEntry,
  cmsSaveEntryRevision,
  ensureCmsAuthorshipSchema,
  type CmsStorageExecutor,
} from "../lib/cms/storage";

const DB_PATH = "aria/storage/aria.db";
const DEFAULT_LOCALE = "en";

const UserActorRowSchema = z
  .object({
    id: z.string().trim().min(1),
    username: z.string().trim().min(1).nullable(),
    email: z.email().nullable(),
  })
  .strict();

type SeedEntryInput = {
  slug: string;
  title: string;
  frontmatter: Record<string, unknown>;
  body: StructuredTextDocument | null;
  relations?: Array<Omit<AriaEntryRelation, "sourceEntryId">>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function nextVersion(): string {
  return generateId();
}

function createExecutor(
  client: ReturnType<typeof createClient>,
): CmsStorageExecutor {
  return {
    async queryAll<T extends Record<string, unknown>>(
      sql: string,
      args: unknown[] = [],
    ): Promise<T[]> {
      const result = await client.execute({ sql, args: args as InArgs });
      return result.rows as unknown as T[];
    },
    async queryFirst<T extends Record<string, unknown>>(
      sql: string,
      args: unknown[] = [],
    ): Promise<T | null> {
      const result = await client.execute({ sql, args: args as InArgs });
      return (result.rows[0] as unknown as T | undefined) ?? null;
    },
    async run(sql: string, args: unknown[] = []): Promise<void> {
      await client.execute({ sql, args: args as InArgs });
    },
  };
}

const blogFields = [
  {
    key: "excerpt",
    label: "Excerpt",
    type: "text",
    required: true,
    searchable: true,
    showInEntryList: true,
  },
  {
    key: "author",
    label: "Author",
    type: "reference",
    targetCollection: "authors",
    required: true,
    showInEntryList: true,
  },
  {
    key: "category",
    label: "Category",
    type: "select",
    required: true,
    options: ["Product", "Design", "Engineering", "Company"],
    showInEntryList: true,
  },
  {
    key: "tags",
    label: "Tags",
    type: "relation",
    targetCollection: "tags",
    searchable: true,
  },
  {
    key: "publishedDate",
    label: "Published date",
    type: "date",
    required: true,
    showInEntryList: true,
  },
  {
    key: "featured",
    label: "Featured",
    type: "boolean",
    default: false,
    showInEntryList: true,
  },
  {
    key: "seoTitle",
    label: "SEO title",
    type: "string",
  },
  {
    key: "seoDescription",
    label: "SEO description",
    type: "text",
  },
] satisfies FieldSchema[];

const tagFields = [
  {
    key: "description",
    label: "Description",
    type: "text",
    searchable: true,
    showInEntryList: true,
  },
  {
    key: "color",
    label: "Color",
    type: "color",
    required: true,
    showInEntryList: true,
  },
  {
    key: "icon",
    label: "Icon",
    type: "icon",
    required: true,
  },
] satisfies FieldSchema[];

const authorFields = [
  {
    key: "role",
    label: "Role",
    type: "string",
    required: true,
    showInEntryList: true,
  },
  {
    key: "bio",
    label: "Bio",
    type: "text",
    required: true,
    searchable: true,
  },
  {
    key: "avatar",
    label: "Avatar",
    type: "image",
  },
  {
    key: "website",
    label: "Website",
    type: "link",
  },
  {
    key: "social",
    label: "Social",
    type: "object",
    fields: [
      {
        key: "x",
        label: "X",
        type: "string",
      },
      {
        key: "github",
        label: "GitHub",
        type: "string",
      },
    ],
  },
] satisfies FieldSchema[];

const announcementFields = [
  {
    key: "summary",
    label: "Summary",
    type: "text",
    required: true,
    searchable: true,
    showInEntryList: true,
  },
  {
    key: "severity",
    label: "Severity",
    type: "select",
    required: true,
    options: ["info", "success", "warning", "critical"],
    showInEntryList: true,
  },
  {
    key: "startsAt",
    label: "Starts at",
    type: "datetime",
    required: true,
    showInEntryList: true,
  },
  {
    key: "endsAt",
    label: "Ends at",
    type: "datetime",
  },
  {
    key: "pinned",
    label: "Pinned",
    type: "boolean",
    default: false,
    showInEntryList: true,
  },
  {
    key: "cta",
    label: "Call to action",
    type: "link",
  },
] satisfies FieldSchema[];

const productFields = [
  {
    key: "sku",
    label: "SKU",
    type: "string",
    required: true,
    showInEntryList: true,
  },
  {
    key: "price",
    label: "Price",
    type: "number",
    required: true,
    showInEntryList: true,
  },
  {
    key: "inventory",
    label: "Inventory",
    type: "integer",
    required: true,
  },
  {
    key: "productStatus",
    label: "Status",
    type: "select",
    required: true,
    options: ["draft", "active", "archived"],
    showInEntryList: true,
  },
  {
    key: "featured",
    label: "Featured",
    type: "boolean",
    default: false,
  },
  {
    key: "owner",
    label: "Product owner",
    type: "reference",
    targetCollection: "authors",
  },
  {
    key: "gallery",
    label: "Gallery",
    type: "repeater",
    fields: [
      {
        key: "image",
        label: "Image",
        type: "image",
        required: true,
      },
      {
        key: "caption",
        label: "Caption",
        type: "string",
      },
    ],
  },
  {
    key: "specs",
    label: "Specs",
    type: "json",
  },
] satisfies FieldSchema[];

const testimonialFields = [
  {
    key: "quote",
    label: "Quote",
    type: "text",
    required: true,
    searchable: true,
    showInEntryList: true,
  },
  {
    key: "rating",
    label: "Rating",
    type: "integer",
    required: true,
    showInEntryList: true,
  },
  {
    key: "customer",
    label: "Customer",
    type: "object",
    required: true,
    fields: [
      {
        key: "name",
        label: "Name",
        type: "string",
        required: true,
      },
      {
        key: "role",
        label: "Role",
        type: "string",
      },
      {
        key: "company",
        label: "Company",
        type: "string",
      },
    ],
  },
  {
    key: "product",
    label: "Product",
    type: "reference",
    targetCollection: "products",
  },
  {
    key: "featured",
    label: "Featured",
    type: "boolean",
    default: false,
  },
] satisfies FieldSchema[];

const fieldShowcaseFields = [
  { key: "shortText", label: "Short text", type: "string", required: true },
  { key: "longText", label: "Long text", type: "text", required: true },
  { key: "customSlug", label: "Custom slug", type: "slug", required: true },
  { key: "score", label: "Score", type: "number", required: true },
  { key: "quantity", label: "Quantity", type: "integer", required: true },
  { key: "enabled", label: "Enabled", type: "boolean", required: true },
  { key: "launchDate", label: "Launch date", type: "date", required: true },
  { key: "launchAt", label: "Launch at", type: "datetime", required: true },
  {
    key: "launchStatus",
    label: "Status",
    type: "select",
    required: true,
    options: ["planned", "live", "paused"],
  },
  {
    key: "channels",
    label: "Channels",
    type: "multiSelect",
    required: true,
    options: ["web", "email", "social", "in-app"],
  },
  { key: "icon", label: "Icon", type: "icon", required: true },
  { key: "heroImage", label: "Hero image", type: "image", required: true },
  { key: "download", label: "Download", type: "file", required: true },
  {
    key: "owner",
    label: "Owner",
    type: "reference",
    targetCollection: "authors",
    required: true,
  },
  {
    key: "relatedTags",
    label: "Related tags",
    type: "relation",
    targetCollection: "tags",
  },
  {
    key: "structuredNotes",
    label: "Structured notes",
    type: "structuredText",
    required: true,
  },
  {
    key: "richSummary",
    label: "Rich summary",
    type: "richtext",
    required: true,
  },
  { key: "settings", label: "Settings", type: "json", required: true },
  {
    key: "steps",
    label: "Steps",
    type: "repeater",
    required: true,
    fields: [
      { key: "label", label: "Label", type: "string", required: true },
      { key: "complete", label: "Complete", type: "boolean", required: true },
    ],
  },
  {
    key: "metadata",
    label: "Metadata",
    type: "object",
    required: true,
    fields: [
      { key: "ownerEmail", label: "Owner email", type: "string", required: true },
      { key: "priority", label: "Priority", type: "integer", required: true },
    ],
  },
  { key: "primaryLink", label: "Primary link", type: "link", required: true },
] satisfies FieldSchema[];

const navMenuFields = [
  {
    key: "location",
    label: "Location",
    type: "select",
    required: true,
    options: ["header", "footer", "mobile"],
    showInEntryList: true,
  },
  {
    key: "items",
    label: "Menu items",
    type: "repeater",
    required: true,
    fields: [
      {
        key: "label",
        label: "Label",
        type: "string",
        required: true,
      },
      {
        key: "link",
        label: "Link",
        type: "link",
        required: true,
      },
    ],
  },
] satisfies FieldSchema[];

function block(
  key: string,
  text: string,
  style: "normal" | "h2" | "h3" | "h4" | "blockquote" = "normal",
): StructuredTextDocument[number] {
  return {
    _type: "block",
    _key: `${key}-block`,
    style,
    markDefs: [],
    children: [
      {
        _type: "span",
        _key: `${key}-span`,
        text,
        marks: [],
      },
    ],
  };
}

async function resolveSeedActor(client: ReturnType<typeof createClient>): Promise<ActorRef> {
  const result = await client.execute({
    sql: `SELECT id, username, email
      FROM aria_users
      ORDER BY CASE WHEN username = 'admin' THEN 0 ELSE 1 END, created_at ASC
      LIMIT 1`,
    args: [],
  });
  const row = result.rows[0];
  if (!row) {
    return ActorRefSchema.parse({
      id: "system",
      username: "system",
    });
  }
  const parsed = UserActorRowSchema.parse(row);
  return ActorRefSchema.parse({
    id: parsed.id,
    username: parsed.username ?? undefined,
    email: parsed.email ?? undefined,
  });
}

function validateSeedCollection(collection: AriaCollection): AriaCollection {
  const schemaErrors = validateCollectionSchema(collection.schema);
  if (schemaErrors.length > 0) {
    throw new Error(schemaErrors.join("; "));
  }
  return AriaCollectionSchema.parse(collection);
}

async function upsertCollection(
  executor: CmsStorageExecutor,
  input: z.infer<typeof CreateCollectionRequestSchema>,
): Promise<AriaCollection> {
  const parsed = CreateCollectionRequestSchema.parse(input);
  const existing = await cmsGetCollection(executor, parsed.name);
  const timestamp = nowIso();
  if (!existing) {
    const id = generateId();
    const collection = validateSeedCollection({
      id,
      name: parsed.name,
      label: parsed.label,
      kind: parsed.kind,
      schema: {
        id,
        label: parsed.label,
        kind: parsed.kind,
        icon: parsed.icon,
        fields: parsed.fields,
        version: 1,
      },
      scope: parsed.scope ?? "global",
      urlPattern: parsed.urlPattern ?? null,
      templatePageId: parsed.templatePageId ?? null,
      listPageId: parsed.listPageId ?? null,
      supports: parsed.supports ?? [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return cmsSaveCollection(executor, collection);
  }

  const update = UpdateCollectionRequestSchema.parse({
    id: existing.id,
    patch: {
      label: parsed.label,
      kind: parsed.kind,
      icon: parsed.icon ?? null,
      fields: parsed.fields,
      urlPattern: parsed.urlPattern ?? null,
      templatePageId: parsed.templatePageId ?? null,
      listPageId: parsed.listPageId ?? null,
      supports: parsed.supports ?? [],
      scope: parsed.scope ?? "global",
    },
    expectedUpdatedAt: existing.updatedAt,
  });
  const collection = validateSeedCollection({
    ...existing,
    label: update.patch.label ?? existing.label,
    kind: update.patch.kind ?? existing.kind,
    schema: {
      ...existing.schema,
      label: update.patch.label ?? existing.schema.label,
      kind: update.patch.kind ?? existing.schema.kind,
      icon:
        update.patch.icon === null
          ? undefined
          : (update.patch.icon ?? existing.schema.icon),
      fields: update.patch.fields ?? existing.schema.fields,
      version: update.patch.fields
        ? existing.schema.version + 1
        : existing.schema.version,
    },
    scope: update.patch.scope ?? existing.scope,
    urlPattern:
      update.patch.urlPattern !== undefined
        ? update.patch.urlPattern
        : existing.urlPattern,
    templatePageId:
      update.patch.templatePageId !== undefined
        ? update.patch.templatePageId
        : existing.templatePageId,
    listPageId:
      update.patch.listPageId !== undefined
        ? update.patch.listPageId
        : existing.listPageId,
    supports: update.patch.supports ?? existing.supports,
    updatedAt: timestamp,
  });
  return cmsSaveCollection(executor, collection);
}

function validateSeedFrontmatter(
  collection: AriaCollection,
  frontmatter: Record<string, unknown>,
): void {
  const validation = validateEntryFrontmatter(
    collectionSchemaForEntryFrontmatter(collection),
    frontmatter,
  );
  if (validation.success) {
    return;
  }

  throw new Error(validation.errors.join("; "));
}

function buildSnapshot(record: AriaEntryRecord): AriaEntrySnapshot {
  return {
    entry: { ...record.entry },
    locales: record.locales.map((locale) => ({ ...locale })),
    relations: record.relations?.map((relation) => ({ ...relation })),
  };
}

async function saveSeedRevision(
  executor: CmsStorageExecutor,
  record: AriaEntryRecord,
  actor: ActorRef,
  message: string,
): Promise<AriaEntryRevision> {
  const actorDisplay = cmsActorFromAuthorship(actor);
  const revision = AriaEntryRevisionSchema.parse({
    id: generateId(),
    entryId: record.entry.id,
    locale: record.locales.find((locale) => locale.isSource)?.locale ?? null,
    version: record.entry.version,
    snapshot: buildSnapshot(record),
    actorId: actorDisplay.id,
    message,
    createdAt: nowIso(),
    authorship: {
      actor: actorDisplay,
    },
  });
  return cmsSaveEntryRevision(executor, revision);
}

async function publishSeedEntry(
  executor: CmsStorageExecutor,
  record: AriaEntryRecord,
  actor: ActorRef,
): Promise<AriaEntryRecord> {
  const actorDisplay = cmsActorFromAuthorship(actor);
  const timestamp = nowIso();
  const nextRecord = AriaEntryRecordSchema.parse({
    ...record,
    entry: {
      ...record.entry,
      status: "published",
      version: nextVersion(),
      authorId: actorDisplay.id,
      updatedAt: timestamp,
      publishedAt: record.entry.publishedAt ?? timestamp,
      scheduledFor: null,
    },
    authorship: {
      author: actorDisplay,
      createdBy: record.authorship?.createdBy ?? record.authorship?.author,
      updatedBy: actorDisplay,
      publishedBy: actorDisplay,
    },
  });
  await saveSeedRevision(executor, record, actor, "Before published");
  return cmsSaveEntry(executor, nextRecord, {
    expectedVersion: record.entry.version,
    relations: record.relations,
  });
}

async function upsertPublishedEntry(
  executor: CmsStorageExecutor,
  collection: AriaCollection,
  input: SeedEntryInput,
  actor: ActorRef,
): Promise<AriaEntryRecord> {
  validateSeedFrontmatter(collection, input.frontmatter);
  const actorDisplay = cmsActorFromAuthorship(actor);
  const timestamp = nowIso();
  let saved: AriaEntryRecord;
  const existing = await cmsGetEntry(executor, {
    collectionId: collection.id,
    idOrSlug: input.slug,
    locale: DEFAULT_LOCALE,
    includeRelations: true,
  });

  if (existing) {
    const relations = input.relations?.map((relation) => ({
      ...relation,
      sourceEntryId: existing.entry.id,
    })) ?? existing.relations;
    const nextRecord = AriaEntryRecordSchema.parse({
      ...existing,
      entry: {
        ...existing.entry,
        version: nextVersion(),
        authorId: actorDisplay.id,
        updatedAt: timestamp,
      },
      locales: [
        {
          entryId: existing.entry.id,
          collectionId: collection.id,
          locale: DEFAULT_LOCALE,
          slug: input.slug,
          title: input.title,
          frontmatter: input.frontmatter,
          body: input.body,
          isSource: true,
        },
      ],
      authorship: {
        author: actorDisplay,
        createdBy: existing.authorship?.createdBy ?? existing.authorship?.author,
        updatedBy: actorDisplay,
        publishedBy: existing.authorship?.publishedBy ?? null,
      },
      relations,
    });
    await saveSeedRevision(executor, existing, actor, "Before seed update");
    saved = await cmsSaveEntry(executor, nextRecord, {
      expectedVersion: existing.entry.version,
      relations,
    });
  } else {
    const entryId = generateId();
    const relations = input.relations?.map((relation) => ({
      ...relation,
      sourceEntryId: entryId,
    }));
    const draftRecord = AriaEntryRecordSchema.parse({
      entry: {
        id: entryId,
        collectionId: collection.id,
        status: "draft",
        version: nextVersion(),
        authorId: actorDisplay.id,
        createdAt: timestamp,
        updatedAt: timestamp,
        publishedAt: null,
        scheduledFor: null,
      },
      locales: [
        {
          entryId,
          collectionId: collection.id,
          locale: DEFAULT_LOCALE,
          slug: input.slug,
          title: input.title,
          frontmatter: input.frontmatter,
          body: input.body,
          isSource: true,
        },
      ],
      authorship: {
        author: actorDisplay,
        createdBy: actorDisplay,
        updatedBy: actorDisplay,
        publishedBy: null,
      },
      relations,
    });
    saved = await cmsSaveEntry(executor, draftRecord, { relations });
    await saveSeedRevision(executor, saved, actor, "Created entry");
  }

  const parsed = AriaEntryRecordSchema.parse(saved);
  if (parsed.entry.status === "published" && parsed.entry.publishedAt) {
    return parsed;
  }

  return publishSeedEntry(executor, parsed, actor);
}

const tagEntries: SeedEntryInput[] = [
  {
    slug: "cms",
    title: "CMS",
    frontmatter: {
      description: "Content modeling, editorial workflows, and publishing UX.",
      color: "#7c3aed",
      icon: "i-lucide:database",
    },
    body: null,
  },
  {
    slug: "design",
    title: "Design",
    frontmatter: {
      description: "Layout systems, visual craft, and interface decisions.",
      color: "#0ea5e9",
      icon: "i-lucide:palette",
    },
    body: null,
  },
  {
    slug: "builder",
    title: "Builder",
    frontmatter: {
      description: "Visual builder features, bindings, and page composition.",
      color: "#22c55e",
      icon: "i-lucide:mouse-pointer-click",
    },
    body: null,
  },
  {
    slug: "workflow",
    title: "Workflow",
    frontmatter: {
      description: "Processes that help teams move from draft to shipped.",
      color: "#f97316",
      icon: "i-lucide:list-checks",
    },
    body: null,
  },
  {
    slug: "release",
    title: "Release",
    frontmatter: {
      description: "Launch notes, improvements, and product announcements.",
      color: "#14b8a6",
      icon: "i-lucide:rocket",
    },
    body: null,
  },
];

const authorEntries: SeedEntryInput[] = [
  {
    slug: "andy",
    title: "Andy",
    frontmatter: {
      role: "Founder",
      bio: "Builds Aria, designs the editor, and stress-tests CMS workflows with real content.",
      avatar: {
        mediaId: "seed-author-andy-avatar",
        alt: "Andy avatar",
        caption: "Seeded demo media reference",
      },
      website: {
        type: "external",
        url: "https://ariabuilder.io",
        label: "Aria Builder",
      },
      social: {
        x: "@ariabuilder",
        github: "ariabuilder",
      },
    },
    body: null,
  },
  {
    slug: "mira",
    title: "Mira Chen",
    frontmatter: {
      role: "Content Strategist",
      bio: "Shapes editorial systems, taxonomy, and reusable content models.",
      avatar: {
        mediaId: "seed-author-mira-avatar",
        alt: "Mira Chen avatar",
        caption: "Seeded demo media reference",
      },
      website: {
        type: "external",
        url: "https://example.com/mira",
        label: "Mira's site",
      },
      social: {
        x: "@mira",
        github: "mirachen",
      },
    },
    body: null,
  },
];

function relationTargets(
  fieldKey: string,
  targetIds: readonly string[],
): SeedEntryInput["relations"] {
  return targetIds.map((targetEntryId, position) => ({
    fieldKey,
    targetEntryId,
    position,
  }));
}

function buildBlogEntries(input: {
  authorBySlug: Record<string, AriaEntryRecord>;
  tagBySlug: Record<string, AriaEntryRecord>;
}): SeedEntryInput[] {
  const tagIds = (...slugs: string[]) =>
    slugs.map((slug) => input.tagBySlug[slug]?.entry.id).filter(Boolean);

  return [
    {
      slug: "designing-with-real-content",
      title: "Designing With Real Content",
      frontmatter: {
        excerpt:
          "A practical look at why CMS-driven builder work should start with believable content instead of lorem ipsum.",
        author: input.authorBySlug.andy.entry.id,
        category: "Design",
        publishedDate: "2026-06-26",
        featured: true,
        seoTitle: "Designing With Real Content",
        seoDescription:
          "Use realistic CMS content to test spacing, rhythm, bindings, and editorial workflows inside Aria.",
      },
      relations: relationTargets("tags", tagIds("cms", "design", "builder")),
      body: [
        block(
          "designing-intro",
          "Real content exposes the edges that placeholder text politely hides.",
        ),
        block(
          "designing-flow",
          "When titles wrap, excerpts get opinionated, and images need captions, the builder starts telling the truth about the interface.",
        ),
        block(
          "designing-checklist-title",
          "What this article is good for testing",
          "h2",
        ),
        block(
          "designing-checklist",
          "Bind the title, excerpt, category, relational tags, published date, and body into a collection template or repeated card layout.",
        ),
      ],
    },
    {
      slug: "shipping-a-calmer-cms",
      title: "Shipping a Calmer CMS",
      frontmatter: {
        excerpt:
          "The CMS should feel focused, sturdy, and quiet enough that editors can move quickly without second guessing the model.",
        author: input.authorBySlug.andy.entry.id,
        category: "Product",
        publishedDate: "2026-06-26",
        featured: false,
        seoTitle: "Shipping a Calmer CMS",
        seoDescription:
          "A seeded article for validating editorial states, metadata, and CMS list rendering.",
      },
      relations: relationTargets("tags", tagIds("cms", "workflow", "release")),
      body: [
        block(
          "calmer-intro",
          "A good editing surface does not need to shout. It needs to make the next move obvious.",
        ),
        block(
          "calmer-meta",
          "Publishing metadata, revisions, and field controls should sit close to the work without stealing the page.",
        ),
        block(
          "calmer-templates",
          "This entry is useful for checking list sorting, status badges, and detail template routing.",
        ),
      ],
    },
    {
      slug: "binding-fields-in-the-builder",
      title: "Binding Fields in the Builder",
      frontmatter: {
        excerpt:
          "A test article for wiring CMS fields into builder props through the inspector panel.",
        author: input.authorBySlug.mira.entry.id,
        category: "Engineering",
        publishedDate: "2026-06-26",
        featured: true,
        seoTitle: "Binding Fields in the Builder",
        seoDescription:
          "Test CMS field bindings in Aria's inspector props tab with structured article data.",
      },
      relations: relationTargets("tags", tagIds("cms", "builder", "workflow")),
      body: [
        block(
          "bindings-intro",
          "The builder should let a selected element bind directly to the content model it is meant to display.",
        ),
        block(
          "bindings-props",
          "Start with text props, then expand toward image, link, boolean, relation, and repeated list bindings as the model hardens.",
        ),
        block(
          "bindings-next",
          "This entry is intentionally simple so it is easy to spot binding mistakes in rendered output.",
        ),
      ],
    },
  ];
}

const navMenuEntry: SeedEntryInput = {
  slug: "main-nav",
  title: "Main Navigation",
  frontmatter: {
    location: "header",
    items: [
      {
        label: "Home",
        link: { type: "page", url: "/", slug: "index", label: "Home" },
      },
      {
        label: "Blog",
        link: { type: "page", url: "/blog", slug: "blog", label: "Blog" },
      },
      {
        label: "About",
        link: { type: "page", url: "/about", slug: "about", label: "About" },
      },
      {
        label: "Contact",
        link: { type: "page", url: "/contact", slug: "contact", label: "Contact" },
      },
    ],
  },
  body: null,
};

const announcementEntries: SeedEntryInput[] = [
  {
    slug: "summer-launch-window",
    title: "Summer Launch Window",
    frontmatter: {
      summary: "The new CMS field binding workflow is rolling out to beta projects.",
      severity: "info",
      startsAt: "2026-07-01T09:00:00.000Z",
      endsAt: "2026-07-15T18:00:00.000Z",
      pinned: true,
      cta: {
        type: "internal",
        url: "/admin/design",
        label: "Review design system",
      },
    },
    body: null,
  },
  {
    slug: "maintenance-complete",
    title: "Maintenance Complete",
    frontmatter: {
      summary: "Storage maintenance finished successfully and editor latency is back to normal.",
      severity: "success",
      startsAt: "2026-07-02T12:30:00.000Z",
      pinned: false,
      cta: {
        type: "external",
        url: "https://status.ariabuilder.io",
        label: "View status",
      },
    },
    body: null,
  },
];

function buildProductEntries(authorBySlug: Record<string, AriaEntryRecord>): SeedEntryInput[] {
  return [
    {
      slug: "aria-starter-kit",
      title: "Aria Starter Kit",
      frontmatter: {
        sku: "ARIA-SK-001",
        price: 149,
        inventory: 24,
        productStatus: "active",
        featured: true,
        owner: authorBySlug.mira.entry.id,
        gallery: [
          {
            image: {
              mediaId: "seed-product-starter-kit-hero",
              alt: "Starter kit dashboard preview",
              caption: "Seeded demo media reference",
            },
            caption: "Dashboard layout with CMS-bound cards.",
          },
          {
            image: {
              mediaId: "seed-product-starter-kit-detail",
              alt: "Starter kit detail page",
            },
            caption: "Detail page with related entries.",
          },
        ],
        specs: {
          templates: 8,
          includesCmsModels: true,
          theme: "minimal editorial",
        },
      },
      body: null,
    },
    {
      slug: "editorial-block-pack",
      title: "Editorial Block Pack",
      frontmatter: {
        sku: "ARIA-BP-014",
        price: 79,
        inventory: 58,
        productStatus: "active",
        featured: false,
        owner: authorBySlug.andy.entry.id,
        gallery: [
          {
            image: {
              mediaId: "seed-product-editorial-pack",
              alt: "Editorial block pack preview",
            },
            caption: "Long-form article sections and pull quotes.",
          },
        ],
        specs: {
          blocks: 14,
          supportsDarkMode: true,
          recommendedFor: ["blog", "case-study", "documentation"],
        },
      },
      body: null,
    },
  ];
}

function buildTestimonialEntries(input: {
  productBySlug: Record<string, AriaEntryRecord>;
}): SeedEntryInput[] {
  return [
    {
      slug: "morgan-starter-kit",
      title: "Morgan on the Starter Kit",
      frontmatter: {
        quote:
          "We bound CMS data into a polished launch page in one afternoon. The relational fields made the template feel real immediately.",
        rating: 5,
        customer: {
          name: "Morgan Lee",
          role: "Creative Director",
          company: "Northstar Studio",
        },
        product: input.productBySlug["aria-starter-kit"].entry.id,
        featured: true,
      },
      body: null,
    },
    {
      slug: "sam-editorial-pack",
      title: "Sam on Editorial Blocks",
      frontmatter: {
        quote:
          "The blocks handled real article lengths, quotes, metadata, and related content without custom code.",
        rating: 4,
        customer: {
          name: "Sam Rivera",
          role: "Engineering Lead",
          company: "Papertrail",
        },
        product: input.productBySlug["editorial-block-pack"].entry.id,
        featured: false,
      },
      body: null,
    },
  ];
}

function buildFieldShowcaseEntry(input: {
  authorBySlug: Record<string, AriaEntryRecord>;
  tagBySlug: Record<string, AriaEntryRecord>;
}): SeedEntryInput {
  return {
    slug: "all-fields-reference",
    title: "All Fields Reference",
    frontmatter: {
      shortText: "A compact text value",
      longText:
        "This entry intentionally exercises every CMS field type so demos can show validation, inspector bindings, and editor widgets in one place.",
      customSlug: "all-fields-reference",
      score: 98.7,
      quantity: 12,
      enabled: true,
      launchDate: "2026-07-01",
      launchAt: "2026-07-01T14:00:00.000Z",
      launchStatus: "live",
      channels: ["web", "email", "in-app"],
      icon: "i-lucide:wand-sparkles",
      heroImage: {
        mediaId: "seed-showcase-hero",
        alt: "Field showcase hero image",
        caption: "Seeded demo media reference",
      },
      download: {
        mediaId: "seed-showcase-download",
        label: "Download field guide",
      },
      owner: input.authorBySlug.andy.entry.id,
      structuredNotes: [
        {
          type: "paragraph",
          text: "Structured notes demonstrate editor-friendly block content.",
        },
      ],
      richSummary: [
        {
          type: "paragraph",
          text: "Rich summary content can be bound to rich text renderers.",
        },
      ],
      settings: {
        cache: true,
        variant: "demo",
        flags: ["seeded", "showcase"],
      },
      steps: [
        { label: "Create fields", complete: true },
        { label: "Bind fields", complete: true },
        { label: "Publish demo", complete: true },
      ],
      metadata: {
        ownerEmail: "admin@example.com",
        priority: 1,
      },
      primaryLink: {
        type: "external",
        url: "https://ariabuilder.io/docs/cms",
        label: "CMS docs",
        openInNewTab: true,
      },
    },
    relations: relationTargets("relatedTags", [
      input.tagBySlug.cms.entry.id,
      input.tagBySlug.builder.entry.id,
      input.tagBySlug.workflow.entry.id,
    ]),
    body: null,
  };
}

function indexEntriesBySlug(
  entries: readonly AriaEntryRecord[],
): Record<string, AriaEntryRecord> {
  return Object.fromEntries(
    entries.flatMap((entry) => {
      const slug = entry.locales.find((locale) => locale.isSource)?.slug;
      return slug ? [[slug, entry]] : [];
    }),
  );
}

function withResolvedTargetCollections(
  fields: readonly FieldSchema[],
  collectionIdByName: Record<string, string>,
): FieldSchema[] {
  return fields.map((field) => ({
    ...field,
    targetCollection:
      field.targetCollection && collectionIdByName[field.targetCollection]
        ? collectionIdByName[field.targetCollection]
        : field.targetCollection,
    fields: field.fields
      ? withResolvedTargetCollections(field.fields, collectionIdByName)
      : undefined,
  }));
}

function summarizeCollection(
  collection: AriaCollection,
  entries: readonly AriaEntryRecord[],
) {
  return {
    name: collection.name,
    id: collection.id,
    kind: collection.kind,
    entries: entries.map((entry) => ({
      id: entry.entry.id,
      slug: entry.locales[0]?.slug,
      status: entry.entry.status,
      relationCount: entry.relations?.length ?? 0,
    })),
  };
}

async function main(): Promise<void> {
  const client = createClient({ url: `file:${DB_PATH}` });
  try {
    await client.execute("PRAGMA busy_timeout = 5000");
    const executor = createExecutor(client);
    await ensureCmsAuthorshipSchema(executor);
    await cmsListCollections(executor);

    const actor = await resolveSeedActor(client);

    const tags = await upsertCollection(executor, {
      name: "tags",
      label: "Tags",
      kind: "tags",
      icon: "i-lucide:tags",
      fields: tagFields,
      supports: ["revisions", "search"],
      scope: "global",
    });

    const authors = await upsertCollection(executor, {
      name: "authors",
      label: "Authors",
      kind: "data",
      icon: "i-lucide:users",
      fields: authorFields,
      supports: ["cover", "revisions", "search"],
      scope: "global",
    });

    const collectionIdByName: Record<string, string> = {
      tags: tags.id,
      authors: authors.id,
    };

    const blog = await upsertCollection(executor, {
      name: "blog",
      label: "Blog",
      kind: "content",
      icon: "i-lucide:newspaper",
      fields: withResolvedTargetCollections(blogFields, collectionIdByName),
      urlPattern: "/blog/{slug}",
      supports: [
        "body",
        "cover",
        "drafts",
        "revisions",
        "scheduling",
        "search",
        "seo",
      ],
      scope: "global",
    });

    const announcements = await upsertCollection(executor, {
      name: "announcements",
      label: "Announcements",
      kind: "content",
      icon: "i-lucide:megaphone",
      fields: announcementFields,
      urlPattern: "/announcements/{slug}",
      supports: ["drafts", "revisions", "scheduling", "search"],
      scope: "global",
    });

    const products = await upsertCollection(executor, {
      name: "products",
      label: "Products",
      kind: "data",
      icon: "i-lucide:package",
      fields: withResolvedTargetCollections(productFields, collectionIdByName),
      supports: ["cover", "revisions", "search"],
      scope: "global",
    });

    collectionIdByName.products = products.id;

    const testimonials = await upsertCollection(executor, {
      name: "testimonials",
      label: "Testimonials",
      kind: "content",
      icon: "i-lucide:quote",
      fields: withResolvedTargetCollections(
        testimonialFields,
        collectionIdByName,
      ),
      supports: ["revisions", "search"],
      scope: "global",
    });

    const mainNav = await upsertCollection(executor, {
      name: "main-nav",
      label: "Main Navigation",
      kind: "config",
      icon: "i-lucide:menu",
      fields: navMenuFields,
      supports: ["revisions"],
      scope: "global",
    });

    const fieldShowcase = await upsertCollection(executor, {
      name: "field-showcase",
      label: "Field Showcase",
      kind: "data",
      icon: "i-lucide:clipboard-check",
      fields: withResolvedTargetCollections(
        fieldShowcaseFields,
        collectionIdByName,
      ),
      supports: ["revisions", "search"],
      scope: "global",
    });

    const seededTags = await Promise.all(
      tagEntries.map((entry) => upsertPublishedEntry(executor, tags, entry, actor)),
    );
    const tagBySlug = indexEntriesBySlug(seededTags);

    const seededAuthors = await Promise.all(
      authorEntries.map((entry) =>
        upsertPublishedEntry(executor, authors, entry, actor),
      ),
    );
    const authorBySlug = indexEntriesBySlug(seededAuthors);

    const seededBlogEntries = await Promise.all(
      buildBlogEntries({ authorBySlug, tagBySlug }).map((entry) =>
        upsertPublishedEntry(executor, blog, entry, actor),
      ),
    );

    const seededAnnouncements = await Promise.all(
      announcementEntries.map((entry) =>
        upsertPublishedEntry(executor, announcements, entry, actor),
      ),
    );

    const seededProducts = await Promise.all(
      buildProductEntries(authorBySlug).map((entry) =>
        upsertPublishedEntry(executor, products, entry, actor),
      ),
    );
    const productBySlug = indexEntriesBySlug(seededProducts);

    const seededTestimonials = await Promise.all(
      buildTestimonialEntries({ productBySlug }).map((entry) =>
        upsertPublishedEntry(executor, testimonials, entry, actor),
      ),
    );

    const seededNavEntry = await upsertPublishedEntry(
      executor,
      mainNav,
      navMenuEntry,
      actor,
    );

    const seededFieldShowcase = await upsertPublishedEntry(
      executor,
      fieldShowcase,
      buildFieldShowcaseEntry({ authorBySlug, tagBySlug }),
      actor,
    );

    console.log(
      JSON.stringify(
        {
          actor: {
            id: actor.id,
            username: actor.username ?? null,
            email: actor.email ?? null,
          },
          collections: [
            summarizeCollection(tags, seededTags),
            summarizeCollection(authors, seededAuthors),
            summarizeCollection(blog, seededBlogEntries),
            summarizeCollection(announcements, seededAnnouncements),
            summarizeCollection(products, seededProducts),
            summarizeCollection(testimonials, seededTestimonials),
            summarizeCollection(mainNav, [seededNavEntry]),
            summarizeCollection(fieldShowcase, [seededFieldShowcase]),
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    client.close();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
