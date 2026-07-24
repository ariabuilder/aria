import { computed } from "vue";
import { z } from "zod";
import { useInspector } from "../../Inspector/composables/useInspector";
import { useNodeMutations } from "../../Inspector/composables/useNodeMutations";
import { useSelectedNodeState } from "../../Core/composables/useSelectedNodeState";
import {
  isLinkProp,
  isRepeatCapableInspectorNodeType,
  usePropsEditor,
  type CmsBindingFieldOption,
  type CmsBindingFieldOptionGroup,
  type PropertyDefinition,
} from "../../Inspector/composables/usePropsEditor";
import {
  buildInspectorPropertyDefinition,
  resolveTextBindingPropName,
} from "../../Inspector/composables/useInspectorPropBinding";
import { NodeDataSourceSchema } from "../../../../lib/schemas/nodes";
import type {
  BuilderNode,
  NodeDataSource,
} from "../../../../lib/types/nodes";

const LINK_PROP_PRIORITY = ["href", "url"] as const;
const IMAGE_PROP_PRIORITY = ["src", "source"] as const;
const TEXT_PROP_PRIORITY = ["text", "content", "label", "title"] as const;
const LINK_NODE_TYPES = new Set(["link", "a"]);
const TEXT_NODE_TYPES = new Set([
  "text",
  "heading",
  "paragraph",
  "span",
  "button",
  "link",
  "a",
  "label",
]);
const IMAGE_NODE_TYPES = new Set(["image", "img", "picture", "avatar"]);
const QUICK_TARGET_KINDS = ["text", "image", "link"] as const;

const CmsQuickTargetKindSchema = z.enum(QUICK_TARGET_KINDS);
export type CmsQuickTargetKind = z.infer<typeof CmsQuickTargetKindSchema>;

