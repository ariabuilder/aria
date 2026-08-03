import { describe, expect, it } from "vitest";

import {
  convertListSemanticMode,
  createDescriptionListGroupNode,
  createIconListNode,
  createListNode,
  resolveListSemanticMode,
} from "../../lib/blocks/listNodes";
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
    expect(listNode.styles).toMatchObject({
      widthSizing: { base: "hug" },
      listStyleType: { base: "none" },
      padding: { base: "0" },
    });
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

  it("preserves decimal markers when explicitly creating an ordered list", () => {
    const listNode = createListNode({
      ordered: true,
      items: ["First item"],
    });

    expect(listNode.props.ordered).toBe(true);
    expect(listNode.styles).toMatchObject({
      widthSizing: { base: "hug" },
      listStyleType: { base: "decimal" },
    });
  });

  it("creates valid description-list term and definition groups", () => {
    const group = createDescriptionListGroupNode(
      "Customer satisfaction",
      "98%",
    );

    expect(group.type).toBe("container");
    expect(group.children.map((child) => child.props.element)).toEqual([
      "dt",
      "dd",
    ]);
    expect(
      group.children.map((child) => child.children[0]?.props.content),
    ).toEqual(["Customer satisfaction", "98%"]);
  });

  it("converts ordinary lists to description terms without adding nodes", () => {
    const listNode = createListNode({
      ordered: true,
      items: ["First item", "Second item"],
    });

    const descriptionList = convertListSemanticMode(listNode, "description");

    expect(resolveListSemanticMode(descriptionList)).toBe("description");
    expect(descriptionList.props.element).toBe("dl");
    expect(descriptionList.props.ordered).toBeUndefined();
    expect(descriptionList.children).toHaveLength(2);
    expect(
      descriptionList.children.map((item) => item.children[0]?.props.content),
    ).toEqual(["First item", "Second item"]);
    expect(descriptionList.children.map((item) => item.props.element)).toEqual([
      "dt",
      "dt",
    ]);
  });

  it("keeps one description group as one ordinary list item", () => {
    const descriptionList = createListNode();
    descriptionList.props = { element: "dl" };
    descriptionList.children = [
      createDescriptionListGroupNode("Question", "Answer"),
    ];

    const orderedList = convertListSemanticMode(descriptionList, "ordered");

    expect(resolveListSemanticMode(orderedList)).toBe("ordered");
    expect(orderedList.props).toMatchObject({ element: "ol", ordered: true });
    expect(orderedList.styles.listStyleType?.base).toBe("decimal");
    expect(orderedList.children).toHaveLength(1);
    expect(orderedList.children[0]?.props.element).toBe("li");
    expect(orderedList.children[0]?.children).toHaveLength(2);
    expect(
      orderedList.children[0]?.children.map((child) => child.type),
    ).toEqual(["container", "container"]);
    expect(
      orderedList.children[0]?.children.map(
        (child) => child.children[0]?.props.content,
      ),
    ).toEqual(["Question", "Answer"]);
  });

  it("does not multiply nodes while repeatedly switching semantic list types", () => {
    const list = createListNode();
    list.props = { element: "dl" };
    list.children = [
      createDescriptionListGroupNode("Question 1", "Answer 1"),
      createDescriptionListGroupNode("Question 2", "Answer 2"),
    ];

    const collectNodeIds = (node: typeof list): string[] => [
      node.id,
      ...node.children.flatMap((child) => collectNodeIds(child)),
    ];
    const originalIds = collectNodeIds(list).sort();

    let converted = list;
    for (const mode of [
      "unordered",
      "description",
      "ordered",
      "description",
      "unordered",
      "description",
    ] as const) {
      converted = convertListSemanticMode(converted, mode);
      expect(collectNodeIds(converted).sort()).toEqual(originalIds);
      expect(converted.children).toHaveLength(2);
    }

    expect(resolveListSemanticMode(converted)).toBe("description");
    expect(
      converted.children.map((group) =>
        group.children.map((child) => child.props.element),
      ),
    ).toEqual([
      ["dt", "dd"],
      ["dt", "dd"],
    ]);
  });
});
