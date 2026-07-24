/**
 * Starter CMS entries for fresh Aria installs (blog getting-started series).
 * Consumed by local SQLite init and remote D1 bootstrap.
 */

import type { StructuredTextDocument } from "../cms/structuredText/schemas";
import {
  cmsSaveCollection,
  cmsSaveEntry,
  type CmsStorageExecutor,
} from "../cms/storage";
import { AriaEntryRecordSchema, type AriaEntryRecord } from "../cms/schemas";
import {
  AUTHORS_COLLECTION_NAME,
  BLOG_COLLECTION_NAME,
  TAGS_COLLECTION_NAME,
  buildAriaCollection,
  buildStarterCollectionDefinitions,
} from "./starterContent";
import {
  MAIN_NAV_COLLECTION_NAME,
  seedStarterMainNavCollectionIfMissing,
} from "./starterMainNav";

export const STARTER_AUTHOR_ARIA_TEAM_ID = "starter-author-aria-team";
export const STARTER_AUTHOR_ARIA_TEAM_SLUG = "aria-team";

export const STARTER_TAG_GETTING_STARTED_ID = "starter-tag-getting-started";
export const STARTER_TAG_GETTING_STARTED_SLUG = "getting-started";
export const STARTER_TAG_COMPOSER_ID = "starter-tag-composer";
export const STARTER_TAG_COMPOSER_SLUG = "composer";
export const STARTER_TAG_CMS_ID = "starter-tag-cms";
export const STARTER_TAG_CMS_SLUG = "cms";
export const STARTER_TAG_AI_ENGINEER_ID = "starter-tag-ai-engineer";
export const STARTER_TAG_AI_ENGINEER_SLUG = "ai-engineer";

export const STARTER_BLOG_PAGES_COMPOSER_ID = "starter-blog-pages-composer";
export const STARTER_BLOG_PAGES_COMPOSER_SLUG = "pages-components-and-composer";
export const STARTER_BLOG_CMS_DYNAMIC_DATA_ID = "starter-blog-cms-dynamic-data";
export const STARTER_BLOG_CMS_DYNAMIC_DATA_SLUG = "cms-and-dynamic-data";
export const STARTER_BLOG_AI_ENGINEER_MCP_ID = "starter-blog-ai-engineer-mcp";
export const STARTER_BLOG_AI_ENGINEER_MCP_SLUG = "ai-engineer-and-mcp";

export const STARTER_MAIN_NAV_ID = "starter-main-nav";
export const STARTER_MAIN_NAV_SLUG = "main-nav";

const STARTER_LOCALE = "en";

type StarterTagDefinition = {
  id: string;
  slug: string;
  title: string;
  description: string;
  color: string;
  icon: string;
};

type StarterBlogDefinition = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: "Product" | "Design" | "Engineering" | "Company";
  featured: boolean;
  publishedDate: string;
  tagSlugs: readonly [string, string];
  body: StructuredTextDocument;
};

const STARTER_TAG_DEFINITIONS: readonly StarterTagDefinition[] = [
  {
    id: STARTER_TAG_GETTING_STARTED_ID,
    slug: STARTER_TAG_GETTING_STARTED_SLUG,
    title: "Getting Started",
    description: "Introductory guides for new Aria projects.",
    color: "#6366f1",
    icon: "i-lucide:sparkles",
  },
  {
    id: STARTER_TAG_COMPOSER_ID,
    slug: STARTER_TAG_COMPOSER_SLUG,
    title: "Composer",
    description: "Visual layout and design iteration in the builder.",
    color: "#0ea5e9",
    icon: "i-lucide:palette",
  },
  {
    id: STARTER_TAG_CMS_ID,
    slug: STARTER_TAG_CMS_SLUG,
    title: "CMS",
    description: "Collections, entries, and dynamic data bindings.",
    color: "#7c3aed",
    icon: "i-lucide:database",
  },
  {
    id: STARTER_TAG_AI_ENGINEER_ID,
    slug: STARTER_TAG_AI_ENGINEER_SLUG,
    title: "AI Engineer",
    description: "Agent-assisted building and MCP integrations.",
    color: "#22c55e",
    icon: "i-lucide:bot",
  },
];

