import { z } from "zod";

import type { BuilderNode } from "../types/nodes";
import {
  getSiteSettingsUtilityEngine,
  resolveSiteStyleRevision,
  type SiteSettings,
  type StorageAdapter,
} from "../storage/adapter";
import { nodesToHtmlFragment } from "../blocks/nodesToHtml";
import { getUnoCSSTags } from "../styles/user-uno";
import { DEFAULT_BREAKPOINTS } from "../types/nodes";
import { COMPONENT_PREVIEW_ROOT_ATTR } from "../schemas/componentPreview";
import {
  COMPONENT_ISOLATE_STYLES,
  buildComponentIsolateBodyStyle,
} from "./componentPreviewStyles";
import { DEFAULT_DESKTOP_CANVAS_WIDTH } from "../styles/responsiveBreakpoints";
import type { RuntimeLocals } from "../cloudflare/env";
import type { IconRenderResources } from "../icons/iconRenderResources";
import { resolveIconRenderResources } from "../icons/resolveIconResources";
import { ICON_SNAPSHOT_VERSION } from "../icons/generatedIconSnapshot";

const COMPONENT_SNAPSHOT_VERSION = "1";
const COMPONENT_SNAPSHOT_MARKER = `<!-- aria-component-snapshot:v${COMPONENT_SNAPSHOT_VERSION} -->`;
const COMPONENT_SNAPSHOT_STYLE_MARKER_PREFIX =
  "<!-- aria-component-snapshot:style-revision:";
const COMPONENT_SNAPSHOT_ICON_MARKER =
  `<!-- aria-component-snapshot:icon-snapshot:${ICON_SNAPSHOT_VERSION} -->`;
const COMPONENT_SNAPSHOT_COMPONENT_UPDATED_MARKER_PREFIX =
  "<!-- aria-component-snapshot:component-updated:";

const ComponentSnapshotInputSchema = z.object({
  componentId: z.string().trim().min(1),
  nodes: z.array(z.custom<BuilderNode>((value) => typeof value === "object")),
  settings: z.custom<SiteSettings | null>(
    (value) => value === null || typeof value === "object",
  ),
  renderStyles: z.object({
    globalCSS: z.string(),
    baseCSS: z.string(),
    utilityCSS: z.string(),
  }),
  pageCssVariables: z.record(z.string(), z.string()).default({}),
  componentUpdatedAt: z.string().nullable().optional(),
});

export type ComponentSnapshotInput = z.infer<typeof ComponentSnapshotInputSchema>;

function buildComponentSnapshotStyleRevisionMarker(styleRevision: string): string {
  const parsedStyleRevision = z.string().trim().min(1).parse(styleRevision);
  return `${COMPONENT_SNAPSHOT_STYLE_MARKER_PREFIX}${parsedStyleRevision} -->`;
}

function getComponentSnapshotStyleRevision(html: string): string | null {
  const match = html.match(
    /<!-- aria-component-snapshot:style-revision:([^\s]+) -->/,
  );

  return typeof match?.[1] === "string" && match[1].trim().length > 0
    ? match[1].trim()
    : null;
}

function buildComponentSnapshotUpdatedAtMarker(updatedAt?: string | null): string {
  const parsedUpdatedAt = z.string().trim().min(1).nullable().optional().parse(updatedAt);
  return parsedUpdatedAt
    ? `${COMPONENT_SNAPSHOT_COMPONENT_UPDATED_MARKER_PREFIX}${parsedUpdatedAt} -->`
    : "";
}

