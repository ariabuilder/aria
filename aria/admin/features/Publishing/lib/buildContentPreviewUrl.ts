import { z } from "zod";
import { ENTRY_STATUSES } from "../../../../lib/cms/constants";
import {
  validateCmsUrlPattern,
} from "../../../../lib/cms/routing";
import { buildCmsEntryPublicPath } from "../../../../lib/cms/publicPaths";
import type { AriaCollection } from "../../../../lib/cms/schemas";

const PreviewStatusSchema = z.enum(ENTRY_STATUSES);

export const CmsEntryPreviewInputSchema = z
  .object({
    collection: z.custom<AriaCollection>((value) => value != null),
    slug: z.string().trim().min(1),
    status: PreviewStatusSchema,
  })
  .strict();

export const PagePreviewInputSchema = z
  .object({
    slug: z.string().trim().min(1),
    status: PreviewStatusSchema,
  })
  .strict();

export const ContentPreviewInputSchema = z.discriminatedUnion("kind", [
  CmsEntryPreviewInputSchema.extend({ kind: z.literal("cms_entry") }),
  PagePreviewInputSchema.extend({ kind: z.literal("page") }),
]);

export type CmsEntryPreviewInput = z.infer<typeof CmsEntryPreviewInputSchema>;
export type PagePreviewInput = z.infer<typeof PagePreviewInputSchema>;
export type ContentPreviewInput = z.infer<typeof ContentPreviewInputSchema>;

function withPreviewQuery(
  pathname: string,
  status: z.infer<typeof PreviewStatusSchema>,
): string {
  if (status === "published" || status === "archived") {
    return pathname;
  }

  const url = new URL(pathname, "https://preview.local");
  url.searchParams.set("preview", "1");
  return `${url.pathname}${url.search}`;
}

export function buildCmsEntryPreviewUrl(
  input: CmsEntryPreviewInput,
): string | null {
  const parsed = CmsEntryPreviewInputSchema.parse(input);
  const urlPattern = parsed.collection.urlPattern;
  const templatePageId = parsed.collection.templatePageId;

  if (!urlPattern || !templatePageId) {
    return null;
  }

  const validation = validateCmsUrlPattern(urlPattern);
  if (!validation.valid) {
    return null;
  }

  const pathname = buildCmsEntryPublicPath(urlPattern, parsed.slug);
  if (!pathname) {
    return null;
  }

  return withPreviewQuery(pathname, parsed.status);
}

export function buildPagePreviewUrl(input: PagePreviewInput): string {
  const parsed = PagePreviewInputSchema.parse(input);
  const pathname = parsed.slug === "index" ? "/" : `/${parsed.slug}`;
  return withPreviewQuery(pathname, parsed.status);
}

export function buildContentPreviewUrl(input: ContentPreviewInput): string | null {
  const parsed = ContentPreviewInputSchema.safeParse(input);
  if (!parsed.success) {
    return null;
  }

  if (parsed.data.kind === "cms_entry") {
    return buildCmsEntryPreviewUrl({
      collection: parsed.data.collection,
      slug: parsed.data.slug,
      status: parsed.data.status,
    });
  }

  return buildPagePreviewUrl({
    slug: parsed.data.slug,
    status: parsed.data.status,
  });
}

function previewInputValidationReason(
  error: z.ZodError,
  input: ContentPreviewInput,
): string {
  const slugIssue = error.issues.find((issue) => issue.path.at(-1) === "slug");
  if (slugIssue) {
    return input.kind === "page" ? "Missing page slug." : "Missing entry slug.";
  }

  return "Preview unavailable.";
}

export function getPreviewDisabledReason(
  input: ContentPreviewInput,
): string | null {
  const parsed = ContentPreviewInputSchema.safeParse(input);
  if (!parsed.success) {
    return previewInputValidationReason(parsed.error, input);
  }

  const data = parsed.data;

  if (data.kind === "page") {
    return null;
  }

  if (!data.collection.urlPattern) {
    return "Set a URL pattern in collection settings to enable preview.";
  }

  if (!data.collection.templatePageId) {
    return "Set a template page in collection settings to enable preview.";
  }

  const validation = validateCmsUrlPattern(data.collection.urlPattern);
  if (!validation.valid) {
    return validation.message ?? "Collection URL pattern is invalid.";
  }

  return null;
}
