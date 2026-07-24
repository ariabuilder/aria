import type { BuilderNode } from "../types/nodes";

export const ICON_LIST_SYSTEM_ATTRIBUTE = "data-aria-icon-list";

export const ICON_LIST_SYSTEM_VALUES = {
  root: "root",
  item: "item",
  icon: "icon",
  text: "text",
} as const;

type IconListSystemValue =
  (typeof ICON_LIST_SYSTEM_VALUES)[keyof typeof ICON_LIST_SYSTEM_VALUES];

export function withIconListSystemProps(
  props: BuilderNode["props"],
  value: IconListSystemValue,
): BuilderNode["props"] {
  return {
    ...props,
    [ICON_LIST_SYSTEM_ATTRIBUTE]: value,
  };
}

export const ICON_LIST_SYSTEM_CSS = `/* Aria Icon List Defaults */
[data-aria-icon-list='root'] {
  display: grid;
  gap: 0.75rem;
  list-style: none;
  padding-left: 0;
  margin: 0;
}

[data-aria-icon-list='item'] {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

[data-aria-icon-list='item'] > a {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

[data-aria-icon-list='icon'] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  font-size: 2.5rem;
  line-height: 1;
  color: var(--primary, currentColor);
  flex-shrink: 0;
  font-style: normal;
}

[data-aria-icon-list='icon'] [data-aria-icon-host='1'],
[data-aria-icon-list='icon'] svg {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: inherit;
  color: inherit;
  flex-shrink: 0;
}

[data-aria-icon-list='text'] {
  margin: 0;
}`;
