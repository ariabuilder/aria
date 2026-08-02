import { getComponentReferenceId } from "../../blocks/componentReference";
import type { BuilderNode, ComponentDSL, LayoutDSL } from "../../types/nodes";
import type {
  NormalizedRenderSurface,
  RenderDependencyRecord,
  RenderManifestRecord,
  RenderManifestRecordInput,
  RenderRegionInput,
  RenderStyleArtifactManifest,
  RenderSurfaceKind,
  ResolveRenderSurfaceRequest,
  ResolvedRenderNode,
  ResolvedRenderRegion,
  ResolvedRenderSurface,
  VersionedRenderRef,
} from "./contract";
import {
  RenderContractError,
  createRenderFailure,
  translateRenderFailure,
} from "./errors";
import { hashCanonicalJson } from "./hash";
import { normalizeEditableSurface } from "./normalizeEditableSurface";
import { resolveLayoutSurfaceRoots } from "./resolveLayoutSlots";
import { parseCanonicalJsonValue } from "./stableJson";

type DependencyState = {
  records: Map<string, RenderDependencyRecord>;
  components: Map<string, NormalizedRenderSurface<"component">>;
  visiting: Set<string>;
};

function dependencyKey(
  kind: "layout" | "component",
  ref: VersionedRenderRef,
): string {
  return `${kind}:${ref.id}@${ref.version ?? "current"}`;
}

function dependencyError(
  code: "RENDER_DEPENDENCY_MISSING" | "RENDER_DEPENDENCY_CYCLE",
  kind: "layout" | "component",
  ref: VersionedRenderRef,
): RenderContractError {
  return new RenderContractError(
    createRenderFailure(code, {
      dependencyKind: kind,
      dependencyId: ref.id,
      dependencyVersion: ref.version ?? null,
    }),
  );
}

function cloneNode(node: BuilderNode, children: BuilderNode[]): BuilderNode {
  return { ...node, children };
}

function componentWrapper(
  instance: BuilderNode,
  componentId: string,
  children: BuilderNode[],
): BuilderNode {
  return {
    ...instance,
    type: "Container",
    props: {
      ...instance.props,
      "data-component-ref": componentId,
    },
    children,
  };
}

function resolveComponentRoots(
  component: ComponentDSL,
  instanceChildren: readonly BuilderNode[] = [],
): BuilderNode[] {
  if (!component.slots?.length) return component.nodes;
  return resolveLayoutSurfaceRoots(instanceChildren, {
    id: component.id,
    name: component.name,
    nodes: component.nodes,
    slots: component.slots,
  });
}

async function loadComponent(
  request: ResolveRenderSurfaceRequest,
  ref: VersionedRenderRef,
  state: DependencyState,
): Promise<NormalizedRenderSurface<"component">> {
  const key = dependencyKey("component", ref);
  const cached = state.components.get(key);
  if (cached) return cached;

  let source: ComponentDSL | null;
  try {
    source = await request.providers.dependencies.getComponent(ref);
  } catch (error) {
    throw translateRenderFailure(error, "RENDER_DEPENDENCY_MISSING", {
      dependencyKind: "component",
      dependencyId: ref.id,
      dependencyVersion: ref.version ?? null,
    });
  }
  if (!source)
    throw dependencyError("RENDER_DEPENDENCY_MISSING", "component", ref);

  const normalized = await normalizeEditableSurface(
    { kind: "component", source },
    { freeze: true },
  );
  state.components.set(key, normalized);
  state.records.set(key, {
    kind: "component",
    id: ref.id,
    version: ref.version ?? source.version ?? null,
    sourceHash: normalized.sourceHash,
  });
  return normalized;
}

async function expandNodes(
  nodes: readonly BuilderNode[],
  request: ResolveRenderSurfaceRequest,
  state: DependencyState,
): Promise<BuilderNode[]> {
  const expanded: BuilderNode[] = [];

  for (const node of nodes) {
    const componentId = getComponentReferenceId(node);
    if (node.type === "Component" && componentId) {
      const ref: VersionedRenderRef = {
        id: componentId,
        ...(request.dependencyVersions?.components?.[componentId]
          ? { version: request.dependencyVersions.components[componentId] }
          : {}),
      };
      const key = dependencyKey("component", ref);
      if (state.visiting.has(key)) {
        throw dependencyError("RENDER_DEPENDENCY_CYCLE", "component", ref);
      }

      state.visiting.add(key);
      try {
        const component = await loadComponent(request, ref, state);
        const children = await expandNodes(
          resolveComponentRoots(component.source, node.children),
          request,
          state,
        );
        expanded.push(componentWrapper(node, componentId, children));
      } finally {
        state.visiting.delete(key);
      }
      continue;
    }

    expanded.push(
      cloneNode(node, await expandNodes(node.children, request, state)),
    );
  }

  return expanded;
}

