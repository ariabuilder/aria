/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";

import { importHtmlToNodes } from "../../../lib/blocks/htmlToNodes";
import {
  resolveStageBlockRootTag,
  shouldDeferTypographyBlockContent,
} from "../../../admin/features/Stage/utils/stageBlockRootTag";
import type { BuilderNode } from "../../../lib/types/nodes";

function getRenderableClassName(block: BuilderNode): string {
  return [
    ...(block.classNames?.base ?? []),
    ...(block.customClasses ?? []),
  ].join(" ");
}

function renderTypographyBlockToElement(block: BuilderNode): HTMLElement {
  const tag = resolveStageBlockRootTag(block);
  const element = document.createElement(tag);
  const className = getRenderableClassName(block);

  if (className) {
    element.className = className;
  }

  if (!shouldDeferTypographyBlockContent(block)) {
    const text = String(block.props?.text ?? block.props?.content ?? "");
    if (text) {
      element.textContent = text;
    }
  }

  for (const child of block.children ?? []) {
    element.appendChild(renderTypographyBlockToElement(child));
  }

  return element;
}

describe("canvasTypographyChildren", () => {
  it("defers typography content when nested spans are present", async () => {
    const imported = await importHtmlToNodes(`
      <h2 class="text-3xl font-bold">
        <span>
          <span class="motion-word" style="display: inline-block;">One</span>
          <span class="motion-word" style="display: inline-block;">Two</span>
        </span>
      </h2>
    `);

    const heading = imported.nodes[0]!;
    expect(shouldDeferTypographyBlockContent(heading)).toBe(true);

    const rendered = renderTypographyBlockToElement(heading);
    const motionWords = rendered.querySelectorAll("span.motion-word");

    expect(motionWords).toHaveLength(2);
    expect(rendered.textContent?.replace(/\s+/g, " ").trim()).toBe("One Two");
  });
});
