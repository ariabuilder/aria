import { describe, expect, it } from "vitest";

import {
  DEFAULT_DESKTOP_MIN_WIDTH,
  formatBreakpointWidth,
} from "../../../lib/styles/responsiveBreakpoints";
import type { BreakpointDefinition } from "../../../lib/types/nodes";
import {
  collectResponsiveStyleCSS,
  stylesToResponsiveCSS,
} from "../../../admin/features/Stage/utils/stageResponsiveStyles";

const STAGE_BREAKPOINTS: BreakpointDefinition[] = [
  {
    name: "base",
    minWidth: formatBreakpointWidth(DEFAULT_DESKTOP_MIN_WIDTH),
    label: "Desktop",
  },
  {
    name: "laptop",
    minWidth: "1024px",
    label: "Laptop",
  },
  {
    name: "tablet",
    minWidth: "768px",
    label: "Tablet",
  },
  {
    name: "mobile",
    minWidth: "0px",
    label: "Mobile",
  },
];

describe("stylesToResponsiveCSS", () => {
  it("emits base and laptop background-color rules without inline duplication", () => {
    const css = stylesToResponsiveCSS(
      {
        backgroundColor: {
          base: "#ffffff",
          laptop: "#ff0000",
        },
      },
      "node-1",
      "Container",
      STAGE_BREAKPOINTS,
    );

    expect(css).toContain(
      '[data-aria-id="node-1"] { background-color: #ffffff; }',
    );
    expect(css).toContain(
      `@media (max-width: ${formatBreakpointWidth(DEFAULT_DESKTOP_MIN_WIDTH - 0.02)}) { [data-aria-id="node-1"] { background-color: #ff0000; } }`,
    );
    expect(css).not.toContain("style=");
  });

  it("emits tablet overrides in a narrower media query than laptop", () => {
    const css = stylesToResponsiveCSS(
      {
        backgroundColor: {
          base: "#ffffff",
          laptop: "#ff0000",
          tablet: "#0000ff",
        },
      },
      "node-2",
      "Container",
      STAGE_BREAKPOINTS,
    );

    expect(css).toContain("background-color: #ffffff");
    expect(css).toContain("background-color: #ff0000");
    expect(css).toContain("background-color: #0000ff");
    expect(css).toContain("@media (max-width: 1279.98px)");
    expect(css).toContain("@media (max-width: 1023.98px)");
  });

  it("reads desktop styles from the base key even when base is disabled in settings", () => {
    const breakpoints: BreakpointDefinition[] = [
      {
        name: "laptop",
        minWidth: "1024px",
        label: "Laptop",
      },
      {
        name: "tablet",
        minWidth: "768px",
        label: "Tablet",
      },
    ];

    const css = stylesToResponsiveCSS(
      {
        backgroundColor: {
          base: "#993939",
          tablet: "#0c7521e8",
        },
      },
      "node-3",
      "Container",
      breakpoints,
    );

    expect(css).toContain("background-color: #993939");
    expect(css.split("@media")[0]).not.toContain("#0c7521");
    expect(css).toContain("@media (max-width: 1023.98px)");
    expect(css).toContain("background-color: #0c7521e8");
  });

  it("emits testing overrides without relying on tablet cascade", () => {
    const breakpoints: BreakpointDefinition[] = [
      {
        name: "base",
        minWidth: formatBreakpointWidth(DEFAULT_DESKTOP_MIN_WIDTH),
        label: "Desktop",
      },
      {
        name: "laptop",
        minWidth: "1024px",
        label: "Laptop",
      },
      {
        name: "testing",
        minWidth: "900px",
        label: "Testing",
      },
      {
        name: "tablet",
        minWidth: "768px",
        label: "Tablet",
      },
      {
        name: "mobile",
        minWidth: "0px",
        label: "Mobile",
      },
    ];

    const css = stylesToResponsiveCSS(
      {
        backgroundColor: {
          base: "#993939",
          testing: "var(--secondary-800)",
          tablet: "#0c7521e8",
        },
      },
      "node-4",
      "Container",
      breakpoints,
    );

    expect(css).toContain("background-color: #993939");
    expect(css).toContain("background-color: var(--secondary-800)");
    expect(css).toContain("@media (max-width: 1023.98px)");
    expect(css).toContain("background-color: var(--secondary-800)");
    expect(css).toContain("@media (max-width: 899.98px)");
    expect(css).toContain("background-color: #0c7521e8");
  });

  it("emits list-style-type from default breakpoint alias on list nodes", () => {
    const css = stylesToResponsiveCSS(
      {
        listStyleType: {
          default: "none",
        },
      },
      "list-1",
      "list",
      STAGE_BREAKPOINTS,
    );

    expect(css).toContain(
      '[data-aria-id="list-1"] { list-style-type: none; }',
    );
  });

  it("emits base list marker rules when upstream testing saves propagate to desktop", () => {
    const breakpoints: BreakpointDefinition[] = [
      {
        name: "testing",
        minWidth: "2400px",
        canvasWidth: 2400,
        label: "Testing",
      },
      ...STAGE_BREAKPOINTS,
    ];

    const css = collectResponsiveStyleCSS(
      [
        {
          id: "list-1",
          type: "list",
          props: {},
          styles: {
            listStyleType: {
              base: "disc",
              tablet: "disc",
            },
          },
          children: [],
        },
      ],
      breakpoints,
      new Map([
        [
          "list-1",
          {
            nodeType: "list",
            styles: {
              listStyleType: {
                testing: "none",
                base: "none",
                tablet: undefined,
              },
            },
          },
        ],
      ]),
    );

    expect(css).toContain(
      '[data-aria-id="list-1"] { list-style-type: none; }',
    );
    expect(css).not.toContain("list-style-type: disc");
  });

  it("drops cleared tablet list marker overrides when live updates set desktop to none", () => {
    const css = collectResponsiveStyleCSS(
      [
        {
          id: "list-1",
          type: "list",
          props: {},
          styles: {
            listStyleType: {
              base: "disc",
              tablet: "disc",
            },
          },
          children: [],
        },
      ],
      STAGE_BREAKPOINTS,
      new Map([
        [
          "list-1",
          {
            nodeType: "list",
            styles: {
              listStyleType: {
                base: "none",
                tablet: undefined,
              },
            },
          },
        ],
      ]),
    );

    expect(css).toContain(
      '[data-aria-id="list-1"] { list-style-type: none; }',
    );
    expect(css).not.toContain("list-style-type: disc");
  });

  it("does not emit node display rules over authored responsive display utilities", () => {
    const css = collectResponsiveStyleCSS(
      [
        {
          id: "dropdown-1",
          type: "Container",
          props: {},
          classNames: {
            base: ["hidden", "w-full"],
            lg: ["block"],
          },
          customClasses: [],
          styles: {
            display: {
              base: "block",
              laptop: "block",
            },
            backgroundColor: {
              base: "#f8fafc",
            },
          },
          children: [],
        },
      ],
      STAGE_BREAKPOINTS,
    );

    expect(css).toContain(
      '[data-aria-id="dropdown-1"] { background-color: #f8fafc; }',
    );
    expect(css).not.toContain("display: block");
  });

  it("emits testing overrides with min-width media queries above base", () => {
    const breakpoints: BreakpointDefinition[] = [
      {
        name: "base",
        minWidth: formatBreakpointWidth(DEFAULT_DESKTOP_MIN_WIDTH),
        canvasWidth: DEFAULT_DESKTOP_MIN_WIDTH,
        label: "Desktop",
      },
      {
        name: "testing",
        minWidth: "2400px",
        canvasWidth: 2400,
        label: "Testing",
      },
      {
        name: "laptop",
        minWidth: "1024px",
        canvasWidth: 1024,
        label: "Laptop",
      },
      {
        name: "tablet",
        minWidth: "768px",
        canvasWidth: 768,
        label: "Tablet",
      },
      {
        name: "mobile",
        minWidth: "0px",
        canvasWidth: 375,
        label: "Mobile",
      },
    ];

    const css = stylesToResponsiveCSS(
      {
        backgroundColor: {
          base: "#993939",
          testing: "var(--secondary-800)",
          tablet: "#0c7521e8",
        },
      },
      "node-5",
      "Container",
      breakpoints,
    );

    expect(css).toContain("background-color: #993939");
    expect(css).toContain("@media (min-width: 2400px)");
    expect(css).toContain("background-color: var(--secondary-800)");
    expect(css).toContain("@media (max-width: 1023.98px)");
    expect(css).toContain("background-color: #0c7521e8");
    expect(css).not.toContain("2399.98px");
  });

  it("emits flex-grow for a fill-width child inside a flex row parent", () => {
    const css = collectResponsiveStyleCSS(
      [
        {
          id: "parent",
          type: "Container",
          props: {},
          styles: {
            display: { base: "flex" },
            flexDirection: { base: "row" },
          },
          children: [
            {
              id: "child",
              type: "Container",
              props: {},
              styles: {
                widthSizing: { base: "fill" },
              },
              children: [],
            },
          ],
        },
      ],
      STAGE_BREAKPOINTS,
    );

    expect(css).toContain('[data-aria-id="child"]');
    expect(css).toContain("flex-grow: 1");
    expect(css).not.toContain("width-sizing");
  });
});
