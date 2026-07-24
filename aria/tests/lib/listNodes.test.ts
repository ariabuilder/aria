import { describe, expect, it } from "vitest";

import { createIconListNode, createListNode } from "../../lib/blocks/listNodes";
import {
  ICON_LIST_SYSTEM_ATTRIBUTE,
  ICON_LIST_SYSTEM_VALUES,
} from "../../lib/blocks/iconListSystem";

describe("listNodes", () => {
  it("creates a labeled starter list with three labeled list items", () => {
    const listNode = createListNode({
      ordered: false,
      items: ["First item", "Second item", "Third item"],
    });

    expect(listNode.type).toBe("list");
    expect(listNode.metadata?.label).toBe("List");
    expect(listNode.children).toHaveLength(3);
    expect(listNode.children.map((child) => child.type)).toEqual([
      "listitem",
      "listitem",
      "listitem",
    ]);
    expect(listNode.children.map((child) => child.metadata?.label)).toEqual([
      "Item 1",
      "Item 2",
      "Item 3",
    ]);
    expect(
      listNode.children.map((child) => child.children[0]?.props?.content),
    ).toEqual(["First item", "Second item", "Third item"]);
    expect(
      listNode.children.map((child) => child.children[0]?.metadata?.label),
    ).toEqual(["First item", "Second item", "Third item"]);
  });

  it("creates an icon list starter with icon and text rows", () => {
    const listNode = createIconListNode({
      items: ["First item", "Second item", "Third item"],
    });

    expect(listNode.type).toBe("list");
    expect(listNode.metadata?.label).toBe("Icon List");
    expect(listNode.styles).toEqual({});
    expect(listNode.classNames).toBeUndefined();
    expect(listNode.props).toMatchObject({
      ordered: false,
      [ICON_LIST_SYSTEM_ATTRIBUTE]: ICON_LIST_SYSTEM_VALUES.root,
    });
    expect(listNode.children).toHaveLength(3);
    expect(listNode.children.map((child) => child.metadata?.label)).toEqual([
      "Item 1",
      "Item 2",
      "Item 3",
    ]);
    expect(listNode.children[0]?.styles).toEqual({});
    expect(listNode.children[0]?.classNames).toBeUndefined();
    expect(listNode.children[0]?.props).toEqual({
      [ICON_LIST_SYSTEM_ATTRIBUTE]: ICON_LIST_SYSTEM_VALUES.item,
    });
    expect(listNode.children[0]?.children.map((child) => child.type)).toEqual([
      "icon",
      "text",
    ]);
    expect(listNode.children[0]?.children[0]?.metadata?.label).toBe(
      "Item 1 Icon",
    );
    expect(listNode.children[0]?.children[0]?.props?.icon).toMatchObject({
      id: "lucide:circle-check",
      pack: "lucide",
      name: "circle-check",
      source: "iconify",
    });
    expect(listNode.children[0]?.children[0]?.styles).toEqual({});
    expect(listNode.children[0]?.children[0]?.classNames).toBeUndefined();
    expect(listNode.children[0]?.children[0]?.props).toMatchObject({
      [ICON_LIST_SYSTEM_ATTRIBUTE]: ICON_LIST_SYSTEM_VALUES.icon,
    });
    expect(listNode.children[0]?.children[1]?.props?.content).toBe(
      "First item",
    );
    expect(listNode.children[0]?.children[1]?.styles).toEqual({});
    expect(listNode.children[0]?.children[1]?.classNames).toBeUndefined();
    expect(listNode.children[0]?.children[1]?.props).toMatchObject({
      [ICON_LIST_SYSTEM_ATTRIBUTE]: ICON_LIST_SYSTEM_VALUES.text,
    });
  });
});
