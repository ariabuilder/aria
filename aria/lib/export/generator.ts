import JSZip from "jszip";
import type {
  PageInventoryItem,
  StorageAdapter,
  ContentSiteState,
} from "../storage/adapter";
import type {
  LayoutLocaleRecord,
  PageLocaleRecord,
} from "../localization/siteTranslationSchemas";
import {
  createDefaultUniversalDesignSystem,
  resolveBreakpointDefinitionsFromDesignSystem,
  type UniversalDesignSystem,
} from "../styles/universalDesignSystem";
import type { CustomFont } from "../types/classes";
import type { ComponentDSL, JsonObject, LayoutDSL } from "../types/nodes";
import type { PageDSL } from "../types/nodes";
import type { AriaCollection, AriaEntryRecord } from "../cms/schemas";
import {
  StructuredTextDocumentSchema,
  type StructuredTextBlock,
  type StructuredTextMarkDef,
  type StructuredTextSpan,
} from "../cms/structuredText/schemas";
import type { RedirectRule } from "../redirects/schemas";
import {
  nodesToAstro,
  nodesToAstroComponent,
  nodesToAstroLayout,
} from "../blocks/nodesToAstro";
import { expandComponentReferencesServer } from "../blocks/nodeUtils";
import { filterPageScopedExportNodes } from "../layouts/slotEditing";
import { resolveExportSelection } from "./selection";
import {
  collectCmsRecordsForExport,
  exportCollections,
  filterCmsPayloadForExport,
} from "./cmsExport";
import type { SiteExportSelection } from "./cmsTypes";
import type { RuntimeLocals } from "../cloudflare/env";
import { resolveIconRenderResources } from "../icons/resolveIconResources";

type GenerateSiteExportArchiveOptions = {
  adapter: StorageAdapter;
  designSystemOverride?: UniversalDesignSystem;
  selection?: SiteExportSelection;
  locals?: RuntimeLocals;
};

type GenerateSiteExportArchiveResult = {
  bytes: Uint8Array;
  filename: string;
  pageCount: number;
  mediaCount: number;
  cmsCollectionCount: number;
  cmsEntryCount: number;
  cmsEntryJsonCount: number;
  redirectCount: number;
  estimatedMediaBytes: number;
};

type HydratedPageEntry = {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published" | "archived";
  draft: PageDSL | null;
  published: PageDSL | null;
  updatedAt?: string;
};

type HydratedResourceEntry<TResource> = {
  id: string;
  resource: TResource | null;
};

type ExportedPage = Omit<PageDSL, "status" | "title" | "slug" | "updatedAt"> & {
  status: "draft" | "published" | "archived";
  title: string;
  slug: string;
  updatedAt: string | undefined;
};

type CmsExportPayload = {
  collections: AriaCollection[];
  entries: AriaEntryRecord[];
};

type PageMetadataExportEntry = {
  id: string;
  slug: string;
  metadata: JsonObject;
};

type SiteExportManifest = {
  format: "aria-site-export";
  version: 1;
  generatedAt: string;
  counts: {
    pages: number;
    layouts: number;
    components: number;
    media: number;
    cmsCollections: number;
    cmsEntries: number;
    cmsMarkdownFiles: number;
    cmsEntryJsonFiles: number;
    cmsCollectionManifests: number;
    redirects: number;
    pageMetadata: number;
    pageLocales: number;
    layoutLocales: number;
  };
  included: string[];
  excluded: string[];
  selection?: SiteExportSelection;
};

type MarkdownExportFile = {
  path: string;
  content: string;
};

