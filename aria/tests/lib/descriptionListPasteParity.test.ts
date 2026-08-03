/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";

import { importHtmlToNodes } from "../../lib/blocks/htmlToNodes";
import { nodesToAstro } from "../../lib/blocks/nodesToAstro";
import { nodesToHtmlFragment } from "../../lib/blocks/nodesToHtml";
import { resolveStageBlockRootTag } from "../../admin/features/Stage/utils/stageBlockRootTag";
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
  it("preserves dl/dt/dd provenance through importer, Stage, HTML, and Astro", async () => {
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
    expect(resolveStageBlockRootTag(descriptionList!)).toBe("dl");
    expect(resolveStageBlockRootTag(term!)).toBe("dt");
    expect(resolveStageBlockRootTag(description!)).toBe("dd");

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

  it("retains ordered-list semantics separately from description lists", async () => {
    const imported = await importHtmlToNodes(
      `<ol><li>First</li><li>Second</li></ol>`,
    );
    const list = imported.nodes[0];

    expect(list).toMatchObject({
      type: "List",
      props: { ordered: true },
    });
    expect(resolveStageBlockRootTag(list!)).toBe("ol");
    document.body.innerHTML = nodesToHtmlFragment(imported.nodes);
    expect(document.body.querySelector("ol > li")).not.toBeNull();
  });
});
