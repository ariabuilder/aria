/**
 * Shared starter content for new Aria installs. This is the single source of truth
 * for what a fresh local (SQLite) or remote (D1) install gets seeded with.
 */

import type { AriaCollection } from "../cms/schemas";
import { AriaCollectionSchema } from "../cms/schemas";
import type { CollectionKind, CollectionSupport } from "../cms/constants";
import type { FieldSchema } from "../cms/fieldSchema";
import { createEmptyCollectionSchema } from "../cms/storage/db";
import { getDefaultTemplate, expandTemplateToPalettes } from "../design/palettes";
import type { DesignSystemColors } from "../design/types";
import {
  applyDesignSystemColorsToUniversalDesignSystem,
  createDefaultUniversalDesignSystem,
  type UniversalDesignSystem,
} from "../styles/universalDesignSystem";
import { validatePageDSL } from "../schemas/nodes";
import type { PageDSL, BuilderNode } from "../types/nodes";
import type { SiteSettings } from "./adapter";
import { DEFAULT_CONTENT_LOCALIZATION } from "../localization/contentLocale";
import { buildProjectSystemMetadata } from "../system/metadata";

// Starter layouts (`aria/lib/storage/starterLayouts.ts`) and the home page
// (`aria/lib/storage/starterPages.ts`) already have their own loader modules;
// import those directly alongside this module rather than re-exporting them
// here, to keep a single canonical import path for each.

export const NOT_FOUND_PAGE_ID = "not-found";
export const BLOG_LIST_PAGE_ID = "blog";
export const BLOG_ENTRY_TEMPLATE_PAGE_ID = "blog-post";
export const TAG_ARCHIVE_PAGE_ID = "tag-archive";

function finalizePageDsl(input: PageDSL): PageDSL {
  const validation = validatePageDSL(input);
  if (!validation.success) {
    throw new Error(
      `Invalid starter page ${input.id}: ${validation.error.message}`,
    );
  }
  return validation.data as PageDSL;
}

/** Placeholder 404 page — deliberately undesigned; a real design comes later. */
export function buildNotFoundPage(): PageDSL {
  return finalizePageDsl({
    id: NOT_FOUND_PAGE_ID,
    slug: "not-found",
    title: "Page Not Found",
    status: "published",
    systemRole: "not-found",
    accessMode: "public",
    nodes: [
      {
        id: "not-found-heading",
        type: "heading",
        props: { text: "Page Not Found" },
        styles: {},
        children: [],
      } as BuilderNode,
      {
        id: "not-found-body",
        type: "text",
        props: { content: "The page you're looking for doesn't exist." },
        styles: {},
        children: [],
      } as BuilderNode,
    ],
  });
}

function bindSingle(collection: string, prop: string, field: string): BuilderNode["dataSource"] {
  return {
    type: "collection",
    collection,
    mode: "single",
    bindings: { [prop]: `${collection}.${field}` },
  };
}

function buildBlogListCard(): BuilderNode {
  return {
    id: "blog-list-card",
    type: "container",
    props: {},
    styles: {},
    children: [
      {
        id: "blog-list-card-title",
        type: "heading",
        props: { text: "Untitled post" },
        styles: {},
        children: [],
        dataSource: bindSingle(BLOG_COLLECTION_NAME, "text", "title"),
      } as BuilderNode,
      {
        id: "blog-list-card-excerpt",
        type: "text",
        props: { content: "" },
        metadata: { label: "Post excerpt" },
        styles: {},
        children: [],
        dataSource: bindSingle(BLOG_COLLECTION_NAME, "content", "excerpt"),
      } as BuilderNode,
      {
        id: "blog-list-card-date",
        type: "text",
        props: { content: "" },
        metadata: { label: "Published date" },
        styles: {},
        children: [],
        dataSource: bindSingle(BLOG_COLLECTION_NAME, "content", "publishedDate"),
      } as BuilderNode,
    ],
  } as BuilderNode;
}

/**
 * Functional (undesigned) blog list page. Assigned as the `blog` collection's
 * `listPageId` and given `system_role: 'cms-collection'` at seed time.
 */
