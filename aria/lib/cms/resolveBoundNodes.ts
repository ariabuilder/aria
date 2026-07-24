import { z } from "zod";
import { buildCmsEntryPublicPath } from "./publicPaths";
import {
  applyPaginationOffsetsToDataSources,
  PaginationDataSourceSchema,
} from "./resolvePagination";
import {
  resolveDataSources,
  ResolveDataSourcesRequestSchema,
  type ResolvedCmsEntry,
  type ResolvedDataSource,
  type ResolveDataSourcesResponse,
} from "./resolveDataSources";
import { CmsServiceError } from "./errors";
import { CmsEntrySeoOverrideSchema } from "../rendering/resolveCmsEntrySeo";
import { renderPaginationHtml } from "../rendering/renderPagination";
import { materializeCmsLinkPropsOnNodes } from "./linkField";
import {
  buildBackgroundImageCssValue,
  coerceCmsBindingValueForStyleTarget,
  isStyleBindingKey,
  parseCmsImageFieldValue,
  parseStyleBindingStyleKey,
  resolveCmsImageFieldUrl,
  STYLE_BINDING_BACKGROUND_IMAGE,
} from "./styleBindings";
import {
  buildCmsMediaReferenceUrlMap,
  collectCmsMediaReferences,
  resolveCmsMediaReferenceValue,
} from "./resolveCmsMediaReference";
import type { MediaCatalogRepository } from "../media/catalog/repository";
import { CollectionEntryContextSchema } from "../rendering/resolvePublicPageRoute";
import type { StorageAdapter } from "../storage/adapter";
import { isLinkableContainerNodeType } from "../blocks/containerTypes";
import {
  getLinkHref,
  TEXT_LINK_PROP_NAMES,
} from "../blocks/listItemLinks";
import { isJsonValue, type BuilderNode, type StyleMap } from "../types/nodes";
import { formatCmsDateValue } from "./dateBindingFormats";

