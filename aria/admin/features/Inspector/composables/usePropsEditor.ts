/**
 * State and operations for the Props tab. Handles component properties and data binding.
 */

import { computed, inject, onMounted, ref, watch } from "vue";
import { actions } from "astro:actions";
import { z } from "zod";
import { useHistory } from "../../History";
import { useInspector } from "./useInspector";
import {
  useCanvasSignalBridge,
  useSelectionTreeState,
  useSelectedNodeState,
} from "../../Core";
import { APP_INJECTION_KEYS } from "../../Core/types/injectionKeys";
import type { CmsPreviewEntryContext } from "../../CMS/composables/useCmsPreviewEntryContext";
import {
  ListCollectionsResponseSchema,
  ListEntriesResponseSchema,
} from "../../../../lib/cms/actionSchemas";
import {
  ComponentDSLSchema,
  JsonObjectSchema,
  NodeDataSourceSchema,
} from "../../../../lib/schemas/nodes";
import {
  EntryListRequestSchema,
  type AriaCollection,
  type AriaEntryRecord,
  type FieldSchema,
} from "../../../../lib/cms/schemas";
import {
  coerceCmsBindingValueForNodeProp,
  resolveCmsImageBindingPreviewValue,
} from "../../../../lib/cms/resolveBoundNodes";
import { buildCmsEntryPublicPath } from "../../../../lib/cms/publicPaths";
import { validateCmsUrlPattern } from "../../../../lib/cms/routing";
import {
  coerceCmsBindingValueForStyleTarget,
  isStyleBindingKey,
  parseStyleBindingStyleKey,
  STYLE_BINDING_BACKGROUND_IMAGE,
} from "../../../../lib/cms/styleBindings";
import { entryFieldsForCollection } from "../../../../lib/cms/systemFields";
import {
  CMS_DATE_FORMAT_OPTIONS,
  defaultDateFormatForFieldType,
  formatCmsDateValue,
  isDateBindingFieldType,
  resolveCmsBindingFieldType,
  type CmsDateFormatId,
} from "../../../../lib/cms/dateBindingFormats";
import {
  buildArchiveListFilter,
  findArchiveBridgingFields,
  type CmsArchiveBridgingField,
  type CmsListFilter,
} from "../../../../lib/cms/listFilters";
import {
  buildNormalizeContentPropsUpdates,
  getCanonicalContentPropName,
  getContentPropAliases,
  getContentValue,
  isContentPropAlias,
  shouldAddSyntheticCanonicalContentProp,
  type ContentNodeLike,
} from "../../../../lib/blocks/contentContract";
import { parseNavigationProps } from "../../../../lib/blocks/navigationSchema";
import {
  readComposerNodeMediaReferences,
  withComposerBackgroundReference,
  withComposerImageReference,
  withComposerResponsiveImage,
} from "../../../../lib/media/composerReference";
import {
  contentEditorFieldSettingsForProp,
  isContentEditorEligibleProp,
  nextNodeContentEditorFieldSettings,
  normalizeContentEditorExposure,
} from "../../../../lib/content/contentEditor";
import {
  isJsonValue,
  type BuilderNode,
  type ComponentDSL,
  type ComponentPropFieldType,
  type ComponentPropSchemaDefinition,
  type NodeDataSource,
} from "../../../../lib/types/nodes";

export interface PropertyDefinition {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "unknown";
  value: unknown;
  isRequired: boolean;
  description?: string;
  studioEditable: boolean;
  studioHidden: boolean;
  contentEditorEligible: boolean;
  contentEditorEnabled: boolean;
  contentEditorLocked: boolean;
  contentEditorHidden: boolean;
  hasSchemaField: boolean;
}

export interface PropertyGroup {
  name: string;
  properties: PropertyDefinition[];
  isExpanded: boolean;
}

export {
  CMS_DATE_FORMAT_OPTIONS,
  type CmsDateFormatId,
} from "../../../../lib/cms/dateBindingFormats";

export type PropBindingMode = "static" | "dynamic";

export const CmsBindingFieldOptionSchema = z
  .object({
    label: z.string().trim().min(1),
    path: z.string().trim().min(1),
    type: z.string().trim().min(1),
    source: z.enum(["system", "schema"]),
    depth: z.int().nonnegative().default(0),
    isList: z.boolean().default(false),
    description: z.string().trim().min(1).optional(),
  })
  .strict();
export type CmsBindingFieldOption = z.infer<typeof CmsBindingFieldOptionSchema>;

const CmsBindingFieldOptionsSchema = z.array(CmsBindingFieldOptionSchema);
export const CmsBindingFieldOptionGroupSchema = z
  .object({
    label: z.string().trim().min(1),
    options: CmsBindingFieldOptionsSchema,
  })
  .strict();
export type CmsBindingFieldOptionGroup = z.infer<
  typeof CmsBindingFieldOptionGroupSchema
>;
const CmsBindingFieldOptionGroupsSchema = z.array(
  CmsBindingFieldOptionGroupSchema,
);

const TEXT_FIELD_TYPES = new Set([
  "system",
  "string",
  "text",
  "slug",
  "select",
  "date",
  "datetime",
  "structuredText",
  "richtext",
]);
const NUMBER_FIELD_TYPES = new Set(["number", "integer"]);
const BOOLEAN_FIELD_TYPES = new Set(["boolean"]);
const IMAGE_FIELD_TYPES = new Set(["image"]);
const LINK_FIELD_TYPES = new Set(["link", "reference", "url"]);
const ARRAY_FIELD_TYPES = new Set(["repeater", "multiSelect", "relation"]);
const OBJECT_FIELD_TYPES = new Set(["object", "json", "image", "file", "link"]);
const CmsSourceModeSchema = z.enum(["single", "list"]);
const CmsListSortSchema = z.enum([
  "-publishedAt",
  "publishedAt",
  "-updatedAt",
  "updatedAt",
  "-createdAt",
  "createdAt",
  "title",
  "-title",
  "slug",
  "-slug",
]);
const CmsListLimitSchema = z.int().positive().max(100);
const CmsListOffsetSchema = z.int().nonnegative().max(10_000);
const CmsListStatusSchema = z
  .enum(["draft", "published", "scheduled", "archived"])
  .optional();
const CmsListLocaleSchema = z.string().trim().min(1).optional();
const CmsSingleEntrySelectionSchema = z
  .object({
    id: z.string().trim().min(1),
    slug: z.string().trim().min(1).optional(),
  })
  .strict();
const TEXT_LIKE_PROP_NAMES = new Set(["text", "content", "label", "title"]);
const HIDDEN_BINDING_PROP_NAMES = new Set(["level", "metadata", "loading"]);
const REPEAT_BINDING_PROP_NAME = "items";
const PropBindingModeSchema = z.enum(["static", "dynamic"]);
const REPEAT_CAPABLE_NODE_TYPES = new Set([
  "container",
  "section",
  "navigation",
  "nav-items",
  "div",
  "group",
  "list",
  "grid",
  "columns",
  "column",
]);
const CmsBindingDisplaySchema = z
  .object({
    sourceLabel: z.string().trim().min(1),
    fieldLabel: z.string().trim().min(1),
    label: z.string().trim().min(1),
  })
  .strict();
export type CmsBindingDisplay = z.infer<typeof CmsBindingDisplaySchema>;

const InheritedCmsLoopSourceSchema = z
  .object({
    nodeId: z.string().trim().min(1),
    collection: z.string().trim().min(1),
  })
  .strict();
type InheritedCmsLoopSource = z.infer<typeof InheritedCmsLoopSourceSchema>;

function normalizedName(value: string): string {
  return value.trim().toLowerCase();
}

function normalizedNodeType(value: unknown): string {
  return typeof value === "string" ? normalizedName(value) : "";
}

function isTextLikePropName(value: string): boolean {
  return TEXT_LIKE_PROP_NAMES.has(normalizedName(value));
}

function isRepeatBindingPropName(value: string): boolean {
  return normalizedName(value) === REPEAT_BINDING_PROP_NAME;
}

export function isRepeatCapableInspectorNodeType(value: unknown): boolean {
  return REPEAT_CAPABLE_NODE_TYPES.has(normalizedNodeType(value));
}

export function isVisibleInspectorBindingProp(propName: string): boolean {
  return !HIDDEN_BINDING_PROP_NAMES.has(normalizedName(propName));
}

export function shouldSkipInspectorContentAliasProp(input: {
  nodeType: unknown;
  propName: string;
}): boolean {
  return isContentPropAlias(input.nodeType, input.propName);
}

export function resolveInspectorContentBindingPropName(input: {
  nodeType: unknown;
  propName: string;
}): string {
  if (isContentPropAlias(input.nodeType, input.propName)) {
    return getCanonicalContentPropName(input.nodeType) ?? input.propName;
  }
  return input.propName;
}

function stripAliasContentBindings(
  nodeType: unknown,
  bindings: Record<string, string>,
  canonicalPropName: string,
  fieldPath: string,
): Record<string, string> {
  const canonical = getCanonicalContentPropName(nodeType);
  if (!canonical || canonicalPropName !== canonical) {
    return {
      ...bindings,
      [canonicalPropName]: fieldPath,
    };
  }

  const nextBindings = {
    ...bindings,
    [canonicalPropName]: fieldPath,
  };
  for (const alias of getContentPropAliases(nodeType)) {
    delete nextBindings[alias];
  }
  return nextBindings;
}

export function shouldAddSyntheticTextBindingProp(input: {
  nodeType: unknown;
  props: Record<string, unknown>;
}): boolean {
  if (normalizedNodeType(input.nodeType) !== "heading") {
    return false;
  }

  return ![...TEXT_LIKE_PROP_NAMES].some((propName) =>
    Object.prototype.hasOwnProperty.call(input.props, propName),
  );
}

export function shouldAddSyntheticRepeatBindingProp(input: {
  nodeType: unknown;
  props: Record<string, unknown>;
  hasChildren: boolean;
}): boolean {
  if (normalizedNodeType(input.nodeType) === "navigation") {
    return false;
  }

  if (!isRepeatCapableInspectorNodeType(input.nodeType) && !input.hasChildren) {
    return false;
  }

  return !Object.prototype.hasOwnProperty.call(input.props, "items");
}

function isStaticNavigationInspectorNode(
  node: ContentNodeLike | null | undefined,
): boolean {
  if (!node || normalizedNodeType(node.type) !== "navigation") {
    return false;
  }

  const props =
    typeof node.props === "object" && node.props !== null
      ? (node.props as Record<string, unknown>)
      : {};
  return parseNavigationProps(props).sourceMode === "static";
}

function resolveInspectorBindingPropValue(input: {
  node: ContentNodeLike;
  propName: string;
  value: unknown;
  editedValue: unknown;
}): unknown {
  if (input.editedValue !== undefined) {
    return input.editedValue;
  }

  if (
    normalizedNodeType(input.node.type) === "heading" &&
    isTextLikePropName(input.propName)
  ) {
    const contentValue = getContentValue(input.node);
    if (contentValue.trim().length > 0) {
      return contentValue;
    }
  }

  return input.value;
}

