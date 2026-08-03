import { z } from "zod";

import { generateNodeId } from "../ids/nodeId";
import { normalizeIconValue, IconPropInputSchema } from "../icons/reference";
import { BuilderNodeSchema } from "../schemas/nodes";
import {
  ICON_LIST_SYSTEM_VALUES,
  withIconListSystemProps,
} from "./iconListSystem";
import type { BuilderNode } from "../types/nodes";

const ListItemTextSchema = z.string().trim().min(1);
const DEFAULT_ICON_LIST_ICON = normalizeIconValue("i-lucide:circle-check");

export const LIST_SEMANTIC_MODES = [
  "unordered",
  "ordered",
  "description",
] as const;

export type ListSemanticMode = (typeof LIST_SEMANTIC_MODES)[number];

const CreateListNodeOptionsSchema = z
  .object({
    ordered: z.boolean().default(false),
    items: z.array(ListItemTextSchema).default([]),
  })
  .strict();

const CreateIconListNodeOptionsSchema = z
  .object({
    items: z.array(ListItemTextSchema).default([]),
    icon: IconPropInputSchema.optional(),
  })
  .strict();

function createTextListChildNode(
  content: string,
  styles: BuilderNode["styles"] = {},
  classNames?: BuilderNode["classNames"],
  props: BuilderNode["props"] = {},
): BuilderNode {
  return BuilderNodeSchema.parse({
    id: generateNodeId(),
    type: "text",
    props: {
      content,
      ...props,
    },
    metadata: {
      label: content,
    },
    styles,
    classNames,
    children: [],
  });
}

function createIconListChildNode(
  icon: z.input<typeof IconPropInputSchema>,
  label: string,
): BuilderNode {
  return BuilderNodeSchema.parse({
    id: generateNodeId(),
    type: "icon",
    props: withIconListSystemProps(
      {
        icon: normalizeIconValue(icon),
      },
      ICON_LIST_SYSTEM_VALUES.icon,
    ),
    metadata: {
      label,
    },
    a11y: {
      ariaHidden: true,
    },
    styles: {},
    children: [],
  });
}

export function createListItemNode(
  children: readonly BuilderNode[] = [],
  label?: string,
  styles: BuilderNode["styles"] = {},
  classNames?: BuilderNode["classNames"],
  props: BuilderNode["props"] = {},
): BuilderNode {
  return BuilderNodeSchema.parse({
    id: generateNodeId(),
    type: "listitem",
    props,
    metadata:
      typeof label === "string" && label.trim().length > 0
        ? {
            label: label.trim(),
          }
        : undefined,
    styles,
    classNames,
    children: [...children],
  });
}

export function createTextListItemNode(
  content: string,
  label?: string,
  styles: BuilderNode["styles"] = {},
): BuilderNode {
  return createListItemNode([createTextListChildNode(content)], label, styles);
}

export function createIconListItemNode(
  content: string,
  options: {
    icon?: z.input<typeof IconPropInputSchema>;
    label?: string;
  } = {},
): BuilderNode {
  const resolvedLabel = options.label?.trim();
  const nextLabel =
    resolvedLabel && resolvedLabel.length > 0 ? resolvedLabel : content;
  const nextIcon = options.icon ?? DEFAULT_ICON_LIST_ICON;

  return createListItemNode(
    [
      createIconListChildNode(nextIcon, `${nextLabel} Icon`),
      createTextListChildNode(
        content,
        {},
        undefined,
        withIconListSystemProps({}, ICON_LIST_SYSTEM_VALUES.text),
      ),
    ],
    nextLabel,
    {},
    undefined,
    withIconListSystemProps({}, ICON_LIST_SYSTEM_VALUES.item),
  );
}

export function createDescriptionListGroupNode(
  term: string,
  description: string,
  label?: string,
): BuilderNode {
  const resolvedLabel = label?.trim() || term.trim() || "Description item";

  return BuilderNodeSchema.parse({
    id: generateNodeId(),
    type: "container",
    props: {},
    metadata: {
      label: resolvedLabel,
    },
    styles: {},
    children: [
      createListItemNode(
        [createTextListChildNode(term)],
        `${resolvedLabel} term`,
        {},
        undefined,
        { element: "dt" },
      ),
      createListItemNode(
        [createTextListChildNode(description)],
        `${resolvedLabel} description`,
        {},
        undefined,
        { element: "dd" },
      ),
    ],
  });
}

export function resolveListSemanticMode(
  node: Pick<BuilderNode, "type" | "props"> | null | undefined,
): ListSemanticMode {
  if (node?.type.toLowerCase() === "list" && node.props.element === "dl") {
    return "description";
  }

  return node?.props.ordered === true || node?.props.element === "ol"
    ? "ordered"
    : "unordered";
}

function cloneNode(node: BuilderNode): BuilderNode {
  return BuilderNodeSchema.parse(JSON.parse(JSON.stringify(node)));
}

