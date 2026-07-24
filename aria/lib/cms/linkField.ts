import { z } from "zod";
import type { StorageAdapter } from "../storage/adapter";
import { buildCmsEntryPublicPath } from "./publicPaths";
import { validateCmsUrlPattern } from "./routing";

export const CmsLinkFieldTypeSchema = z.enum([
  "page",
  "entry",
  "external",
  "email",
  "phone",
  "internal",
]);
export type CmsLinkFieldType = z.infer<typeof CmsLinkFieldTypeSchema>;

export const CmsLinkFieldValueSchema = z
  .object({
    type: CmsLinkFieldTypeSchema,
    url: z.string().trim().optional(),
    pageId: z.string().trim().optional(),
    entryId: z.string().trim().optional(),
    collectionId: z.string().trim().optional(),
    slug: z.string().trim().optional(),
    label: z.string().trim().optional(),
    openInNewTab: z.boolean().optional(),
  })
  .strict();
export type CmsLinkFieldValue = z.infer<typeof CmsLinkFieldValueSchema>;

export const ResolveCmsLinkOptionsSchema = z
  .object({
    preview: z.boolean().default(false),
  })
  .strict();
export type ResolveCmsLinkOptions = z.infer<typeof ResolveCmsLinkOptionsSchema>;

export const ResolvedCmsLinkSchema = z
  .object({
    href: z.string().trim().min(1),
    label: z.string().trim().optional(),
    openInNewTab: z.boolean().optional(),
  })
  .strict();
export type ResolvedCmsLink = z.infer<typeof ResolvedCmsLinkSchema>;

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeExternalUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("#") ||
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
  ) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function buildPageHref(slug: string): string {
  return slug === "index" ? "/" : `/${slug}`;
}

function withPreviewQuery(href: string, preview: boolean): string {
  if (!preview) {
    return href;
  }

  const url = new URL(href, "https://aria.local");
  url.searchParams.set("preview", "1");
  return `${url.pathname}${url.search}${url.hash}`;
}

async function resolvePageLinkHref(
  adapter: StorageAdapter,
  link: CmsLinkFieldValue,
  preview: boolean,
): Promise<string | null> {
  const pageId = optionalTrimmed(link.pageId);
  const slug = optionalTrimmed(link.slug);
  const directUrl = optionalTrimmed(link.url);

  if (pageId) {
    const policy = await adapter.getPagePolicy(pageId);
    if (!policy) {
      return null;
    }
    return withPreviewQuery(buildPageHref(policy.slug), preview);
  }

  if (slug) {
    return withPreviewQuery(buildPageHref(slug), preview);
  }

  if (directUrl) {
    return withPreviewQuery(
      directUrl.startsWith("/") || directUrl.startsWith("#")
        ? directUrl
        : normalizeExternalUrl(directUrl),
      preview,
    );
  }

  return null;
}

async function resolveEntryLinkHref(
  adapter: StorageAdapter,
  link: CmsLinkFieldValue,
  preview: boolean,
): Promise<string | null> {
  const collectionId = optionalTrimmed(link.collectionId);
  const entryId = optionalTrimmed(link.entryId);
  const entrySlug = optionalTrimmed(link.slug);

  if (!collectionId) {
    return null;
  }

  const collection = await adapter.getCollection(collectionId);
  if (!collection?.urlPattern || !collection.templatePageId) {
    return null;
  }

  const validation = validateCmsUrlPattern(collection.urlPattern);
  if (!validation.valid) {
    return null;
  }

  let resolvedSlug = entrySlug;
  if (!resolvedSlug && entryId) {
    const entry = await adapter.getEntry({
      collectionId,
      idOrSlug: entryId,
    });
    const locale =
      entry?.locales.find((row) => row.isSource) ?? entry?.locales[0];
    resolvedSlug = optionalTrimmed(locale?.slug);
  }

  if (!resolvedSlug) {
    return null;
  }

  const pathname = buildCmsEntryPublicPath(collection.urlPattern, resolvedSlug);
  if (!pathname) {
    return null;
  }

  return withPreviewQuery(pathname, preview);
}

