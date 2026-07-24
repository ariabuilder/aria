import type { AriaCollection } from "../cms/schemas";

const STRUCTURED_TEXT_EXPORT_MODULE = `import { z } from "zod";

const StructuredTextSpanSchema = z.object({
  _type: z.literal("span"),
  _key: z.string(),
  text: z.string(),
  marks: z.array(z.string()).default([]),
}).strict();

const StructuredTextMarkDefSchema = z.discriminatedUnion("_type", [
  z.object({
    _key: z.string(),
    _type: z.literal("link"),
    href: z.string(),
    openInNewTab: z.boolean().optional(),
  }).strict(),
  z.object({
    _key: z.string(),
    _type: z.literal("entryLink"),
    collectionId: z.string(),
    entryId: z.string(),
  }).strict(),
  z.object({
    _key: z.string(),
    _type: z.literal("pageLink"),
    pageId: z.string(),
  }).strict(),
]);

const StructuredTextBlockSchema = z.discriminatedUnion("_type", [
  z.object({
    _type: z.literal("block"),
    _key: z.string(),
    style: z.enum(["normal", "h2", "h3", "h4", "blockquote"]).default("normal"),
    listItem: z.enum(["bullet", "number"]).optional(),
    level: z.number().positive().optional(),
    markDefs: z.array(StructuredTextMarkDefSchema).default([]),
    children: z.array(StructuredTextSpanSchema).min(1),
  }).strict(),
  z.object({
    _type: z.literal("image"),
    _key: z.string(),
    mediaId: z.string(),
    alt: z.string().optional(),
    caption: z.array(StructuredTextSpanSchema).optional(),
  }).strict(),
  z.object({
    _type: z.literal("embed"),
    _key: z.string(),
    provider: z.string(),
    url: z.string(),
    meta: z.record(z.string(), z.unknown()).optional(),
  }).strict(),
  z.object({
    _type: z.literal("divider"),
    _key: z.string(),
  }).strict(),
]);

export type StructuredTextBlock = z.infer<typeof StructuredTextBlockSchema>;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderStructuredTextToHtml(
  document: StructuredTextBlock[] | null | undefined,
): string {
  if (!document || document.length === 0) {
    return "";
  }

  return document
    .map((block) => {
      if (block._type !== "block") {
        if (block._type === "divider") {
          return "<hr />";
        }
        return "";
      }

      const text = block.children.map((span) => escapeHtml(span.text)).join("");
      switch (block.style) {
        case "h2":
          return \`<h2>\${text}</h2>\`;
        case "h3":
          return \`<h3>\${text}</h3>\`;
        case "h4":
          return \`<h4>\${text}</h4>\`;
        case "blockquote":
          return \`<blockquote><p>\${text}</p></blockquote>\`;
        default:
          return \`<p>\${text}</p>\`;
      }
    })
    .join("");
}
`;

function buildCollectionsModule(collections: readonly AriaCollection[]): string {
  const names = collections.map((collection) => collection.name);
  return `export const COLLECTION_NAMES = ${JSON.stringify(names, null, 2)} as const;

export type CollectionName = (typeof COLLECTION_NAMES)[number];
`;
}

function buildQueriesModule(): string {
  return `import type { CollectionName } from "./collections";

type ExportedEntry = {
  id: string;
  status: string;
  slug: string;
  locale: string;
  title: string;
  frontmatter: Record<string, unknown>;
  body: unknown;
  bodyHtml?: string;
  relations: Array<{
    fieldKey: string;
    targetCollection: string;
    targetSlug: string;
    position: number;
    meta?: Record<string, unknown>;
  }>;
  publishedAt: string | null;
  updatedAt: string;
};

type ExportedCollectionManifest = {
  id: string;
  name: string;
  label: string;
  kind: string;
  entryCount: number;
};

const entryModules = import.meta.glob("../../../content/collections/*/*.json", {
  eager: true,
  import: "default",
}) as Record<string, ExportedEntry>;

const manifestModules = import.meta.glob("../../../content/collections/*.json", {
  eager: true,
  import: "default",
}) as Record<string, ExportedCollectionManifest>;

function normalizePath(path: string): string {
  return path.replace(/\\\\/g, "/");
}

function entriesForCollection(collection: string): ExportedEntry[] {
  const prefix = \`/content/collections/\${collection}/\`;
  return Object.entries(entryModules)
    .filter(([path]) => normalizePath(path).includes(prefix))
    .map(([, entry]) => entry)
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

export async function getCollection(
  name: CollectionName,
): Promise<ExportedCollectionManifest | null> {
  const match = Object.entries(manifestModules).find(([path]) =>
    normalizePath(path).endsWith(\`/content/collections/\${name}.json\`),
  );
  return match?.[1] ?? null;
}

export async function getEntryBySlug(
  collection: CollectionName,
  slug: string,
  options?: { locale?: string },
): Promise<ExportedEntry | null> {
  const entries = entriesForCollection(collection);
  const locale = options?.locale;
  if (locale) {
    return (
      entries.find(
        (entry) => entry.slug === slug && entry.locale === locale,
      ) ?? null
    );
  }
  return entries.find((entry) => entry.slug === slug) ?? null;
}

export async function getEntry(
  collection: CollectionName,
  slug: string,
  options?: { locale?: string },
): Promise<ExportedEntry | null> {
  return getEntryBySlug(collection, slug, options);
}

export async function listEntries(
  collection: CollectionName,
  options?: {
    locale?: string;
    limit?: number;
    offset?: number;
    orderBy?: {
      field: "publishedAt" | "updatedAt" | "title";
      direction: "asc" | "desc";
    };
  },
): Promise<{ items: ExportedEntry[]; total: number }> {
  let items = entriesForCollection(collection);
  if (options?.locale) {
    items = items.filter((entry) => entry.locale === options.locale);
  }

  const orderField = options?.orderBy?.field ?? "updatedAt";
  const direction = options?.orderBy?.direction ?? "desc";
  items = [...items].sort((left, right) => {
    const leftValue = String(left[orderField] ?? "");
    const rightValue = String(right[orderField] ?? "");
    const result = leftValue.localeCompare(rightValue);
    return direction === "asc" ? result : -result;
  });

  const total = items.length;
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? total;
  return {
    items: items.slice(offset, offset + limit),
    total,
  };
}
`;
}

export function generateExportLibFiles(
  collections: readonly AriaCollection[],
): Array<{ path: string; content: string }> {
  return [
    {
      path: "export/lib/aria/content/collections.ts",
      content: buildCollectionsModule(collections),
    },
    {
      path: "export/lib/aria/content/queries.ts",
      content: buildQueriesModule(),
    },
    {
      path: "export/lib/aria/content/structuredText.ts",
      content: STRUCTURED_TEXT_EXPORT_MODULE,
    },
  ];
}