export const RenderCmsDataOptionsSchema = z
  .object({
    preview: z.boolean().default(false),
    locale: z.string().trim().min(1).optional(),
    entryContext: CollectionEntryContextSchema.optional(),
    entrySeo: CmsEntrySeoOverrideSchema.optional(),
    pagination: z
      .object({
        page: z.int().positive(),
        pageParam: z.string().trim().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();
export type RenderCmsDataOptions = z.infer<typeof RenderCmsDataOptionsSchema>;

export const ResolveCmsBoundNodesInputSchema = z
  .object({
    nodes: z.array(
      z.custom<BuilderNode>((value) => value !== null && typeof value === "object"),
    ),
    basePath: z.string().default("/"),
    cms: RenderCmsDataOptionsSchema.optional(),
    contextLabel: z.string().trim().min(1).optional(),
  })
  .strict();

const CmsFallbackPropsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

function cloneNodesForRender(nodes: readonly BuilderNode[]): BuilderNode[] {
  return nodes.map((node) => ({
    ...node,
    props: { ...(node.props ?? {}) },
    styles: { ...(node.styles ?? {}) },
    children: node.children ? cloneNodesForRender(node.children) : [],
    dataSource: node.dataSource ? { ...node.dataSource } : undefined,
  }));
}

function collectNodeDataSources(
  nodes: readonly BuilderNode[],
): Record<string, NonNullable<BuilderNode["dataSource"]>> {
  const sources: Record<string, NonNullable<BuilderNode["dataSource"]>> = {};
  for (const node of nodes) {
    const hasBindings =
      Boolean(node.dataSource?.bindings) &&
      Object.keys(node.dataSource?.bindings ?? {}).length > 0;
    const isListTemplate =
      node.dataSource?.mode === "list" && Boolean(node.children?.length);
    if (
      node.dataSource &&
      (node.dataSource.type === "cms" || node.dataSource.type === "collection") &&
      node.dataSource.collection &&
      (hasBindings || isListTemplate)
    ) {
      sources[node.id] = node.dataSource;
      if (isListTemplate) {
        continue;
      }
    }
    if (node.children?.length) {
      Object.assign(sources, collectNodeDataSources(node.children));
    }
  }
  return sources;
}

function withRenderContext(error: CmsServiceError, contextLabel?: string) {
  const label = contextLabel?.trim();
  if (!label || error.message.includes(` in ${label}:`)) {
    return error;
  }
  return new CmsServiceError(
    error.code,
    `CMS data source failed in ${label}: ${error.message}`,
  );
}

function readResolvedEntryBindingValue(
  source: ResolvedDataSource,
  entry: ResolvedCmsEntry,
  bindingPath: string,
): unknown {
  const parts = bindingPath.split(".").filter(Boolean);
  const collectionName = source.collection.name;
  const collectionLabel = source.collection.label;
  const path =
    parts[0] === collectionName || parts[0] === collectionLabel
      ? parts.slice(1)
      : parts;
  if (path.length === 0) {
    return undefined;
  }

  if (
    (path[0] === "url" || path[0] === "permalink") &&
    source.collection.urlPattern
  ) {
    return buildCmsEntryPublicPath(source.collection.urlPattern, entry.slug);
  }

  const root: Record<string, unknown> = {
    id: entry.id,
    slug: entry.slug,
    title: entry.title,
    status: entry.status,
    body: entry.body,
    updatedAt: entry.updatedAt,
    publishedAt: entry.publishedAt,
    ...entry.frontmatter,
    frontmatter: entry.frontmatter,
    record: entry.record,
  };

  return path.reduce<unknown>((value, key) => {
    if (value && typeof value === "object" && key in value) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, root);
}

function readPathValue(root: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((value, key) => {
    if (value && typeof value === "object" && key in value) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, root);
}

function bindingPathParts(
  source: ResolvedDataSource,
  bindingPath: string,
): string[] {
  const parts = bindingPath.split(".").filter(Boolean);
  const collectionName = source.collection.name;
  const collectionLabel = source.collection.label;
  return parts[0] === collectionName || parts[0] === collectionLabel
    ? parts.slice(1)
    : parts;
}

function readLoopItemBindingValue(
  source: ResolvedDataSource,
  entry: ResolvedCmsEntry,
  item: unknown,
  fieldPath: string,
  bindingPath: string,
): unknown {
  const path = bindingPathParts(source, bindingPath);
  if (path.length === 0) {
    return undefined;
  }

  if (item && typeof item === "object" && path[0] in item) {
    return readPathValue(item, path);
  }

  const fieldParts = bindingPathParts(source, fieldPath);
  const scopedPath =
    fieldParts.length > 0 &&
    path.slice(0, fieldParts.length).join(".") === fieldParts.join(".")
      ? path.slice(fieldParts.length)
      : path;
  const itemPath = scopedPath[0] === "0" ? scopedPath.slice(1) : scopedPath;
  if (itemPath.length === 0 || itemPath[0] === "value") {
    return item;
  }

  const itemValue = readPathValue(item, itemPath);
  return itemValue !== undefined
    ? itemValue
    : readResolvedEntryBindingValue(source, entry, bindingPath);
}

function readResolvedBindingValue(
  source: ResolvedDataSource,
  bindingPath: string,
): unknown {
  const entry = source.entry ?? source.items[0] ?? null;
  return entry ? readResolvedEntryBindingValue(source, entry, bindingPath) : undefined;
}

const TEXT_LIKE_PROP_NAMES = new Set(["text", "content", "label", "title"]);

export function coerceCmsBindingValueForTextProp(
  propName: string,
  value: unknown,
): unknown {
  if (!TEXT_LIKE_PROP_NAMES.has(propName)) {
    return value;
  }
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "title" in value
  ) {
    const title = (value as Record<string, unknown>).title;
    if (typeof title === "string") {
      return title;
    }
  }
  return value;
}

export function resolveCmsImageBindingPreviewValue(value: unknown): unknown {
  if (parseCmsImageFieldValue(value)) {
    return value;
  }
  const url = resolveCmsImageFieldUrl(value);
  if (url) {
    return url;
  }
  return value;
}

function normalizedPropName(propName: string): string {
  return propName.trim().toLowerCase();
}

function isImageSourcePropName(propName: string): boolean {
  const name = normalizedPropName(propName);
  return (
    name === "src" ||
    name === "source" ||
    name === "poster" ||
    name.includes("image") ||
    name.includes("cover") ||
    name.includes("avatar") ||
    name.includes("thumbnail")
  );
}

function isAltTextPropName(propName: string): boolean {
  const name = normalizedPropName(propName);
  return name === "alt" || name.includes("alttext") || name.includes("alt_text");
}

export function coerceCmsBindingValueForNodeProp(
  propName: string,
  value: unknown,
): unknown {
  if (isAltTextPropName(propName)) {
    const image = parseCmsImageFieldValue(value);
    if (image) {
      return image.alt ?? image.caption ?? "";
    }
  }
  if (isImageSourcePropName(propName)) {
    return resolveCmsImageBindingPreviewValue(value);
  }
  return coerceCmsBindingValueForTextProp(propName, value);
}

function writeStyleBindingValue(
  node: BuilderNode,
  bindingKey: string,
  value: unknown,
): void {
  const styleKey = parseStyleBindingStyleKey(bindingKey);
  if (!styleKey) {
    return;
  }

  const coerced = coerceCmsBindingValueForStyleTarget(bindingKey, value);
  const existingStyle = node.styles?.[styleKey as keyof StyleMap] ?? {};

  if (typeof coerced === "string" && coerced.trim()) {
    node.styles = {
      ...(node.styles ?? {}),
      [styleKey]: {
        ...existingStyle,
        base: coerced,
      },
    };
    return;
  }

  const imageField =
    bindingKey === STYLE_BINDING_BACKGROUND_IMAGE
      ? parseCmsImageFieldValue(coerced)
      : null;
  if (imageField) {
    // Unresolved CMS image objects are staged until materialization can look up media URLs.
    node.styles = {
      ...(node.styles ?? {}),
      [styleKey]: {
        ...existingStyle,
        base: imageField,
      },
    } as StyleMap;
  }
}

function writeBoundBindingValue(
  node: BuilderNode,
  bindingKey: string,
  value: unknown,
): void {
  if (isStyleBindingKey(bindingKey)) {
    writeStyleBindingValue(node, bindingKey, value);
    return;
  }

  writeJsonBoundProp(node, bindingKey, value);
}

function writeJsonBoundProp(
  node: BuilderNode,
  propName: string,
  value: unknown,
): void {
  const formatId = node.dataSource?.bindingFormats?.[propName];
  const resolved =
    formatId !== undefined ? formatCmsDateValue(value, formatId) : value;
  const coerced = coerceCmsBindingValueForNodeProp(propName, resolved);
  if (isJsonValue(coerced)) {
    node.props[propName] = coerced;
  }
}

function applyDataSourceFallbackProps(node: BuilderNode): void {
  const result = CmsFallbackPropsSchema.safeParse(node.dataSource?.fallback);
  if (!result.success) {
    return;
  }
  node.props = {
    ...node.props,
    ...result.data,
  };
}

function writeBoundNodeProps(
  nodes: BuilderNode[],
  resolved: ResolveDataSourcesResponse,
): void {
  for (const node of nodes) {
    const source = resolved[node.id];
    if (source && node.dataSource?.bindings) {
      for (const [propName, bindingPath] of Object.entries(
        node.dataSource.bindings,
      )) {
        const value = readResolvedBindingValue(source, bindingPath);
        writeBoundBindingValue(node, propName, value);
      }
    }
    if (node.children?.length) {
      writeBoundNodeProps(node.children, resolved);
    }
  }
}

function suffixRepeatedNodeIds(nodes: BuilderNode[], suffix: string): void {
  for (const node of nodes) {
    node.id = `${node.id}${suffix}`;
    if (node.children.length > 0) {
      suffixRepeatedNodeIds(node.children, suffix);
    }
  }
}

function findFirstLinkableDescendant(node: BuilderNode): BuilderNode | null {
  if (isLinkableContainerNodeType(node.type ?? "")) {
    return node;
  }
  for (const child of node.children) {
    const found = findFirstLinkableDescendant(child);
    if (found) {
      return found;
    }
  }
  return null;
}

function resolveLoopLinkTargetNode(clone: BuilderNode): BuilderNode | null {
  if (isLinkableContainerNodeType(clone.type ?? "")) {
    return clone;
  }
  // Fallback when the template root is a wrapper — apply link to the first linkable descendant.
  return findFirstLinkableDescendant(clone);
}

function applyLoopParentLinkToNode(
  target: BuilderNode,
  loopParent: BuilderNode,
  source: ResolvedDataSource,
  entry: ResolvedCmsEntry,
): void {
  const parentProps = loopParent.props ?? {};
  const hrefBinding = loopParent.dataSource?.bindings?.href;
  let hasHref = false;

  if (typeof hrefBinding === "string" && hrefBinding.trim().length > 0) {
    const value = readResolvedEntryBindingValue(source, entry, hrefBinding);
    if (value === undefined || value === null || value === "") {
      return;
    }
    writeBoundBindingValue(target, "href", value);
    hasHref = true;
  } else {
    const href = getLinkHref(parentProps);
    if (!href) {
      return;
    }
    writeJsonBoundProp(target, "href", href);
    hasHref = true;
  }

  if (!hasHref) {
    return;
  }

  for (const propName of TEXT_LINK_PROP_NAMES) {
    if (propName === "href") {
      continue;
    }
    const value = parentProps[propName];
    if (value !== undefined) {
      writeJsonBoundProp(target, propName, value);
    }
  }
}

function applyLoopParentLinkToClones(
  loopParent: BuilderNode,
  clones: BuilderNode[],
  source: ResolvedDataSource,
  entry: ResolvedCmsEntry,
): void {
  for (const clone of clones) {
    const target = resolveLoopLinkTargetNode(clone);
    if (!target) {
      continue;
    }
    applyLoopParentLinkToNode(target, loopParent, source, entry);
  }
}

function writeTemplateBindingsForEntry(
  nodes: BuilderNode[],
  source: ResolvedDataSource,
  entry: ResolvedCmsEntry,
): void {
  for (const node of nodes) {
    if (
      node.dataSource?.source === "field" &&
      node.dataSource.mode === "list" &&
      node.dataSource.field &&
      node.children.length > 0
    ) {
      const fieldValue = readResolvedEntryBindingValue(
        source,
        entry,
        node.dataSource.field,
      );
      if (!Array.isArray(fieldValue) || fieldValue.length === 0) {
        node.children = [];
        continue;
      }
      const fieldPath = node.dataSource.field;
      node.children = fieldValue.flatMap((item, index) => {
        const clones = cloneNodesForRender(node.children);
        suffixRepeatedNodeIds(clones, `__cms_field_${index}`);
        writeTemplateBindingsForLoopItem(clones, source, entry, item, fieldPath);
        applyLoopParentLinkToClones(node, clones, source, entry);
        return clones;
      });
      continue;
    }
    if (node.dataSource?.bindings) {
      for (const [propName, bindingPath] of Object.entries(
        node.dataSource.bindings,
      )) {
        const value = readResolvedEntryBindingValue(source, entry, bindingPath);
        writeBoundBindingValue(node, propName, value);
      }
    }
    if (node.children.length > 0) {
      writeTemplateBindingsForEntry(node.children, source, entry);
    }
  }
}

function writeTemplateBindingsForLoopItem(
  nodes: BuilderNode[],
  source: ResolvedDataSource,
  entry: ResolvedCmsEntry,
  item: unknown,
  fieldPath: string,
): void {
  for (const node of nodes) {
    if (node.dataSource?.bindings) {
      for (const [propName, bindingPath] of Object.entries(
        node.dataSource.bindings,
      )) {
        const value = readLoopItemBindingValue(
          source,
          entry,
          item,
          fieldPath,
          bindingPath,
        );
        writeBoundBindingValue(node, propName, value);
      }
    }
    if (node.children.length > 0) {
      writeTemplateBindingsForLoopItem(
        node.children,
        source,
        entry,
        item,
        fieldPath,
      );
    }
  }
}

function expandCmsListTemplates(
  nodes: BuilderNode[],
  resolved: ResolveDataSourcesResponse,
): void {
  for (const node of nodes) {
    const source = resolved[node.id];
    if (source && source.mode === "list" && node.children.length > 0) {
      if (source.items.length === 0) {
        if (node.dataSource?.onError === "show-fallback") {
          applyDataSourceFallbackProps(node);
        } else {
          node.children = [];
        }
        continue;
      }
      node.children = source.items.flatMap((entry, index) => {
        const clones = cloneNodesForRender(node.children);
        suffixRepeatedNodeIds(clones, `__cms_${index}_${entry.id}`);
        writeTemplateBindingsForEntry(clones, source, entry);
        applyLoopParentLinkToClones(node, clones, source, entry);
        return clones;
      });
      continue;
    }
    if (node.children.length > 0) {
      expandCmsListTemplates(node.children, resolved);
    }
  }
}

function pruneEmptyCmsNodes(
  nodes: BuilderNode[],
  resolved: ResolveDataSourcesResponse,
): BuilderNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children:
        node.children.length > 0
          ? pruneEmptyCmsNodes(node.children, resolved)
          : node.children,
    }))
    .filter((node) => {
      const source = resolved[node.id];
      if (!source) {
        return true;
      }
      const hasResolvedEntry = source.items.length > 0 || Boolean(source.entry);
      if (hasResolvedEntry) {
        return true;
      }
      if (node.dataSource?.onError === "show-fallback") {
        applyDataSourceFallbackProps(node);
        return true;
      }
      return false;
    });
}

function findRenderableNodeById(
  nodes: readonly BuilderNode[],
  nodeId: string,
): BuilderNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }
    const childMatch = findRenderableNodeById(node.children, nodeId);
    if (childMatch) {
      return childMatch;
    }
  }
  return null;
}