function sanitizeArchiveSegment(
  value: string | undefined,
  fallback: string,
): string {
  const normalized = (value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized.length > 0 ? normalized : fallback;
}

function sanitizeSlugPath(slug: string | undefined, fallback: string): string {
  const normalizedSlug = (slug ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (!normalizedSlug) {
    return fallback;
  }

  return normalizedSlug
    .split("/")
    .filter(Boolean)
    .map((segment) => sanitizeArchiveSegment(segment, fallback))
    .join("/");
}

function toExportPageAstroPath(page: Pick<PageDSL, "id" | "slug">): string {
  const normalizedSlug = sanitizeSlugPath(page.slug, "index");
  return normalizedSlug === "index"
    ? "export/pages/index.astro"
    : `export/pages/${normalizedSlug}.astro`;
}

function toPageLayoutImportPath(pagePath: string, layoutId: string): string {
  const pageSegments = pagePath.split("/");
  const nestedDirectoryDepth = Math.max(0, pageSegments.length - 3);
  const prefix =
    nestedDirectoryDepth === 0
      ? ".."
      : "../".repeat(nestedDirectoryDepth + 1).replace(/\/$/, "");
  return `${prefix}/layouts/${sanitizeArchiveSegment(layoutId, "layout")}.astro`;
}

function toExportLayoutAstroPath(layoutId: string): string {
  return `export/layouts/${sanitizeArchiveSegment(layoutId, "layout")}.astro`;
}

function toExportComponentAstroPath(componentId: string): string {
  return `export/components/${sanitizeArchiveSegment(componentId, "component")}.astro`;
}

function toExportUploadsPath(path: string): string {
  return `export/uploads/${path.replace(/^\/+/, "")}`;
}

function toExportArchiveMediaUrl(path: string): string {
  return `/uploads/${path.replace(/^\/+/, "")}`;
}

function toExportTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function toExportMarkdownDate(value: string | null | undefined): string {
  if (!value) {
    return "undated";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return sanitizeArchiveSegment(value.slice(0, 10), "undated");
  }

  return date.toISOString().slice(0, 10);
}

function markdownEscape(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+\-.!|>])/g, "\\$1");
}

function markdownInlineCode(value: string): string {
  return `\`${value.replace(/`/g, "\\`")}\``;
}

function markdownYamlScalar(value: unknown): string {
  if (value === undefined) {
    return "null";
  }

  return JSON.stringify(value);
}

function buildMarkdownFrontmatter(values: Record<string, unknown>): string {
  return [
    "---",
    ...Object.entries(values).map(
      ([key, value]) => `${key}: ${markdownYamlScalar(value)}`,
    ),
    "---",
  ].join("\n");
}

function compareStrings(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  return (a ?? "").localeCompare(b ?? "");
}

function sourceLocaleForEntry(record: AriaEntryRecord) {
  return record.locales.find((locale) => locale.isSource) ?? record.locales[0];
}

function markDefByKey(
  markDefs: readonly StructuredTextMarkDef[],
): Map<string, StructuredTextMarkDef> {
  return new Map(markDefs.map((markDef) => [markDef._key, markDef]));
}

function renderMarkdownSpan(
  span: StructuredTextSpan,
  markDefs: ReadonlyMap<string, StructuredTextMarkDef>,
): string {
  return span.marks.reduce((text, mark) => {
    const markDef = markDefs.get(mark);
    if (markDef?._type === "link") {
      return `[${text}](${markDef.href})`;
    }
    if (markDef?._type === "entryLink") {
      return `[${text}](entry://${markDef.collectionId}/${markDef.entryId})`;
    }
    if (markDef?._type === "pageLink") {
      return `[${text}](page://${markDef.pageId})`;
    }

    switch (mark) {
      case "strong":
      case "bold":
        return `**${text}**`;
      case "em":
      case "italic":
        return `_${text}_`;
      case "code":
        return markdownInlineCode(text);
      case "strike":
        return `~~${text}~~`;
      default:
        return text;
    }
  }, markdownEscape(span.text));
}

function renderMarkdownBlockChildren(
  block: Extract<StructuredTextBlock, { _type: "block" }>,
): string {
  const markDefs = markDefByKey(block.markDefs);
  return block.children
    .map((span) => renderMarkdownSpan(span, markDefs))
    .join("");
}

function renderMarkdownTextBlock(
  block: Extract<StructuredTextBlock, { _type: "block" }>,
  listIndex: number,
): string {
  const content = renderMarkdownBlockChildren(block);
  if (block.listItem === "bullet") {
    return `- ${content}`;
  }
  if (block.listItem === "number") {
    return `${listIndex}. ${content}`;
  }

  switch (block.style) {
    case "h2":
      return `## ${content}`;
    case "h3":
      return `### ${content}`;
    case "h4":
      return `#### ${content}`;
    case "blockquote":
      return content
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "normal":
      return content;
  }
}

function renderMarkdownNonTextBlock(
  block: Exclude<StructuredTextBlock, { _type: "block" }>,
): string {
  switch (block._type) {
    case "image": {
      const caption =
        block.caption?.map((span) => markdownEscape(span.text)).join("") ?? "";
      const alt = markdownEscape(block.alt || caption || block.mediaId);
      return `![${alt}](media://${block.mediaId})`;
    }
    case "embed":
      return `[${block.provider}](${block.url})`;
    case "divider":
      return "---";
  }
}

