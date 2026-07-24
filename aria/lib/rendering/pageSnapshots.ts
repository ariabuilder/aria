import { z } from "zod";

import {
  PageSnapshotStageSchema,
  type PageSnapshotStage,
} from "./pageSnapshotStages";
import {
  resolveSiteStyleRevision,
  type StorageAdapter,
} from "../storage/adapter";
import type { PageDSL } from "../types/nodes";
import { renderPageDslToHtml } from "./renderPageDslToHtml";
import type { RuntimeLocals } from "../cloudflare/env";
import { ICON_SNAPSHOT_VERSION } from "../icons/generatedIconSnapshot";

export { PageSnapshotStageSchema, type PageSnapshotStage };

export const PageSnapshotInputSchema = z.object({
  page: z.custom<PageDSL>((value): value is PageDSL => {
    return typeof value === "object" && value !== null;
  }),
  stage: PageSnapshotStageSchema,
});

export type PageSnapshotInput = z.infer<typeof PageSnapshotInputSchema>;

const PAGE_SNAPSHOT_VERSION = "4";
const PAGE_SNAPSHOT_MARKER = `<!-- aria-page-snapshot:v${PAGE_SNAPSHOT_VERSION} -->`;
const PAGE_SNAPSHOT_STYLE_MARKER_PREFIX =
  "<!-- aria-page-snapshot:style-revision:";
const PAGE_SNAPSHOT_ICON_MARKER = `<!-- aria-page-snapshot:icon-snapshot:${ICON_SNAPSHOT_VERSION} -->`;

function buildPageSnapshotStyleRevisionMarker(styleRevision: string): string {
  const parsedStyleRevision = z.string().trim().min(1).parse(styleRevision);
  return `${PAGE_SNAPSHOT_STYLE_MARKER_PREFIX}${parsedStyleRevision} -->`;
}

function getPageSnapshotStyleRevision(html: string): string | null {
  const match = html.match(
    /<!-- aria-page-snapshot:style-revision:([^\s]+) -->/,
  );

  return typeof match?.[1] === "string" && match[1].trim().length > 0
    ? match[1].trim()
    : null;
}

function normalizeSnapshotSlug(slug: string): string {
  const parsedSlug = z.string().trim().min(1).parse(slug);
  return parsedSlug.replace(/^(draft|published):/, "");
}

export interface PagePreviewStageInput {
  status?: string | null;
  isModifiedSincePublish?: boolean;
}

/** Draft artifacts for unpublished edits; published only when live matches draft. */
export function resolvePagePreviewStage(
  page: PagePreviewStageInput,
): PageSnapshotStage {
  if (page.status === "published" && !page.isModifiedSincePublish) {
    return "published";
  }

  return "draft";
}

export function buildPageSnapshotAdminUrl(
  slug: string,
  stage: PageSnapshotStage,
  updatedAt?: string | null,
  styleRevision?: string | null,
): string {
  const safeSlug = encodeURIComponent(normalizeSnapshotSlug(slug));
  const parsedStage = PageSnapshotStageSchema.parse(stage);
  const params = new URLSearchParams({ stage: parsedStage });

  if (typeof updatedAt === "string" && updatedAt.trim().length > 0) {
    params.set("v", updatedAt);
  }

  if (typeof styleRevision === "string" && styleRevision.trim().length > 0) {
    params.set("sr", styleRevision.trim());
  }

  return `/admin/api/page-snapshots/${safeSlug}?${params.toString()}`;
}

function getLegacySnapshotStorageSlug(
  slug: string,
  stage: PageSnapshotStage,
): string {
  return `${stage}:${normalizeSnapshotSlug(slug)}`;
}

export async function renderPageSnapshotHtml(
  input: PageSnapshotInput,
  adapter: StorageAdapter,
  options: { locals?: RuntimeLocals } = {},
): Promise<string> {
  const parsed = PageSnapshotInputSchema.parse(input);
  const siteSettings = await adapter.getSiteSettings();
  const styleRevision = resolveSiteStyleRevision(siteSettings);
  const rendered = await renderPageDslToHtml({
    page: parsed.page,
    adapter,
    inlineCompiledCss: true,
    cms: { preview: true },
    locals: options.locals,
  });

  return `${PAGE_SNAPSHOT_MARKER}\n${PAGE_SNAPSHOT_ICON_MARKER}\n${buildPageSnapshotStyleRevisionMarker(styleRevision)}\n${rendered.html}`;
}

export async function savePageSnapshot(
  input: PageSnapshotInput,
  adapter: StorageAdapter,
  options: { locals?: RuntimeLocals } = {},
): Promise<void> {
  const parsed = PageSnapshotInputSchema.parse(input);
  const html = await renderPageSnapshotHtml(parsed, adapter, options);
  const slug = normalizeSnapshotSlug(parsed.page.slug);

  await adapter.saveSnapshot(slug, html, parsed.stage);
}

export async function deletePageSnapshots(
  slug: string,
  adapter: StorageAdapter,
): Promise<void> {
  const parsedSlug = normalizeSnapshotSlug(slug);
  await Promise.all([
    adapter.deleteSnapshot(parsedSlug, "draft"),
    adapter.deleteSnapshot(parsedSlug, "published"),
    adapter.deleteSnapshot(
      getLegacySnapshotStorageSlug(parsedSlug, "draft"),
      "draft",
    ),
    adapter.deleteSnapshot(
      getLegacySnapshotStorageSlug(parsedSlug, "published"),
      "published",
    ),
  ]);
}

export async function getPageSnapshotHtml(
  slug: string,
  stage: PageSnapshotStage,
  adapter: StorageAdapter,
): Promise<string | null> {
  const parsedSlug = normalizeSnapshotSlug(slug);
  const parsedStage = PageSnapshotStageSchema.parse(stage);
  const canonical = await adapter.getSnapshot(parsedSlug, parsedStage);
  if (canonical) {
    return canonical;
  }

  const legacySlug = getLegacySnapshotStorageSlug(parsedSlug, parsedStage);
  const legacy = await adapter.getSnapshot(legacySlug, parsedStage);
  if (!legacy) {
    return null;
  }

  await adapter.saveSnapshot(parsedSlug, legacy, parsedStage);
  await adapter.deleteSnapshot(legacySlug, parsedStage);
  return legacy;
}

export function hasCurrentPageSnapshotVersion(
  html: string,
  currentStyleRevision?: string,
): boolean {
  if (!html.includes(PAGE_SNAPSHOT_MARKER)) {
    return false;
  }

  if (!html.includes(PAGE_SNAPSHOT_ICON_MARKER)) {
    return false;
  }

  if (
    typeof currentStyleRevision !== "string" ||
    currentStyleRevision.trim().length === 0
  ) {
    return true;
  }

  return getPageSnapshotStyleRevision(html) === currentStyleRevision.trim();
}