async function loadLayout(
  request: ResolveRenderSurfaceRequest<"page">,
  state: DependencyState,
): Promise<LayoutDSL | null> {
  const layoutId = request.normalized.source.layout;
  if (!layoutId) return null;
  const pinned = request.dependencyVersions?.layout;
  const ref: VersionedRenderRef = {
    id: layoutId,
    ...(pinned?.id === layoutId && pinned.version
      ? { version: pinned.version }
      : {}),
  };

  let source: LayoutDSL | null;
  try {
    source = await request.providers.dependencies.getLayout(ref);
  } catch (error) {
    throw translateRenderFailure(error, "RENDER_DEPENDENCY_MISSING", {
      dependencyKind: "layout",
      dependencyId: ref.id,
      dependencyVersion: ref.version ?? null,
    });
  }
  if (!source)
    throw dependencyError("RENDER_DEPENDENCY_MISSING", "layout", ref);

  const normalized = await normalizeEditableSurface(
    { kind: "layout", source },
    { freeze: true },
  );
  state.records.set(dependencyKey("layout", ref), {
    kind: "layout",
    id: ref.id,
    version: ref.version ?? source.version ?? null,
    sourceHash: normalized.sourceHash,
  });
  return normalized.source;
}

async function componentRegion(
  role: "header" | "footer",
  componentId: string | undefined,
  request: ResolveRenderSurfaceRequest,
  state: DependencyState,
): Promise<RenderRegionInput | null> {
  if (!componentId) return null;
  const ref: VersionedRenderRef = {
    id: componentId,
    ...(request.dependencyVersions?.components?.[componentId]
      ? { version: request.dependencyVersions.components[componentId] }
      : {}),
  };
  const key = dependencyKey("component", ref);
  if (state.visiting.has(key)) {
    throw dependencyError("RENDER_DEPENDENCY_CYCLE", "component", ref);
  }
  state.visiting.add(key);
  try {
    const component = await loadComponent(request, ref, state);
    return {
      id: role,
      role,
      roots: await expandNodes(component.source.nodes, request, state),
    };
  } finally {
    state.visiting.delete(key);
  }
}

async function buildRegions(
  request: ResolveRenderSurfaceRequest,
  state: DependencyState,
): Promise<RenderRegionInput[]> {
  if (request.normalized.kind === "component") {
    const componentRequest =
      request as ResolveRenderSurfaceRequest<"component">;
    return [
      {
        id: `component:${componentRequest.normalized.source.id}`,
        role: "component-isolate",
        roots: await expandNodes(
          resolveComponentRoots(componentRequest.normalized.source),
          request,
          state,
        ),
      },
    ];
  }

  if (request.normalized.kind === "layout") {
    const layoutRequest = request as ResolveRenderSurfaceRequest<"layout">;
    return [
      {
        id: `layout:${layoutRequest.normalized.source.id}`,
        role: "layout",
        roots: await expandNodes(
          resolveLayoutSurfaceRoots([], layoutRequest.normalized.source),
          request,
          state,
        ),
      },
    ];
  }

  const pageRequest = request as ResolveRenderSurfaceRequest<"page">;
  const layout = await loadLayout(pageRequest, state);
  if (!layout) {
    return [
      {
        id: `page:${pageRequest.normalized.source.id}`,
        role: "page",
        roots: await expandNodes(
          pageRequest.normalized.source.nodes,
          request,
          state,
        ),
      },
    ];
  }

  const regions = layout.regions ?? layout.metadata?.regions;
  const header = await componentRegion(
    "header",
    regions?.headerComponent,
    request,
    state,
  );
  const footer = await componentRegion(
    "footer",
    regions?.footerComponent,
    request,
    state,
  );
  const bodyRoots = resolveLayoutSurfaceRoots(
    pageRequest.normalized.source.nodes,
    layout,
  );
  const body: RenderRegionInput = {
    id: `layout:${layout.id}`,
    role: layout.nodes.length > 0 ? "layout" : "page",
    roots: await expandNodes(bodyRoots, request, state),
  };
  return [header, body, footer].filter(
    (region): region is RenderRegionInput => region !== null,
  );
}

async function manifestRecords(
  inputs: readonly RenderManifestRecordInput[] = [],
): Promise<RenderManifestRecord[]> {
  const records = await Promise.all(
    inputs.map(async (input) => ({
      kind: input.kind,
      id: input.id,
      hash: await hashCanonicalJson(input.value),
    })),
  );
  return records.sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.id.localeCompare(right.id) ||
      left.hash.localeCompare(right.hash),
  );
}