function renderStructuredTextToMarkdown(body: unknown): string | null {
  const parsed = StructuredTextDocumentSchema.safeParse(body);
  if (!parsed.success) {
    return null;
  }

  let orderedListIndex = 1;
  const lines = parsed.data.map((block) => {
    if (block._type !== "block") {
      orderedListIndex = 1;
      return renderMarkdownNonTextBlock(block);
    }

    if (block.listItem === "number") {
      return renderMarkdownTextBlock(block, orderedListIndex++);
    }

    orderedListIndex = 1;
    return renderMarkdownTextBlock(block, 1);
  });

  return lines
    .filter((line) => line.trim().length > 0)
    .join("\n\n")
    .trim();
}

function renderUnknownBodyToMarkdown(body: unknown): string {
  if (body == null) {
    return "";
  }

  if (typeof body === "string") {
    return body.trim();
  }

  const structuredMarkdown = renderStructuredTextToMarkdown(body);
  if (structuredMarkdown !== null) {
    return structuredMarkdown;
  }

  return `\`\`\`json\n${JSON.stringify(body, null, 2)}\n\`\`\``;
}

function sortRedirects(redirects: RedirectRule[]): RedirectRule[] {
  return [...redirects].sort(
    (a, b) =>
      compareStrings(a.fromPath, b.fromPath) ||
      compareStrings(a.toPath, b.toPath) ||
      compareStrings(a.id, b.id),
  );
}

function toExportCmsMarkdownPath(input: {
  collection: AriaCollection | undefined;
  record: AriaEntryRecord;
  usedPaths: Set<string>;
}): string {
  const sourceLocale = sourceLocaleForEntry(input.record);
  const collectionSegment = sanitizeArchiveSegment(
    input.collection?.name ??
      input.collection?.id ??
      input.record.entry.collectionId,
    "collection",
  );
  const entrySegment = sanitizeArchiveSegment(
    sourceLocale?.slug ?? input.record.entry.id,
    "entry",
  );
  const dateSegment = toExportMarkdownDate(
    input.record.entry.publishedAt ??
      input.record.entry.scheduledFor ??
      input.record.entry.createdAt ??
      input.record.entry.updatedAt,
  );
  const basePath = `export/collections/${collectionSegment}/${entrySegment}-${dateSegment}`;
  let path = `${basePath}.md`;

  if (!input.usedPaths.has(path)) {
    input.usedPaths.add(path);
    return path;
  }

  const idSegment = sanitizeArchiveSegment(input.record.entry.id, "entry");
  path = `${basePath}-${idSegment}.md`;
  if (!input.usedPaths.has(path)) {
    input.usedPaths.add(path);
    return path;
  }

  for (let index = 2; ; index += 1) {
    path = `${basePath}-${idSegment}-${index}.md`;
    if (!input.usedPaths.has(path)) {
      input.usedPaths.add(path);
      return path;
    }
  }
}

function collectCmsMarkdownFiles(
  payload: CmsExportPayload,
): MarkdownExportFile[] {
  const collectionById = new Map(
    payload.collections.map((collection) => [collection.id, collection]),
  );
  const usedPaths = new Set<string>();

  return payload.entries.flatMap((record): MarkdownExportFile[] => {
    const sourceLocale = sourceLocaleForEntry(record);
    if (!sourceLocale) {
      return [];
    }

    const collection = collectionById.get(record.entry.collectionId);
    const frontmatter = buildMarkdownFrontmatter({
      id: record.entry.id,
      collectionId: record.entry.collectionId,
      collectionName: collection?.name ?? record.entry.collectionId,
      collectionLabel: collection?.label ?? null,
      collectionKind: collection?.kind ?? null,
      title: sourceLocale.title,
      slug: sourceLocale.slug,
      locale: sourceLocale.locale,
      status: record.entry.status,
      version: record.entry.version,
      authorId: record.entry.authorId,
      createdAt: record.entry.createdAt,
      updatedAt: record.entry.updatedAt,
      publishedAt: record.entry.publishedAt,
      scheduledFor: record.entry.scheduledFor,
      frontmatter: sourceLocale.frontmatter,
      relations: record.relations ?? [],
      authorship: record.authorship ?? null,
    });
    const body = renderUnknownBodyToMarkdown(sourceLocale.body);

    return [
      {
        path: toExportCmsMarkdownPath({
          collection,
          record,
          usedPaths,
        }),
        content: `${frontmatter}\n\n${body}\n`,
      },
    ];
  });
}

async function collectPageMetadata(
  adapter: StorageAdapter,
  pages: ExportedPage[],
): Promise<PageMetadataExportEntry[]> {
  const metadataEntries = await Promise.all(
    pages.map(async (page): Promise<PageMetadataExportEntry | null> => {
      const slug = page.slug || page.id;
      let metadata = await adapter.getPageMetadata(slug);
      if (!metadata && page.id !== slug) {
        metadata = await adapter.getPageMetadata(page.id);
      }

      return metadata
        ? {
            id: page.id,
            slug,
            metadata,
          }
        : null;
    }),
  );

  return metadataEntries
    .filter((entry): entry is PageMetadataExportEntry => entry !== null)
    .sort(
      (a, b) => compareStrings(a.slug, b.slug) || compareStrings(a.id, b.id),
    );
}