const LIST_SEMANTIC_GROUP_METADATA_KEY = "listSemanticGroup";
const LIST_SEMANTIC_ROLE_METADATA_KEY = "listSemanticRole";

type DescriptionListRole = "term" | "description";

function descriptionRoleForNode(node: BuilderNode): DescriptionListRole | null {
  if (node.props.element === "dt") {
    return "term";
  }
  if (node.props.element === "dd") {
    return "description";
  }

  const storedRole = node.metadata?.[LIST_SEMANTIC_ROLE_METADATA_KEY];
  return storedRole === "term" || storedRole === "description"
    ? storedRole
    : null;
}

function withoutSemanticMetadata(
  metadata: BuilderNode["metadata"],
  key:
    | typeof LIST_SEMANTIC_GROUP_METADATA_KEY
    | typeof LIST_SEMANTIC_ROLE_METADATA_KEY,
): BuilderNode["metadata"] {
  if (!metadata || !(key in metadata)) {
    return metadata;
  }

  const nextMetadata = { ...metadata };
  delete nextMetadata[key];
  return Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined;
}

function asOrdinaryListItem(node: BuilderNode): BuilderNode {
  const nextNode = cloneNode(node);
  nextNode.type = "listitem";
  nextNode.props = {
    ...nextNode.props,
    element: "li",
  };
  return BuilderNodeSchema.parse(nextNode);
}

function descriptionPartToOrdinaryBlock(node: BuilderNode): BuilderNode {
  const role = descriptionRoleForNode(node);
  if (!role) {
    return cloneNode(node);
  }

  const nextNode = cloneNode(node);
  // Imported dt/dd nodes commonly store their authored text directly in
  // props.content. A Container does not materialize that property, so use a
  // Text node for leaves and reserve Container for parts with real children.
  nextNode.type = nextNode.children.length > 0 ? "container" : "text";
  nextNode.props = { ...nextNode.props };
  delete nextNode.props.element;
  nextNode.metadata = {
    ...nextNode.metadata,
    [LIST_SEMANTIC_ROLE_METADATA_KEY]: role,
  };
  return BuilderNodeSchema.parse(nextNode);
}

function descriptionGroupToOrdinaryListItem(node: BuilderNode): BuilderNode {
  const nextNode = asOrdinaryListItem(node);
  nextNode.metadata = {
    ...nextNode.metadata,
    [LIST_SEMANTIC_GROUP_METADATA_KEY]: true,
  };
  nextNode.children = nextNode.children.map(descriptionPartToOrdinaryBlock);
  return BuilderNodeSchema.parse(nextNode);
}

function descriptionChildrenToListItems(
  children: readonly BuilderNode[],
): BuilderNode[] {
  return children.map((child) => {
    if (child.type.toLowerCase() === "listitem") {
      const role = descriptionRoleForNode(child);
      const nextItem = asOrdinaryListItem(child);
      if (role) {
        nextItem.metadata = {
          ...nextItem.metadata,
          [LIST_SEMANTIC_ROLE_METADATA_KEY]: role,
        };
      }
      return BuilderNodeSchema.parse(nextItem);
    }

    const hasDescriptionParts = child.children.some(
      (entry) => descriptionRoleForNode(entry) !== null,
    );
    if (hasDescriptionParts) {
      return descriptionGroupToOrdinaryListItem(child);
    }

    return asOrdinaryListItem(child);
  });
}

function normalizeOrdinaryDescriptionParts(
  children: readonly BuilderNode[],
): BuilderNode[] {
  return children.map((child) => {
    const nextItem = cloneNode(child);
    const isStoredGroup =
      nextItem.type.toLowerCase() === "listitem" &&
      nextItem.metadata?.[LIST_SEMANTIC_GROUP_METADATA_KEY] === true;
    if (!isStoredGroup) {
      return nextItem;
    }

    nextItem.children = nextItem.children.map((part) => {
      const nextPart = cloneNode(part);
      const isEmptyStoredDescriptionPart =
        descriptionRoleForNode(nextPart) !== null &&
        nextPart.type.toLowerCase() === "container" &&
        nextPart.children.length === 0;
      if (isEmptyStoredDescriptionPart) {
        // Repair the short-lived conversion shape that hid imported
        // props.content behind an empty Container in Stage.
        nextPart.type = "text";
      }
      return BuilderNodeSchema.parse(nextPart);
    });
    return BuilderNodeSchema.parse(nextItem);
  });
}

function ordinaryBlockToDescriptionPart(node: BuilderNode): BuilderNode {
  const role = descriptionRoleForNode(node);
  if (!role) {
    return cloneNode(node);
  }

  const nextNode = cloneNode(node);
  nextNode.type = "listitem";
  nextNode.props = {
    ...nextNode.props,
    element: role === "term" ? "dt" : "dd",
  };
  nextNode.metadata = withoutSemanticMetadata(
    nextNode.metadata,
    LIST_SEMANTIC_ROLE_METADATA_KEY,
  );
  return BuilderNodeSchema.parse(nextNode);
}

