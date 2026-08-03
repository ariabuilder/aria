import type {
  BuilderNode,
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "../../types/nodes";
import type { CanonicalJsonValue } from "./stableJson";
import type { CanonicalSha256 } from "./hash";

export type RenderSurfaceKind = "page" | "layout" | "component";

export type RenderSurfaceCollection = "pages" | "layouts" | "components";

export function renderSurfaceKindForCollection(
  collection: RenderSurfaceCollection,
): RenderSurfaceKind {
  switch (collection) {
    case "pages":
      return "page";
    case "layouts":
      return "layout";
    case "components":
      return "component";
  }
}

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

export type RenderMode =
  | "edit"
  | "preview"
  | "public"
  | "snapshot"
  | "thumbnail"
  | "export";

export interface RenderRouteContext {
  path: string;
  locale?: string;
  params?: Readonly<Record<string, string>>;
}

export interface VersionedRenderRef {
  id: string;
  version?: string;
}

export interface RenderDependencyVersions {
  layout?: VersionedRenderRef;
  components?: Readonly<Record<string, string>>;
}

export interface RenderDependencyProvider {
  getLayout(ref: VersionedRenderRef): Promise<LayoutDSL | null>;
  getComponent(ref: VersionedRenderRef): Promise<ComponentDSL | null>;
}

export type RenderRegionRole =
  | "header"
  | "layout"
  | "page"
  | "footer"
  | "component-isolate";

export interface RenderRegionInput {
  id: string;
  role: RenderRegionRole;
  roots: readonly BuilderNode[];
}

export interface RenderManifestRecordInput {
  kind: string;
  id: string;
  value: CanonicalJsonValue;
}

export interface RenderDataResolution {
  regions: readonly RenderRegionInput[];
  records?: readonly RenderManifestRecordInput[];
}

export interface RenderDataProvider {
  resolveData(input: {
    regions: readonly RenderRegionInput[];
    mode: RenderMode;
    route: RenderRouteContext;
  }): Promise<RenderDataResolution>;
}

export interface RenderResourceResolution {
  regions: readonly RenderRegionInput[];
  records?: readonly RenderManifestRecordInput[];
}

export interface RenderResourceProvider {
  resolveResources(input: {
    regions: readonly RenderRegionInput[];
    mode: RenderMode;
    route: RenderRouteContext;
  }): Promise<RenderResourceResolution>;
}

export interface RenderStyleArtifactInput {
  id: string;
  revision: string;
  value: CanonicalJsonValue;
}

export interface RenderStyleArtifactProvider {
  resolveStyleArtifact(input: {
    mode: RenderMode;
  }): Promise<RenderStyleArtifactInput | null>;
}

export interface RenderSurfaceProviders {
  dependencies: RenderDependencyProvider;
  data?: RenderDataProvider;
  resources?: RenderResourceProvider;
  styles?: RenderStyleArtifactProvider;
}

export interface ResolveRenderSurfaceRequest<
  K extends RenderSurfaceKind = RenderSurfaceKind,
> {
  normalized: NormalizedRenderSurface<K>;
  mode: RenderMode;
  route: RenderRouteContext;
  dependencyVersions?: RenderDependencyVersions;
  providers: RenderSurfaceProviders;
  freeze?: boolean;
}

export interface RenderDependencyRecord {
  kind: "layout" | "component";
  id: string;
  version: string | null;
  sourceHash: CanonicalSha256;
}

export interface RenderDependencyManifest {
  records: readonly RenderDependencyRecord[];
  hash: CanonicalSha256;
}

export interface RenderManifestRecord {
  kind: string;
  id: string;
  hash: CanonicalSha256;
}

export interface RenderDataManifest {
  records: readonly RenderManifestRecord[];
  hash: CanonicalSha256;
}

export interface RenderResourceManifest {
  records: readonly RenderManifestRecord[];
  hash: CanonicalSha256;
}

export interface RenderStyleArtifactManifest {
  id: string | null;
  revision: string | null;
  hash: CanonicalSha256;
}

export interface ResolvedRenderNode extends BuilderNode {
  runtimeId: string;
  sourceNodeId: string;
  children: ResolvedRenderNode[];
}

export interface ResolvedRenderRegion {
  id: string;
  role: RenderRegionRole;
  roots: readonly ResolvedRenderNode[];
}

export interface RenderDiagnostic {
  code: string;
  severity: "info" | "warning";
  message: string;
}

export interface ResolvedRenderSurface<
  K extends RenderSurfaceKind = RenderSurfaceKind,
> {
  contractVersion: 1;
  normalized: NormalizedRenderSurface<K>;
  mode: RenderMode;
  renderInputHash: CanonicalSha256;
  regions: readonly ResolvedRenderRegion[];
  dependencies: RenderDependencyManifest;
  resources: RenderResourceManifest;
  data: RenderDataManifest;
  styleArtifact: RenderStyleArtifactManifest;
  diagnostics: readonly RenderDiagnostic[];
}

export { normalizeEditableSurface } from "./normalizeEditableSurface";
export { resolveRenderSurface } from "./resolveRenderSurface";