function scopeNode(node: BuilderNode, path: string): ResolvedRenderNode {
  const priorSourceId = (node as BuilderNode & { sourceNodeId?: unknown })
    .sourceNodeId;
  const sourceNodeId =
    typeof priorSourceId === "string" ? priorSourceId : node.id;
  return {
    ...node,
    runtimeId: path,
    sourceNodeId,
    children: node.children.map((child, index) =>
      scopeNode(child, `${path}.${index}`),
    ),
  };
}

function scopeRegions(
  regions: readonly RenderRegionInput[],
): ResolvedRenderRegion[] {
  return regions.map((region, regionIndex) => ({
    id: region.id,
    role: region.role,
    roots: region.roots.map((node, nodeIndex) =>
      scopeNode(node, `r${regionIndex}.n${nodeIndex}`),
    ),
  }));
}

function deepFreeze<T>(value: T): T {
  const stack: object[] = [];
  if (value && typeof value === "object") stack.push(value);
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || Object.isFrozen(current)) continue;
    for (const child of Object.values(current)) {
      if (child && typeof child === "object") stack.push(child);
    }
    Object.freeze(current);
  }
  return value;
}

function canonicalClone<T>(value: T): T {
  const serialized = JSON.stringify(value);
  const parsed: unknown = JSON.parse(serialized);
  parseCanonicalJsonValue(parsed);
  return parsed as T;
}

/** Resolves one normalized editable surface into a frozen effective graph. */
export async function resolveRenderSurface<K extends RenderSurfaceKind>(
  request: ResolveRenderSurfaceRequest<K>,
): Promise<ResolvedRenderSurface<K>> {
  const state: DependencyState = {
    records: new Map(),
    components: new Map(),
    visiting: new Set(),
  };
  let regions = await buildRegions(request, state);

  let dataRecords: RenderManifestRecord[] = [];
  if (request.providers.data) {
    try {
      const resolution = await request.providers.data.resolveData({
        regions,
        mode: request.mode,
        route: request.route,
      });
      regions = [...resolution.regions];
      dataRecords = await manifestRecords(resolution.records);
    } catch (error) {
      throw translateRenderFailure(error, "RENDER_DATA_RESOLUTION_FAILED");
    }
  }

  let resourceRecords: RenderManifestRecord[] = [];
  if (request.providers.resources) {
    try {
      const resolution = await request.providers.resources.resolveResources({
        regions,
        mode: request.mode,
        route: request.route,
      });
      regions = [...resolution.regions];
      resourceRecords = await manifestRecords(resolution.records);
    } catch (error) {
      throw translateRenderFailure(error, "RENDER_RESOURCE_FAILED");
    }
  }

  const dependencies = [...state.records.values()].sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.id.localeCompare(right.id) ||
      (left.version ?? "").localeCompare(right.version ?? ""),
  );
  const dependencyHash = await hashCanonicalJson(dependencies);
  const dataHash = await hashCanonicalJson(dataRecords);
  const resourceHash = await hashCanonicalJson(resourceRecords);
  let styleArtifact: RenderStyleArtifactManifest = {
    id: null,
    revision: null,
    hash: await hashCanonicalJson(null),
  };
  if (request.providers.styles) {
    try {
      const artifact = await request.providers.styles.resolveStyleArtifact({
        mode: request.mode,
      });
      if (artifact) {
        styleArtifact = {
          id: artifact.id,
          revision: artifact.revision,
          hash: await hashCanonicalJson(artifact.value),
        };
      }
    } catch (error) {
      throw translateRenderFailure(error, "RENDER_ARTIFACT_MISSING");
    }
  }

  const scopedRegions = canonicalClone(scopeRegions(regions));
  const renderInputHash = await hashCanonicalJson({
    contractVersion: 1,
    sourceHash: request.normalized.sourceHash,
    mode: request.mode,
    route: request.route,
    regions: scopedRegions,
    dependencies,
    dependencyHash,
    dataHash,
    resourceHash,
    styleArtifact,
  });
  const surface: ResolvedRenderSurface<K> = {
    contractVersion: 1,
    normalized: request.normalized,
    mode: request.mode,
    renderInputHash,
    regions: scopedRegions,
    dependencies: { records: dependencies, hash: dependencyHash },
    resources: { records: resourceRecords, hash: resourceHash },
    data: { records: dataRecords, hash: dataHash },
    styleArtifact,
    diagnostics: [],
  };
  return request.freeze === false ? surface : deepFreeze(surface);
}