function ordinaryListItemToDescriptionChild(node: BuilderNode): BuilderNode {
  const isStoredGroup =
    node.metadata?.[LIST_SEMANTIC_GROUP_METADATA_KEY] === true;
  if (isStoredGroup) {
    const nextGroup = cloneNode(node);
    nextGroup.type = "container";
    nextGroup.props = { ...nextGroup.props };
    delete nextGroup.props.element;
    delete nextGroup.props.ordered;
    nextGroup.metadata = withoutSemanticMetadata(
      nextGroup.metadata,
      LIST_SEMANTIC_GROUP_METADATA_KEY,
    );
    nextGroup.children = nextGroup.children.map(ordinaryBlockToDescriptionPart);
    return BuilderNodeSchema.parse(nextGroup);
  }

  const role = descriptionRoleForNode(node) ?? "term";
  const nextItem = cloneNode(node);
  nextItem.type = "listitem";
  nextItem.props = {
    ...nextItem.props,
    element: role === "term" ? "dt" : "dd",
  };
  nextItem.metadata = withoutSemanticMetadata(
    nextItem.metadata,
    LIST_SEMANTIC_ROLE_METADATA_KEY,
  );
  return BuilderNodeSchema.parse(nextItem);
}

function listItemsToDescriptionChildren(
  children: readonly BuilderNode[],
): BuilderNode[] {
  return children.map((child) => {
    if (child.type.toLowerCase() !== "listitem") {
      return cloneNode(child);
    }
    return ordinaryListItemToDescriptionChild(child);
  });
}

export function convertListSemanticMode(
  node: BuilderNode,
  nextMode: ListSemanticMode,
): BuilderNode {
  if (node.type.toLowerCase() !== "list") {
    return cloneNode(node);
  }

  const currentMode = resolveListSemanticMode(node);
  const nextNode = cloneNode(node);

  if (nextMode === "description") {
    nextNode.props = {
      ...nextNode.props,
      element: "dl",
    };
    delete nextNode.props.ordered;
    if (currentMode !== "description") {
      nextNode.children = listItemsToDescriptionChildren(nextNode.children);
    }
    return BuilderNodeSchema.parse(nextNode);
  }

  nextNode.props = {
    ...nextNode.props,
    element: nextMode === "ordered" ? "ol" : "ul",
    ordered: nextMode === "ordered",
  };
  if (currentMode === "description") {
    nextNode.children = descriptionChildrenToListItems(nextNode.children);
  }
  nextNode.children = normalizeOrdinaryDescriptionParts(nextNode.children);
  const currentListStyleType = nextNode.styles?.listStyleType?.base;
  const incompatibleStyleTypes =
    nextMode === "ordered"
      ? new Set(["disc", "circle", "square", "none"])
      : new Set([
          "decimal",
          "lower-alpha",
          "upper-alpha",
          "lower-roman",
          "upper-roman",
        ]);
  if (
    typeof currentListStyleType !== "string" ||
    incompatibleStyleTypes.has(currentListStyleType)
  ) {
    nextNode.styles = {
      ...nextNode.styles,
      listStyleType: {
        ...nextNode.styles?.listStyleType,
        base: nextMode === "ordered" ? "decimal" : "none",
      },
    };
  }
  return BuilderNodeSchema.parse(nextNode);
}

export function createListNode(
  input: Partial<z.input<typeof CreateListNodeOptionsSchema>> = {},
): BuilderNode {
  const options = CreateListNodeOptionsSchema.parse(input);

  return BuilderNodeSchema.parse({
    id: generateNodeId(),
    type: "list",
    props: {
      ordered: options.ordered,
    },
    metadata: {
      label: "List",
    },
    styles: {
      widthSizing: {
        base: "hug",
      },
      listStyleType: {
        base: options.ordered ? "decimal" : "none",
      },
      ...(options.ordered
        ? {}
        : {
            padding: {
              base: "0",
            },
          }),
    },
    children: options.items.map((item, index) =>
      createTextListItemNode(item, `Item ${index + 1}`),
    ),
  });
}

export function createIconListNode(
  input: Partial<z.input<typeof CreateIconListNodeOptionsSchema>> = {},
): BuilderNode {
  const options = CreateIconListNodeOptionsSchema.parse(input);
  const icon = options.icon ?? DEFAULT_ICON_LIST_ICON;

  return BuilderNodeSchema.parse({
    id: generateNodeId(),
    type: "list",
    props: withIconListSystemProps(
      {
        ordered: false,
      },
      ICON_LIST_SYSTEM_VALUES.root,
    ),
    metadata: {
      label: "Icon List",
    },
    styles: {},
    children: options.items.map((item, index) => {
      const itemNumber = index + 1;

      return createIconListItemNode(item, {
        icon,
        label: `Item ${itemNumber}`,
      });
    }),
  });
}