function isImageProp(propName: string): boolean {
  const name = normalizedName(propName);
  return (
    name === STYLE_BINDING_BACKGROUND_IMAGE.toLowerCase() ||
    name === "src" ||
    name === "source" ||
    name.includes("image") ||
    name.includes("cover") ||
    name.includes("avatar") ||
    name.includes("poster") ||
    name.includes("thumbnail")
  );
}

export { STYLE_BINDING_BACKGROUND_IMAGE };

export function isLinkProp(propName: string): boolean {
  const name = normalizedName(propName);
  return (
    name === "href" ||
    name === "url" ||
    name.includes("link") ||
    name.includes("href") ||
    name.includes("url")
  );
}

function isAltTextProp(propName: string): boolean {
  const name = normalizedName(propName);
  return (
    name === "alt" || name.includes("alttext") || name.includes("alt_text")
  );
}

function isCaptionProp(propName: string): boolean {
  return normalizedName(propName).includes("caption");
}

function fieldPathSegment(path: string): string {
  return path.split(".").at(-1) ?? path;
}

function humanizeFieldPathSegment(path: string): string {
  return fieldPathSegment(path)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function isImageMetaField(option: CmsBindingFieldOption): boolean {
  const segment = normalizedName(fieldPathSegment(option.path));
  return (
    option.type === "image" ||
    segment.includes("image") ||
    segment.includes("cover") ||
    segment.includes("media") ||
    segment.includes("thumbnail")
  );
}

export function isCmsBindingFieldRecommendedForProp(
  prop: PropertyDefinition,
  option: CmsBindingFieldOption,
): boolean {
  if (isAltTextProp(prop.name)) {
    return option.type === "string" || option.type === "text";
  }
  if (isCaptionProp(prop.name)) {
    return option.type === "string" || option.type === "text";
  }
  if (isImageProp(prop.name)) {
    return IMAGE_FIELD_TYPES.has(option.type) || isImageMetaField(option);
  }
  if (isLinkProp(prop.name)) {
    return LINK_FIELD_TYPES.has(option.type) || option.type === "slug";
  }

  switch (prop.type) {
    case "number":
      return NUMBER_FIELD_TYPES.has(option.type);
    case "boolean":
      return BOOLEAN_FIELD_TYPES.has(option.type);
    case "array":
      return option.isList || ARRAY_FIELD_TYPES.has(option.type);
    case "object":
      return OBJECT_FIELD_TYPES.has(option.type) || option.isList;
    case "string":
      return TEXT_FIELD_TYPES.has(option.type);
    default:
      return true;
  }
}

export function createSystemFieldOptions(
  collection: AriaCollection,
): CmsBindingFieldOption[] {
  const hasValidUrlPattern =
    typeof collection.urlPattern === "string" &&
    validateCmsUrlPattern(collection.urlPattern).valid;

  return CmsBindingFieldOptionsSchema.parse([
    {
      label: "Title",
      path: `${collection.name}.title`,
      type: "system",
      source: "system",
      description: "Entry title",
    },
    {
      label: "Slug",
      path: `${collection.name}.slug`,
      type: "slug",
      source: "system",
      description: "Entry slug",
    },
    {
      label: "Status",
      path: `${collection.name}.status`,
      type: "system",
      source: "system",
      description: "Workflow status",
    },
    {
      label: "Published at",
      path: `${collection.name}.publishedAt`,
      type: "datetime",
      source: "system",
      description: "Publish timestamp",
    },
    {
      label: "Updated at",
      path: `${collection.name}.updatedAt`,
      type: "datetime",
      source: "system",
      description: "Last updated timestamp",
    },
    ...(collection.supports.includes("body")
      ? [
          {
            label: "Body",
            path: `${collection.name}.body`,
            type: "richtext",
            source: "system" as const,
            description: "Entry body",
          },
        ]
      : []),
    ...(hasValidUrlPattern
      ? [
          {
            label: "URL",
            path: `${collection.name}.url`,
            type: "url",
            source: "system" as const,
            description: "Entry public URL",
          },
        ]
      : []),
  ]);
}

export function buildCollectionsByKey(
  collections: readonly AriaCollection[],
): Map<string, AriaCollection> {
  const lookup = new Map<string, AriaCollection>();
  for (const collection of collections) {
    lookup.set(collection.id, collection);
    lookup.set(collection.name, collection);
  }
  return lookup;
}

function nestedSystemFieldOptions(
  target: AriaCollection,
  parentPath: string,
  parentLabel: string,
  depth: number,
): CmsBindingFieldOption[] {
  return createSystemFieldOptions(target).map((option) => {
    const suffix = option.path.split(".").slice(1).join(".");
    return CmsBindingFieldOptionSchema.parse({
      ...option,
      path: suffix ? `${parentPath}.${suffix}` : parentPath,
      label: `${parentLabel} / ${option.label}`,
      depth,
    });
  });
}

export function createSchemaFieldOptions(
  collectionName: string,
  fields: readonly FieldSchema[],
  parentPath = collectionName,
  parentLabel = "",
  depth = 0,
  collectionsByKey?: ReadonlyMap<string, AriaCollection>,
): CmsBindingFieldOption[] {
  const options: CmsBindingFieldOption[] = [];

  for (const field of fields) {
    const path = `${parentPath}.${field.key}`;
    const label = parentLabel ? `${parentLabel} / ${field.label}` : field.label;
    const isList =
      field.type === "repeater" ||
      field.type === "multiSelect" ||
      field.type === "relation";
    options.push(
      CmsBindingFieldOptionSchema.parse({
        label,
        path,
        type: field.type,
        source: "schema",
        depth,
        isList,
        description: isList ? "List field" : undefined,
      }),
    );

    if (field.type === "image") {
      options.push(
        CmsBindingFieldOptionSchema.parse({
          label: `${label} / Alt`,
          path: `${path}.alt`,
          type: "string",
          source: "schema",
          depth: depth + 1,
          isList: false,
          description: "Image alt text",
        }),
        CmsBindingFieldOptionSchema.parse({
          label: `${label} / Caption`,
          path: `${path}.caption`,
          type: "string",
          source: "schema",
          depth: depth + 1,
          isList: false,
          description: "Image caption",
        }),
        CmsBindingFieldOptionSchema.parse({
          label: `${label} / URL`,
          path: `${path}.url`,
          type: "url",
          source: "schema",
          depth: depth + 1,
          isList: false,
          description: "Image URL",
        }),
      );
    }

    if (field.type === "object") {
      options.push(
        ...createSchemaFieldOptions(
          collectionName,
          field.fields ?? [],
          path,
          label,
          depth + 1,
          collectionsByKey,
        ),
      );
    }

    if (field.type === "repeater") {
      options.push(
        ...createSchemaFieldOptions(
          collectionName,
          field.fields ?? [],
          `${path}.0`,
          `${label} / First item`,
          depth + 1,
          collectionsByKey,
        ),
      );
    }

    if (
      (field.type === "reference" || field.type === "relation") &&
      field.targetCollection &&
      collectionsByKey
    ) {
      const target = collectionsByKey.get(field.targetCollection);
      if (target) {
        const nestedPath = field.type === "relation" ? `${path}.0` : path;
        const nestedLabel =
          field.type === "relation" ? `${label} / First item` : label;
        const nestedDepth = field.type === "relation" ? depth + 1 : depth + 1;
        options.push(
          ...nestedSystemFieldOptions(
            target,
            nestedPath,
            nestedLabel,
            nestedDepth,
          ),
        );
        options.push(
          ...createSchemaFieldOptions(
            target.name,
            entryFieldsForCollection(target),
            nestedPath,
            nestedLabel,
            nestedDepth,
            collectionsByKey,
          ),
        );
      }
    }
  }

  return CmsBindingFieldOptionsSchema.parse(options);
}

export function createCmsBindingFieldOptionGroups(
  prop: PropertyDefinition,
  options: readonly CmsBindingFieldOption[],
  currentBinding?: string,
): CmsBindingFieldOptionGroup[] {
  const recommended: CmsBindingFieldOption[] = [];
  const other: CmsBindingFieldOption[] = [];

  for (const option of options) {
    if (
      isCmsBindingFieldRecommendedForProp(prop, option) ||
      (currentBinding && option.path === currentBinding)
    ) {
      recommended.push(option);
    } else {
      other.push(option);
    }
  }

  return CmsBindingFieldOptionGroupsSchema.parse([
    ...(recommended.length > 0
      ? [{ label: "Recommended", options: recommended }]
      : []),
    ...(other.length > 0 ? [{ label: "Other fields", options: other }] : []),
  ]);
}

export function resolveInspectorPreviewEntryId(input: {
  isEntryTemplatePage: boolean;
  pagePreviewEntryId: string;
  nodeFilterEntryId: string;
}): string {
  if (input.isEntryTemplatePage && input.pagePreviewEntryId) {
    return input.pagePreviewEntryId;
  }
  return input.nodeFilterEntryId;
}

export function shouldBootstrapTemplatePageDataSource(input: {
  isAssignedCmsTemplatePage: boolean;
  assignedCollectionName: string | null;
  existingCollectionName: string | undefined;
}): boolean {
  return Boolean(
    input.isAssignedCmsTemplatePage &&
    input.assignedCollectionName &&
    !input.existingCollectionName,
  );
}

export function shouldBootstrapTemplatePageListDataSource(input: {
  isListTemplatePage: boolean;
  isRepeatCapable: boolean;
  assignedCollectionName: string | null;
  existingCollectionName: string | undefined;
}): boolean {
  return Boolean(
    input.isListTemplatePage &&
    input.isRepeatCapable &&
    input.assignedCollectionName &&
    !input.existingCollectionName,
  );
}

export function shouldAutoScopePageAssignedCollection(input: {
  isListTemplatePage: boolean;
  hasInheritedCmsLoopSource: boolean;
  nodeDataSourceCollection?: string;
}): boolean {
  if (input.nodeDataSourceCollection) {
    return true;
  }
  if (input.hasInheritedCmsLoopSource) {
    return true;
  }
  if (input.isListTemplatePage) {
    return false;
  }
  return true;
}

export function isNodeListLoopDataSource(
  dataSource: NodeDataSource | null | undefined,
): boolean {
  return dataSource?.mode === "list";
}

export function nextDataSourceAfterDisablingListLoop(
  dataSource: NodeDataSource | null | undefined,
): NodeDataSource | null {
  if (!dataSource || !isNodeListLoopDataSource(dataSource)) {
    return dataSource ?? null;
  }

  const bindings = dataSource.bindings;
  const hasBindings = Boolean(bindings && Object.keys(bindings).length > 0);
  const withoutListFields: Record<string, unknown> = { ...dataSource };
  delete withoutListFields.filter;
  delete withoutListFields.sort;
  delete withoutListFields.limit;
  delete withoutListFields.offset;
  delete withoutListFields.status;
  delete withoutListFields.locale;

  if (!hasBindings) {
    return null;
  }

  return NodeDataSourceSchema.unwrap().parse({
    ...withoutListFields,
    mode: "single",
  });
}

function parsedNodeDataSource(
  node: BuilderNode | null | undefined,
): NodeDataSource | null {
  if (!node?.dataSource) {
    return null;
  }
  const parsed = NodeDataSourceSchema.unwrap().safeParse(node.dataSource);
  return parsed.success ? parsed.data : null;
}

function findInheritedCmsLoopSource(
  nodes: readonly BuilderNode[],
  selectedNodeId: string | null,
  ancestors: readonly BuilderNode[] = [],
): InheritedCmsLoopSource | null {
  if (!selectedNodeId) {
    return null;
  }

  for (const node of nodes) {
    if (node.id === selectedNodeId) {
      const loopAncestor = [...ancestors].reverse().find((ancestor) => {
        const source = parsedNodeDataSource(ancestor);
        return Boolean(
          source &&
          (source.type === "cms" || source.type === "collection") &&
          source.mode === "list" &&
          source.collection,
        );
      });
      const source = parsedNodeDataSource(loopAncestor);
      return source?.collection
        ? InheritedCmsLoopSourceSchema.parse({
            nodeId: loopAncestor?.id,
            collection: source.collection,
          })
        : null;
    }

    if (node.children.length > 0) {
      const match = findInheritedCmsLoopSource(node.children, selectedNodeId, [
        ...ancestors,
        node,
      ]);
      if (match) {
        return match;
      }
    }
  }

  return null;
}

let propsEditorSingleton: ReturnType<typeof createPropsEditor> | null = null;

/**
 * usePropsEditor - Props tab logic (shared singleton)
 */
export function usePropsEditor() {
  if (!propsEditorSingleton) {
    propsEditorSingleton = createPropsEditor();
  }
  return propsEditorSingleton;
}

/** @internal Resets the props editor singleton between tests. */
export function resetPropsEditorForTests(): void {
  propsEditorSingleton = null;
}

/**
 * @internal Shared props editor implementation.
 */
function createPropsEditor() {
  const providedInspector = inject<ReturnType<typeof useInspector> | null>(
    "inspector",
    null,
  );
  const inspector = providedInspector ?? useInspector();
  const { execute } = useHistory();
  const { selectionTreeRootNodes, setSelectionTreeRootNodes } =
    useSelectionTreeState();
  const { updateSelectedNodeDataSource } = useSelectedNodeState();
  const { broadcastPropsUpdate } = useCanvasSignalBridge();
  const cmsPreviewEntryContext = inject<CmsPreviewEntryContext | null>(
    APP_INJECTION_KEYS.cmsPreviewEntryContext,
    null,
  );

  const isEntryTemplatePage = computed(
    () => cmsPreviewEntryContext?.isEntryTemplatePage.value ?? false,
  );
  const isListTemplatePage = computed(
    () => cmsPreviewEntryContext?.isListTemplatePage.value ?? false,
  );
  const isAssignedCmsTemplatePage = computed(
    () => isEntryTemplatePage.value || isListTemplatePage.value,
  );
  const pageAssignedCollection = computed(
    () => cmsPreviewEntryContext?.pageAssignedCollection.value ?? null,
  );

  const editedValues = ref<Record<string, unknown>>({});

  /** Pending date format selections before persistence completes */
  const pendingDateFormats = ref<Record<string, CmsDateFormatId>>({});

  /** New property form state */
  const newPropName = ref("");
  const newPropType = ref<"string" | "number" | "boolean">("string");
  const newPropValue = ref<unknown>("");
  const collections = ref<AriaCollection[]>([]);
  const selectedCollectionName = ref("");
  const isLoadingCollections = ref(false);
  const collectionsError = ref<string | null>(null);
  const cmsEntries = ref<AriaEntryRecord[]>([]);
  const isLoadingCmsEntries = ref(false);
  const cmsEntriesError = ref<string | null>(null);
  const cmsSourceError = ref<string | null>(null);
  const componentDefinition = ref<ComponentDSL | null>(null);
  const isLoadingComponentSchema = ref(false);
  const componentSchemaError = ref<string | null>(null);
  const pendingDynamicProps = ref<ReadonlySet<string>>(new Set());

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function selectedComponentRef(): string | null {
    const node = inspector.elementContext.value.node;
    if (!node) {
      return null;
    }

    if (typeof node.componentRef === "string" && node.componentRef.trim()) {
      return node.componentRef;
    }

    const reference = isRecord(node.reference) ? node.reference : null;
    if (reference) {
      if (typeof reference.masterId === "string" && reference.masterId.trim()) {
        return reference.masterId;
      }

      if (typeof reference.id === "string" && reference.id.trim()) {
        return reference.id;
      }
    }

    const nodeProps = isRecord(node.props) ? node.props : null;
    if (nodeProps) {
      if (
        typeof nodeProps.componentId === "string" &&
        nodeProps.componentId.trim()
      ) {
        return nodeProps.componentId;
      }

      if (
        typeof nodeProps["data-component-ref"] === "string" &&
        nodeProps["data-component-ref"].trim()
      ) {
        return nodeProps["data-component-ref"];
      }
    }

    return null;
  }

  function schemaFieldForProp(
    propName: string,
  ): ComponentPropSchemaDefinition | null {
    return (
      componentDefinition.value?.propSchema?.find(
        (field) => field.name === propName,
      ) ?? null
    );
  }

  function toSchemaFieldType(
    type: PropertyDefinition["type"],
  ): ComponentPropFieldType {
    switch (type) {
      case "number":
      case "boolean":
      case "array":
      case "object":
      case "string":
        return type;
      case "unknown":
      default:
        return "string";
    }
  }

  function createSchemaFieldFromProp(
    prop: PropertyDefinition,
  ): ComponentPropSchemaDefinition {
    return {
      name: prop.name,
      label: prop.name,
      type: toSchemaFieldType(prop.type),
      section: prop.type === "string" ? "Content" : "Behavior",
      required: false,
      ...(isJsonValue(prop.value) ? { default: prop.value } : {}),
    };
  }

  function contentEditorStateForProp(input: {
    node: BuilderNode;
    propName: string;
    type: PropertyDefinition["type"];
    schemaField: ComponentPropSchemaDefinition | null;
  }) {
    const schemaExposure = normalizeContentEditorExposure(
      input.schemaField?.contentEditor,
    );
    const nodeExposure = contentEditorFieldSettingsForProp(
      input.node,
      input.propName,
    );
    const exposure = input.schemaField ? schemaExposure : nodeExposure;
    return {
      contentEditorEligible: isContentEditorEligibleProp({
        propName: input.propName,
        type: input.type,
      }),
      contentEditorEnabled: exposure.enabled,
      contentEditorLocked: exposure.locked,
      contentEditorHidden: exposure.hidden,
    };
  }

  const componentRef = computed(() => selectedComponentRef());

  /**
   * Get all properties from the selected node
   */
  const properties = computed<PropertyDefinition[]>(() => {
    const node = inspector.elementContext.value.node;
    if (!node) return [];

    const props: PropertyDefinition[] = [];
    const nodeProps = isRecord(node.props) ? node.props : {};

    for (const [name, value] of Object.entries(nodeProps)) {
      if (!isVisibleInspectorBindingProp(name)) {
        continue;
      }
      if (
        shouldSkipInspectorContentAliasProp({
          nodeType: node.type,
          propName: name,
        })
      ) {
        continue;
      }

      const schemaField = schemaFieldForProp(name);
      const inferredType = inferType(value);
      props.push({
        name,
        type: inferredType,
        value: formatBoundPropDisplayValue(
          name,
          resolveInspectorBindingPropValue({
            node,
            propName: name,
            value,
            editedValue: editedValues.value[name],
          }),
        ),
        isRequired: schemaField?.required ?? false,
        description: schemaField?.description,
        studioEditable: schemaField?.editable !== false,
        studioHidden: schemaField?.hidden === true,
        ...contentEditorStateForProp({
          node,
          propName: name,
          type: inferredType,
          schemaField,
        }),
        hasSchemaField: Boolean(schemaField),
      });
    }

    if (
      shouldAddSyntheticCanonicalContentProp({
        nodeType: node.type,
        props: nodeProps,
      })
    ) {
      const canonicalPropName =
        getCanonicalContentPropName(node.type) ?? "content";
      const schemaField = schemaFieldForProp(canonicalPropName);
      const inferredType = "string" as const;
      props.push({
        name: canonicalPropName,
        type: inferredType,
        value:
          editedValues.value[canonicalPropName] ??
          getContentValue({
            type: node.type,
            props: nodeProps,
            children: node.children,
          }),
        isRequired: schemaField?.required ?? false,
        description: schemaField?.description,
        studioEditable: schemaField?.editable !== false,
        studioHidden: schemaField?.hidden === true,
        ...contentEditorStateForProp({
          node,
          propName: canonicalPropName,
          type: inferredType,
          schemaField,
        }),
        hasSchemaField: Boolean(schemaField),
      });
    }

    if (
      shouldAddSyntheticTextBindingProp({
        nodeType: node.type,
        props: nodeProps,
      })
    ) {
      const schemaField = schemaFieldForProp("text");
      const inferredType = "string" as const;
      props.push({
        name: "text",
        type: inferredType,
        value:
          editedValues.value.text ??
          getContentValue({
            type: node.type,
            props: nodeProps,
            children: node.children,
          }),
        isRequired: schemaField?.required ?? false,
        description: schemaField?.description ?? "Heading text",
        studioEditable: schemaField?.editable !== false,
        studioHidden: schemaField?.hidden === true,
        ...contentEditorStateForProp({
          node,
          propName: "text",
          type: inferredType,
          schemaField,
        }),
        hasSchemaField: Boolean(schemaField),
      });
    }

    if (
      shouldAddSyntheticRepeatBindingProp({
        nodeType: node.type,
        props: nodeProps,
        hasChildren: Array.isArray(node.children) && node.children.length > 0,
      })
    ) {
      const schemaField = schemaFieldForProp("items");
      const inferredType = "array" as const;
      props.push({
        name: "items",
        type: inferredType,
        value: [],
        isRequired: schemaField?.required ?? false,
        description:
          schemaField?.description ??
          "Loop this element's children from a CMS collection.",
        studioEditable: schemaField?.editable !== false,
        studioHidden: schemaField?.hidden === true,
        ...contentEditorStateForProp({
          node,
          propName: "items",
          type: inferredType,
          schemaField,
        }),
        hasSchemaField: Boolean(schemaField),
      });
    }

    return props.sort((a, b) => a.name.localeCompare(b.name));
  });

  /**
   * Get property count
   */
  const propertyCount = computed(() => properties.value.length);

  /**
   * Check if there are any properties
   */
  const hasProperties = computed(() => propertyCount.value > 0);

  const selectedCollection = computed(
    () =>
      collections.value.find(
        (collection) => collection.name === selectedCollectionName.value,
      ) ?? null,
  );

  function resolveActiveCmsCollection(): AriaCollection | null {
    if (selectedCollection.value) {
      return selectedCollection.value;
    }

    const autoScopePageCollection = shouldAutoScopePageAssignedCollection({
      isListTemplatePage: isListTemplatePage.value,
      hasInheritedCmsLoopSource: hasInheritedCmsLoopSource.value,
      nodeDataSourceCollection: nodeDataSource.value?.collection,
    });

    const collectionName =
      nodeDataSource.value?.collection ??
      inheritedCmsLoopSource.value?.collection ??
      (autoScopePageCollection ? pageAssignedCollection.value?.name : null) ??
      null;
    if (!collectionName) {
      return null;
    }

    return (
      collections.value.find(
        (candidate) => candidate.name === collectionName,
      ) ??
      (autoScopePageCollection ? pageAssignedCollection.value : null) ??
      null
    );
  }

  const nodeDataSource = computed(() => {
    return (
      parsedNodeDataSource(inspector.elementContext.value.node) ?? undefined
    );
  });

  const cmsBindings = computed(() => nodeDataSource.value?.bindings ?? {});
  const cmsBindingFormats = computed(
    () => nodeDataSource.value?.bindingFormats ?? {},
  );
  function boundFieldTypeForProp(propName: string): string | null {
    return resolveCmsBindingFieldType(
      cmsBindings.value[propName],
      cmsFieldOptions.value,
    );
  }

  function isDateBoundProp(propName: string): boolean {
    const fieldType = boundFieldTypeForProp(propName);
    return (
      isPropCmsBound(propName) &&
      Boolean(fieldType && isDateBindingFieldType(fieldType))
    );
  }

  function dateFormatForProp(
    propName: string,
    fieldPath?: string,
  ): CmsDateFormatId {
    const resolvedPropName = resolveInspectorContentBindingPropName({
      nodeType: inspector.elementContext.value.node?.type,
      propName,
    });

    const pending = pendingDateFormats.value[resolvedPropName];
    if (pending) {
      return pending;
    }

    const stored = cmsBindingFormats.value[resolvedPropName];
    if (stored) {
      return stored;
    }

    const resolvedPath = fieldPath ?? cmsBindings.value[resolvedPropName];
    const fieldType = resolveCmsBindingFieldType(
      resolvedPath,
      cmsFieldOptions.value,
    );
    if (fieldType === "date" || fieldType === "datetime") {
      return defaultDateFormatForFieldType(fieldType);
    }

    return "medium";
  }

  function nextBindingFormatsForBinding(
    propName: string,
    fieldPath: string,
    current?: Record<string, CmsDateFormatId>,
  ): Record<string, CmsDateFormatId> | undefined {
    const nextFormats = { ...(current ?? {}) };
    const fieldType = resolveCmsBindingFieldType(
      fieldPath,
      cmsFieldOptions.value,
    );

    if (fieldType && isDateBindingFieldType(fieldType)) {
      nextFormats[propName] =
        nextFormats[propName] ??
        defaultDateFormatForFieldType(
          fieldType === "datetime" ? "datetime" : "date",
        );
    } else {
      delete nextFormats[propName];
    }

    return Object.keys(nextFormats).length > 0 ? nextFormats : undefined;
  }

  function formatBoundPropDisplayValue(
    propName: string,
    value: unknown,
  ): unknown {
    if (!isDateBoundProp(propName)) {
      return value;
    }

    return formatCmsDateValue(value, dateFormatForProp(propName));
  }

  const inheritedCmsLoopSource = computed<InheritedCmsLoopSource | null>(() =>
    findInheritedCmsLoopSource(
      selectionTreeRootNodes.value as readonly BuilderNode[],
      inspector.elementContext.value.nodeId,
    ),
  );
  const hasInheritedCmsLoopSource = computed(
    () => inheritedCmsLoopSource.value !== null,
  );
  const isSelectedNodeRepeatCapable = computed(() => {
    const node = inspector.elementContext.value.node;
    if (isRepeatCapableInspectorNodeType(node?.type)) {
      return true;
    }
    return Array.isArray(node?.children) && node.children.length > 0;
  });
  const nodeBindingSummary = computed(() => {
    const bindingCount = Object.keys(cmsBindings.value).length;
    const isListSource =
      nodeDataSource.value?.mode === "list" &&
      isSelectedNodeRepeatCapable.value;
    return {
      mode: bindingCount > 0 || isListSource ? "dynamic" : "static",
      bindingCount,
      label: isListSource
        ? "Dynamic · loop"
        : bindingCount > 0
          ? `Dynamic · ${bindingCount} ${
              bindingCount === 1 ? "binding" : "bindings"
            }`
          : "Static",
    } as const;
  });
  const cmsDataSourceMode = computed(
    () => nodeDataSource.value?.mode ?? "single",
  );
  const cmsListLimit = computed(() => nodeDataSource.value?.limit ?? 12);
  const cmsListSort = computed(
    () => nodeDataSource.value?.sort ?? "-publishedAt",
  );
  const cmsListOffset = computed(() => nodeDataSource.value?.offset ?? 0);
  const cmsListStatus = computed(() => nodeDataSource.value?.status ?? "");
  const cmsListLocale = computed(() => nodeDataSource.value?.locale ?? "");
  const cmsListArchiveFilterPendingMode = ref<"relation" | "reference" | null>(
    null,
  );
  const cmsArchiveBridgingFields = computed(
    (): readonly CmsArchiveBridgingField[] => {
      if (!isEntryTemplatePage.value) {
        return [];
      }
      const listCollection = resolveActiveCmsCollection();
      const entryCollection = pageAssignedCollection.value;
      if (
        !listCollection ||
        !entryCollection ||
        listCollection.id === entryCollection.id
      ) {
        return [];
      }
      return findArchiveBridgingFields({
        listCollection,
        entryContextCollectionId: entryCollection.id,
        collections: collections.value,
      });
    },
  );
  const cmsListArchiveFilterMode = computed(() => {
    const filter = isRecord(nodeDataSource.value?.filter)
      ? nodeDataSource.value.filter
      : null;
    if (isRecord(filter?.relationIncludes)) {
      return "relation";
    }
    if (isRecord(filter?.referenceEquals)) {
      return "reference";
    }
    return "none";
  });
  const cmsListArchiveFilterEffectiveMode = computed(() => {
    return (
      cmsListArchiveFilterPendingMode.value ?? cmsListArchiveFilterMode.value
    );
  });
  const cmsListArchiveFilterShowFieldPicker = computed(() => {
    const mode = cmsListArchiveFilterEffectiveMode.value;
    if (mode !== "relation" && mode !== "reference") {
      return false;
    }
    const candidates =
      mode === "relation"
        ? cmsListArchiveRelationFields.value
        : cmsListArchiveReferenceFields.value;
    if (candidates.length <= 1) {
      return false;
    }
    return (
      cmsListArchiveFilterPendingMode.value !== null ||
      cmsListArchiveFilterField.value === ""
    );
  });
  const cmsListArchiveFilterField = computed(() => {
    const filter = isRecord(nodeDataSource.value?.filter)
      ? nodeDataSource.value.filter
      : null;
    if (!filter) {
      return "";
    }
    const relationIncludes = isRecord(filter.relationIncludes)
      ? filter.relationIncludes
      : null;
    if (relationIncludes) {
      const field = relationIncludes.field;
      if (typeof field === "string") {
        return field;
      }
    }
    const referenceEquals = isRecord(filter.referenceEquals)
      ? filter.referenceEquals
      : null;
    if (referenceEquals) {
      const field = referenceEquals.field;
      if (typeof field === "string") {
        return field;
      }
    }
    return "";
  });
  const cmsListArchiveRelationFields = computed(() =>
    cmsArchiveBridgingFields.value.filter((field) => field.type === "relation"),
  );
  const cmsListArchiveReferenceFields = computed(() =>
    cmsArchiveBridgingFields.value.filter(
      (field) => field.type === "reference",
    ),
  );
  const selectedCmsEntryId = computed(() => {
    const filter = isRecord(nodeDataSource.value?.filter)
      ? nodeDataSource.value.filter
      : null;
    const nodeFilterEntryId = typeof filter?.id === "string" ? filter.id : "";
    return resolveInspectorPreviewEntryId({
      isEntryTemplatePage: isEntryTemplatePage.value,
      pagePreviewEntryId: cmsPreviewEntryContext?.previewEntryId.value ?? "",
      nodeFilterEntryId,
    });
  });
  const effectiveSelectedCollectionName = computed(() => {
    if (nodeDataSource.value?.collection) {
      return nodeDataSource.value.collection;
    }
    if (inheritedCmsLoopSource.value?.collection) {
      return inheritedCmsLoopSource.value.collection;
    }
    if (
      shouldAutoScopePageAssignedCollection({
        isListTemplatePage: isListTemplatePage.value,
        hasInheritedCmsLoopSource: hasInheritedCmsLoopSource.value,
        nodeDataSourceCollection: nodeDataSource.value?.collection,
      })
    ) {
      return pageAssignedCollection.value?.name ?? selectedCollectionName.value;
    }
    return selectedCollectionName.value;
  });

  const cmsEntryOptions = computed(() =>
    cmsEntries.value.map((record) => {
      const sourceLocale =
        record.locales.find((locale) => locale.isSource) ?? record.locales[0];
      return {
        id: record.entry.id,
        title: sourceLocale?.title || "Untitled",
        slug: sourceLocale?.slug || record.entry.id,
        status: record.entry.status,
      };
    }),
  );

  const cmsLocaleOptions = computed(() => {
    const locales = new Set<string>();
    for (const record of cmsEntries.value) {
      for (const locale of record.locales) {
        locales.add(locale.locale);
      }
    }
    return [...locales].sort((left, right) => left.localeCompare(right));
  });

  const cmsFieldOptions = computed<CmsBindingFieldOption[]>(() => {
    const collection = resolveActiveCmsCollection();
    if (!collection) {
      return [];
    }
    const collectionsByKey = buildCollectionsByKey(collections.value);
    return CmsBindingFieldOptionsSchema.parse([
      ...createSystemFieldOptions(collection),
      ...createSchemaFieldOptions(
        collection.name,
        entryFieldsForCollection(collection),
        collection.name,
        "",
        0,
        collectionsByKey,
      ),
    ]);
  });

  function cmsFieldOptionGroupsForProp(
    prop: PropertyDefinition,
  ): CmsBindingFieldOptionGroup[] {
    return createCmsBindingFieldOptionGroups(
      prop,
      cmsFieldOptions.value,
      cmsBindings.value[prop.name],
    );
  }

  function cmsBindingDisplayForProp(
    propName: string,
  ): CmsBindingDisplay | null {
    const bindingPath = cmsBindings.value[propName];
    if (!bindingPath) {
      return null;
    }

    const sourceLabel =
      selectedCollection.value?.label ??
      selectedCollection.value?.name ??
      nodeDataSource.value?.collection ??
      "CMS";
    const fieldLabel =
      cmsFieldOptions.value.find((option) => option.path === bindingPath)
        ?.label ?? humanizeFieldPathSegment(bindingPath);

    return CmsBindingDisplaySchema.parse({
      sourceLabel,
      fieldLabel,
      label: `${sourceLabel} → ${fieldLabel}`,
    });
  }

  function isPropCmsBound(propName: string): boolean {
    return propName in cmsBindings.value;
  }

  function propBindingMode(propName: string): PropBindingMode {
    if (isRepeatBindingPropName(propName)) {
      if (
        isNodeListLoopDataSource(nodeDataSource.value) &&
        isSelectedNodeRepeatCapable.value
      ) {
        return "dynamic";
      }
      if (pendingDynamicProps.value.has(propName)) {
        return "dynamic";
      }
      return "static";
    }

    return isPropCmsBound(propName) || pendingDynamicProps.value.has(propName)
      ? "dynamic"
      : "static";
  }

  async function ensureTemplatePageDataSource(): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!isEntryTemplatePage.value) {
      return { success: true };
    }

    if (isStaticNavigationInspectorNode(inspector.elementContext.value.node)) {
      return { success: true };
    }

    const assignedCollection = pageAssignedCollection.value;
    if (
      !shouldBootstrapTemplatePageDataSource({
        isAssignedCmsTemplatePage: true,
        assignedCollectionName: assignedCollection?.name ?? null,
        existingCollectionName: nodeDataSource.value?.collection,
      })
    ) {
      if (assignedCollection) {
        if (selectedCollectionName.value !== assignedCollection.name) {
          selectedCollectionName.value = assignedCollection.name;
        }
      }
      return { success: true };
    }

    selectedCollectionName.value = assignedCollection!.name;
    await loadCmsEntriesForCollection(assignedCollection);
    return persistCmsDataSource(
      nextCmsDataSource({
        collection: assignedCollection!,
        mode: "single",
        bindings: nodeDataSource.value?.bindings,
      }),
      "Set CMS collection from entry template",
    );
  }

  async function ensureTemplatePageListDataSource(): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!isListTemplatePage.value || !isSelectedNodeRepeatCapable.value) {
      return { success: true };
    }

    if (isStaticNavigationInspectorNode(inspector.elementContext.value.node)) {
      return { success: true };
    }

    const assignedCollection = pageAssignedCollection.value;
    if (
      !shouldBootstrapTemplatePageListDataSource({
        isListTemplatePage: isListTemplatePage.value,
        isRepeatCapable: isSelectedNodeRepeatCapable.value,
        assignedCollectionName: assignedCollection?.name ?? null,
        existingCollectionName: nodeDataSource.value?.collection,
      })
    ) {
      if (assignedCollection) {
        if (selectedCollectionName.value !== assignedCollection.name) {
          selectedCollectionName.value = assignedCollection.name;
        }
      }
      return { success: true };
    }

    selectedCollectionName.value = assignedCollection!.name;
    await loadCmsEntriesForCollection(assignedCollection);
    return persistCmsDataSource(
      nextCmsDataSource({
        collection: assignedCollection!,
        mode: "list",
        limit: 12,
        sort: "-publishedAt",
      }),
      "Set CMS collection from list template",
    );
  }

  async function setPropBindingMode(propName: string, mode: PropBindingMode) {
    const parsedMode = PropBindingModeSchema.parse(mode);
    if (parsedMode === "static") {
      const nextPending = new Set(pendingDynamicProps.value);
      nextPending.delete(propName);
      pendingDynamicProps.value = nextPending;

      if (
        isRepeatBindingPropName(propName) &&
        isNodeListLoopDataSource(nodeDataSource.value)
      ) {
        return clearCmsRepeatSource();
      }

      if (!(propName in cmsBindings.value)) {
        return { success: true };
      }
      return clearCmsBinding(propName);
    }

    pendingDynamicProps.value = new Set([
      ...pendingDynamicProps.value,
      propName,
    ]);

    const assignedCollection = pageAssignedCollection.value;
    if (
      isEntryTemplatePage.value &&
      assignedCollection &&
      !nodeDataSource.value?.collection
    ) {
      selectedCollectionName.value = assignedCollection.name;
      await loadCmsEntriesForCollection(assignedCollection);
      const persistResult = await persistCmsDataSource(
        nextCmsDataSource({
          collection: assignedCollection,
          mode: "single",
          bindings: nodeDataSource.value?.bindings,
        }),
        "Set CMS collection from entry template",
      );
      if (!persistResult.success) {
        return persistResult;
      }
    }

    if (isRepeatBindingPropName(propName)) {
      if (isListTemplatePage.value) {
        const assignedCollection = pageAssignedCollection.value;
        if (assignedCollection && !selectedCollectionName.value) {
          selectedCollectionName.value = assignedCollection.name;
          await loadCmsEntriesForCollection(assignedCollection);
        }
        if (!nodeDataSource.value?.collection) {
          return ensureTemplatePageListDataSource();
        }
      }
      const collection = resolveActiveCmsCollection();
      if (!collection) {
        return { success: false, error: "Select a CMS collection first" };
      }
      if (selectedCollectionName.value !== collection.name) {
        selectedCollectionName.value = collection.name;
        await loadCmsEntriesForCollection(collection);
      }
      return updateCmsDataSourceMode("list");
    }
    return { success: true };
  }

  /**
   * Infer type from value
   */
  function inferType(value: unknown): PropertyDefinition["type"] {
    if (value === null || value === undefined) return "unknown";
    if (typeof value === "string") return "string";
    if (typeof value === "number") return "number";
    if (typeof value === "boolean") return "boolean";
    if (Array.isArray(value)) return "array";
    if (typeof value === "object") return "object";
    return "unknown";
  }

  /**
   * Convert value to appropriate type
   */
  function coerceValue(
    value: unknown,
    type: PropertyDefinition["type"],
  ): unknown {
    switch (type) {
      case "number":
        return typeof value === "string" ? parseFloat(value) || 0 : value;
      case "boolean":
        return value === true || value === "true";
      case "string":
        return String(value ?? "");
      default:
        return value;
    }
  }

  async function loadCmsCollections(): Promise<void> {
    isLoadingCollections.value = true;
    collectionsError.value = null;
    try {
      const { data, error } = await actions.cms.collections.list({});
      if (error) {
        collectionsError.value = error.message ?? "Failed to load collections";
        return;
      }
      const parsed = ListCollectionsResponseSchema.parse(data);
      collections.value = parsed.collections;
      const assigned = pageAssignedCollection.value;
      if (!selectedCollectionName.value && assigned) {
        selectedCollectionName.value = assigned.name;
      }
    } catch (error) {
      collectionsError.value =
        error instanceof Error ? error.message : "Failed to load collections";
    } finally {
      isLoadingCollections.value = false;
    }
  }

  async function loadCmsEntriesForCollection(
    collection: AriaCollection | null,
  ): Promise<void> {
    if (!collection) {
      cmsEntries.value = [];
      return;
    }

    isLoadingCmsEntries.value = true;
    cmsEntriesError.value = null;
    try {
      const payload = EntryListRequestSchema.parse({
        collectionId: collection.id,
        page: 1,
        limit: 100,
        sort: [{ field: "updatedAt", direction: "desc" }],
      });
      const { data, error } = await actions.cms.entries.list(payload);
      if (error) {
        cmsEntriesError.value = error.message ?? "Failed to load entries";
        cmsEntries.value = [];
        return;
      }

      cmsEntries.value = ListEntriesResponseSchema.parse(data).items;
    } catch (error) {
      cmsEntriesError.value =
        error instanceof Error ? error.message : "Failed to load entries";
      cmsEntries.value = [];
    } finally {
      isLoadingCmsEntries.value = false;
    }
  }

  function dataSourceCollectionName(collection: AriaCollection): string {
    return collection.name;
  }

  function primaryEntryLocale(record: AriaEntryRecord) {
    return (
      record.locales.find((locale) => locale.isSource) ?? record.locales[0]
    );
  }

  function selectedCmsEntryRecord(): AriaEntryRecord | null {
    const entryId = selectedCmsEntryId.value;
    if (!entryId) {
      return null;
    }
    return (
      cmsEntries.value.find((record) => record.entry.id === entryId) ?? null
    );
  }

  function resolveCmsBindingPreviewValue(fieldPath: string): unknown {
    const collection = selectedCollection.value;
    const record = selectedCmsEntryRecord();
    if (!collection || !record) {
      return undefined;
    }

    const locale = primaryEntryLocale(record);
    if (!locale) {
      return undefined;
    }

    const parts = fieldPath.split(".").filter(Boolean);
    const path =
      parts[0] === collection.name || parts[0] === collection.label
        ? parts.slice(1)
        : parts;
    if (path.length === 0) {
      return undefined;
    }

    if (
      (path[0] === "url" || path[0] === "permalink") &&
      collection.urlPattern
    ) {
      return buildCmsEntryPublicPath(collection.urlPattern, locale.slug);
    }

    const root: Record<string, unknown> = {
      id: record.entry.id,
      slug: locale.slug,
      title: locale.title,
      status: record.entry.status,
      body: locale.body,
      updatedAt: record.entry.updatedAt,
      publishedAt: record.entry.publishedAt,
      ...locale.frontmatter,
      frontmatter: locale.frontmatter,
      record,
    };

    return path.reduce<unknown>((value, key) => {
      if (value && typeof value === "object" && key in value) {
        return (value as Record<string, unknown>)[key];
      }
      return undefined;
    }, root);
  }

  function resolveCmsBindingPreviewValueForProp(
    propName: string,
    fieldPath: string,
  ): unknown {
    const value = resolveCmsBindingPreviewValue(fieldPath);
    if (isStyleBindingKey(propName)) {
      return coerceCmsBindingValueForStyleTarget(propName, value);
    }
    if (isImageProp(propName)) {
      return resolveCmsImageBindingPreviewValue(value);
    }
    const coerced = coerceCmsBindingValueForNodeProp(propName, value);
    const fieldType = resolveCmsBindingFieldType(
      fieldPath,
      cmsFieldOptions.value,
    );
    if (fieldType && isDateBindingFieldType(fieldType)) {
      return formatCmsDateValue(
        coerced,
        dateFormatForProp(propName, fieldPath),
      );
    }
    return coerced;
  }

  function nextCmsDataSource(input: {
    collection: AriaCollection;
    mode?: "single" | "list";
    entry?: { id: string; slug?: string };
    limit?: number;
    sort?: string;
    offset?: number;
    status?: "draft" | "published" | "scheduled" | "archived" | null;
    locale?: string | null;
    bindings?: Record<string, string>;
    filter?: CmsListFilter | null;
  }): NodeDataSource {
    const current = nodeDataSource.value;
    const mode = CmsSourceModeSchema.parse(
      input.mode ?? current?.mode ?? "single",
    );
    const sort = input.sort ?? current?.sort;
    const limit =
      input.limit ??
      (typeof current?.limit === "number" ? current.limit : undefined);
    const offset =
      input.offset ??
      (typeof current?.offset === "number" ? current.offset : undefined);
    const status =
      input.status === null
        ? undefined
        : input.status !== undefined
          ? CmsListStatusSchema.parse(input.status)
          : current?.status;
    const locale =
      input.locale === null
        ? undefined
        : input.locale !== undefined
          ? CmsListLocaleSchema.parse(input.locale)
          : current?.locale;
    const nextFilter =
      mode === "single"
        ? input.entry
          ? {
              id: input.entry.id,
              ...(input.entry.slug ? { slug: input.entry.slug } : {}),
            }
          : current?.filter
        : undefined;

    const nextDataSource: Record<string, unknown> = {
      type:
        current?.type === "cms" || current?.type === "collection"
          ? current.type
          : "collection",
      collection: dataSourceCollectionName(input.collection),
      mode,
      ...(current?.include ? { include: current.include } : {}),
      ...(current?.cache ? { cache: current.cache } : {}),
      ...(typeof current?.live === "boolean" ? { live: current.live } : {}),
      ...(current?.transform ? { transform: current.transform } : {}),
      ...(current?.itemTemplate ? { itemTemplate: current.itemTemplate } : {}),
      ...(current?.fallback !== undefined
        ? { fallback: current.fallback }
        : {}),
      ...(current?.onError ? { onError: current.onError } : {}),
      ...((input.bindings ?? current?.bindings)
        ? { bindings: input.bindings ?? current?.bindings }
        : {}),
      ...(current?.bindingFormats
        ? { bindingFormats: current.bindingFormats }
        : {}),
    };

    if (mode === "single" && nextFilter) {
      nextDataSource.filter = nextFilter;
    }

    if (mode === "list") {
      if (sort) nextDataSource.sort = sort;
      if (limit !== undefined) nextDataSource.limit = limit;
      if (offset !== undefined) nextDataSource.offset = offset;
      if (status) nextDataSource.status = status;
      if (locale) nextDataSource.locale = locale;
      const listFilter =
        input.filter === null
          ? undefined
          : (input.filter ??
            (current?.mode === "list" ? current.filter : undefined));
      if (
        listFilter &&
        typeof listFilter === "object" &&
        Object.keys(listFilter).length > 0
      ) {
        nextDataSource.filter = listFilter;
      }
    }

    return NodeDataSourceSchema.unwrap().parse(nextDataSource);
  }

  function refreshSelectionTreeReference(): void {
    const nextRootNodes: BuilderNode[] = Array.from(
      selectionTreeRootNodes.value as BuilderNode[],
    );
    setSelectionTreeRootNodes(nextRootNodes);
  }

  function applyOptimisticDataSourceUpdate(
    nextDataSource: NodeDataSource | null,
  ): NodeDataSource | null | undefined {
    const nodeId = inspector.elementContext.value.nodeId;
    if (!nodeId) {
      return undefined;
    }

    const previousDataSource = nodeDataSource.value ?? null;
    updateSelectedNodeDataSource(nodeId, nextDataSource);
    refreshSelectionTreeReference();
    return previousDataSource;
  }

  function restoreOptimisticDataSourceUpdate(
    previousDataSource: NodeDataSource | null | undefined,
  ): void {
    if (previousDataSource === undefined) {
      return;
    }

    const nodeId = inspector.elementContext.value.nodeId;
    if (!nodeId) {
      return;
    }

    updateSelectedNodeDataSource(nodeId, previousDataSource);
    refreshSelectionTreeReference();
  }

  async function persistCmsDataSource(
    nextDataSource: NodeDataSource,
    description: string,
  ) {
    cmsSourceError.value = null;
    const previousDataSource = applyOptimisticDataSourceUpdate(nextDataSource);
    const result = await inspector.updateProperty(
      "dataSource",
      nextDataSource,
      {
        description,
        restoreValue: previousDataSource,
      },
    );
    if (!result.success) {
      restoreOptimisticDataSourceUpdate(previousDataSource);
      cmsSourceError.value = result.error ?? "Failed to update CMS source";
    }
    return result;
  }

  function suggestArchiveListFilter(
    listCollection: AriaCollection,
  ): CmsListFilter | undefined {
    if (!isEntryTemplatePage.value) {
      return undefined;
    }
    const entryCollection = pageAssignedCollection.value;
    if (
      !entryCollection ||
      listCollection.id === entryCollection.id ||
      nodeDataSource.value?.filter?.relationIncludes ||
      nodeDataSource.value?.filter?.referenceEquals
    ) {
      return undefined;
    }
    const bridging = findArchiveBridgingFields({
      listCollection,
      entryContextCollectionId: entryCollection.id,
      collections: collections.value,
    });
    if (bridging.length !== 1) {
      return undefined;
    }
    return buildArchiveListFilter({ bridgingField: bridging[0]! });
  }

  async function updateCmsCollection(collectionName: string) {
    const collection = collections.value.find(
      (candidate) => candidate.name === collectionName,
    );
    if (!collection) {
      cmsSourceError.value = "Select a CMS collection first";
      return { success: false, error: cmsSourceError.value };
    }

    selectedCollectionName.value = collection.name;
    await loadCmsEntriesForCollection(collection);
    const shouldUseListMode =
      pendingDynamicProps.value.has(REPEAT_BINDING_PROP_NAME) &&
      isSelectedNodeRepeatCapable.value;
    const archiveFilter = shouldUseListMode
      ? suggestArchiveListFilter(collection)
      : undefined;
    return persistCmsDataSource(
      nextCmsDataSource({
        collection,
        mode: CmsSourceModeSchema.parse(
          shouldUseListMode ? "list" : (nodeDataSource.value?.mode ?? "single"),
        ),
        bindings: nodeDataSource.value?.bindings,
        ...(archiveFilter ? { filter: archiveFilter } : {}),
      }),
      "Set CMS collection",
    );
  }

  async function updateCmsLoopCollection(collectionName: string) {
    const collection = collections.value.find(
      (candidate) => candidate.name === collectionName,
    );
    if (!collection) {
      cmsSourceError.value = "Select a CMS collection first";
      return { success: false, error: cmsSourceError.value };
    }
    if (!isSelectedNodeRepeatCapable.value) {
      cmsSourceError.value =
        "Loops work on containers or elements with children.";
      return { success: false, error: cmsSourceError.value };
    }

    selectedCollectionName.value = collection.name;
    await loadCmsEntriesForCollection(collection);
    const archiveFilter = suggestArchiveListFilter(collection);
    return persistCmsDataSource(
      nextCmsDataSource({
        collection,
        mode: "list",
        bindings: nodeDataSource.value?.bindings,
        ...(archiveFilter ? { filter: archiveFilter } : {}),
      }),
      "Set CMS loop collection",
    );
  }

  function nextDataSourceForBinding(
    propName: string,
    fieldPath: string,
  ): NodeDataSource | null {
    const node = inspector.elementContext.value.node;
    const resolvedPropName = resolveInspectorContentBindingPropName({
      nodeType: node?.type,
      propName,
    });

    if (inheritedCmsLoopSource.value) {
      const current = nodeDataSource.value;
      const bindings = stripAliasContentBindings(
        node?.type,
        {
          ...(current?.bindings ?? {}),
          [resolvedPropName]: fieldPath,
        },
        resolvedPropName,
        fieldPath,
      );
      const bindingFormats = nextBindingFormatsForBinding(
        resolvedPropName,
        fieldPath,
        current?.bindingFormats,
      );
      return NodeDataSourceSchema.unwrap().parse({
        ...(current?.type === "static" ? current : { type: "static" }),
        bindings,
        ...(bindingFormats ? { bindingFormats } : {}),
      });
    }

    const collection = selectedCollection.value;
    if (!collection) {
      return null;
    }
    const current = nodeDataSource.value;
    const bindings = stripAliasContentBindings(
      node?.type,
      {
        ...(current?.bindings ?? {}),
        [resolvedPropName]: fieldPath,
      },
      resolvedPropName,
      fieldPath,
    );
    const bindingFormats = nextBindingFormatsForBinding(
      resolvedPropName,
      fieldPath,
      current?.bindingFormats,
    );
    return NodeDataSourceSchema.unwrap().parse({
      ...(current ?? {}),
      type:
        current?.type === "cms" || current?.type === "collection"
          ? current.type
          : "collection",
      collection: collection.name,
      mode: current?.mode ?? "single",
      bindings,
      ...(bindingFormats ? { bindingFormats } : {}),
    });
  }

  function nextDataSourceWithoutBinding(
    propName: string,
  ): NodeDataSource | null {
    const node = inspector.elementContext.value.node;
    const resolvedPropName = resolveInspectorContentBindingPropName({
      nodeType: node?.type,
      propName,
    });
    const current = nodeDataSource.value;
    if (!current?.bindings) {
      return current ?? null;
    }

    const propNamesToClear = new Set([resolvedPropName]);
    for (const alias of getContentPropAliases(node?.type)) {
      if (alias in current.bindings) {
        propNamesToClear.add(alias);
      }
    }

    const hasBindingToClear = [...propNamesToClear].some(
      (bindingPropName) => bindingPropName in current.bindings!,
    );
    if (!hasBindingToClear) {
      return current ?? null;
    }

    const bindings = { ...current.bindings };
    for (const bindingPropName of propNamesToClear) {
      delete bindings[bindingPropName];
    }
    const bindingFormats = { ...(current.bindingFormats ?? {}) };
    for (const bindingPropName of propNamesToClear) {
      delete bindingFormats[bindingPropName];
    }
    if (Object.keys(bindings).length === 0 && !current.collection) {
      return null;
    }
    return NodeDataSourceSchema.unwrap().parse({
      ...current,
      bindings: Object.keys(bindings).length > 0 ? bindings : undefined,
      ...(Object.keys(bindingFormats).length > 0 ? { bindingFormats } : {}),
    });
  }

  function nextDataSourceWithoutRepeatSource(): NodeDataSource | null {
    return nextDataSourceAfterDisablingListLoop(nodeDataSource.value);
  }

  async function bindPropToCmsField(propName: string, fieldPath: string) {
    const node = inspector.elementContext.value.node;
    const resolvedPropName = resolveInspectorContentBindingPropName({
      nodeType: node?.type,
      propName,
    });

    if (isEntryTemplatePage.value) {
      const ensureResult = await ensureTemplatePageDataSource();
      if (!ensureResult.success) {
        return ensureResult;
      }
    }

    const nextDataSource = nextDataSourceForBinding(
      resolvedPropName,
      fieldPath,
    );
    if (!nextDataSource) {
      return { success: false, error: "Select a CMS collection first" };
    }

    const previewValue = resolveCmsBindingPreviewValueForProp(
      resolvedPropName,
      fieldPath,
    );
    const updates: Record<string, unknown> = {
      dataSource: nextDataSource,
    };
    if (resolvedPropName === "src") {
      if (
        readComposerNodeMediaReferences(node?.metadata).image ||
        node?.metadata?.responsiveImage
      ) {
        updates.metadata = withComposerResponsiveImage(
          withComposerImageReference(node?.metadata, null),
          null,
        );
      }
    } else if (resolvedPropName === STYLE_BINDING_BACKGROUND_IMAGE) {
      const references = readComposerNodeMediaReferences(node?.metadata);
      let metadata = node?.metadata;
      for (const breakpoint of Object.keys(references.background ?? {})) {
        metadata = withComposerBackgroundReference(metadata, breakpoint, null);
      }
      if (metadata !== node?.metadata) updates.metadata = metadata;
    }
    if (isStyleBindingKey(resolvedPropName)) {
      const styleKey = parseStyleBindingStyleKey(resolvedPropName);
      if (
        styleKey &&
        typeof previewValue === "string" &&
        previewValue.trim().length > 0
      ) {
        updates[`styles.${styleKey}`] = { base: previewValue };
      }
    } else if (isJsonValue(previewValue)) {
      updates[`props.${resolvedPropName}`] = previewValue;
    }

    for (const alias of getContentPropAliases(node?.type)) {
      if (
        node?.props &&
        Object.prototype.hasOwnProperty.call(node.props, alias)
      ) {
        updates[`props.${alias}`] = undefined;
      }
    }

    const result = await inspector.batchUpdate(updates, {
      description: `Bind ${resolvedPropName} to CMS field`,
    });
    if (result.success) {
      const nextPending = new Set(pendingDynamicProps.value);
      nextPending.delete(propName);
      nextPending.delete(resolvedPropName);
      for (const alias of getContentPropAliases(node?.type)) {
        nextPending.delete(alias);
      }
      pendingDynamicProps.value = nextPending;
    }
    return result;
  }

  async function setPropDateFormat(
    propName: string,
    formatId: CmsDateFormatId,
  ) {
    const resolvedPropName = resolveInspectorContentBindingPropName({
      nodeType: inspector.elementContext.value.node?.type,
      propName,
    });
    const bindingPath = cmsBindings.value[resolvedPropName];
    if (!bindingPath) {
      return { success: false, error: "Bind a CMS date field first" };
    }

    const current = nodeDataSource.value;
    if (!current) {
      return { success: false, error: "No CMS data source configured" };
    }

    const nodeId = inspector.elementContext.value.nodeId;
    if (!nodeId) {
      return { success: false, error: "No target node selected" };
    }

    const nextFormats = {
      ...(current.bindingFormats ?? {}),
      [resolvedPropName]: formatId,
    };
    const nextDataSource = NodeDataSourceSchema.unwrap().parse({
      ...current,
      bindingFormats: nextFormats,
    });
    const previewValue = coerceCmsBindingValueForNodeProp(
      resolvedPropName,
      resolveCmsBindingPreviewValue(bindingPath),
    );
    const formattedPreview = isJsonValue(previewValue)
      ? formatCmsDateValue(previewValue, formatId)
      : null;

    pendingDateFormats.value = {
      ...pendingDateFormats.value,
      [resolvedPropName]: formatId,
    };

    if (formattedPreview !== null) {
      broadcastPropsUpdate({
        nodeId,
        props: { [resolvedPropName]: formattedPreview },
        source: "inspector-live",
      });
    }

    const updates: Record<string, unknown> = {
      dataSource: nextDataSource,
    };

    if (formattedPreview !== null) {
      updates[`props.${resolvedPropName}`] = formattedPreview;
    }

    const result = await inspector.batchUpdate(updates, {
      description: `Set date format for ${resolvedPropName}`,
    });

    const nextPending = { ...pendingDateFormats.value };
    delete nextPending[resolvedPropName];
    pendingDateFormats.value = nextPending;

    return result;
  }

  async function clearCmsBinding(propName: string) {
    return inspector.updateProperty(
      "dataSource",
      nextDataSourceWithoutBinding(propName),
      {
        description: `Clear CMS binding for ${propName}`,
      },
    );
  }

  async function unbindPropFromCms(propName: string) {
    const hadBinding = propName in cmsBindings.value;

    if (hadBinding) {
      const nextDataSource = nextDataSourceWithoutBinding(propName);
      const previousDataSource =
        applyOptimisticDataSourceUpdate(nextDataSource);

      const clearResult = await inspector.updateProperty(
        "dataSource",
        nextDataSource,
        {
          description: `Clear CMS binding for ${propName}`,
          restoreValue: previousDataSource,
        },
      );

      if (!clearResult.success) {
        restoreOptimisticDataSourceUpdate(previousDataSource);
        return clearResult;
      }
    }

    const nextPending = new Set(pendingDynamicProps.value);
    nextPending.delete(propName);
    pendingDynamicProps.value = nextPending;

    if (hadBinding) {
      return { success: true };
    }

    return setPropBindingMode(propName, "static");
  }

  async function clearCmsRepeatSource() {
    const nextDataSource = nextDataSourceWithoutRepeatSource();
    const previousDataSource = applyOptimisticDataSourceUpdate(nextDataSource);

    const result =
      nextDataSource === null
        ? await inspector.updateProperty("dataSource", undefined, {
            description: "Clear CMS loop source",
            restoreValue: previousDataSource,
          })
        : await inspector.updateProperty("dataSource", nextDataSource, {
            description: "Clear CMS loop source",
            restoreValue: previousDataSource,
          });

    if (!result.success) {
      restoreOptimisticDataSourceUpdate(previousDataSource);
    }

    return result;
  }

  async function updateCmsDataSourceMode(mode: "single" | "list") {
    const parsedMode = z.enum(["single", "list"]).parse(mode);
    const collection = resolveActiveCmsCollection();
    const current = nodeDataSource.value;
    if (!collection) {
      return { success: false, error: "Select a CMS collection first" };
    }
    if (selectedCollectionName.value !== collection.name) {
      selectedCollectionName.value = collection.name;
      await loadCmsEntriesForCollection(collection);
    }
    if (parsedMode === "list" && !isSelectedNodeRepeatCapable.value) {
      cmsSourceError.value =
        "Loops work on containers or elements with children.";
      return { success: false, error: cmsSourceError.value };
    }

    return persistCmsDataSource(
      nextCmsDataSource({
        collection,
        mode: parsedMode,
        bindings: current?.bindings,
      }),
      `Set CMS source mode to ${parsedMode}`,
    );
  }

  async function updateCmsSingleEntry(
    entryId: string,
    selectedEntry?: { id: string; slug?: string },
  ) {
    const collection = selectedCollection.value;
    if (!collection) {
      return { success: false, error: "Select a CMS collection first" };
    }
    const entry = selectedEntry ??
      cmsEntryOptions.value.find((option) => option.id === entryId) ?? {
        id: entryId,
      };
    if (!entry) {
      return { success: false, error: "Select a CMS entry first" };
    }

    return persistCmsDataSource(
      nextCmsDataSource({
        collection,
        mode: "single",
        entry: CmsSingleEntrySelectionSchema.parse(entry),
      }),
      "Set CMS single entry",
    );
  }

  async function updateCmsListLimit(limit: number) {
    const ensureResult = await ensureTemplatePageListDataSource();
    if (!ensureResult.success) {
      return ensureResult;
    }

    const collection = selectedCollection.value;
    if (!collection) {
      return { success: false, error: "Select a CMS collection first" };
    }
    if (!isSelectedNodeRepeatCapable.value) {
      cmsSourceError.value =
        "Loops work on containers or elements with children.";
      return { success: false, error: cmsSourceError.value };
    }
    return persistCmsDataSource(
      nextCmsDataSource({
        collection,
        mode: "list",
        limit: CmsListLimitSchema.parse(limit),
      }),
      "Set CMS list limit",
    );
  }

  async function updateCmsListSort(sort: string) {
    const ensureResult = await ensureTemplatePageListDataSource();
    if (!ensureResult.success) {
      return ensureResult;
    }

    const collection = selectedCollection.value;
    if (!collection) {
      return { success: false, error: "Select a CMS collection first" };
    }
    if (!isSelectedNodeRepeatCapable.value) {
      cmsSourceError.value =
        "Loops work on containers or elements with children.";
      return { success: false, error: cmsSourceError.value };
    }
    return persistCmsDataSource(
      nextCmsDataSource({
        collection,
        mode: "list",
        sort: CmsListSortSchema.parse(sort),
      }),
      "Set CMS list sort",
    );
  }

  async function updateCmsListStatus(status: string) {
    const ensureResult = await ensureTemplatePageListDataSource();
    if (!ensureResult.success) {
      return ensureResult;
    }

    const collection = selectedCollection.value;
    if (!collection) {
      return { success: false, error: "Select a CMS collection first" };
    }
    if (!isSelectedNodeRepeatCapable.value) {
      cmsSourceError.value =
        "Loops work on containers or elements with children.";
      return { success: false, error: cmsSourceError.value };
    }
    return persistCmsDataSource(
      nextCmsDataSource({
        collection,
        mode: "list",
        status:
          status === "__auto__" ? null : CmsListStatusSchema.parse(status),
      }),
      "Set CMS list status",
    );
  }

  async function updateCmsListOffset(offset: number) {
    const ensureResult = await ensureTemplatePageListDataSource();
    if (!ensureResult.success) {
      return ensureResult;
    }

    const collection = selectedCollection.value;
    if (!collection) {
      return { success: false, error: "Select a CMS collection first" };
    }
    if (!isSelectedNodeRepeatCapable.value) {
      cmsSourceError.value =
        "Loops work on containers or elements with children.";
      return { success: false, error: cmsSourceError.value };
    }
    return persistCmsDataSource(
      nextCmsDataSource({
        collection,
        mode: "list",
        offset: CmsListOffsetSchema.parse(offset),
      }),
      "Set CMS list offset",
    );
  }

  async function updateCmsListArchiveFilter(input: {
    mode: "none" | "relation" | "reference";
    fieldKey?: string;
  }) {
    const collection = resolveActiveCmsCollection();
    if (!collection) {
      return { success: false, error: "Select a CMS collection first" };
    }
    if (!isSelectedNodeRepeatCapable.value) {
      cmsSourceError.value =
        "Loops work on containers or elements with children.";
      return { success: false, error: cmsSourceError.value };
    }

    let filter: CmsListFilter | null = null;
    if (input.mode !== "none") {
      const candidates =
        input.mode === "relation"
          ? cmsListArchiveRelationFields.value
          : cmsListArchiveReferenceFields.value;
      if (candidates.length > 1 && !input.fieldKey) {
        cmsSourceError.value =
          "Choose which field links this collection to the current entry.";
        return { success: false, error: cmsSourceError.value };
      }
      const bridgingField =
        (input.fieldKey
          ? candidates.find((field) => field.key === input.fieldKey)
          : candidates[0]) ?? null;
      if (!bridgingField) {
        cmsSourceError.value =
          "No matching field links this collection to the current entry context.";
        return { success: false, error: cmsSourceError.value };
      }
      filter = buildArchiveListFilter({ bridgingField });
    }

    cmsListArchiveFilterPendingMode.value = null;
    if (selectedCollectionName.value !== collection.name) {
      selectedCollectionName.value = collection.name;
    }

    return persistCmsDataSource(
      nextCmsDataSource({
        collection,
        mode: "list",
        filter,
      }),
      input.mode === "none"
        ? "Clear CMS archive filter"
        : "Set CMS archive filter",
    );
  }

  async function setCmsListArchiveFilterMode(
    mode: "none" | "relation" | "reference",
  ) {
    if (mode === "none") {
      cmsListArchiveFilterPendingMode.value = null;
      return updateCmsListArchiveFilter({ mode: "none" });
    }

    const candidates =
      mode === "relation"
        ? cmsListArchiveRelationFields.value
        : cmsListArchiveReferenceFields.value;
    if (candidates.length > 1) {
      cmsListArchiveFilterPendingMode.value = mode;
      cmsSourceError.value = "";
      return { success: true };
    }

    cmsListArchiveFilterPendingMode.value = null;
    return updateCmsListArchiveFilter({ mode });
  }

  async function setCmsListArchiveFilterField(fieldKey: string) {
    const mode =
      cmsListArchiveFilterPendingMode.value ??
      (cmsListArchiveFilterMode.value === "relation" ||
      cmsListArchiveFilterMode.value === "reference"
        ? cmsListArchiveFilterMode.value
        : null);
    if (!mode) {
      return { success: false, error: "Select an archive filter mode first" };
    }
    return updateCmsListArchiveFilter({ mode, fieldKey });
  }

  async function updateCmsListLocale(locale: string) {
    const ensureResult = await ensureTemplatePageListDataSource();
    if (!ensureResult.success) {
      return ensureResult;
    }

    const collection = selectedCollection.value;
    if (!collection) {
      return { success: false, error: "Select a CMS collection first" };
    }
    if (!isSelectedNodeRepeatCapable.value) {
      cmsSourceError.value =
        "Loops work on containers or elements with children.";
      return { success: false, error: cmsSourceError.value };
    }
    return persistCmsDataSource(
      nextCmsDataSource({
        collection,
        mode: "list",
        locale:
          locale === "__default__" ? null : CmsListLocaleSchema.parse(locale),
      }),
      "Set CMS list locale",
    );
  }

  async function loadComponentDefinition(componentId: string | null) {
    componentDefinition.value = null;
    componentSchemaError.value = null;

    if (!componentId) {
      return;
    }

    isLoadingComponentSchema.value = true;

    try {
      const { data, error } = await actions.getItem({
        collection: "components",
        slug: componentId,
      });

      if (error || !data) {
        componentSchemaError.value =
          error?.message ?? "Failed to load component schema";
        return;
      }

      const parsed = ComponentDSLSchema.safeParse(data);
      if (!parsed.success) {
        componentSchemaError.value = "Component schema is invalid";
        return;
      }

      componentDefinition.value = parsed.data;
    } finally {
      isLoadingComponentSchema.value = false;
    }
  }

  async function updateComponentSchemaField(
    propName: string,
    patch: Partial<
      Pick<
        ComponentPropSchemaDefinition,
        "editable" | "hidden" | "contentEditor"
      >
    >,
  ) {
    componentSchemaError.value = null;
    const componentId = componentRef.value;
    const component = componentDefinition.value;

    if (!componentId || !component) {
      return { success: false, error: "Select a component instance first" };
    }

    const prop = properties.value.find((item) => item.name === propName);
    if (!prop) {
      return { success: false, error: "Property not found" };
    }

    const previousComponent = ComponentDSLSchema.parse(
      JSON.parse(JSON.stringify(component)),
    );
    const existingSchema = previousComponent.propSchema ?? [];
    const existingField = existingSchema.find(
      (field) => field.name === propName,
    );
    const nextField = {
      ...(existingField ?? createSchemaFieldFromProp(prop)),
      ...patch,
    };
    const nextPropSchema = existingField
      ? existingSchema.map((field) =>
          field.name === propName ? nextField : field,
        )
      : [...existingSchema, nextField];
    const parsedComponent = ComponentDSLSchema.safeParse({
      ...previousComponent,
      propSchema: nextPropSchema,
      updatedAt: new Date().toISOString(),
    });

    if (!parsedComponent.success) {
      componentSchemaError.value = "Component schema update is invalid";
      return { success: false, error: componentSchemaError.value };
    }

    const saveComponentSchema = async (definition: ComponentDSL) => {
      const { error } = await actions.updateItem({
        collection: "components",
        slug: componentId,
        data: JsonObjectSchema.parse(JSON.parse(JSON.stringify(definition))),
      });
      if (error) {
        throw new Error(error.message ?? "Failed to update component schema");
      }
    };

    const result = await execute({
      type: "update-component-dsl",
      timestamp: Date.now(),
      description: `Update component property settings for ${propName}`,
      undo: async () => {
        await saveComponentSchema(previousComponent);
        componentDefinition.value = previousComponent;
      },
      redo: async () => {
        await saveComponentSchema(parsedComponent.data);
        componentDefinition.value = parsedComponent.data;
      },
    });

    if (!result.success) {
      componentSchemaError.value =
        result.error?.message ?? "Failed to update component schema";
      return { success: false, error: componentSchemaError.value };
    }

    return { success: true };
  }

  async function setStudioEditable(propName: string, editable: boolean) {
    return updateComponentSchemaField(propName, { editable });
  }

  async function setStudioHidden(propName: string, hidden: boolean) {
    return updateComponentSchemaField(propName, { hidden });
  }

  async function setContentEditorExposure(
    propName: string,
    patch: {
      enabled?: boolean;
      locked?: boolean;
      hidden?: boolean;
    },
  ) {
    const schemaField = schemaFieldForProp(propName);
    if (componentRef.value && componentDefinition.value && schemaField) {
      const current = normalizeContentEditorExposure(schemaField.contentEditor);
      return updateComponentSchemaField(propName, {
        contentEditor: {
          ...current,
          ...patch,
        },
      });
    }

    const node = inspector.elementContext.value.node;
    if (!node) {
      return { success: false, error: "No node selected" };
    }

    const nextContentEditor = nextNodeContentEditorFieldSettings({
      current: node.metadata?.contentEditor,
      propName,
      patch,
    });
    const nextMetadata = {
      ...(node.metadata ?? {}),
      contentEditor: nextContentEditor,
    };

    return inspector.updateProperty("metadata", nextMetadata, {
      description: `Update content detail exposure for ${propName}`,
    });
  }

  /**
   * Get a single property value
   */
  function getProp(name: string): unknown {
    const node = inspector.elementContext.value.node;
    return editedValues.value[name] ?? node?.props?.[name];
  }

  /**
   * Update a property (optimistic + persist)
   */
  async function updateProp(name: string, value: unknown) {
    editedValues.value[name] = value;

    const result = await inspector.updateProperty(`props.${name}`, value, {
      description: `Update ${name}`,
    });

    // The history-backed mutation updates selected-node state on success. Clear
    // this transient override in either case so undo/redo is never masked.
    delete editedValues.value[name];

    return result;
  }

  /**
   * Add a new property
   */
  async function addProp(
    name: string,
    type: PropertyDefinition["type"],
    value: unknown,
  ) {
    if (!name.trim()) return { success: false, error: "Name required" };

    const coercedValue = coerceValue(value, type);

    const result = await inspector.updateProperty(
      `props.${name}`,
      coercedValue,
      {
        description: `Add property ${name}`,
      },
    );

    if (result.success) {
      newPropName.value = "";
      newPropType.value = "string";
      newPropValue.value = "";
    }

    return result;
  }

  /**
   * Remove a property
   */
  async function removeProp(name: string) {
    // Set to undefined to remove
    return inspector.updateProperty(`props.${name}`, undefined, {
      description: `Remove property ${name}`,
    });
  }

  /**
   * Create new prop from form state
   */
  async function createNewProp() {
    return addProp(newPropName.value, newPropType.value, newPropValue.value);
  }

  /**
   * Reset edited values when selection changes
   */
  watch(
    () => inspector.elementContext.value.nodeId,
    async () => {
      editedValues.value = {};
      pendingDateFormats.value = {};
      pendingDynamicProps.value = new Set();
      const collection = nodeDataSource.value?.collection;
      if (collection) {
        selectedCollectionName.value = collection;
      } else if (inheritedCmsLoopSource.value?.collection) {
        selectedCollectionName.value = inheritedCmsLoopSource.value.collection;
      } else if (
        !shouldAutoScopePageAssignedCollection({
          isListTemplatePage: isListTemplatePage.value,
          hasInheritedCmsLoopSource: hasInheritedCmsLoopSource.value,
          nodeDataSourceCollection: nodeDataSource.value?.collection,
        })
      ) {
        selectedCollectionName.value = "";
      }

      const node = inspector.elementContext.value.node;
      if (!node) {
        return;
      }

      const normalizeUpdates = buildNormalizeContentPropsUpdates(node);
      if (!normalizeUpdates) {
        return;
      }

      await inspector.batchUpdate(normalizeUpdates, {
        description: "Normalize content props",
      });
    },
  );

  watch(
    effectiveSelectedCollectionName,
    (collectionName) => {
      if (!collectionName) {
        return;
      }
      if (
        !shouldAutoScopePageAssignedCollection({
          isListTemplatePage: isListTemplatePage.value,
          hasInheritedCmsLoopSource: hasInheritedCmsLoopSource.value,
          nodeDataSourceCollection: nodeDataSource.value?.collection,
        }) &&
        collectionName === pageAssignedCollection.value?.name &&
        !nodeDataSource.value?.collection &&
        !inheritedCmsLoopSource.value?.collection
      ) {
        return;
      }
      if (selectedCollectionName.value !== collectionName) {
        selectedCollectionName.value = collectionName;
      }
    },
    { immediate: true },
  );

  watch(
    componentRef,
    (nextComponentRef) => {
      void loadComponentDefinition(nextComponentRef);
    },
    { immediate: true },
  );

  watch(
    selectedCollection,
    (collection) => {
      void loadCmsEntriesForCollection(collection);
    },
    { immediate: true },
  );

  onMounted(() => {
    void loadCmsCollections();
  });

  /**
   * Reset form
   */
  function resetForm() {
    newPropName.value = "";
    newPropType.value = "string";
    newPropValue.value = "";
  }

  return {
    properties,
    propertyCount,
    hasProperties,
    collections,
    selectedCollectionName,
    selectedCollection,
    isLoadingCollections,
    collectionsError,
    cmsEntries,
    cmsEntryOptions,
    isLoadingCmsEntries,
    cmsEntriesError,
    cmsSourceError,
    cmsBindings,
    cmsBindingFormats,
    cmsDateFormatOptions: CMS_DATE_FORMAT_OPTIONS,
    inheritedCmsLoopSource,
    hasInheritedCmsLoopSource,
    nodeBindingSummary,
    cmsDataSourceMode,
    cmsListLimit,
    cmsListSort,
    cmsListOffset,
    cmsListStatus,
    cmsListLocale,
    cmsArchiveBridgingFields,
    cmsListArchiveFilterMode,
    cmsListArchiveFilterEffectiveMode,
    cmsListArchiveFilterShowFieldPicker,
    cmsListArchiveFilterField,
    cmsListArchiveRelationFields,
    cmsListArchiveReferenceFields,
    cmsLocaleOptions,
    selectedCmsEntryId,
    cmsFieldOptions,
    cmsFieldOptionGroupsForProp,
    cmsBindingDisplayForProp,
    isDateBoundProp,
    dateFormatForProp,
    isPropCmsBound,
    propBindingMode,
    setPropBindingMode,
    ensureTemplatePageDataSource,
    ensureTemplatePageListDataSource,
    isSelectedNodeRepeatCapable,
    isEntryTemplatePage,
    isListTemplatePage,
    isAssignedCmsTemplatePage,
    pageAssignedCollection,
    componentRef,
    componentDefinition,
    isLoadingComponentSchema,
    componentSchemaError,

    getProp,
    updateProp,
    addProp,
    removeProp,
    bindPropToCmsField,
    setPropDateFormat,
    clearCmsBinding,
    unbindPropFromCms,
    updateCmsCollection,
    updateCmsLoopCollection,
    updateCmsDataSourceMode,
    updateCmsSingleEntry,
    updateCmsListLimit,
    updateCmsListSort,
    updateCmsListStatus,
    updateCmsListOffset,
    updateCmsListArchiveFilter,
    setCmsListArchiveFilterMode,
    setCmsListArchiveFilterField,
    updateCmsListLocale,
    setStudioEditable,
    setStudioHidden,
    setContentEditorExposure,
    loadCmsCollections,
    loadCmsEntriesForCollection,

    newPropName,
    newPropType,
    newPropValue,
    createNewProp,
    resetForm,

    inferType,
    coerceValue,

    // From inspector
    elementContext: inspector.elementContext,
    canEdit: inspector.canEdit,
    isUpdating: inspector.isUpdating,
    hasError: inspector.hasError,
    lastError: inspector.lastError,
  };
}