function starterBlock(
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

function buildStarterBlogBody(
  sections: readonly { key: string; heading?: string; text: string }[],
): StructuredTextDocument {
  const blocks: StructuredTextDocument = [];
  for (const section of sections) {
    if (section.heading) {
      blocks.push(starterBlock(`${section.key}-heading`, section.heading, "h2"));
    }
    blocks.push(starterBlock(section.key, section.text));
  }
  return blocks;
}

const STARTER_BLOG_DEFINITIONS: readonly StarterBlogDefinition[] = [
  {
    id: STARTER_BLOG_PAGES_COMPOSER_ID,
    slug: STARTER_BLOG_PAGES_COMPOSER_SLUG,
    title: "Getting Started with Pages, Components, and Composer",
    excerpt:
      "How pages, reusable components, and Composer fit together in Aria's builder.",
    category: "Design",
    featured: true,
    publishedDate: "2026-07-01",
    tagSlugs: [STARTER_TAG_GETTING_STARTED_SLUG, STARTER_TAG_COMPOSER_SLUG],
    body: buildStarterBlogBody([
      {
        key: "pages-intro",
        text: "Aria organizes site content around pages — each page maps to a route, can use a layout, and moves through draft and published states like any CMS-backed site.",
      },
      {
        key: "components",
        heading: "Components",
        text: "Components are reusable building blocks. Drop them on a page once, then reuse the same structure across the site instead of rebuilding identical node trees by hand.",
      },
      {
        key: "composer",
        heading: "Composer",
        text: "Composer is where you iterate on layout and visual design. Stage editing handles structure and bindings; Composer is the faster loop for spacing, typography, and polish. See docs/concepts/composer-vs-stage.md for the full mental model.",
      },
    ]),
  },
  {
    id: STARTER_BLOG_CMS_DYNAMIC_DATA_ID,
    slug: STARTER_BLOG_CMS_DYNAMIC_DATA_SLUG,
    title: "CMS Collections and Dynamic Data",
    excerpt:
      "Collections, entry templates, and binding CMS fields to page content.",
    category: "Product",
    featured: false,
    publishedDate: "2026-07-02",
    tagSlugs: [STARTER_TAG_GETTING_STARTED_SLUG, STARTER_TAG_CMS_SLUG],
    body: buildStarterBlogBody([
      {
        key: "cms-intro",
        text: "Fresh Aria installs include blog, authors, and tags collections. Relations between them let you model real editorial structure instead of hard-coding content in page nodes.",
      },
      {
        key: "templates",
        heading: "List and entry templates",
        text: "The blog list page at /blog renders many entries. Each post uses an entry template at /blog/{slug}. Tag archive pages at /tags/{slug} filter posts by relational tags.",
      },
      {
        key: "bindings",
        heading: "Data bindings",
        text: "Bind title, excerpt, published date, and body fields directly on builder nodes. When content changes in the CMS, every bound surface updates without re-editing the page structure.",
      },
    ]),
  },
  {
    id: STARTER_BLOG_AI_ENGINEER_MCP_ID,
    slug: STARTER_BLOG_AI_ENGINEER_MCP_SLUG,
    title: "AI Engineer and MCP in Aria",
    excerpt:
      "Using AI Engineer and MCP to build and iterate on Aria sites with agent tooling.",
    category: "Engineering",
    featured: false,
    publishedDate: "2026-07-03",
    tagSlugs: [STARTER_TAG_GETTING_STARTED_SLUG, STARTER_TAG_AI_ENGINEER_SLUG],
    body: buildStarterBlogBody([
      {
        key: "ai-intro",
        text: "AI Engineer is Aria's agent-assisted building surface. It helps you move faster on pages, CMS content, and deployment tasks — it does not replace the visual builder.",
      },
      {
        key: "mcp",
        heading: "Model Context Protocol (MCP)",
        text: "MCP connects external tools to your project context. Agents can read structure, propose edits, and run workflows with the same primitives you use in the admin UI.",
      },
      {
        key: "start",
        heading: "Where to begin",
        text: "Open AI Engineer from the admin, describe what you want to build or change, and iterate with the agent. Pair it with MCP-enabled tools when you need deeper integration with your editor or deployment stack.",
      },
    ]),
  },
];

function buildStarterEntryRecord(input: {
  id: string;
  collectionId: string;
  slug: string;
  title: string;
  frontmatter: Record<string, unknown>;
  body: unknown;
  now: string;
  relations?: AriaEntryRecord["relations"];
}): AriaEntryRecord {
  return AriaEntryRecordSchema.parse({
    entry: {
      id: input.id,
      collectionId: input.collectionId,
      status: "published",
      version: "v1",
      authorId: "system",
      createdAt: input.now,
      updatedAt: input.now,
      publishedAt: input.now,
      scheduledFor: null,
    },
    locales: [
      {
        entryId: input.id,
        collectionId: input.collectionId,
        locale: STARTER_LOCALE,
        slug: input.slug,
        title: input.title,
        frontmatter: input.frontmatter,
        body: input.body,
        isSource: true,
      },
    ],
    relations: input.relations,
  });
}

export function buildStarterTagEntryRecords(now: string): AriaEntryRecord[] {
  return STARTER_TAG_DEFINITIONS.map((tag) =>
    buildStarterEntryRecord({
      id: tag.id,
      collectionId: TAGS_COLLECTION_NAME,
      slug: tag.slug,
      title: tag.title,
      frontmatter: {
        description: tag.description,
        color: tag.color,
        icon: tag.icon,
      },
      body: null,
      now,
    }),
  );
}

export function buildStarterAuthorEntryRecord(now: string): AriaEntryRecord {
  return buildStarterEntryRecord({
    id: STARTER_AUTHOR_ARIA_TEAM_ID,
    collectionId: AUTHORS_COLLECTION_NAME,
    slug: STARTER_AUTHOR_ARIA_TEAM_SLUG,
    title: "Aria Team",
    frontmatter: {
      role: "Aria Team",
      bio: "Building Aria — a visual site builder with a real CMS, designed for teams who ship on the edge.",
      social: {
        x: "@ariabuilder",
        github: "ariabuilder",
      },
    },
    body: null,
    now,
  });
}

export function buildStarterBlogEntryRecords(
  now: string,
  input: {
    authorId: string;
    tagIdsBySlug: Record<string, string>;
  },
): AriaEntryRecord[] {
  return STARTER_BLOG_DEFINITIONS.map((post) => {
    const relations = post.tagSlugs.map((tagSlug, position) => ({
      sourceEntryId: post.id,
      fieldKey: "tags",
      targetEntryId: input.tagIdsBySlug[tagSlug]!,
      position,
    }));

    return buildStarterEntryRecord({
      id: post.id,
      collectionId: BLOG_COLLECTION_NAME,
      slug: post.slug,
      title: post.title,
      frontmatter: {
        excerpt: post.excerpt,
        author: input.authorId,
        category: post.category,
        publishedDate: post.publishedDate,
        featured: post.featured,
      },
      body: post.body,
      now,
      relations,
    });
  });
}

export function buildStarterMainNavEntryRecord(
  now: string,
): AriaEntryRecord {
  return buildStarterEntryRecord({
    id: STARTER_MAIN_NAV_ID,
    collectionId: MAIN_NAV_COLLECTION_NAME,
    slug: STARTER_MAIN_NAV_SLUG,
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
      ],
    },
    body: null,
    now,
  });
}