export const CmsQuickBindingTargetSchema = z
  .object({
    id: z.string().trim().min(1),
    nodeId: z.string().trim().min(1),
    nodeLabel: z.string().trim().min(1),
    nodeType: z.string().trim().min(1),
    kind: CmsQuickTargetKindSchema,
    propName: z.string().trim().min(1),
    currentPath: z.string(),
    suggestedPath: z.string(),
    groups: z.array(
      z
        .object({
          label: z.string().trim().min(1),
          options: z.array(
            z
              .object({
                label: z.string().trim().min(1),
                path: z.string().trim().min(1),
                type: z.string().trim().min(1),
                source: z.enum(["system", "schema"]),
                depth: z.int().nonnegative(),
                isList: z.boolean(),
                description: z.string().trim().min(1).optional(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();
export type CmsQuickBindingTarget = z.infer<
  typeof CmsQuickBindingTargetSchema
>;

const CmsQuickBindingSelectionSchema = z
  .object({
    nodeId: z.string().trim().min(1),
    propName: z.string().trim().min(1),
    fieldPath: z.string().trim().min(1),
    inherited: z.boolean(),
  })
  .strict();

const CmsQuickBindingSelectionsSchema = z.array(CmsQuickBindingSelectionSchema);

export type CmsQuickBindingSelection = z.infer<
  typeof CmsQuickBindingSelectionSchema
>;

function isLinkNodeType(nodeType?: string): boolean {
  return LINK_NODE_TYPES.has(nodeType?.toLowerCase() ?? "");
}

export function resolveLinkPropName(propNames: readonly string[]): string | null {
  const entries = propNames.map((name) => ({
    name,
    normalized: name.trim().toLowerCase(),
  }));

  for (const preferred of LINK_PROP_PRIORITY) {
    const match = entries.find((entry) => entry.normalized === preferred);
    if (match) {
      return match.name;
    }
  }

  const linkMatch = entries.find(
    (entry) =>
      entry.normalized.includes("link") ||
      entry.normalized.includes("href") ||
      entry.normalized.includes("url"),
  );
  return linkMatch?.name ?? null;
}

export function resolveImagePropName(propNames: readonly string[]): string | null {
  const entries = propNames.map((name) => ({
    name,
    normalized: name.trim().toLowerCase(),
  }));

  for (const preferred of IMAGE_PROP_PRIORITY) {
    const match = entries.find((entry) => entry.normalized === preferred);
    if (match) {
      return match.name;
    }
  }

  const imageMatch = entries.find(
    (entry) =>
      entry.normalized.includes("image") ||
      entry.normalized.includes("cover") ||
      entry.normalized.includes("poster") ||
      entry.normalized.includes("thumbnail"),
  );
  return imageMatch?.name ?? null;
}

export function resolveTextPropName(
  nodeType: string | undefined,
  propNames: readonly string[],
): string {
  for (const preferred of TEXT_PROP_PRIORITY) {
    const match = propNames.find(
      (name) => name.trim().toLowerCase() === preferred,
    );
    if (match) {
      return match;
    }
  }

  if (nodeType?.toLowerCase() === "heading") {
    return "text";
  }

  return "text";
}

export function findLinkPropDefinition(
  properties: readonly PropertyDefinition[],
  nodeType?: string,
): PropertyDefinition | null {
  const names = properties.map((prop) => prop.name);
  const linkPropName = resolveLinkPropName(names);
  if (linkPropName) {
    return properties.find((prop) => prop.name === linkPropName) ?? null;
  }
  if (isLinkNodeType(nodeType)) {
    return buildInspectorPropertyDefinition({
      name: "href",
      type: "string",
    });
  }
  return null;
}

export function findImagePropDefinition(
  properties: readonly PropertyDefinition[],
): PropertyDefinition | null {
  const names = properties.map((prop) => prop.name);
  const imagePropName = resolveImagePropName(names);
  if (!imagePropName) {
    return null;
  }
  return properties.find((prop) => prop.name === imagePropName) ?? null;
}

export function findTextPropDefinition(input: {
  nodeType?: string;
  properties: readonly PropertyDefinition[];
}): PropertyDefinition {
  const propName = resolveTextPropName(
    input.nodeType,
    input.properties.map((prop) => prop.name),
  );
  return (
    input.properties.find((prop) => prop.name === propName) ??
    buildInspectorPropertyDefinition({
      name: propName,
      type: "string",
    })
  );
}

function normalizeNodeType(node: BuilderNode): string {
  return node.type?.trim().toLowerCase() || "element";
}

function formatNodeLabel(node: BuilderNode): string {
  const metadataLabel =
    node.metadata && typeof node.metadata === "object"
      ? (node.metadata as { label?: unknown }).label
      : undefined;
  if (typeof metadataLabel === "string" && metadataLabel.trim()) {
    return metadataLabel.trim();
  }

  const propLabel = node.props?.label ?? node.props?.title ?? node.props?.text;
  if (typeof propLabel === "string" && propLabel.trim()) {
    return propLabel.trim().slice(0, 48);
  }

  const type = node.type?.trim() || "Element";
  return `${type} ${node.id.slice(0, 6)}`;
}

function flattenNodes(nodes: readonly BuilderNode[]): BuilderNode[] {
  const result: BuilderNode[] = [];
  const visit = (node: BuilderNode): void => {
    result.push(node);
    for (const child of node.children ?? []) {
      visit(child);
    }
  };
  for (const node of nodes) {
    visit(node);
  }
  return result;
}

function propertyDefinitionForQuickTarget(input: {
  kind: CmsQuickTargetKind;
  propName: string;
}): PropertyDefinition {
  const type = input.kind === "image" || input.kind === "link" ? "string" : "string";
  return buildInspectorPropertyDefinition({
    name: input.propName,
    type,
  });
}

function optionTokens(option: CmsBindingFieldOption): string[] {
  return [option.path, option.label, option.type]
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
}

function scoreSuggestedField(
  target: Pick<CmsQuickBindingTarget, "kind" | "propName" | "nodeLabel" | "nodeType">,
  option: CmsBindingFieldOption,
): number {
  const tokens = optionTokens(option);
  const path = option.path.toLowerCase();
  let score = 0;

  if (target.kind === "image") {
    if (["image", "cover", "thumbnail", "poster", "avatar"].some((token) => tokens.includes(token))) {
      score += 8;
    }
    if (option.type === "image") score += 6;
  }

  if (target.kind === "link") {
    if (["url", "permalink", "slug", "href", "link"].some((token) => tokens.includes(token))) {
      score += 8;
    }
    if (["url", "link", "reference"].includes(option.type)) score += 5;
  }

  if (target.kind === "text") {
    if (["title", "name", "label", "heading"].some((token) => tokens.includes(token))) {
      score += target.nodeType === "heading" ? 9 : 6;
    }
    if (["summary", "description", "excerpt", "body", "content"].some((token) => tokens.includes(token))) {
      score += target.nodeType === "heading" ? 2 : 6;
    }
    if (["string", "text", "slug", "select", "structuredtext", "richtext", "system"].includes(option.type.toLowerCase())) {
      score += 3;
    }
  }

  const prop = target.propName.toLowerCase();
  if (tokens.includes(prop)) score += 4;

  for (const labelToken of target.nodeLabel.toLowerCase().split(/[^a-z0-9]+/u)) {
    if (labelToken && tokens.includes(labelToken)) {
      score += 2;
    }
  }

  if (path.endsWith(`.${prop}`) || path === prop) {
    score += 4;
  }

  return score;
}

function suggestedFieldPathForTarget(
  target: Pick<CmsQuickBindingTarget, "kind" | "propName" | "nodeLabel" | "nodeType">,
  groups: readonly CmsBindingFieldOptionGroup[],
): string {
  const options = groups.flatMap((group) => group.options);
  if (options.length === 0) {
    return "";
  }

  const ranked = options
    .map((option) => ({ option, score: scoreSuggestedField(target, option) }))
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.option.path ?? "";
}

function appendQuickTarget(
  targets: CmsQuickBindingTarget[],
  input: Omit<CmsQuickBindingTarget, "id" | "currentPath" | "suggestedPath" | "groups"> & {
    currentPath?: string;
    groups: CmsBindingFieldOptionGroup[];
  },
): void {
  const baseTarget = {
    ...input,
    id: `${input.nodeId}:${input.propName}`,
    currentPath: input.currentPath ?? "",
    suggestedPath: "",
  };
  const suggestedPath = suggestedFieldPathForTarget(baseTarget, input.groups);
  targets.push(
    CmsQuickBindingTargetSchema.parse({
      ...baseTarget,
      suggestedPath,
    }),
  );
}

export function shouldShowToolbarLoopButton(input: {
  isRepeatCapable: boolean;
  hasInheritedLoopSource: boolean;
}): boolean {
  return input.isRepeatCapable && !input.hasInheritedLoopSource;
}

export function shouldShowToolbarLinkButton(input: {
  nodeType?: string;
  linkPropName: string | null;
  hasCmsContext: boolean;
  collectionsReady: boolean;
}): boolean {
  return (
    input.collectionsReady &&
    input.hasCmsContext &&
    (Boolean(input.linkPropName) || isLinkNodeType(input.nodeType))
  );
}

export function shouldShowToolbarImageButton(input: {
  nodeType?: string;
  imagePropName: string | null;
  hasCmsContext: boolean;
  collectionsReady: boolean;
}): boolean {
  return (
    input.nodeType?.toLowerCase() === "image" &&
    input.collectionsReady &&
    input.hasCmsContext &&
    Boolean(input.imagePropName)
  );
}

export function shouldShowToolbarTextButton(input: {
  nodeType?: string;
  hasCmsContext: boolean;
  collectionsReady: boolean;
}): boolean {
  const type = input.nodeType?.toLowerCase() ?? "";
  const isTextLike = ["text", "heading", "paragraph", "span", "link"].includes(
    type,
  );
  return isTextLike && input.collectionsReady && input.hasCmsContext;
}

export function resolveCmsQuickPickerInitialPage(input: {
  mode: "loop" | "field";
  hasSelectedCollection: boolean;
  requiresEntryStep: boolean;
  isEntryTemplatePage: boolean;
}): "collection" | "entry" | "mapping" {
  if (input.mode === "loop") {
    return input.hasSelectedCollection ? "mapping" : "collection";
  }
  if (!input.isEntryTemplatePage) {
    return "collection";
  }
  if (!input.hasSelectedCollection) {
    return "collection";
  }
  return input.requiresEntryStep ? "entry" : "mapping";
}

export function useSelectionToolbarCms() {
  const propsEditor = usePropsEditor();
  const inspector = useInspector();
  const mutations = useNodeMutations();
  const { resolveNode, selectedNode } = useSelectedNodeState();

  const hasCmsContext = computed(
    () =>
      propsEditor.collections.value.length > 0 ||
      propsEditor.isAssignedCmsTemplatePage.value ||
      Boolean(
        propsEditor.pageAssignedCollection.value ??
          propsEditor.selectedCollection.value,
      ),
  );

  const collectionsReady = computed(
    () =>
      propsEditor.collections.value.length > 0 ||
      Boolean(propsEditor.pageAssignedCollection.value),
  );

  const linkPropDefinition = computed(() =>
    findLinkPropDefinition(
      propsEditor.properties.value,
      selectedNode.value?.type,
    ),
  );

  const imagePropDefinition = computed(() =>
    findImagePropDefinition(propsEditor.properties.value),
  );

  const textPropDefinition = computed(() =>
    findTextPropDefinition({
      nodeType: selectedNode.value?.type,
      properties: propsEditor.properties.value,
    }),
  );

  const linkPropName = computed(() => linkPropDefinition.value?.name ?? null);
  const imagePropName = computed(() => imagePropDefinition.value?.name ?? null);
  const textPropName = computed(() => {
    if (selectedNode.value) {
      return resolveTextBindingPropName(selectedNode.value);
    }
    return textPropDefinition.value.name;
  });

  const boundTextPropName = computed(() => {
    const bindings = propsEditor.cmsBindings.value;
    for (const key of ["text", "content", "label", "title"] as const) {
      if (key in bindings) {
        return key;
      }
    }
    return textPropName.value;
  });

  const showLoopButton = computed(() =>
    shouldShowToolbarLoopButton({
      isRepeatCapable: propsEditor.isSelectedNodeRepeatCapable.value,
      hasInheritedLoopSource: propsEditor.hasInheritedCmsLoopSource.value,
    }),
  );

  const showLinkButton = computed(() =>
    shouldShowToolbarLinkButton({
      nodeType: selectedNode.value?.type,
      linkPropName: linkPropName.value,
      hasCmsContext: hasCmsContext.value,
      collectionsReady: collectionsReady.value,
    }),
  );

  const showImageButton = computed(() =>
    shouldShowToolbarImageButton({
      nodeType: selectedNode.value?.type,
      imagePropName: imagePropName.value,
      hasCmsContext: hasCmsContext.value,
      collectionsReady: collectionsReady.value,
    }),
  );

  const showTextButton = computed(() =>
    shouldShowToolbarTextButton({
      nodeType: selectedNode.value?.type,
      hasCmsContext: hasCmsContext.value,
      collectionsReady: collectionsReady.value,
    }),
  );

  const linkFieldGroups = computed((): CmsBindingFieldOptionGroup[] => {
    const linkProp = linkPropDefinition.value;
    if (!linkProp) {
      return [];
    }
    return propsEditor.cmsFieldOptionGroupsForProp(linkProp);
  });

  const imageFieldGroups = computed((): CmsBindingFieldOptionGroup[] => {
    const imageProp = imagePropDefinition.value;
    if (!imageProp) {
      return [];
    }
    return propsEditor.cmsFieldOptionGroupsForProp(imageProp);
  });

  const textFieldGroups = computed((): CmsBindingFieldOptionGroup[] => {
    return propsEditor.cmsFieldOptionGroupsForProp(
      buildInspectorPropertyDefinition({
        name: textPropName.value,
        type: "string",
      }),
    );
  });

  const linkBoundPath = computed(() => {
    const propName = linkPropName.value;
    if (!propName) {
      return "";
    }
    return propsEditor.cmsBindings.value[propName] ?? "";
  });

  const imageBoundPath = computed(() => {
    const propName = imagePropName.value;
    if (!propName) {
      return "";
    }
    return propsEditor.cmsBindings.value[propName] ?? "";
  });

  const textBoundPath = computed(() => {
    return propsEditor.cmsBindings.value[boundTextPropName.value] ?? "";
  });

  const isLoopActive = computed(
    () =>
      propsEditor.cmsDataSourceMode.value === "list" &&
      propsEditor.isSelectedNodeRepeatCapable.value,
  );

  const isLinkActive = computed(() => {
    const propName = linkPropName.value;
    return Boolean(propName && propsEditor.cmsBindings.value[propName]);
  });

  const isImageActive = computed(() => {
    const propName = imagePropName.value;
    return Boolean(propName && propsEditor.cmsBindings.value[propName]);
  });

  const isTextActive = computed(() => {
    return Boolean(propsEditor.cmsBindings.value[boundTextPropName.value]);
  });

  const linkButtonLabel = computed(() => {
    const propName = linkPropName.value;
    if (!propName) {
      return "Link";
    }
    const bindingDisplay = propsEditor.cmsBindingDisplayForProp(propName);
    return bindingDisplay?.label ?? "Link";
  });

  const imageButtonLabel = computed(() => {
    const propName = imagePropName.value;
    if (!propName) {
      return "Image";
    }
    return propsEditor.cmsBindingDisplayForProp(propName)?.label ?? "Image";
  });

  const textButtonLabel = computed(() => {
    return (
      propsEditor.cmsBindingDisplayForProp(boundTextPropName.value)?.label ??
      "Field"
    );
  });

  function warnCmsActionFailure(
    action: string,
    result: { success: boolean; error?: string } | undefined,
  ): void {
    if (!result || result.success) {
      return;
    }
    const message = result.error ?? `Failed to ${action}`;
    propsEditor.cmsSourceError.value = message;
    if (import.meta.env.DEV) {
      console.warn(`[SelectionToolbarCms] ${message}`);
    }
  }

  async function handleLoopActivate(): Promise<void> {
    inspector.setTab("props");

    if (isLoopActive.value) {
      const result = await propsEditor.setPropBindingMode("items", "static");
      warnCmsActionFailure("disable loop", result);
      return;
    }

    const result = await propsEditor.setPropBindingMode("items", "dynamic");
    warnCmsActionFailure("enable loop", result);
  }

  async function bindField(propName: string, path: string): Promise<void> {
    if (propsEditor.isEntryTemplatePage.value) {
      const bootstrapResult = await propsEditor.ensureTemplatePageDataSource();
      if (!bootstrapResult.success) {
        return;
      }
    }

    await propsEditor.bindPropToCmsField(propName, path);
  }

  async function handleLinkFieldSelect(path: string): Promise<void> {
    const propName = linkPropName.value;
    if (!propName) {
      return;
    }
    await bindField(propName, path);
  }

  async function handleImageFieldSelect(path: string): Promise<void> {
    const propName = imagePropName.value;
    if (!propName) {
      return;
    }
    await bindField(propName, path);
  }

  async function handleTextFieldSelect(path: string): Promise<void> {
    await bindField(textPropName.value, path);
  }

  async function handleLinkFieldClear(): Promise<void> {
    const propName = linkPropName.value;
    if (!propName) {
      return;
    }
    const result = await propsEditor.unbindPropFromCms(propName);
    warnCmsActionFailure(`clear ${propName} binding`, result);
  }

  async function handleImageFieldClear(): Promise<void> {
    const propName = imagePropName.value;
    if (!propName) {
      return;
    }
    const result = await propsEditor.unbindPropFromCms(propName);
    warnCmsActionFailure(`clear ${propName} binding`, result);
  }

  async function handleTextFieldClear(): Promise<void> {
    const result = await propsEditor.unbindPropFromCms(boundTextPropName.value);
    warnCmsActionFailure(`clear ${boundTextPropName.value} binding`, result);
  }

  async function clearQuickFieldBinding(
    kind: CmsQuickTargetKind,
  ): Promise<{ success: boolean; error?: string }> {
    if (kind === "link") {
      const propName = linkPropName.value;
      if (!propName) {
        return { success: false, error: "No link prop available" };
      }
      const result = await propsEditor.unbindPropFromCms(propName);
      warnCmsActionFailure(`clear ${propName} binding`, result);
      return result;
    }

    if (kind === "image") {
      const propName = imagePropName.value;
      if (!propName) {
        return { success: false, error: "No image prop available" };
      }
      const result = await propsEditor.unbindPropFromCms(propName);
      warnCmsActionFailure(`clear ${propName} binding`, result);
      return result;
    }

    const result = await propsEditor.unbindPropFromCms(boundTextPropName.value);
    warnCmsActionFailure(`clear ${boundTextPropName.value} binding`, result);
    return result;
  }

  function groupsForQuickTarget(input: {
    kind: CmsQuickTargetKind;
    propName: string;
  }): CmsBindingFieldOptionGroup[] {
    return propsEditor.cmsFieldOptionGroupsForProp(
      propertyDefinitionForQuickTarget(input),
    );
  }

  function quickTargetsForNode(input: {
    node: BuilderNode;
    includeKinds?: readonly CmsQuickTargetKind[];
  }): CmsQuickBindingTarget[] {
    const nodeType = normalizeNodeType(input.node);
    const includeKinds = new Set(input.includeKinds ?? QUICK_TARGET_KINDS);
    const targets: CmsQuickBindingTarget[] = [];
    const currentBindings = input.node.dataSource?.bindings ?? {};
    const nodeLabel = formatNodeLabel(input.node);

    if (includeKinds.has("text") && TEXT_NODE_TYPES.has(nodeType)) {
      const propName = resolveTextBindingPropName(input.node);
      appendQuickTarget(targets, {
        nodeId: input.node.id,
        nodeLabel,
        nodeType,
        kind: "text",
        propName,
        currentPath: currentBindings[propName] ?? "",
        groups: groupsForQuickTarget({ kind: "text", propName }),
      });
    }

    if (includeKinds.has("image") && IMAGE_NODE_TYPES.has(nodeType)) {
      const propName =
        resolveImagePropName(Object.keys(input.node.props ?? {})) ?? "src";
      appendQuickTarget(targets, {
        nodeId: input.node.id,
        nodeLabel,
        nodeType,
        kind: "image",
        propName,
        currentPath: currentBindings[propName] ?? "",
        groups: groupsForQuickTarget({ kind: "image", propName }),
      });
    }

    if (
      includeKinds.has("link") &&
      (isLinkNodeType(nodeType) || nodeType === "button")
    ) {
      const propName =
        resolveLinkPropName(Object.keys(input.node.props ?? {})) ?? "href";
      appendQuickTarget(targets, {
        nodeId: input.node.id,
        nodeLabel,
        nodeType,
        kind: "link",
        propName,
        currentPath: currentBindings[propName] ?? "",
        groups: groupsForQuickTarget({ kind: "link", propName }),
      });
    }

    return targets;
  }

  function quickBindingTargets(input: {
    mode: "loop" | "field";
    kind?: CmsQuickTargetKind;
  }): CmsQuickBindingTarget[] {
    const node = selectedNode.value;
    if (!node) {
      return [];
    }

    const includeKinds = input.kind ? [input.kind] : QUICK_TARGET_KINDS;
    const candidates =
      input.mode === "loop" ? flattenNodes(node.children ?? []) : [node];

    return candidates.flatMap((candidate) =>
      quickTargetsForNode({ node: candidate, includeKinds }),
    );
  }

  function nextDataSourceForQuickBinding(input: {
    node: BuilderNode;
    propName: string;
    fieldPath: string;
    inherited: boolean;
  }): NodeDataSource {
    const current = input.node.dataSource;
    const bindings = {
      ...(current?.bindings ?? {}),
      [input.propName]: input.fieldPath,
    };

    if (input.inherited) {
      return NodeDataSourceSchema.unwrap().parse({
        ...(current?.type === "static" ? current : { type: "static" }),
        bindings,
      });
    }

    const collection = propsEditor.selectedCollection.value;
    if (!collection) {
      throw new Error("Select a CMS collection first");
    }

    return NodeDataSourceSchema.unwrap().parse({
      ...(current ?? {}),
      type:
        current?.type === "cms" || current?.type === "collection"
          ? current.type
          : "collection",
      collection: collection.name,
      mode: current?.mode ?? "single",
      bindings,
    });
  }

  async function applyQuickBindings(
    selections: readonly CmsQuickBindingSelection[],
  ): Promise<{ success: boolean; error?: string }> {
    const parsedSelectionsResult =
      CmsQuickBindingSelectionsSchema.safeParse(selections);
    if (!parsedSelectionsResult.success) {
      return {
        success: false,
        error:
          parsedSelectionsResult.error.issues[0]?.message ??
          "Invalid CMS binding selection",
      };
    }
    const parsedSelections = parsedSelectionsResult.data;
    const documentPath = inspector.getDocumentPath();
    if (!documentPath) {
      return { success: false, error: "No document context" };
    }

    for (const selection of parsedSelections) {
      const node = resolveNode(selection.nodeId);
      if (!node) {
        return { success: false, error: `Node ${selection.nodeId} not found` };
      }

      let nextDataSource: NodeDataSource;
      try {
        nextDataSource = nextDataSourceForQuickBinding({
          node,
          propName: selection.propName,
          fieldPath: selection.fieldPath,
          inherited: selection.inherited,
        });
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Invalid CMS binding",
        };
      }

      const result = await mutations.batchUpdate(
        {
          path: documentPath,
          nodeId: selection.nodeId,
        },
        { dataSource: nextDataSource },
        { description: `Bind ${selection.propName} to CMS field` },
      );
      if (!result.success) {
        return {
          success: false,
          error: result.error ?? "Failed to apply CMS binding",
        };
      }
    }

    return { success: true };
  }

  async function updateQuickCollection(collectionName: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    const result = await propsEditor.updateCmsCollection(collectionName);
    warnCmsActionFailure("set CMS collection", result);
    return result;
  }

  async function updateQuickLoopCollection(collectionName: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    const result = await propsEditor.updateCmsLoopCollection(collectionName);
    warnCmsActionFailure("set CMS loop collection", result);
    return result;
  }

  async function updateQuickSingleEntry(
    entryId: string,
    selectedEntry?: { id: string; slug?: string },
  ): Promise<{ success: boolean; error?: string }> {
    const result = await propsEditor.updateCmsSingleEntry(entryId, selectedEntry);
    warnCmsActionFailure("set CMS preview entry", result);
    return result;
  }

  return {
    collections: propsEditor.collections,
    collectionsError: propsEditor.collectionsError,
    cmsEntryOptions: propsEditor.cmsEntryOptions,
    cmsEntriesError: propsEditor.cmsEntriesError,
    cmsSourceError: propsEditor.cmsSourceError,
    isLoadingCollections: propsEditor.isLoadingCollections,
    isLoadingCmsEntries: propsEditor.isLoadingCmsEntries,
    hasInheritedCmsLoopSource: propsEditor.hasInheritedCmsLoopSource,
    isEntryTemplatePage: propsEditor.isEntryTemplatePage,
    selectedCmsEntryId: propsEditor.selectedCmsEntryId,
    selectedCollection: propsEditor.selectedCollection,
    selectedCollectionName: propsEditor.selectedCollectionName,
    showLoopButton,
    showLinkButton,
    showImageButton,
    showTextButton,
    linkFieldGroups,
    imageFieldGroups,
    textFieldGroups,
    linkBoundPath,
    imageBoundPath,
    textBoundPath,
    linkButtonLabel,
    imageButtonLabel,
    textButtonLabel,
    isLoopActive,
    isLinkActive,
    isImageActive,
    isTextActive,
    handleLoopActivate,
    handleLinkFieldSelect,
    handleImageFieldSelect,
    handleTextFieldSelect,
    handleLinkFieldClear,
    handleImageFieldClear,
    handleTextFieldClear,
    clearQuickFieldBinding,
    applyQuickBindings,
    quickBindingTargets,
    updateQuickCollection,
    updateQuickLoopCollection,
    updateQuickSingleEntry,
  };
}

export { isLinkProp, isRepeatCapableInspectorNodeType };
