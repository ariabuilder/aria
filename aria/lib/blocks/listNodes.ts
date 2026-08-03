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