function materializePaginationNodes(input: {
  nodes: BuilderNode[];
  resolved: ResolveDataSourcesResponse;
  basePath: string;
  currentPage: number;
}): void {
  for (const node of input.nodes) {
    if (node.dataSource?.type === "pagination" && node.dataSource.targetNodeId) {
      const pagination = PaginationDataSourceSchema.parse({
        type: "pagination",
        targetNodeId: node.dataSource.targetNodeId,
      });
      const targetSource = input.resolved[pagination.targetNodeId];
      const targetNode = findRenderableNodeById(
        input.nodes,
        pagination.targetNodeId,
      );
      const perPage = targetNode?.dataSource?.limit ?? 12;
      node.props = {
        ...node.props,
        __paginationHtml: renderPaginationHtml({
          node,
          pagination,
          currentPage: input.currentPage,
          totalItems: targetSource?.total ?? 0,
          perPage,
          basePath: input.basePath,
        }),
      };
    }

    if (node.children.length > 0) {
      materializePaginationNodes({
        nodes: node.children,
        resolved: input.resolved,
        basePath: input.basePath,
        currentPage: input.currentPage,
      });
    }
  }
}

export async function resolveCmsBoundNodes(options: {
  nodes: readonly BuilderNode[];
  adapter: StorageAdapter;
  cms?: RenderCmsDataOptions;
  basePath: string;
  catalog?: MediaCatalogRepository | null;
  contextLabel?: string;
}): Promise<BuilderNode[]> {
  const nodes = cloneNodesForRender(options.nodes);
  let sources = collectNodeDataSources(nodes);
  const cms = RenderCmsDataOptionsSchema.parse(options.cms ?? {});

  if (cms.pagination) {
    sources = applyPaginationOffsetsToDataSources({
      nodes,
      sources,
      page: cms.pagination.page,
    });
  }

  if (Object.keys(sources).length === 0) {
    return nodes;
  }

  let resolved: ResolveDataSourcesResponse;
  try {
    resolved = await resolveDataSources(
      options.adapter,
      ResolveDataSourcesRequestSchema.parse({
        sources,
        preview: cms.preview,
        locale: cms.locale,
        entryContext: cms.entryContext,
      }),
    );
  } catch (error) {
    if (error instanceof CmsServiceError) {
      throw withRenderContext(error, options.contextLabel);
    }
    throw error;
  }
  writeBoundNodeProps(nodes, resolved);
  expandCmsListTemplates(nodes, resolved);
  materializePaginationNodes({
    nodes,
    resolved,
    basePath: options.basePath,
    currentPage: cms.pagination?.page ?? 1,
  });
  await materializeCmsLinkPropsOnNodes(nodes, options.adapter, {
    preview: cms.preview,
  });
  await materializeCmsImageBindingsOnNodes(nodes, {
    catalog: options.catalog,
    adapter: options.adapter,
  });
  return pruneEmptyCmsNodes(nodes, resolved);
}