export function parseCmsLinkFieldValue(value: unknown): CmsLinkFieldValue | null {
  const parsed = CmsLinkFieldValueSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function resolveCmsLinkValue(
  adapter: StorageAdapter,
  value: unknown,
  options: ResolveCmsLinkOptions = ResolveCmsLinkOptionsSchema.parse({}),
): Promise<ResolvedCmsLink | null> {
  const link = parseCmsLinkFieldValue(value);
  if (!link) {
    return null;
  }

  const parsedOptions = ResolveCmsLinkOptionsSchema.parse(options);
  const common = {
    ...(optionalTrimmed(link.label) ? { label: optionalTrimmed(link.label) } : {}),
    ...(link.openInNewTab ? { openInNewTab: true } : {}),
  };

  switch (link.type) {
    case "internal": {
      const url = optionalTrimmed(link.url);
      if (!url) {
        return null;
      }
      return ResolvedCmsLinkSchema.parse({
        href: url,
        ...common,
      });
    }
    case "page": {
      const href = await resolvePageLinkHref(adapter, link, parsedOptions.preview);
      if (!href) {
        return null;
      }
      return ResolvedCmsLinkSchema.parse({
        href,
        ...common,
      });
    }
    case "entry": {
      const href = await resolveEntryLinkHref(adapter, link, parsedOptions.preview);
      if (!href) {
        return null;
      }
      return ResolvedCmsLinkSchema.parse({
        href,
        ...common,
      });
    }
    case "email": {
      const raw = optionalTrimmed(link.url);
      if (!raw) {
        return null;
      }
      const href = raw.startsWith("mailto:") ? raw : `mailto:${raw}`;
      return ResolvedCmsLinkSchema.parse({
        href,
        ...common,
      });
    }
    case "phone": {
      const raw = optionalTrimmed(link.url);
      if (!raw) {
        return null;
      }
      const href = raw.startsWith("tel:") ? raw : `tel:${raw}`;
      return ResolvedCmsLinkSchema.parse({
        href,
        ...common,
      });
    }
    case "external":
    default: {
      const href = normalizeExternalUrl(link.url ?? "");
      if (!href) {
        return null;
      }
      return ResolvedCmsLinkSchema.parse({
        href,
        ...common,
      });
    }
  }
}

export async function resolveCmsLinkHref(
  adapter: StorageAdapter,
  value: unknown,
  options?: ResolveCmsLinkOptions,
): Promise<string | null> {
  const resolved = await resolveCmsLinkValue(adapter, value, options);
  return resolved?.href ?? null;
}

const LinkMaterializablePropSchema = z.enum(["href", "url"]);
type LinkMaterializableProp = z.infer<typeof LinkMaterializablePropSchema>;

function applyResolvedLinkToNodeProps(
  node: { props: Record<string, unknown> },
  propName: LinkMaterializableProp,
  resolved: ResolvedCmsLink,
): void {
  node.props[propName] = resolved.href;
  if (resolved.openInNewTab) {
    node.props.target = "_blank";
    node.props.rel = "noopener noreferrer";
  }
}

export async function materializeCmsLinkPropsOnNodes(
  nodes: readonly { props: Record<string, unknown>; children: readonly unknown[] }[],
  adapter: StorageAdapter,
  options: ResolveCmsLinkOptions = ResolveCmsLinkOptionsSchema.parse({}),
): Promise<void> {
  for (const node of nodes) {
    for (const propName of LinkMaterializablePropSchema.options) {
      const value = node.props[propName];
      const resolved = await resolveCmsLinkValue(adapter, value, options);
      if (resolved) {
        applyResolvedLinkToNodeProps(node, propName, resolved);
      }
    }

    const childNodes = node.children.filter(
      (child): child is { props: Record<string, unknown>; children: readonly unknown[] } =>
        typeof child === "object" && child !== null && "props" in child,
    );
    if (childNodes.length > 0) {
      await materializeCmsLinkPropsOnNodes(childNodes, adapter, options);
    }
  }
}
