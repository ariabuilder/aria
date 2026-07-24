import {
  buildGeneratedDocumentCss,
  buildStageRenderStylesData,
  buildStoredRenderStylesData,
} from "./styles";
import { getDesignSystem } from "./_designSystemPersist";
import type { ComponentSnapshotInput } from "../lib/rendering/componentSnapshots";
import { resolveBreakpointDefinitionsFromDesignSystem } from "../lib/styles/universalDesignSystem";
import type { BuilderNode } from "../lib/types/nodes";
import type { StorageAdapter } from "../lib/storage/adapter";

async function resolveComponentRenderStyles(
  adapter: StorageAdapter,
): Promise<ComponentSnapshotInput["renderStyles"]> {
  const designSystem = await getDesignSystem(adapter);
  const siteSettings = await adapter.getSiteSettings();
  const generatedDocumentCss = await buildGeneratedDocumentCss(
    adapter,
    resolveBreakpointDefinitionsFromDesignSystem(designSystem),
  );
  const storedRenderStyles = buildStoredRenderStylesData(
    designSystem,
    siteSettings,
  );
  const renderStyles = buildStageRenderStylesData({
    storedRenderStyles,
    generatedDocumentCss,
  });

  return {
    globalCSS: renderStyles.globalCSS,
    baseCSS: renderStyles.baseCSS,
    utilityCSS: renderStyles.utilityCSS,
  };
}

export async function buildComponentSnapshotInput(
  componentId: string,
  adapter: StorageAdapter,
): Promise<ComponentSnapshotInput | null> {
  const component = await adapter.getComponentDSL(componentId);
  if (!component) {
    return null;
  }

  const siteSettings = await adapter.getSiteSettings();
  const renderStyles = await resolveComponentRenderStyles(adapter);
  const pageCssVariables =
    component.settings &&
    typeof component.settings === "object" &&
    "cssVariables" in component.settings &&
    component.settings.cssVariables &&
    typeof component.settings.cssVariables === "object"
      ? (component.settings.cssVariables as Record<string, string>)
      : {};

  return {
    componentId: component.id,
    nodes: (component.nodes || []) as BuilderNode[],
    settings: siteSettings,
    renderStyles,
    pageCssVariables,
    componentUpdatedAt: component.updatedAt ?? null,
  };
}
