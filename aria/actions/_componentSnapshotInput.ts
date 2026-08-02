import {
  buildGeneratedDocumentStyleBands,
  buildStageRenderStylesData,
  buildStoredRenderStylesData,
} from "./styles";
import { getDesignSystem } from "./_designSystemPersist";
import type { ComponentSnapshotInput } from "../lib/rendering/componentSnapshots";
import { resolveBreakpointDefinitionsFromDesignSystem } from "../lib/styles/universalDesignSystem";
import type { BuilderNode } from "../lib/types/nodes";
import type { StorageAdapter } from "../lib/storage/adapter";
import {
  buildRendererBaseStyleFragment,
  collectRendererStyleRequirements,
} from "../lib/rendering/canonical";

type ComponentSnapshotStorageAdapter = Pick<
  StorageAdapter,
  | "getComponentDSL"
  | "getSiteSettings"
  | "getDesignSystem"
  | "listPagesDSL"
  | "listLayoutsDSL"
  | "listComponentsDSL"
  | "getPageDSL"
  | "getLayoutDSL"
>;

async function resolveComponentRenderStyles(
  adapter: ComponentSnapshotStorageAdapter,
  rendererNodes: readonly BuilderNode[],
): Promise<ComponentSnapshotInput["renderStyles"]> {
  const designSystem = await getDesignSystem(adapter);
  const siteSettings = await adapter.getSiteSettings();
  const generatedStyleBands = await buildGeneratedDocumentStyleBands(
    adapter,
    resolveBreakpointDefinitionsFromDesignSystem(designSystem),
  );
  const storedRenderStyles = buildStoredRenderStylesData(
    designSystem,
    siteSettings,
  );
  const renderStyles = buildStageRenderStylesData({
    storedRenderStyles,
    generatedDocumentCss: generatedStyleBands.generatedDocumentCss,
    rendererBaseFragment: await buildRendererBaseStyleFragment(
      collectRendererStyleRequirements(rendererNodes),
    ),
  });

  return {
    globalCSS: renderStyles.globalCSS,
    baseCSS: renderStyles.baseCSS,
    utilityCSS: renderStyles.utilityCSS,
  };
}

export async function buildComponentSnapshotInput(
  componentId: string,
  adapter: ComponentSnapshotStorageAdapter,
): Promise<ComponentSnapshotInput | null> {
  const component = await adapter.getComponentDSL(componentId);
  if (!component) {
    return null;
  }

  const siteSettings = await adapter.getSiteSettings();
  const componentNodes = component.nodes ?? [];
  const componentSlotDefaultNodes =
    component.slots?.flatMap((slot) => slot.defaultContent ?? []) ?? [];
  const renderStyles = await resolveComponentRenderStyles(adapter, [
    ...componentNodes,
    ...componentSlotDefaultNodes,
  ]);
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
    nodes: componentNodes,
    settings: siteSettings,
    renderStyles,
    pageCssVariables,
    componentUpdatedAt: component.updatedAt ?? null,
  };
}
