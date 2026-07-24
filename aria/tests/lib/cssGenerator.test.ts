import { describe, expect, it } from "vitest";

import { generateStylesheet } from "../../lib/rendering/cssGenerator";
import type { PageDSL } from "../../lib/types/nodes";

describe("cssGenerator", () => {
  it("uses desktop-base breakpoint semantics", () => {
    const dsl: PageDSL = {
      version: "1",
      nodes: [
        {
          id: "hero",
          type: "Section",
          props: {},
          styles: {
            padding: {
              base: "16",
              tablet: "24",
              mobile: "12",
            },
            fontSize: {
              base: "14",
              tablet: "18",
              mobile: "12",
            },
          },
          children: [],
        },
      ],
    } as unknown as PageDSL;

    const { css } = generateStylesheet(dsl);

    expect(css).toContain("padding: 16px;");
    expect(css).toContain("font-size: 14px;");
    expect(css).toContain("@media (max-width: 1279.98px)");
    expect(css).toContain("padding: 24px;");
    expect(css).toContain("@media (max-width: 767.98px)");
    expect(css).toContain("padding: 12px;");
    expect(css).not.toContain("@media (min-width: 768px)");
  });

  it("emits grid lanes declarations for production stylesheets", () => {
    const dsl: PageDSL = {
      version: "1",
      nodes: [
        {
          id: "gallery",
          type: "Section",
          props: {},
          styles: {
            display: {
              base: "grid-lanes",
            },
            gridTemplateColumns: {
              base: "repeat(auto-fill, minmax(250px, 1fr))",
            },
            gap: {
              base: "16px",
            },
            flowTolerance: {
              base: "1em",
            },
            gridColumn: {
              base: "span 2",
            },
          },
          children: [],
        },
      ],
    } as unknown as PageDSL;

    const { css } = generateStylesheet(dsl);

    expect(css).toContain("display: grid-lanes;");
    expect(css).toContain(
      "grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));",
    );
    expect(css).toContain("gap: 16px;");
    expect(css).toContain("flow-tolerance: 1em;");
    expect(css).toContain("grid-column: span 2;");
  });

  it("quotes digit-leading custom font families in generated CSS", () => {
    const dsl: PageDSL = {
      version: "1",
      nodes: [
        {
          id: "hero-copy",
          type: "Text",
          props: {},
          styles: {
            fontFamily: {
              base: "1903Sans-Bold",
            },
          },
          children: [],
        },
      ],
    } as unknown as PageDSL;

    const { css } = generateStylesheet(dsl);

    expect(css).toContain("font-family: '1903Sans-Bold';");
  });
});
