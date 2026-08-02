import type { ComponentDSL, LayoutDSL, PageDSL } from "../../types/nodes";
import type { CanonicalSha256 } from "./hash";

export type RenderSurfaceKind = "page" | "layout" | "component";

export type RenderSurfaceSourceByKind = {
  page: PageDSL;
  layout: LayoutDSL;
  component: ComponentDSL;
};

export interface NormalizedRenderSurface<
  K extends RenderSurfaceKind = RenderSurfaceKind,
> {
  contractVersion: 1;
  kind: K;
  source: RenderSurfaceSourceByKind[K];
  sourceHash: CanonicalSha256;
}

export interface NormalizeEditableSurfaceOptions {
  freeze?: boolean;
}

export { normalizeEditableSurface } from "./normalizeEditableSurface";
