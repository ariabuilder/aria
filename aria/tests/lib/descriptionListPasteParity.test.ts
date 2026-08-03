/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";

import { importHtmlToNodes } from "../../lib/blocks/htmlToNodes";
import { convertListSemanticMode } from "../../lib/blocks/listNodes";
import { nodesToAstro } from "../../lib/blocks/nodesToAstro";
import { nodesToHtmlFragment } from "../../lib/blocks/nodesToHtml";
import type { BuilderNode } from "../../lib/types/nodes";
import { RENDERING_DESCRIPTION_LIST_UTILITY_PASTE } from "../fixtures/renderingDescriptionListUtilityPaste";

function findNode(
  nodes: readonly BuilderNode[],
  predicate: (node: BuilderNode) => boolean,
): BuilderNode | null {
  for (const node of nodes) {
    if (predicate(node)) return node;
    const nested = findNode(node.children, predicate);
    if (nested) return nested;
  }
  return null;
}

describe("description-list paste semantic parity", () => {
  it("preserves dl/dt/dd provenance through importer, HTML, and Astro", async () => {
    const imported = await importHtmlToNodes(
      RENDERING_DESCRIPTION_LIST_UTILITY_PASTE,
    );
    const descriptionList = findNode(
      imported.nodes,
      (node) => node.type === "List" && node.props.element === "dl",
    );
    const term = findNode(
      imported.nodes,
      (node) => node.type === "ListItem" && node.props.element === "dt",
    );
    const description = findNode(
      imported.nodes,
      (node) => node.type === "ListItem" && node.props.element === "dd",
    );

    expect(descriptionList).not.toBeNull();
    expect(term).not.toBeNull();
    expect(description).not.toBeNull();
    expect(descriptionList?.classNames?.base).toEqual([
      "mx-auto",
      "mt-16",
      "grid",
      "max-w-2xl",
      "grid-cols-1",
      "gap-x-8",
      "gap-y-16",
      "text-center",
      "sm:grid-cols-2",
      "lg:max-w-none",
      "lg:grid-cols-4",
    ]);
    const html = nodesToHtmlFragment(imported.nodes);
    document.body.innerHTML = html;
    const renderedList = document.body.querySelector("dl");
    expect(renderedList).not.toBeNull();
    expect(renderedList?.children).toHaveLength(4);
    for (const group of Array.from(renderedList?.children ?? [])) {
      expect(group.tagName.toLowerCase()).toBe("div");
      expect(group.querySelector(":scope > dt")).not.toBeNull();
      expect(group.querySelector(":scope > dd")).not.toBeNull();
    }
    expect(renderedList?.querySelector("ul, ol, li")).toBeNull();
    expect(renderedList?.hasAttribute("element")).toBe(false);
    expect(renderedList?.hasAttribute("ordered")).toBe(false);

    const astro = nodesToAstro(imported.nodes);
    expect(astro).toContain("<dl");
    expect(astro).toContain("<dt");
    expect(astro).toContain("<dd");
    expect(astro).not.toMatch(/<(?:ul|ol|li)[\s>]/);
    expect(astro).not.toContain('element="dl"');
    expect(astro).not.toContain("ordered=");
  });

  it("keeps the pasted description groups stable across repeated type switches", async () => {
    const imported = await importHtmlToNodes(
      RENDERING_DESCRIPTION_LIST_UTILITY_PASTE,
    );
    const descriptionList = findNode(
      imported.nodes,
      (node) => node.type === "List" && node.props.element === "dl",
    );
    expect(descriptionList).not.toBeNull();

    let converted = descriptionList!;
    for (const mode of [
      "ordered",
      "description",
      "unordered",
      "description",
    ] as const) {
      converted = convertListSemanticMode(converted, mode);
      expect(converted.children).toHaveLength(4);
    }

    const ordered = convertListSemanticMode(converted, "ordered");
    const emptyContainers = ordered.children.flatMap((item) =>
      item.children.filter(
        (child) =>
          child.type.toLowerCase() === "container" &&
          child.children.length === 0,
      ),
    );
    expect(emptyContainers).toEqual([]);
    document.body.innerHTML = nodesToHtmlFragment([ordered]);
    const renderedOrderedList = document.body.querySelector("ol");
    expect(renderedOrderedList?.children).toHaveLength(4);
    expect(renderedOrderedList?.querySelectorAll(":scope > li")).toHaveLength(
      4,
    );
    expect(renderedOrderedList?.querySelector("li li")).toBeNull();
    expect(renderedOrderedList?.textContent).toContain("Customer satisfaction");
    expect(renderedOrderedList?.textContent).toContain("98%");

    const restored = convertListSemanticMode(ordered, "description");
    document.body.innerHTML = nodesToHtmlFragment([restored]);
    const renderedDescriptionList = document.body.querySelector("dl");
    expect(renderedDescriptionList?.children).toHaveLength(4);
    expect(
      renderedDescriptionList?.querySelectorAll(":scope > div > dt"),
    ).toHaveLength(4);
    expect(
      renderedDescriptionList?.querySelectorAll(":scope > div > dd"),
    ).toHaveLength(4);
    expect(renderedDescriptionList?.querySelector("ul, ol, li")).toBeNull();
  });

  it("repairs empty temporary description containers on the next type change", async () => {
    const imported = await importHtmlToNodes(
      RENDERING_DESCRIPTION_LIST_UTILITY_PASTE,
    );
    const descriptionList = findNode(
      imported.nodes,
      (node) => node.type === "List" && node.props.element === "dl",
    );
    expect(descriptionList).not.toBeNull();

    const previouslyConverted = convertListSemanticMode(
      descriptionList!,
      "ordered",
    );
    for (const item of previouslyConverted.children) {
      for (const part of item.children) {
        if (part.type.toLowerCase() === "text") {
          part.type = "container";
        }
      }
    }

    const repaired = convertListSemanticMode(previouslyConverted, "unordered");
    expect(
      repaired.children.flatMap((item) =>
        item.children.map((part) => part.type.toLowerCase()),
      ),
    ).not.toContain("container");

    document.body.innerHTML = nodesToHtmlFragment([repaired]);
    const renderedList = document.body.querySelector("ul");
    expect(renderedList?.textContent).toContain("Customer satisfaction");
    expect(renderedList?.textContent).toContain("98%");
    expect(renderedList?.querySelector("li > div:empty")).toBeNull();
  });

  it.each([
    ["ul", false],
    ["ol", true],
  ] as const)("retains ordinary %s/li semantics", async (tagName, ordered) => {
    const imported = await importHtmlToNodes(
      `<${tagName}><li>First</li><li>Second</li></${tagName}>`,
    );
    const list = imported.nodes[0]!;

    expect(list).toMatchObject({
      type: "List",
      props: ordered ? { ordered: true } : {},
    });
    document.body.innerHTML = nodesToHtmlFragment(imported.nodes);
    expect(document.body.querySelectorAll(`${tagName} > li`)).toHaveLength(2);
  });
});