export function buildBlogListPage(): PageDSL {
  return finalizePageDsl({
    id: BLOG_LIST_PAGE_ID,
    slug: "blog",
    title: "Blog",
    status: "published",
    systemRole: "cms-collection",
    nodes: [
      {
        id: "blog-list-heading",
        type: "heading",
        props: { text: "Blog" },
        styles: {},
        children: [],
      } as BuilderNode,
      {
        id: "blog-list",
        type: "container",
        props: {},
        styles: {},
        children: [buildBlogListCard()],
        dataSource: {
          type: "collection",
          collection: BLOG_COLLECTION_NAME,
          mode: "list",
          sort: "-publishedAt",
          limit: 20,
          onError: "show-fallback",
          fallback: "No posts yet.",
        },
      } as BuilderNode,
    ],
  });
}

/**
 * Functional (undesigned) blog entry template. Assigned as the
 * `blog` collection's `templatePageId` and given `system_role: 'cms-entry'` at.
 */
export function buildBlogEntryTemplatePage(): PageDSL {
  return finalizePageDsl({
    id: BLOG_ENTRY_TEMPLATE_PAGE_ID,
    slug: "blog-post",
    title: "Blog Post",
    status: "published",
    systemRole: "cms-entry",
    accessMode: "public",
    nodes: [
      {
        id: "blog-entry-title",
        type: "heading",
        props: { text: "Untitled post" },
        styles: {},
        children: [],
        dataSource: bindSingle(BLOG_COLLECTION_NAME, "text", "title"),
      } as BuilderNode,
      {
        id: "blog-entry-date",
        type: "text",
        props: { content: "" },
        metadata: { label: "Published date" },
        styles: {},
        children: [],
        dataSource: bindSingle(BLOG_COLLECTION_NAME, "content", "publishedDate"),
      } as BuilderNode,
      {
        id: "blog-entry-body",
        type: "container",
        props: { content: "" },
        metadata: { label: "Post body" },
        styles: {},
        children: [],
        dataSource: bindSingle(BLOG_COLLECTION_NAME, "content", "body"),
      } as BuilderNode,
    ],
  });
}

/**
 * Functional tag archive template. Assigned as the `tags` collection's
 * `templatePageId` with `urlPattern: /tags/{slug}`.
 */
export function buildTagArchiveTemplatePage(): PageDSL {
  return finalizePageDsl({
    id: TAG_ARCHIVE_PAGE_ID,
    slug: "tag-archive",
    title: "Tag Archive",
    status: "published",
    systemRole: "cms-entry",
    accessMode: "public",
    nodes: [
      {
        id: "tag-archive-heading",
        type: "heading",
        props: { text: "Tag" },
        styles: {},
        children: [],
        dataSource: bindSingle(TAGS_COLLECTION_NAME, "text", "title"),
      } as BuilderNode,
      {
        id: "tag-archive-description",
        type: "text",
        props: { content: "" },
        metadata: { label: "Tag description" },
        styles: {},
        children: [],
        dataSource: bindSingle(TAGS_COLLECTION_NAME, "content", "description"),
      } as BuilderNode,
      {
        id: "tag-archive-list",
        type: "container",
        props: {},
        styles: {},
        children: [buildBlogListCard()],
        dataSource: {
          type: "collection",
          collection: BLOG_COLLECTION_NAME,
          mode: "list",
          sort: "-publishedAt",
          limit: 20,
          filter: {
            relationIncludes: {
              field: "tags",
              entryId: "$entryContext.id",
            },
          },
          onError: "show-fallback",
          fallback: "No posts for this tag yet.",
        },
      } as BuilderNode,
      {
        id: "tag-archive-pagination",
        type: "Pagination",
        props: {
          style: "numbers",
          maxPageButtons: 5,
          pageParam: "page",
          labels: {
            prev: "Previous",
            next: "Next",
          },
        },
        styles: {},
        children: [],
        dataSource: {
          type: "pagination",
          targetNodeId: "tag-archive-list",
        },
      } as BuilderNode,
    ],
  });
}

export const BLOG_COLLECTION_NAME = "blog";
export const AUTHORS_COLLECTION_NAME = "authors";
export const TAGS_COLLECTION_NAME = "tags";

/** Field schema extracted from `aria/scripts/seed-cms-demo-content.ts` (schema only, no demo entries). */
export const tagFields: FieldSchema[] = [
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
];

export const authorFields: FieldSchema[] = [
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
      { key: "x", label: "X", type: "string" },
      { key: "github", label: "GitHub", type: "string" },
    ],
  },
];

export const blogFields: FieldSchema[] = [
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
    targetCollection: AUTHORS_COLLECTION_NAME,
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
    targetCollection: TAGS_COLLECTION_NAME,
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
];

