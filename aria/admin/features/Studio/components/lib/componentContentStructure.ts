import {
  contentEditorDisplayLabel,
  contentEditorFieldSettingsForProp,
  isContentEditorBindableField,
  isContentEditorEligibleSchemaField,
  isImageLikeContentEditorProp,
  isContentEditorNodeLocked,
  normalizeContentEditorExposure,
} from "../../../../../lib/content/contentEditor";
import type {
  BuilderNode,
  ComponentDSL,
} from "../../../../../lib/types/nodes";

export type ContentFieldCategory = "text" | "links" | "media" | "actions";
export type ContentFieldTypeFilter = "all" | ContentFieldCategory;

export interface ComponentBindingTarget {
  id: string;
  kind: "schema-prop" | "node-prop";
  label: string;
  propName: string;
  path: number[];
  nodeId: string;
  nodeType?: string;
  staticValue: unknown;
  bindable: boolean;
  locked: boolean;
  category: ContentFieldCategory;
  fieldType?: string;
  order?: number;
}

export interface ContentStructureNode {
  id: string;
  nodeId: string;
  path: number[];
  label: string;
  icon: string;
  fieldCount: number;
  lockedFieldCount: number;
  fields: ComponentBindingTarget[];
  children: ContentStructureNode[];
  order?: number;
}

export interface BuildComponentContentStructureOptions {
  component: ComponentDSL;
  hideLockedFields?: boolean;
}

function nodeLabel(node: BuilderNode, fallback: string): string {
  return contentEditorDisplayLabel({
    explicitLabel: node.metadata?.contentEditor?.label,
    fallbackLabel: node.metadata?.label,
    nodeType: node.type || fallback,
  });
}

function fieldLabel(input: {
  settingsLabel?: string;
  schemaLabel?: string;
  propName: string;
}): string {
  return contentEditorDisplayLabel({
    explicitLabel: input.settingsLabel,
    fallbackLabel: input.schemaLabel,
    propName: input.propName,
  });
}

function createStructureNode(node: BuilderNode, path: number[]): ContentStructureNode {
  return {
    id: `node:${node.id || path.join(".")}`,
    nodeId: node.id,
    path,
    label: nodeLabel(node, node.type || "Section"),
    icon: node.type,
    fieldCount: 0,
    lockedFieldCount: 0,
    fields: [],
    children: [],
    order: node.metadata?.contentEditor?.order,
  };
}

function compareOrder(
  left: { label: string; order?: number },
  right: { label: string; order?: number },
): number {
  const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return left.label.localeCompare(right.label);
}

function normalizeKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isActionField(input: {
  propName: string;
  nodeType?: string;
}): boolean {
  const propName = normalizeKey(input.propName);
  const nodeType = normalizeKey(input.nodeType);
  return (
    nodeType.includes("button") ||
    propName.includes("action") ||
    propName === "cta" ||
    propName.startsWith("cta")
  );
}

function isLinkField(propName: string): boolean {
  const name = normalizeKey(propName);
  return (
    name === "href" ||
    name === "url" ||
    name === "to" ||
    name.endsWith("href") ||
    name.endsWith("url") ||
    name.includes("link")
  );
}

export function contentFieldCategoryForTarget(input: {
  propName: string;
  nodeType?: string;
}): ContentFieldCategory {
  if (isActionField(input)) {
    return "actions";
  }
  if (isImageLikeContentEditorProp(input.propName)) {
    return "media";
  }
  if (isLinkField(input.propName)) {
    return "links";
  }
  return "text";
}

export function contentFieldMatchesTypeFilter(
  field: ComponentBindingTarget,
  filter: ContentFieldTypeFilter,
): boolean {
  return filter === "all" || field.category === filter;
}

function sortStructure(node: ContentStructureNode): ContentStructureNode {
  node.fields.sort((left, right) =>
    compareOrder(
      { label: left.label, order: left.order },
      { label: right.label, order: right.order },
    ),
  );
  node.children = node.children.map(sortStructure).sort((left, right) =>
    compareOrder(
      { label: left.label, order: left.order },
      { label: right.label, order: right.order },
    ),
  );
  return node;
}

function recount(node: ContentStructureNode): ContentStructureNode {
  const childCounts = node.children.reduce(
    (total, child) => ({
      fields: total.fields + child.fieldCount,
      locked: total.locked + child.lockedFieldCount,
    }),
    { fields: 0, locked: 0 },
  );
  node.fieldCount = node.fields.length + childCounts.fields;
  node.lockedFieldCount =
    node.fields.filter((field) => field.locked).length + childCounts.locked;
  return node;
}

function pruneEmpty(node: ContentStructureNode): ContentStructureNode | null {
  node.children = node.children
    .map(pruneEmpty)
    .filter((child): child is ContentStructureNode => Boolean(child));
  recount(node);
  if (node.fieldCount === 0) {
    return null;
  }
  return sortStructure(node);
}

function shouldHideLockedField(input: {
  locked: boolean;
  hideLockedFields: boolean;
}): boolean {
  return input.locked && input.hideLockedFields;
}