function buildSiteExportManifest(input: {
  generatedAt: string;
  pageCount: number;
  layoutCount: number;
  componentCount: number;
  mediaCount: number;
  cmsCollectionCount: number;
  cmsEntryCount: number;
  cmsMarkdownFileCount: number;
  cmsEntryJsonFileCount: number;
  cmsCollectionManifestCount: number;
  redirectCount: number;
  pageMetadataCount: number;
  pageLocaleCount: number;
  layoutLocaleCount: number;
  contentState: ContentSiteState | null;
  included: string[];
  excluded: string[];
  selection?: SiteExportSelection;
}): SiteExportManifest {
  return {
    format: "aria-site-export",
    version: 1,
    generatedAt: input.generatedAt,
    counts: {
      pages: input.pageCount,
      layouts: input.layoutCount,
      components: input.componentCount,
      media: input.mediaCount,
      cmsCollections: input.cmsCollectionCount,
      cmsEntries: input.cmsEntryCount,
      cmsMarkdownFiles: input.cmsMarkdownFileCount,
      cmsEntryJsonFiles: input.cmsEntryJsonFileCount,
      cmsCollectionManifests: input.cmsCollectionManifestCount,
      redirects: input.redirectCount,
      pageMetadata: input.pageMetadataCount,
      pageLocales: input.pageLocaleCount,
      layoutLocales: input.layoutLocaleCount,
    },
    included: input.included,
    excluded: input.excluded,
    selection: input.selection,
  };
}

type SiteLocalizationExport = {
  format: "aria-site-localization";
  version: 1;
  pageLocales: PageLocaleRecord[];
  layoutLocales: LayoutLocaleRecord[];
};

async function collectSiteLocalizationForExport(input: {
  adapter: StorageAdapter;
  includePages: boolean;
  includeLayouts: boolean;
}): Promise<SiteLocalizationExport> {
  // Exports created by older adapter implementations remain readable. All
  // current runtime adapters implement these methods, and new archives always
  // include this portable contract even when there are no translations yet.
  const adapter = input.adapter as Partial<StorageAdapter>;
  const [pageLocales, layoutLocales] = await Promise.all([
    input.includePages && typeof adapter.listPageLocaleRecords === "function"
      ? adapter.listPageLocaleRecords()
      : Promise.resolve([]),
    input.includeLayouts && typeof adapter.listLayoutLocaleRecords === "function"
      ? adapter.listLayoutLocaleRecords()
      : Promise.resolve([]),
  ]);
  return {
    format: "aria-site-localization",
    version: 1,
    pageLocales,
    layoutLocales,
  };
}

function buildManifestIncludedExcluded(input: {
  sections: Record<string, boolean>;
  mediaMode: string;
}): { included: string[]; excluded: string[] } {
  const labels: Record<string, string> = {
    pages: "generated Astro pages",
    layouts: "generated Astro layouts",
    components: "generated Astro components",
    designSystem: "design system",
    siteSettings: "site settings",
    media:
      input.mediaMode === "manifestOnly"
        ? "media manifest"
        : input.mediaMode === "omit"
          ? "media references only"
          : "media files",
    cms: "CMS collections",
    redirects: "redirect rules",
    discovery: "discovery artifacts",
    contentState: "content revision state",
    pageMetadata: "page metadata",
  };

  const included: string[] = [];
  const excluded: string[] = [];

  for (const [key, enabled] of Object.entries(input.sections)) {
    const label = labels[key];
    if (!label) {
      continue;
    }
    if (enabled) {
      included.push(label);
    } else {
      excluded.push(label);
    }
  }

  if (input.sections.pages || input.sections.layouts) {
    included.push("site localization records");
  } else {
    excluded.push("site localization records");
  }

  excluded.push(
    "auth users and sessions",
    "BYOK provider secrets",
    "content sync jobs and logs",
    "WordPress import tracking",
    "historical canonical page, layout, component, and CMS revision rows",
    "snapshots, thumbnails, and runtime caches",
    "previous site export artifacts",
  );

  return { included, excluded };
}