function getComponentSnapshotUpdatedAt(html: string): string | null {
  const match = html.match(
    /<!-- aria-component-snapshot:component-updated:([^\s]+) -->/,
  );

  return typeof match?.[1] === "string" && match[1].trim().length > 0
    ? match[1].trim()
    : null;
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cssVariablesToString(variables: Record<string, string> = {}): string {
  const entries = Object.entries(variables).filter(([, value]) => value != null);
  if (entries.length === 0) return "";

  const declarations = entries
    .map(([key, value]) => {
      const varName = key.startsWith("--") ? key : `--${key}`;
      return `${varName}: ${String(value)};`;
    })
    .join("\n");

  return `:root {\n${declarations}\n}`;
}

const THEME_STYLES = `
  :root {
    color-scheme: light dark;
  }
  body {
    margin: 0;
    font-family: system-ui, sans-serif;
  }
`;

function getSnapshotStorageSlug(componentId: string): string {
  return `component:${z.string().trim().min(1).parse(componentId)}`;
}

export function buildComponentSnapshotAdminUrl(
  componentId: string,
  updatedAt?: string | null,
  styleRevision?: string | null,
): string {
  const safeId = encodeURIComponent(z.string().trim().min(1).parse(componentId));
  const params = new URLSearchParams();

  if (typeof updatedAt === "string" && updatedAt.trim().length > 0) {
    params.set("v", updatedAt);
  }

  if (typeof styleRevision === "string" && styleRevision.trim().length > 0) {
    params.set("sr", styleRevision.trim());
  }

  const query = params.toString();
  return query
    ? `/admin/api/component-snapshots/${safeId}?${query}`
    : `/admin/api/component-snapshots/${safeId}`;
}

export function renderComponentIsolateSnapshotHtml(
  input: ComponentSnapshotInput,
  iconResources?: IconRenderResources,
): string {
  const parsed = ComponentSnapshotInputSchema.parse(input);
  const bodyContent = nodesToHtmlFragment(
    parsed.nodes,
    0,
    DEFAULT_BREAKPOINTS,
    "stylesheet",
    iconResources,
  );

  const settings = parsed.settings;
  const framework = getSiteSettingsUtilityEngine(settings);

  const frameworkAssets =
    framework === "unocss"
      ? getUnoCSSTags(settings ?? undefined)
      : framework === "custom" && settings?.customFrameworkURL
        ? `<link rel="stylesheet" href="${escapeHtml(settings.customFrameworkURL)}">`
        : "";

  const pageVariables = cssVariablesToString(parsed.pageCssVariables);
  const compiledStyles = parsed.renderStyles.globalCSS?.trim()
    ? parsed.renderStyles.globalCSS
    : [parsed.renderStyles.baseCSS, parsed.renderStyles.utilityCSS]
        .filter(Boolean)
        .join("\n\n");

  const frameWidth = DEFAULT_DESKTOP_CANVAS_WIDTH;

  return stripComponentPreviewAutoplayMedia(`<!DOCTYPE html>
<html lang="en" class="component-isolate-preview">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Component Preview</title>
  <style>${THEME_STYLES}</style>
  <style>${COMPONENT_ISOLATE_STYLES}</style>
  <style>${compiledStyles}</style>
  <style>${pageVariables}</style>
  ${frameworkAssets}
</head>
<body class="preview-mode component-isolate-preview" style="${buildComponentIsolateBodyStyle(frameWidth)}">
  <div ${COMPONENT_PREVIEW_ROOT_ATTR}>${bodyContent}</div>
</body>
</html>`);
}

export async function renderComponentSnapshotHtml(
  input: ComponentSnapshotInput,
  adapter: StorageAdapter,
  options: { locals?: RuntimeLocals } = {},
): Promise<string> {
  const parsed = ComponentSnapshotInputSchema.parse(input);
  const siteSettings = await adapter.getSiteSettings();
  const styleRevision = resolveSiteStyleRevision(siteSettings);
  const iconResources = await resolveIconRenderResources(parsed.nodes, {
    locals: options.locals,
  });
  const rendered = renderComponentIsolateSnapshotHtml(parsed, iconResources);
  const updatedAtMarker = buildComponentSnapshotUpdatedAtMarker(
    parsed.componentUpdatedAt,
  );
  const markers = [
    COMPONENT_SNAPSHOT_MARKER,
    COMPONENT_SNAPSHOT_ICON_MARKER,
    buildComponentSnapshotStyleRevisionMarker(styleRevision),
    updatedAtMarker,
  ].filter(Boolean);

  return `${markers.join("\n")}\n${rendered}`;
}

export async function saveComponentSnapshot(
  input: ComponentSnapshotInput,
  adapter: StorageAdapter,
  options: { locals?: RuntimeLocals } = {},
): Promise<void> {
  const parsed = ComponentSnapshotInputSchema.parse(input);
  const html = await renderComponentSnapshotHtml(parsed, adapter, options);
  await adapter.saveSnapshot(getSnapshotStorageSlug(parsed.componentId), html);
}

export async function getComponentSnapshotHtml(
  componentId: string,
  adapter: StorageAdapter,
): Promise<string | null> {
  return await adapter.getSnapshot(getSnapshotStorageSlug(componentId));
}

/** Drop storage markers so iframe srcdoc parsing starts at the document root. */
export function extractComponentSnapshotRenderableHtml(html: string): string {
  const doctypeIndex = html.search(/<!DOCTYPE\s+html/i);
  if (doctypeIndex >= 0) {
    return html.slice(doctypeIndex);
  }

  const htmlIndex = html.search(/<html[\s>]/i);
  if (htmlIndex >= 0) {
    return html.slice(htmlIndex);
  }

  return html;
}

export function componentSnapshotIncludesPreviewRoot(html: string): boolean {
  return /<div[^>]*\bdata-aria-component-preview-root\b/i.test(html);
}

/** Snapshot HTML prepared for hidden iframe thumbnail capture. */
export function prepareComponentSnapshotForThumbnailCapture(html: string): string {
  return stripComponentSnapshotRuntimeAssets(
    extractComponentSnapshotRenderableHtml(html),
  );
}

/** Strip runtime scripts and cross-origin fonts for thumbnail capture. */
export function stripComponentSnapshotRuntimeAssets(html: string): string {
  return stripComponentPreviewAutoplayMedia(html)
    .replace(
      /\s*<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@unocss\/runtime\/[^"]+"><\/script>/gi,
      "",
    )
    .replace(
      /\s*<script>\s*window\.__unocss(?:_runtime)?\s*=[\s\S]*?<\/script>/gi,
      "",
    )
    .replace(
      /@import\s+url\(["']?https:\/\/fonts\.(?:googleapis|gstatic)\.com[^)]+\)["']?\s*;?/gi,
      "",
    )
    .replace(
      /\s*<link[^>]+href=["']https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"']*["'][^>]*>/gi,
      "",
    )
    .replace(
      /\s*<link[^>]+rel=["']preconnect["'][^>]+href=["']https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"']*["'][^>]*>/gi,
      "",
    );
}

export function stripComponentPreviewAutoplayMedia(html: string): string {
  return html
    .replace(
      /(<video\b[^>]*?)\s+autoplay(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi,
      "$1",
    )
    .replace(
      /(<video\b[^>]*?)\s+preload=(?:"auto"|'auto'|auto)([^>]*>)/gi,
      '$1 preload="metadata"$2',
    );
}

export function hasCurrentComponentSnapshotVersion(
  html: string,
  currentStyleRevision?: string,
  currentComponentUpdatedAt?: string | null,
): boolean {
  if (!html.includes(COMPONENT_SNAPSHOT_MARKER)) {
    return false;
  }

  if (!html.includes(COMPONENT_SNAPSHOT_ICON_MARKER)) {
    return false;
  }

  if (!componentSnapshotIncludesPreviewRoot(html)) {
    return false;
  }

  if (
    typeof currentComponentUpdatedAt === "string" &&
    currentComponentUpdatedAt.trim().length > 0 &&
    getComponentSnapshotUpdatedAt(html) !== currentComponentUpdatedAt.trim()
  ) {
    return false;
  }

  if (
    typeof currentStyleRevision !== "string" ||
    currentStyleRevision.trim().length === 0
  ) {
    return true;
  }

  return (
    getComponentSnapshotStyleRevision(html) === currentStyleRevision.trim()
  );
}