function schemaPropTargets(input: {
  component: ComponentDSL;
  rootNode: BuilderNode | null;
  hideLockedFields: boolean;
}): ComponentBindingTarget[] {
  const rootProps = (input.rootNode?.props ?? {}) as Record<string, unknown>;
  const targets: ComponentBindingTarget[] = [];

  for (const field of input.component.propSchema ?? []) {
    if (!isContentEditorEligibleSchemaField(field)) {
      continue;
    }
    const exposure = normalizeContentEditorExposure(field.contentEditor);
    const locked = exposure.locked || isContentEditorNodeLocked(input.rootNode);
    if (
      shouldHideLockedField({
        locked,
        hideLockedFields: input.hideLockedFields,
      })
    ) {
      continue;
    }
    targets.push({
      id: `schema:${field.name}`,
      kind: "schema-prop",
      label: fieldLabel({
        settingsLabel: exposure.label,
        schemaLabel: field.label,
        propName: field.name,
      }),
      propName: field.name,
      path: [0],
      nodeId: input.rootNode?.id ?? "root",
      nodeType: input.rootNode?.type,
      staticValue:
        rootProps[field.name] !== undefined ? rootProps[field.name] : field.default,
      bindable: isContentEditorBindableField({
        propName: field.name,
        type: field.type,
      }),
      locked,
      category: contentFieldCategoryForTarget({
        propName: field.name,
        nodeType: input.rootNode?.type,
      }),
      fieldType: field.type,
      order: exposure.order,
    });
  }

  return targets;
}

function nodeFieldTargets(input: {
  node: BuilderNode;
  path: number[];
  ancestorLocked: boolean;
  hideLockedFields: boolean;
}): ComponentBindingTarget[] {
  const props = (input.node.props ?? {}) as Record<string, unknown>;
  const targets: ComponentBindingTarget[] = [];

  for (const propName of Object.keys(props)) {
    const settings = contentEditorFieldSettingsForProp(input.node, propName);
    const locked =
      settings.locked ||
      input.ancestorLocked ||
      isContentEditorNodeLocked(input.node);
    if (
      shouldHideLockedField({
        locked,
        hideLockedFields: input.hideLockedFields,
      })
    ) {
      continue;
    }
    if (
      !isContentEditorEligiblePropForNode({
        propName,
        value: props[propName],
      })
    ) {
      continue;
    }
    targets.push({
      id: `node:${input.node.id}:${propName}`,
      kind: "node-prop",
      label: fieldLabel({
        settingsLabel: settings.label,
        propName,
      }),
      propName,
      path: input.path,
      nodeId: input.node.id,
      nodeType: input.node.type,
      staticValue: props[propName],
      bindable: isContentEditorBindableField({
        propName,
        type: typeof props[propName],
      }),
      locked,
      category: contentFieldCategoryForTarget({
        propName,
        nodeType: input.node.type,
      }),
      fieldType: typeof props[propName],
      order: settings.order,
    });
  }

  return targets;
}

function isContentEditorEligiblePropForNode(input: {
  propName: string;
  value: unknown;
}): boolean {
  return isContentEditorBindableField({
    propName: input.propName,
    type: typeof input.value,
  });
}

function buildNodeBranch(input: {
  node: BuilderNode;
  path: number[];
  hideLockedFields: boolean;
  ancestorHidden: boolean;
  ancestorLocked: boolean;
}): ContentStructureNode | null {
  if (input.ancestorHidden) {
    return null;
  }

  const locked = input.ancestorLocked || isContentEditorNodeLocked(input.node);
  const branch = createStructureNode(input.node, input.path);
  branch.fields = nodeFieldTargets({
    node: input.node,
    path: input.path,
    ancestorLocked: locked,
    hideLockedFields: input.hideLockedFields,
  });

  branch.children = (input.node.children ?? [])
    .map((child, index) =>
      buildNodeBranch({
        node: child,
        path: [...input.path, index],
        hideLockedFields: input.hideLockedFields,
        ancestorHidden: false,
        ancestorLocked: locked,
      }),
    )
    .filter((child): child is ContentStructureNode => Boolean(child));

  return pruneEmpty(branch);
}

export function buildComponentContentStructure(
  options: BuildComponentContentStructureOptions,
): ContentStructureNode[] {
  const hideLockedFields = options.hideLockedFields !== false;
  const rootNode = options.component.nodes[0] ?? null;
  const schemaTargets = schemaPropTargets({
    component: options.component,
    rootNode,
    hideLockedFields,
  });

  const branches = options.component.nodes
    .map((node, index) =>
      buildNodeBranch({
        node,
        path: [index],
        hideLockedFields,
        ancestorHidden: false,
        ancestorLocked: false,
      }),
    )
    .filter((branch): branch is ContentStructureNode => Boolean(branch));

  if (schemaTargets.length > 0) {
    const rootBranch =
      branches.find((branch) => branch.path.length === 1 && branch.path[0] === 0) ??
      (rootNode ? createStructureNode(rootNode, [0]) : null);
    if (rootBranch) {
      const schemaPropNames = new Set(
        (options.component.propSchema ?? [])
          .filter(isContentEditorEligibleSchemaField)
          .map((field) => field.name),
      );
      rootBranch.fields = rootBranch.fields.filter(
        (field) => !schemaPropNames.has(field.propName),
      );
      rootBranch.fields = [...schemaTargets, ...rootBranch.fields];
      recount(rootBranch);
      if (!branches.includes(rootBranch)) {
        branches.unshift(rootBranch);
      }
    }
  }

  return branches.map(recount).map(sortStructure);
}

export function flattenContentStructureFields(
  nodes: readonly ContentStructureNode[],
): ComponentBindingTarget[] {
  return nodes.flatMap((node) => [
    ...node.fields,
    ...flattenContentStructureFields(node.children),
  ]);
}