export function buildStarterCmsEntryRecords(now: string): AriaEntryRecord[] {
  const tags = buildStarterTagEntryRecords(now);
  const author = buildStarterAuthorEntryRecord(now);
  const tagIdsBySlug = Object.fromEntries(
    tags.map((record) => [record.locales[0]!.slug, record.entry.id]),
  );
  const blogPosts = buildStarterBlogEntryRecords(now, {
    authorId: author.entry.id,
    tagIdsBySlug,
  });
  return [buildStarterMainNavEntryRecord(now), ...tags, author, ...blogPosts];
}

export type StarterBlogCollectionIds = {
  tags: string;
  authors: string;
  blog: string;
};

function withEntryCollectionId(
  record: AriaEntryRecord,
  collectionId: string,
): AriaEntryRecord {
  return AriaEntryRecordSchema.parse({
    ...record,
    entry: { ...record.entry, collectionId },
    locales: record.locales.map((locale) => ({ ...locale, collectionId })),
    relations: record.relations,
  });
}

async function getCollectionIdByName(
  executor: CmsStorageExecutor,
  name: string,
): Promise<string | null> {
  const row = await executor.queryFirst<{ id: string }>(
    `SELECT id FROM aria_collections WHERE name = ? LIMIT 1`,
    [name],
  );
  return row?.id ?? null;
}

