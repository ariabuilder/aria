import type { BuilderNode } from "../../types/nodes";
import {
  createIconRenderResources,
  type IconRenderResources,
} from "../../icons/iconRenderResources";
import {
  nodesToHtmlDocument,
  nodesToHtmlFragment,
  resolvePublishedHtmlRenderStyleMode,
  type NodeToHtmlDocumentOptions,
} from "./renderDocumentHtml";
import { collectRuntimeManifest } from "./collectRuntimeManifest";
import { compileCanonicalNodes } from "./compileCanonicalNode";
import type {
  RenderDocumentRegionV1,
  RenderDocumentV1,
  ResolvedRenderSurface,
} from "./contract";
import { hashCanonicalJson, sha256Text } from "./hash";

export interface CompileRenderDocumentOptions {
  surface: ResolvedRenderSurface;
  document: NodeToHtmlDocumentOptions;
  cspHeaderValue: string;
  iconResources?: IconRenderResources;
  freeze?: boolean;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function extractHeadHtml(html: string): string {
  return html.match(/<head>([\s\S]*?)<\/head>/iu)?.[1]?.trim() ?? "";
}

function extractStylesheet(html: string): string {
  return Array.from(html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/giu))
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");
}

function freshIconResources(
  resources: IconRenderResources | undefined,
): IconRenderResources | undefined {
  return resources
    ? createIconRenderResources(
        resources.icons,
        resources.inlineSvgs,
        resources.metrics,
      )
    : undefined;
}

/** Compile a resolved surface into the only authoritative public HTML document. */
export async function compileRenderDocument(
  options: CompileRenderDocumentOptions,
): Promise<RenderDocumentV1> {
  const roots: BuilderNode[] = options.surface.regions.flatMap((region) => [
    ...region.roots,
  ]);
  const documentOptions: NodeToHtmlDocumentOptions = {
    ...options.document,
    iconResources: freshIconResources(
      options.iconResources ?? options.document.iconResources,
    ),
  };
  const styleMode = resolvePublishedHtmlRenderStyleMode(documentOptions);
  const html = nodesToHtmlDocument(roots, documentOptions);
  const regionIconResources = freshIconResources(
    options.iconResources ?? options.document.iconResources,
  );
  const regions: RenderDocumentRegionV1[] = options.surface.regions.map(
    (region) => ({
      id: region.id,
      role: region.role,
      html: nodesToHtmlFragment(
        [...region.roots],
        1,
        documentOptions.breakpoints,
        styleMode,
        regionIconResources,
      ),
    }),
  );
  const headHtml = extractHeadHtml(html);
  const stylesheet = extractStylesheet(html);
  const unhashed = {
    contractVersion: 1,
    kind: options.surface.normalized.kind,
    renderInputHash: options.surface.renderInputHash,
    mode: options.surface.mode,
    document: {
      lang: documentOptions.lang ?? "en",
      dir: documentOptions.dir ?? null,
      title: documentOptions.seo?.title ?? documentOptions.title ?? "",
      description:
        documentOptions.seo?.description ?? documentOptions.description ?? "",
      bodyClass: documentOptions.bodyClass ?? "",
    },
    head: headHtml ? [{ type: "raw" as const, value: headHtml }] : [],
    roots: compileCanonicalNodes(roots, {
      breakpoints: documentOptions.breakpoints,
      styleMode,
      iconResources: freshIconResources(
        options.iconResources ?? options.document.iconResources,
      ),
    }),
    styles: {
      css: stylesheet,
      hash: await sha256Text(stylesheet),
    },
    html,
    regions,
    runtime: collectRuntimeManifest(roots),
    csp: { headerValue: options.cspHeaderValue },
    resources: options.surface.resources,
    dependencies: options.surface.dependencies,
    revision: {
      sourceHash: options.surface.normalized.sourceHash,
      renderInputHash: options.surface.renderInputHash,
    },
    diagnostics: options.surface.diagnostics,
  } as const;
  const result: RenderDocumentV1 = {
    ...unhashed,
    documentHash: await hashCanonicalJson(unhashed),
  };

  return options.freeze === false ? result : deepFreeze(result);
}
