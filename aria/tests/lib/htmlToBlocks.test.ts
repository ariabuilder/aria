import { describe, expect, it } from "vitest";

import { htmlToBlocks } from "../../lib/blocks/htmlToBlocks";

describe("htmlToBlocks", () => {
  it("imports whole-row list item links onto the list item", () => {
    const blocks = htmlToBlocks(`
      <ul>
        <li>
          <a href="/features">
            <p>Features</p>
          </a>
        </li>
      </ul>
    `);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe("list");
    expect(blocks[0]?.children?.[0]?.type).toBe("listitem");
    expect(blocks[0]?.children?.[0]?.props).toMatchObject({
      href: "/features",
      linkScope: "row",
    });
    expect(blocks[0]?.children?.[0]?.children?.[0]?.type).toBe("text");
    expect(blocks[0]?.children?.[0]?.children?.[0]?.props.content).toBe(
      "Features",
    );
  });

  it("imports text-scoped list item links without keeping a nested link block", () => {
    const blocks = htmlToBlocks(`
      <ul>
        <li>
          <p>Before</p>
          <a href="/features">
            <p>Features</p>
          </a>
        </li>
      </ul>
    `);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.children?.[0]?.props).toMatchObject({
      href: "/features",
      linkScope: "text",
    });
    expect(blocks[0]?.children?.[0]?.children).toHaveLength(2);
    expect(
      blocks[0]?.children?.[0]?.children?.map((child) => child.type),
    ).toEqual(["text", "text"]);
    expect(
      blocks[0]?.children?.[0]?.children?.some(
        (child) => child.type === "link",
      ),
    ).toBe(false);
  });
});