/** Resolves `targetCollection` names (e.g. `"authors"`) to real collection ids once they're known. */
export function withResolvedTargetCollections(
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

export interface StarterCollectionDefinition {
  /**
   * /** Deterministic id (equal to `name`) rather than a
   * randomly generated one. This keeps re-seeding idempotent (`INSERT..
   */
  id: string;
  name: string;
  label: string;
  kind: CollectionKind;
  icon: string;
  fields: FieldSchema[];
  supports: CollectionSupport[];
  urlPattern: string | null;
  templatePageId: string | null;
  listPageId: string | null;
}

/**
 * Builds the three starter collection definitions (schema only — no
 * demo entries). `authors`/`tags` exist because `blog` references them via.
 */
export function buildStarterCollectionDefinitions(input: {
  collectionIdByName: Record<string, string>;
}): {
  tags: StarterCollectionDefinition;
  authors: StarterCollectionDefinition;
  blog: StarterCollectionDefinition;
} {
  return {
    tags: {
      id: TAGS_COLLECTION_NAME,
      name: TAGS_COLLECTION_NAME,
      label: "Tags",
      kind: "tags",
      icon: "i-lucide:tags",
      fields: tagFields,
      supports: ["revisions", "search"],
      urlPattern: "/tags/{slug}",
      templatePageId: TAG_ARCHIVE_PAGE_ID,
      listPageId: null,
    },
    authors: {
      id: AUTHORS_COLLECTION_NAME,
      name: AUTHORS_COLLECTION_NAME,
      label: "Authors",
      kind: "data",
      icon: "i-lucide:users",
      fields: authorFields,
      supports: ["cover", "revisions", "search"],
      urlPattern: null,
      templatePageId: null,
      listPageId: null,
    },
    blog: {
      id: BLOG_COLLECTION_NAME,
      name: BLOG_COLLECTION_NAME,
      label: "Blog",
      kind: "content",
      icon: "i-lucide:newspaper",
      fields: withResolvedTargetCollections(blogFields, input.collectionIdByName),
      supports: ["body", "cover", "drafts", "revisions", "scheduling", "search", "seo"],
      urlPattern: "/blog/{slug}",
      templatePageId: BLOG_ENTRY_TEMPLATE_PAGE_ID,
      listPageId: BLOG_LIST_PAGE_ID,
    },
  };
}

/** Builds a fully-parsed `AriaCollection` ready to persist, using the definition's deterministic id. */
export function buildAriaCollection(
  definition: StarterCollectionDefinition,
  now: string,
): AriaCollection {
  const id = definition.id;
  return AriaCollectionSchema.parse({
    id,
    name: definition.name,
    label: definition.label,
    kind: definition.kind,
    schema: {
      ...createEmptyCollectionSchema(id, definition.label, definition.kind, definition.icon),
      fields: definition.fields,
    },
    scope: "global",
    urlPattern: definition.urlPattern,
    templatePageId: definition.templatePageId,
    listPageId: definition.listPageId,
    supports: definition.supports,
    createdAt: now,
    updatedAt: now,
  });
}

// DESIGN SYSTEM — a single template color palette, nothing else

/**
 * Empty design system (no fonts, no utilities enabled, no semantic
 * classes, no components) with only `tokens. colors` populated from the.
 */
export function buildStarterDesignSystem(): UniversalDesignSystem {
  const template = getDefaultTemplate();
  const expanded = expandTemplateToPalettes(template);
  const colors: DesignSystemColors = {
    activeTemplateId: template.id,
    palettes: {
      primary: expanded.primary,
      secondary: expanded.secondary,
      muted: expanded.muted,
      neutral: expanded.neutral,
    },
    semantic: { ...template.semantic },
  };
  return applyDesignSystemColorsToUniversalDesignSystem(
    createDefaultUniversalDesignSystem(),
    colors,
  );
}

// SITE SETTINGS — icon packs and UnoCSS utilities start disabled. Everything
// else (including the deprecated `appearance` field) is intentionally left
// unset so it falls through to each subsystem's own defaults (e.g.
// `DEFAULT_APPEARANCE_SETTINGS`, which already matches the desired
// aria/system/Outfit/1.0 scale defaults).

export function buildStarterSiteSettings(): Pick<
  SiteSettings,
  "icons" | "localization" | "system" | "utilityEngine"
> {
  return {
    utilityEngine: "custom",
    icons: {
      enabledPacks: {
        lucide: false,
        "coreui-brands": false,
      },
    },
    localization: {
      content: DEFAULT_CONTENT_LOCALIZATION,
    },
    system: buildProjectSystemMetadata(),
  };
}
