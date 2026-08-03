import { type StorageAdapter } from "../storage/adapter";
import { renderPageDslToHtml } from "./renderPageDslToHtml";
import {
  loadCollectionPublicPageRoute,
  type PublicPageRouteStage,
} from "./resolvePublicPageRoute";
import { resolveCmsEntrySeoOverride } from "./resolveCmsEntrySeo";

export type RenderPageResult = {
  html: string;
};

export type RenderPagePartsResult = {
  headHtml: string;
  bodyHtml: string;
};

export {
  loadCollectionPublicPageRoute,
  resolveCollectionTemplateRoute,
  CollectionEntryContextSchema,
  CollectionPublicPageRouteSchema,
  CollectionTemplateRouteSchema,
  PublicPageRouteStageSchema,
  type CollectionEntryContext,
  type CollectionPublicPageRoute,
  type CollectionTemplateRoute,
  type PublicPageRouteStage,
} from "./resolvePublicPageRoute";
export {
  resolveCmsEntrySeoOverride,
  CmsEntrySeoOverrideSchema,
} from "./resolveCmsEntrySeo";

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeSlugForStorage(pathname: string): string {
  if (pathname === "/" || pathname === "") return "/";
  const trimmed = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  return trimmed;
}

function isInvalidSlugError(value: unknown): boolean {
  return (
    value instanceof Error &&
    typeof value.message === "string" &&
    value.message.toLowerCase().includes("invalid slug")
  );
}

async function getPageDslSafe(
  adapter: StorageAdapter,
  slug: string,
  stage: PublicPageRouteStage,
): Promise<Awaited<ReturnType<StorageAdapter["getPageDSL"]>>> {
  try {
    return stage === "published"
      ? await adapter.getPublishedPageDSL(slug)
      : await adapter.getPageDSL(slug);
  } catch (error: unknown) {
    if (isInvalidSlugError(error)) {
      return null;
    }
    throw error;
  }
}

async function buildCollectionRenderCmsOptions(
  adapter: StorageAdapter,
  collectionRoute: NonNullable<
    Awaited<ReturnType<typeof loadCollectionPublicPageRoute>>
  >,
  stage: PublicPageRouteStage,
) {
  const entry = await adapter.getEntry({
    collectionId: collectionRoute.entryContext.collectionId,
    idOrSlug: collectionRoute.entryContext.slug,
  });
  const sourceLocale =
    entry?.locales.find((locale) => locale.isSource) ?? entry?.locales[0];
  const entrySeo = sourceLocale
    ? resolveCmsEntrySeoOverride({
        entryTitle: sourceLocale.title,
        frontmatter: sourceLocale.frontmatter,
      })
    : undefined;

  return {
    preview: stage !== "published",
    entryContext: collectionRoute.entryContext,
    entrySeo,
  } as const;
}

export async function renderPageHtmlFromStorage(options: {
  adapter: StorageAdapter;
  pathname: string;
  stage?: PublicPageRouteStage;
}): Promise<RenderPageResult | null> {
  const { adapter, pathname, stage = "draft" } = options;
  const slug = normalizeSlugForStorage(pathname);

  const page = await getPageDslSafe(adapter, slug, stage);
  if (!page) {
    const collectionRoute = await loadCollectionPublicPageRoute(adapter, {
      pathname,
      stage,
    });
    if (!collectionRoute) return null;

    const { html } = await renderPageDslToHtml({
      page: collectionRoute.templatePage,
      adapter,
      pathOrSlug: pathname,
      cms: await buildCollectionRenderCmsOptions(
        adapter,
        collectionRoute,
        stage,
      ),
    });

    return { html };
  }

  const { html } = await renderPageDslToHtml({
    page,
    adapter,
    pathOrSlug: pathname,
  });

  return { html };
}

export async function renderPagePartsFromStorage(options: {
  adapter: StorageAdapter;
  pathname: string;
}): Promise<RenderPagePartsResult | null> {
  const { adapter, pathname } = options;
  const slug = normalizeSlugForStorage(pathname);

  const page = await getPageDslSafe(adapter, slug, "draft");
  if (!page) return null;

  const rendered = await renderPageDslToHtml({
    page,
    adapter,
    pathOrSlug: pathname,
  });
  const headMatch = rendered.html.match(/<head>([\s\S]*?)<\/head>/i);
  const bodyMatch = rendered.html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!headMatch || !bodyMatch) {
    throw new Error("Canonical render document is missing head or body markup");
  }

  const cspMetaTag = `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttr(rendered.cspHeaderValue)}">`;
  return {
    headHtml: `${headMatch[1].trim()}\n${cspMetaTag}`,
    bodyHtml: bodyMatch[1].trim(),
  };
}