import { buildDiscoveryArtifacts, loadDiscoveryContext } from "../crawl";
import { buildNetlifyRedirects } from "../redirects/buildRedirectsFile";
import { listRedirectsFromAdapter } from "../redirects/storage";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rewriteExportMediaUrls(
  input: string,
  mediaFiles: Array<{ path: string; url: string }>,
): string {
  if (input.trim().length === 0 || mediaFiles.length === 0) {
    return input;
  }

  let output = input;

  for (const mediaFile of mediaFiles) {
    const exportedUrl = toExportArchiveMediaUrl(mediaFile.path);
    const candidates = Array.from(
      new Set([
        mediaFile.url,
        `/${mediaFile.path.replace(/^\/+/, "")}`,
        exportedUrl,
      ]),
    ).filter(Boolean);

    for (const candidate of candidates) {
      const pattern = candidate.startsWith("/")
        ? new RegExp(
            `(?<!${escapeRegExp("/uploads")})${escapeRegExp(candidate)}`,
            "g",
          )
        : new RegExp(escapeRegExp(candidate), "g");

      output = output.replace(pattern, exportedUrl);
    }
  }

  return output;
}

function rewriteSingleExportMediaUrl(
  input: string | undefined,
  mediaFiles: Array<{ path: string; url: string }>,
): string | undefined {
  if (typeof input !== "string") {
    return input;
  }

  const trimmedInput = input.trim();
  if (trimmedInput.length === 0) {
    return input;
  }

  const matchingMedia = mediaFiles.find((mediaFile) => {
    const exportedUrl = toExportArchiveMediaUrl(mediaFile.path);
    const candidates = [
      mediaFile.url,
      `/${mediaFile.path.replace(/^\/+/, "")}`,
      exportedUrl,
      `/uploads/${mediaFile.path.replace(/^\/+/, "")}`,
    ];

    return candidates.some((candidate) => candidate === trimmedInput);
  });

  if (matchingMedia) {
    return toExportArchiveMediaUrl(matchingMedia.path);
  }

  return rewriteExportMediaUrls(input, mediaFiles);
}

function createExportDesignSystem(
  designSystem: UniversalDesignSystem,
  mediaFiles: Array<{ path: string; url: string }>,
): UniversalDesignSystem {
  const exportedDesignSystem = structuredClone(designSystem);

  exportedDesignSystem.artifacts.customFontsCSS = rewriteExportMediaUrls(
    exportedDesignSystem.artifacts.customFontsCSS,
    mediaFiles,
  );
  exportedDesignSystem.artifacts.globalCSS = rewriteExportMediaUrls(
    exportedDesignSystem.artifacts.globalCSS,
    mediaFiles,
  );

  for (const font of Object.values(
    exportedDesignSystem.fonts.uploaded,
  ) as Array<CustomFont & { url?: string }>) {
    font.url = rewriteSingleExportMediaUrl(font.url, mediaFiles);
    for (const format of font.formats) {
      format.url =
        rewriteSingleExportMediaUrl(format.url, mediaFiles) || format.url;
    }
  }

  return exportedDesignSystem;
}