/** Maps a suffixed loop instance id back to the template node id. */
export function resolveCmsTemplateNodeId(nodeId: string): string {
  const cmsMatch = nodeId.match(/^(.+)__cms_(?:\d+_[^]+|field_\d+)$/);
  if (cmsMatch?.[1]) {
    return cmsMatch[1];
  }
  return nodeId;
}

async function materializeCmsImageBindingsOnNodes(
  nodes: BuilderNode[],
  options: {
    catalog: MediaCatalogRepository | null | undefined;
    adapter: StorageAdapter;
  },
): Promise<void> {
  const references = new Set<string>();

  function collect(nodesToScan: readonly BuilderNode[]): void {
    for (const node of nodesToScan) {
      const styleValue = node.styles?.backgroundImage?.base;
      for (const reference of collectCmsMediaReferences(styleValue)) {
        references.add(reference);
      }

      for (const reference of collectCmsMediaReferences(node.props?.src)) {
        references.add(reference);
      }

      if (node.children?.length) {
        collect(node.children);
      }
    }
  }

  collect(nodes);

  const urlByReference = await buildCmsMediaReferenceUrlMap({
    references: [...references],
    catalog: options.catalog,
    adapter: options.adapter,
  });

  function apply(nodesToUpdate: BuilderNode[]): void {
    for (const node of nodesToUpdate) {
      const styleValue = node.styles?.backgroundImage?.base;
      if (styleValue !== undefined && styleValue !== null) {
        const url = resolveCmsMediaReferenceValue(styleValue, urlByReference);
        if (url) {
          node.styles = {
            ...(node.styles ?? {}),
            backgroundImage: {
              ...(node.styles?.backgroundImage ?? {}),
              base: buildBackgroundImageCssValue(url),
            },
          };
        }
      }

      const imageSrc = node.props?.src;
      if (imageSrc !== undefined && imageSrc !== null) {
        const url = resolveCmsMediaReferenceValue(imageSrc, urlByReference);
        if (url) {
          node.props.src = url;
        }

        const imageField = parseCmsImageFieldValue(imageSrc);
        const currentAlt =
          typeof node.props.alt === "string" ? node.props.alt.trim() : "";
        if (!currentAlt && imageField?.alt?.trim()) {
          node.props.alt = imageField.alt.trim();
        }
      }

      if (node.children?.length) {
        apply(node.children);
      }
    }
  }

  apply(nodes);
}