export async function seedStarterBlogCollectionsIfMissing(
  executor: CmsStorageExecutor,
  now: string,
): Promise<StarterBlogCollectionIds | null> {
  const tagsDefinition = buildStarterCollectionDefinitions({
    collectionIdByName: {},
  }).tags;
  const authorsDefinition = buildStarterCollectionDefinitions({
    collectionIdByName: {},
  }).authors;

  let tagsId = await getCollectionIdByName(executor, TAGS_COLLECTION_NAME);
  if (!tagsId) {
    const tagsCollection = buildAriaCollection(tagsDefinition, now);
    await cmsSaveCollection(executor, tagsCollection);
    tagsId = tagsCollection.id;
  }

  let authorsId = await getCollectionIdByName(executor, AUTHORS_COLLECTION_NAME);
  if (!authorsId) {
    const authorsCollection = buildAriaCollection(authorsDefinition, now);
    await cmsSaveCollection(executor, authorsCollection);
    authorsId = authorsCollection.id;
  }

  let blogId = await getCollectionIdByName(executor, BLOG_COLLECTION_NAME);
  if (!blogId) {
    const blogDefinition = buildStarterCollectionDefinitions({
      collectionIdByName: {
        [tagsDefinition.name]: tagsId,
        [authorsDefinition.name]: authorsId,
      },
    }).blog;
    const blogCollection = buildAriaCollection(blogDefinition, now);
    await cmsSaveCollection(executor, blogCollection);
    blogId = blogCollection.id;
  }

  if (!tagsId || !authorsId || !blogId) {
    return null;
  }

  return { tags: tagsId, authors: authorsId, blog: blogId };
}

async function entrySlugExists(
  executor: CmsStorageExecutor,
  collectionId: string,
  slug: string,
): Promise<boolean> {
  const existing = await executor.queryFirst<{ id: string }>(
    `SELECT entry_id AS id
     FROM aria_entry_locales
     WHERE collection_id = ? AND slug = ?
     LIMIT 1`,
    [collectionId, slug],
  );
  return Boolean(existing);
}

async function resolveEntryIdBySlug(
  executor: CmsStorageExecutor,
  collectionId: string,
  slug: string,
): Promise<string | null> {
  const row = await executor.queryFirst<{ id: string }>(
    `SELECT entry_id AS id
     FROM aria_entry_locales
     WHERE collection_id = ? AND slug = ?
     LIMIT 1`,
    [collectionId, slug],
  );
  return row?.id ?? null;
}

async function seedEntryIfMissing(
  executor: CmsStorageExecutor,
  record: AriaEntryRecord,
): Promise<void> {
  const slug = record.locales[0]?.slug;
  if (!slug) {
    return;
  }

  const exists = await entrySlugExists(
    executor,
    record.entry.collectionId,
    slug,
  );
  if (exists) {
    return;
  }

  await cmsSaveEntry(executor, record, { replaceLocales: true });
}

export async function seedStarterCmsEntriesIfMissing(
  executor: CmsStorageExecutor,
  now: string,
): Promise<void> {
  const collectionIds = await seedStarterBlogCollectionsIfMissing(
    executor,
    now,
  );
  if (!collectionIds) {
    return;
  }

  await seedStarterMainNavCollectionIfMissing(executor, now);
  const mainNavId = await getCollectionIdByName(
    executor,
    MAIN_NAV_COLLECTION_NAME,
  );

  if (mainNavId) {
    await seedEntryIfMissing(
      executor,
      withEntryCollectionId(buildStarterMainNavEntryRecord(now), mainNavId),
    );
  }

  for (const record of buildStarterTagEntryRecords(now)) {
    await seedEntryIfMissing(
      executor,
      withEntryCollectionId(record, collectionIds.tags),
    );
  }

  await seedEntryIfMissing(
    executor,
    withEntryCollectionId(
      buildStarterAuthorEntryRecord(now),
      collectionIds.authors,
    ),
  );

  const authorId = await resolveEntryIdBySlug(
    executor,
    collectionIds.authors,
    STARTER_AUTHOR_ARIA_TEAM_SLUG,
  );
  if (!authorId) {
    return;
  }

  const tagIdsBySlug: Record<string, string> = {};
  for (const tag of STARTER_TAG_DEFINITIONS) {
    const id = await resolveEntryIdBySlug(
      executor,
      collectionIds.tags,
      tag.slug,
    );
    if (id) {
      tagIdsBySlug[tag.slug] = id;
    }
  }

  const blogRecords = buildStarterBlogEntryRecords(now, {
    authorId,
    tagIdsBySlug,
  });
  for (const record of blogRecords) {
    const slug = record.locales[0]?.slug;
    const definition = STARTER_BLOG_DEFINITIONS.find((def) => def.slug === slug);
    if (definition?.tagSlugs.some((tagSlug) => !tagIdsBySlug[tagSlug])) {
      continue;
    }
    await seedEntryIfMissing(
      executor,
      withEntryCollectionId(record, collectionIds.blog),
    );
  }
}