export async function generateSiteExportArchive(
  options: GenerateSiteExportArchiveOptions,
): Promise<GenerateSiteExportArchiveResult> {
  const resolved = resolveExportSelection(options.selection);
  const { sections, mediaMode, cms: cmsOptions } = resolved;
  const generatedAt = new Date();

  const [
    pageSummaries,
    layoutSummaries,
    componentSummaries,
    designSystem,
    siteSettings,
    mediaFiles,
    cmsCollections,
    contentState,
    pageOrder,
    layoutOrder,
    componentOrder,
    allRedirectRules,
  ] = await Promise.all([
    sections.pages ? options.adapter.listPagesDSL() : Promise.resolve([]),
    sections.layouts ? options.adapter.listLayoutsDSL() : Promise.resolve([]),
    sections.components
      ? options.adapter.listComponentsDSL()
      : Promise.resolve([]),
    sections.designSystem ||
    sections.pages ||
    sections.layouts ||
    sections.components
      ? Promise.resolve(options.designSystemOverride ?? null).then(
          (value) =>
            value ??
            options.adapter
              .getDesignSystem()
              .then(
                (storedValue) =>
                  storedValue ?? createDefaultUniversalDesignSystem(),
              ),
        )
      : Promise.resolve(createDefaultUniversalDesignSystem()),
    sections.siteSettings
      ? options.adapter.getSiteSettings()
      : Promise.resolve(null),
    sections.media && mediaMode !== "omit"
      ? options.adapter.listMedia()
      : Promise.resolve([]),
    sections.cms ? options.adapter.listCollections() : Promise.resolve([]),
    sections.contentState
      ? options.adapter.getContentSiteState()
      : Promise.resolve(null),
    sections.contentState
      ? options.adapter.getOrder("pages")
      : Promise.resolve([]),
    sections.contentState
      ? options.adapter.getOrder("layouts")
      : Promise.resolve([]),
    sections.contentState
      ? options.adapter.getOrder("components")
      : Promise.resolve([]),
    sections.redirects
      ? listRedirectsFromAdapter(options.adapter, { includeDisabled: true })
      : Promise.resolve([]),
  ]);

  const estimatedMediaBytes = mediaFiles.reduce(
    (total, file) => total + (file.size ?? 0),
    0,
  );

  const pages = sections.pages
    ? await Promise.all(
        pageSummaries.map(
          async (
            pageSummary: PageInventoryItem,
          ): Promise<HydratedPageEntry> => {
            const [draft, published] = await Promise.all([
              options.adapter.getPageDSL(pageSummary.id),
              options.adapter.getPublishedPageDSL(pageSummary.id),
            ]);

            return {
              id: pageSummary.id,
              slug:
                pageSummary.slug ??
                draft?.slug ??
                published?.slug ??
                pageSummary.id,
              title:
                pageSummary.title ??
                draft?.title ??
                published?.title ??
                pageSummary.id,
              status:
                pageSummary.status === "published" ||
                pageSummary.status === "archived"
                  ? pageSummary.status
                  : "draft",
              draft,
              published,
              updatedAt:
                draft?.updatedAt ??
                published?.updatedAt ??
                pageSummary.updatedAt,
            };
          },
        ),
      )
    : [];

  const layouts = sections.layouts
    ? await Promise.all(
        layoutSummaries.map(
          async (
            layoutSummary: LayoutDSL,
          ): Promise<HydratedResourceEntry<LayoutDSL>> => ({
            id: layoutSummary.id,
            resource: await options.adapter.getLayoutDSL(layoutSummary.id),
          }),
        ),
      )
    : [];

  const components = sections.components
    ? await Promise.all(
        componentSummaries.map(
          async (
            componentSummary: ComponentDSL,
          ): Promise<HydratedResourceEntry<ComponentDSL>> => ({
            id: componentSummary.id,
            resource: await options.adapter.getComponentDSL(
              componentSummary.id,
            ),
          }),
        ),
      )
    : [];

  const exportedPages = pages.reduce<ExportedPage[]>(
    (accumulator: ExportedPage[], page: HydratedPageEntry) => {
      const currentRevision =
        page.status === "published"
          ? (page.published ?? page.draft)
          : (page.draft ?? page.published);

      if (!currentRevision) {
        return accumulator;
      }

      accumulator.push({
        ...currentRevision,
        status: page.status,
        updatedAt: currentRevision.updatedAt ?? page.updatedAt,
        title: currentRevision.title || page.title,
        slug: currentRevision.slug ?? page.slug,
      });

      return accumulator;
    },
    [],
  );

  const rawCmsPayload = sections.cms
    ? await collectCmsRecordsForExport(options.adapter, cmsCollections)
    : { collections: [], entries: [] };

  const cmsPayload = sections.cms
    ? filterCmsPayloadForExport({
        collections: rawCmsPayload.collections,
        entries: rawCmsPayload.entries,
        options: {
          ...cmsOptions,
          includeMonolithicCmsJson: cmsOptions.includeMonolithicCmsJson,
        },
      })
    : { collections: [], entries: [] };

  const cmsBundle = sections.cms
    ? await exportCollections({
        adapter: options.adapter,
        collections: cmsPayload.collections,
        pages: exportedPages.map((page) => ({ id: page.id, slug: page.slug })),
        options: cmsOptions,
        generatedAt: generatedAt.toISOString(),
      })
    : null;

  const pageMetadata =
    sections.pageMetadata && exportedPages.length > 0
      ? await collectPageMetadata(options.adapter, exportedPages)
      : [];

  const siteLocalization =
    sections.pages || sections.layouts
      ? await collectSiteLocalizationForExport({
          adapter: options.adapter,
          includePages: sections.pages,
          includeLayouts: sections.layouts,
        })
      : null;

  const cmsMarkdownFiles =
    sections.cms && cmsOptions.includeMarkdown
      ? collectCmsMarkdownFiles({
          collections: rawCmsPayload.collections,
          entries: rawCmsPayload.entries,
        })
      : [];

  const canonicalBreakpoints =
    resolveBreakpointDefinitionsFromDesignSystem(designSystem);
  const exportedDesignSystem = createExportDesignSystem(
    designSystem,
    mediaFiles,
  );

  const layoutById = new Map<string, LayoutDSL>();
  for (const layout of layouts) {
    if (layout.resource) {
      layoutById.set(layout.id, layout.resource);
    }
  }

  const getComponentDSL = options.adapter.getComponentDSL.bind(options.adapter);

  const zip = new JSZip();

  if (sections.pages) {
    for (const page of exportedPages) {
      const pagePath = toExportPageAstroPath(page);
      const layoutResource =
        typeof page.layout === "string" && page.layout.trim().length > 0
          ? layoutById.get(page.layout.trim())
          : undefined;
      const pageNodes = layoutResource
        ? filterPageScopedExportNodes(page.nodes || [], layoutResource)
        : page.nodes || [];

      zip.file(
        pagePath,
        nodesToAstro(pageNodes, {
          title: page.title,
          description: page.description,
          layoutImportPath:
            typeof page.layout === "string" && page.layout.trim().length > 0
              ? toPageLayoutImportPath(pagePath, page.layout)
              : undefined,
          frontmatter: {
            ...(page.frontmatter ?? {}),
            seo: page.settings?.seo,
          },
          breakpoints: canonicalBreakpoints,
          iconResources: await resolveIconRenderResources(pageNodes, {
            locals: options.locals,
          }),
        }),
      );
    }
  }

  if (sections.layouts) {
    for (const layout of layouts) {
      if (!layout.resource) {
        continue;
      }

      const expandedSlots = await Promise.all(
        (layout.resource.slots ?? []).map(
          async (slot: LayoutDSL["slots"][number]) => ({
            ...slot,
            defaultContent:
              slot.defaultContent && slot.defaultContent.length > 0
                ? await expandComponentReferencesServer(
                    slot.defaultContent,
                    getComponentDSL,
                  )
                : undefined,
          }),
        ),
      );

      zip.file(
        toExportLayoutAstroPath(layout.id),
        nodesToAstroLayout(layout.resource.nodes || [], expandedSlots, {
          title: layout.resource.title || layout.resource.name,
          description: layout.resource.description,
          breakpoints: canonicalBreakpoints,
          iconResources: await resolveIconRenderResources(
            [
              ...(layout.resource.nodes || []),
              ...expandedSlots.flatMap((slot) => slot.defaultContent ?? []),
            ],
            { locals: options.locals },
          ),
        }),
      );
    }
  }

  if (sections.components) {
    for (const component of components) {
      if (!component.resource) {
        continue;
      }

      zip.file(
        toExportComponentAstroPath(component.id),
        nodesToAstroComponent(component.resource.nodes || [], {
          name: component.resource.title || component.resource.name,
          description: component.resource.description,
          breakpoints: canonicalBreakpoints,
          iconResources: await resolveIconRenderResources(
            component.resource.nodes || [],
            { locals: options.locals },
          ),
        }),
      );
    }
  }

  if (sections.designSystem) {
    if (exportedDesignSystem.artifacts.globalCSS) {
      zip.file(
        "export/styles/global.css",
        exportedDesignSystem.artifacts.globalCSS,
      );
    }

    zip.file(
      "export/styles/design-system.json",
      JSON.stringify(exportedDesignSystem, null, 2),
    );
  }

  if (sections.siteSettings) {
    zip.file(
      "export/site-settings.json",
      JSON.stringify(siteSettings ?? {}, null, 2),
    );
  }

  if (sections.cms && cmsOptions.includeMonolithicCmsJson) {
    zip.file("export/content/cms.json", JSON.stringify(rawCmsPayload, null, 2));
  }

  if (sections.cms && cmsBundle) {
    if (cmsBundle.seedManifest) {
      zip.file(
        "export/content/seed-manifest.json",
        JSON.stringify(cmsBundle.seedManifest, null, 2),
      );
    }

    for (const manifestFile of cmsBundle.collectionManifests) {
      zip.file(
        manifestFile.path,
        JSON.stringify(manifestFile.manifest, null, 2),
      );
    }

    for (const entryFile of cmsBundle.entryFiles) {
      zip.file(entryFile.path, JSON.stringify(entryFile.entry, null, 2));
    }

    for (const libFile of cmsBundle.libFiles) {
      zip.file(libFile.path, libFile.content);
    }
  }

  if (sections.cms) {
    for (const markdownFile of cmsMarkdownFiles) {
      zip.file(markdownFile.path, markdownFile.content);
    }
  }

  if (sections.contentState && contentState) {
    zip.file(
      "export/content/content-state.json",
      JSON.stringify(contentState, null, 2),
    );

    zip.file(
      "export/content/order.json",
      JSON.stringify(
        {
          pages: pageOrder,
          layouts: layoutOrder,
          components: componentOrder,
        },
        null,
        2,
      ),
    );
  }

  if (sections.pageMetadata) {
    zip.file(
      "export/content/page-metadata.json",
      JSON.stringify(pageMetadata, null, 2),
    );
  }

  if (siteLocalization) {
    zip.file(
      "export/content/site-localization.json",
      JSON.stringify(siteLocalization, null, 2),
    );
  }

  const sortedRedirectRules = sections.redirects
    ? sortRedirects(allRedirectRules)
    : [];

  if (sections.redirects) {
    zip.file(
      "export/content/redirects.json",
      JSON.stringify(sortedRedirectRules, null, 2),
    );
  }

  let mediaCount = 0;
  if (sections.media && mediaMode === "manifestOnly") {
    zip.file(
      "export/content/media-manifest.json",
      JSON.stringify(
        mediaFiles.map((mediaFile) => ({
          path: mediaFile.path,
          url: mediaFile.url,
          size: mediaFile.size,
          contentType: mediaFile.contentType ?? null,
          createdAt: mediaFile.createdAt,
        })),
        null,
        2,
      ),
    );
    mediaCount = mediaFiles.length;
  } else if (sections.media && mediaMode === "bundle") {
    const exportedMedia = await Promise.all(
      mediaFiles.map(
        async (mediaFile: {
          path: string;
          url: string;
          size: number;
          contentType?: string;
          createdAt: string;
        }) => {
          const buffer = await options.adapter.getMedia(mediaFile.path);
          if (!buffer) {
            return null;
          }

          return {
            path: toExportUploadsPath(mediaFile.path),
            bytes: new Uint8Array(buffer),
          };
        },
      ),
    );

    for (const mediaFile of exportedMedia) {
      if (!mediaFile) {
        continue;
      }

      zip.file(mediaFile.path, mediaFile.bytes);
      mediaCount += 1;
    }
  }

  if (sections.discovery) {
    const discoveryContext = await loadDiscoveryContext(options.adapter);
    const discoveryArtifacts = buildDiscoveryArtifacts({
      siteSettings: discoveryContext.siteSettings,
      pages: discoveryContext.pages,
      cmsEntries: discoveryContext.cmsEntries,
    });

    zip.file("export/robots.txt", discoveryArtifacts.robots);

    if (discoveryArtifacts.sitemap) {
      zip.file("export/sitemap.xml", discoveryArtifacts.sitemap);
    }

    if (discoveryArtifacts.llms) {
      zip.file("export/llms.txt", discoveryArtifacts.llms);
    }
  }

  if (sections.redirects) {
    const enabledRedirectRules = sortedRedirectRules.filter(
      (rule) => rule.enabled !== false,
    );
    const redirectsBody = buildNetlifyRedirects(enabledRedirectRules);
    if (redirectsBody.length > 0) {
      zip.file("export/_redirects", redirectsBody);
    }
  }

  const manifestLabels = buildManifestIncludedExcluded({
    sections,
    mediaMode,
  });

  const manifest = buildSiteExportManifest({
    generatedAt: generatedAt.toISOString(),
    pageCount: exportedPages.length,
    layoutCount: layouts.filter((layout) => layout.resource).length,
    componentCount: components.filter((component) => component.resource).length,
    mediaCount,
    cmsCollectionCount: rawCmsPayload.collections.length,
    cmsEntryCount: rawCmsPayload.entries.length,
    cmsMarkdownFileCount: cmsMarkdownFiles.length,
    cmsEntryJsonFileCount: cmsBundle?.counts.entryJsonFiles ?? 0,
    cmsCollectionManifestCount: cmsBundle?.counts.collectionManifests ?? 0,
    redirectCount: sortedRedirectRules.length,
    pageMetadataCount: pageMetadata.length,
    pageLocaleCount: siteLocalization?.pageLocales.length ?? 0,
    layoutLocaleCount: siteLocalization?.layoutLocales.length ?? 0,
    contentState,
    included: manifestLabels.included,
    excluded: manifestLabels.excluded,
    selection: options.selection,
  });

  zip.file("export/aria-export.json", JSON.stringify(manifest, null, 2));

  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return {
    bytes,
    filename: `aria-site-export-${toExportTimestamp(generatedAt)}.zip`,
    pageCount: exportedPages.length,
    mediaCount,
    cmsCollectionCount: rawCmsPayload.collections.length,
    cmsEntryCount: rawCmsPayload.entries.length,
    cmsEntryJsonCount: cmsBundle?.counts.entryJsonFiles ?? 0,
    redirectCount: sortedRedirectRules.length,
    estimatedMediaBytes,
  };
}
