/**
 * Compatibility facade for the Render v2 canonical HTML compiler.
 *
 * New rendering code belongs under `rendering/canonical`. These exports remain
 * temporarily stable for editor previews, export, and downstream callers while
 * they move to the canonical document contract in later phases.
 */
import type { RuntimeLocals } from "../cloudflare/env";
import type {
  BreakpointDefinition,
  BuilderNode,
  ComponentDSL,
} from "../types/nodes";
import { DEFAULT_BREAKPOINTS } from "../types/nodes";
import type { IconRenderResources } from "../icons/iconRenderResources";
import {
  mergePageNodesIntoLayoutForRender,
  nodesToHtmlDocument,
  nodesToHtmlFragment,
  type HtmlRenderStyleMode,
  type NodeToHtmlDocumentOptions as CanonicalDocumentOptions,
} from "../rendering/canonical/renderDocumentHtml";

type ComponentDSLResolver = (
  id: string,
) => Promise<ComponentDSL | null | undefined>;

export interface NodeToHtmlDocumentOptions extends CanonicalDocumentOptions {
  /** Runtime bindings used only by compatibility wrappers during icon prepass. */
  iconLocals?: RuntimeLocals;
}

export {
  appendResponsiveStyles,
  collectNodeStylesheet,
  collectResponsiveStyles,
  createIconRenderResources,
  extractTextContent,
  mergePageNodesIntoLayoutForRender,
  nodesToHtmlDocument,
  nodesToHtmlFragment,
  nodesToHtmlFragmentWithStylesheet,
  nodesToHtmlWithLayout,
  resolvePublishedHtmlRenderStyleMode,
  type HtmlFragmentStylesheetPreview,
  type HtmlRenderStyleMode,
  type IconRenderResources,
} from "../rendering/canonical/renderDocumentHtml";

export async function nodesToHtmlFragmentAsync(
  nodes: BuilderNode[],
  getComponentDSL: ComponentDSLResolver,
  indent: number = 0,
  breakpoints: BreakpointDefinition[] = DEFAULT_BREAKPOINTS,
  styleMode: HtmlRenderStyleMode = "inline",
  iconResources?: IconRenderResources,
  iconLocals?: RuntimeLocals,
): Promise<string> {
  const { expandComponentReferencesServer } = await import("./nodeUtils");
  const expandedNodes = await expandComponentReferencesServer(
    nodes,
    getComponentDSL,
  );
  const resolvedIcons =
    iconResources ??
    (await (
      await import("../icons/resolveIconResources")
    ).resolveIconRenderResources(expandedNodes, { locals: iconLocals }));
  return nodesToHtmlFragment(
    expandedNodes,
    indent,
    breakpoints,
    styleMode,
    resolvedIcons,
  );
}

export async function nodesToHtmlDocumentAsync(
  nodes: BuilderNode[],
  getComponentDSL: ComponentDSLResolver,
  options?: NodeToHtmlDocumentOptions,
): Promise<string> {
  const { expandComponentReferencesServer } = await import("./nodeUtils");
  const expandedNodes = await expandComponentReferencesServer(
    nodes,
    getComponentDSL,
  );
  const iconResources =
    options?.iconResources ??
    (await (
      await import("../icons/resolveIconResources")
    ).resolveIconRenderResources(expandedNodes, {
      locals: options?.iconLocals,
    }));
  return nodesToHtmlDocument(expandedNodes, { ...options, iconResources });
}

export async function nodesToHtmlWithLayoutAsync(
  pageNodes: BuilderNode[],
  layoutNodes: BuilderNode[],
  getComponentDSL: ComponentDSLResolver,
  options?: NodeToHtmlDocumentOptions,
): Promise<string> {
  const { expandComponentReferencesServer } = await import("./nodeUtils");
  const [expandedPageNodes, expandedLayoutNodes] = await Promise.all([
    expandComponentReferencesServer(pageNodes, getComponentDSL),
    expandComponentReferencesServer(layoutNodes, getComponentDSL),
  ]);
  const mergedNodes = mergePageNodesIntoLayoutForRender(
    expandedPageNodes,
    expandedLayoutNodes,
    options?.layoutSlots,
  );
  const iconResources =
    options?.iconResources ??
    (await (
      await import("../icons/resolveIconResources")
    ).resolveIconRenderResources(mergedNodes, { locals: options?.iconLocals }));
  return nodesToHtmlDocument(mergedNodes, { ...options, iconResources });
}
