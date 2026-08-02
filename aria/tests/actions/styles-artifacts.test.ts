import { describe, expect, it, vi } from "vitest";

import {
  buildRenderStylesCacheKey,
  buildRenderStylesContentSignature,
  buildStageRenderStylesData,
  buildGlobalCSSArtifactsSnapshot,
  regenerateGlobalCSSArtifacts,
} from "../../actions/styles";
import { buildStarterDesignSystem } from "../../lib/storage/starterContent";
import { createDefaultUniversalDesignSystem } from "../../lib/styles/universalDesignSystem";

vi.mock("../../lib/motion/css/readAriaMotionCss", () => ({
  readAriaMotionCss: () =>
    ":root { --aria-motion-duration-instant: 150ms; }\n.aria-motion.aria-motion-fade {}\n.aria-parallax {}",
}));

describe("buildGlobalCSSArtifactsSnapshot", () => {
  it("changes the render styles cache key when saved content metadata changes", async () => {
    const createAdapter = (updatedAt: string) =>
      ({
        listPagesDSL: vi.fn(async () => [
          {
            id: "blog",
            slug: "blog",
            title: "Blog",
            status: "draft",
            layout: "full-width",
            updatedAt,
          },
        ]),
        listLayoutsDSL: vi.fn(async () => [
          {
            id: "full-width",
            name: "Full Width",
            updatedAt: "2026-01-01T00:00:00.000Z",
            version: "layout-v1",
          },
        ]),
        listComponentsDSL: vi.fn(async () => []),
      }) as never;

    const firstSignature = await buildRenderStylesContentSignature(
      createAdapter("2026-01-01T00:00:00.000Z"),
    );
    const secondSignature = await buildRenderStylesContentSignature(
      createAdapter("2026-01-01T00:00:01.000Z"),
    );

    expect(firstSignature).not.toBe(secondSignature);
    expect(buildRenderStylesCacheKey("style-v1", firstSignature)).not.toBe(
      buildRenderStylesCacheKey("style-v1", secondSignature),
    );
  });

  it("builds framework-independent base CSS in custom mode", async () => {
    const designSystem = createDefaultUniversalDesignSystem();
    designSystem.tokens.colors.palette.primary = "#a633cc";
    designSystem.tokens.colors.palette["primary-500"] = "#a633cc";
    designSystem.tokens.colors.palette["primary-300"] = "#c084fc";
    designSystem.tokens.typography.sizes.base = "1rem";
    designSystem.tokens.typography.lineHeights.base = "1.5rem";
    designSystem.tokens.typography.letterSpacing.base = "0em";
    designSystem.tokens.typography.weights.regular = "400";
    designSystem.tokens.typography.weights.semibold = "600";
    designSystem.fonts.assignments.body = "Inter";
    designSystem.fonts.assignments.heading = "Bricolage Grotesque";

    const adapter = {
      getSiteSettings: vi.fn(async () => ({ utilityEngine: "custom" })),
      getDesignSystem: vi.fn(async () => designSystem),
      listPagesDSL: vi.fn(async () => []),
      listLayoutsDSL: vi.fn(async () => []),
      listComponentsDSL: vi.fn(async () => []),
      getPageDSL: vi.fn(async () => null),
      getLayoutDSL: vi.fn(async () => null),
      getComponentDSL: vi.fn(async () => null),
    };

    const result = await buildGlobalCSSArtifactsSnapshot(adapter as never);

    expect(result.framework).toBe("custom");
    expect(result.designSystem.artifacts.baseCSS).toContain(
      "--primary: #a633cc;",
    );
    expect(result.designSystem.artifacts.baseCSS).toContain(
      "--primary-300: #c084fc;",
    );
    expect(result.designSystem.artifacts.baseCSS).not.toContain(
      "--breakpoint-",
    );
    expect(result.designSystem.artifacts.baseCSSHash).toHaveLength(12);
    expect(result.designSystem.artifacts.compiledUnoCSS).toBe("");
    expect(result.designSystem.artifacts.utilityCSS).toBe("");
    expect(result.designSystem.artifacts.globalCSS).toContain(
      "--primary: #a633cc;",
    );
    expect(result.designSystem.artifacts.globalCSS).toContain(
      "--font-family-body: Inter;",
    );
    expect(result.designSystem.artifacts.globalCSS).toContain(
      "--font-family-heading: Bricolage Grotesque;",
    );
    expect(result.designSystem.artifacts.globalCSS).toContain(
      "body {\n  font-family: var(--font-family-base, var(--font-family-body, inherit));\n  font-size: var(--font-size-base);\n  line-height: var(--line-height-base);\n  letter-spacing: var(--letter-spacing-base);\n  font-weight: var(--font-weight-regular);\n}",
    );
    expect(result.designSystem.artifacts.globalCSS).toContain(
      "h1 {\n  font-family: var(--font-family-5xl, var(--font-family-heading, var(--font-family-body, inherit)));\n  font-weight: var(--font-weight-semibold);",
    );
    expect(result.designSystem.artifacts.globalCSS).not.toContain(
      "--breakpoint-",
    );
    expect(result.designSystem.artifacts.globalCSSHash).toHaveLength(12);
    expect(result.designSystem.artifacts.baseCSS).not.toContain(
      "[data-aria-icon-list='root']",
    );
    expect(result.designSystem.artifacts.baseCSS).not.toContain(
      "[data-aria-icon-list='icon']",
    );
    expect(result.designSystem.artifacts.globalCSS).not.toContain(
      "--aria-motion-duration-instant",
    );
    expect(result.designSystem.artifacts.globalCSS).not.toContain(
      ".aria-parallax",
    );
  });

  it("includes persisted root and container global styles in the generated CSS", async () => {
    const designSystem = createDefaultUniversalDesignSystem();
    designSystem.globalStyles.defaults.root.caretColor = "#0ea5e9";
    designSystem.globalStyles.defaults.root.selectionColor = "#ffffff";
    designSystem.globalStyles.defaults.root.selectionBackgroundColor = "#0f172a";
    designSystem.globalStyles.defaults.container.maxWidth = "72rem";
    designSystem.globalStyles.defaults.container.width = "100%";

    const adapter = {
      getSiteSettings: vi.fn(async () => ({ utilityEngine: "custom" })),
      getDesignSystem: vi.fn(async () => designSystem),
      listPagesDSL: vi.fn(async () => []),
      listLayoutsDSL: vi.fn(async () => []),
      listComponentsDSL: vi.fn(async () => []),
      getPageDSL: vi.fn(async () => null),
      getLayoutDSL: vi.fn(async () => null),
      getComponentDSL: vi.fn(async () => null),
    };

    const result = await buildGlobalCSSArtifactsSnapshot(adapter as never);

    expect(result.designSystem.artifacts.globalCSS).toContain(
      "html {\n  caret-color: #0ea5e9;\n}",
    );
    expect(result.designSystem.artifacts.globalCSS).toContain(
      "::selection {\n  color: #ffffff;\n  background-color: #0f172a;\n}",
    );
    expect(result.designSystem.artifacts.globalCSS).toContain(
      "[data-aria-type='Container'], [data-aria-type='container'] {\n  max-width: 72rem;\n  width: 100%;\n  box-sizing: border-box;\n}",
    );
  });

  it("adds Aria Motion and parallax CSS to the global artifact when a saved node uses motion", async () => {
    const designSystem = createDefaultUniversalDesignSystem();
    const adapter = {
      getSiteSettings: vi.fn(async () => ({ utilityEngine: "custom" })),
      getDesignSystem: vi.fn(async () => designSystem),
      listPagesDSL: vi.fn(async () => [{ id: "home", slug: "" }]),
      listLayoutsDSL: vi.fn(async () => []),
      listComponentsDSL: vi.fn(async () => []),
      getPageDSL: vi.fn(async () => ({
        id: "home",
        slug: "",
        nodes: [
          {
            id: "hero",
            type: "Section",
            props: {},
            styles: {},
            motion: {
              enabled: true,
              effects: ["fade"],
              trigger: "reveal",
            },
            children: [],
          },
        ],
      })),
      getLayoutDSL: vi.fn(async () => null),
      getComponentDSL: vi.fn(async () => null),
    };

    const result = await buildGlobalCSSArtifactsSnapshot(adapter as never);
    const globalCSS = result.designSystem.artifacts.globalCSS;

    expect(globalCSS).toContain("--aria-motion-duration-instant");
    expect(globalCSS).toContain(".aria-motion.aria-motion-fade");
    expect(globalCSS).toContain(".aria-parallax");
  });

  it("emits saved global body styles and custom variables into the compiled stylesheet", async () => {
    const designSystem = createDefaultUniversalDesignSystem();
    designSystem.globalStyles.defaults.body.backgroundColor = "#2db749";
    designSystem.globalStyles.variables.custom.brand = {
      label: "Brand",
      value: "#2db749",
      category: "color",
      description: "",
    };
    designSystem.globalStyles.variables.aliases.surface = {
      label: "Surface",
      sourceType: "custom",
      sourceKey: "brand",
      fallback: "",
    };

    const adapter = {
      getSiteSettings: vi.fn(async () => ({ utilityEngine: "custom" })),
      getDesignSystem: vi.fn(async () => designSystem),
      listPagesDSL: vi.fn(async () => []),
      listLayoutsDSL: vi.fn(async () => []),
      listComponentsDSL: vi.fn(async () => []),
      getPageDSL: vi.fn(async () => null),
      getLayoutDSL: vi.fn(async () => null),
      getComponentDSL: vi.fn(async () => null),
    };

    const result = await buildGlobalCSSArtifactsSnapshot(adapter as never);

    expect(result.designSystem.artifacts.globalCSS).toContain(
      ":root {\n  --brand: #2db749;\n  --surface: var(--brand);\n}",
    );
    expect(result.designSystem.artifacts.globalCSS).toContain(
      "body {\n  background-color: #2db749;\n}",
    );
  });

  it("places custom classes after utility CSS so semantic classes can override utilities", async () => {
    const designSystem = createDefaultUniversalDesignSystem();
    designSystem.semanticClasses.sasha = {
      id: "sasha",
      name: "sasha",
      description: "",
      variants: [
        {
          breakpoint: "base",
          rules: [
            {
              property: "color",
              value: "var(--destructive-700)",
              important: false,
            },
            { property: "fontSize", value: "55px", important: false },
            {
              property: "fontFamily",
              value: '"Space Grotesk", sans-serif',
              important: false,
            },
            {
              property: "textTransform",
              value: "uppercase",
              important: false,
            },
          ],
        },
      ],
      pseudoVariants: [],
      compoundVariants: [],
      usageCount: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    designSystem.fonts.google["google-space-grotesk"] = {
      id: "google-space-grotesk",
      family: "Space Grotesk",
      variants: ["400", "700"],
      googleFontsURL:
        "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&display=swap",
    };

    const adapter = {
      getSiteSettings: vi.fn(async () => ({ utilityEngine: "unocss" })),
      getDesignSystem: vi.fn(async () => designSystem),
      listPagesDSL: vi.fn(async () => [{ id: "home", slug: "index" }]),
      listLayoutsDSL: vi.fn(async () => []),
      listComponentsDSL: vi.fn(async () => []),
      getPageDSL: vi.fn(async () => ({
        id: "home",
        slug: "index",
        nodes: [
          {
            id: "hero-title",
            type: "Heading",
            props: { text: "Revolutionary way to build the web" },
            classNames: {
              base: ["text-4xl", "font-bold", "text-black"],
            },
            customClasses: ["sasha"],
            styles: {},
            children: [],
          },
        ],
      })),
      getLayoutDSL: vi.fn(async () => null),
      getComponentDSL: vi.fn(async () => null),
    };

    const result = await buildGlobalCSSArtifactsSnapshot(adapter as never);
    const globalCSS = result.designSystem.artifacts.globalCSS;

    expect(globalCSS).toContain(".text-4xl");
    expect(globalCSS).toContain(".text-black");
    expect(globalCSS).toContain(".sasha");
    expect(globalCSS.indexOf(".text-black")).toBeLessThan(
      globalCSS.indexOf(".sasha"),
    );
    expect(globalCSS).toContain('font-family: "Space Grotesk", sans-serif;');
    expect(globalCSS).toContain(
      '@import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:ital,wght@0,400;0,700&display=swap");',
    );
  });

  it("publishes utilities whose only source is a saved database page", async () => {
    const designSystem = createDefaultUniversalDesignSystem();
    const databasePage = {
      id: "landing",
      slug: "landing",
      title: "Landing",
      nodes: [
        {
          id: "hero",
          type: "Section",
          props: {
            componentProps: {
              className: "bg-white/[.03] border-white/15 shadow-black/80",
            },
            slotContent: {
              classes: ["[background-size:32px_32px]"],
            },
          },
          classNames: {
            base: [
              "bg-[#070808]",
              "text-white",
              "bg-teal-300",
              "[background-image:radial-gradient(circle_at_center,rgba(45,212,191,.2),transparent_70%)]",
              "lg:grid-cols-[.9fr_1.25fr_.7fr]",
            ],
          },
          classes: { hover: ["opacity-90"] },
          customClasses: [],
          styles: {
            className: { base: "[background-position:center]" },
          },
          children: [],
        },
      ],
    };
    const adapter = {
      getSiteSettings: vi.fn(async () => ({ utilityEngine: "unocss" })),
      getDesignSystem: vi.fn(async () => designSystem),
      saveDesignSystem: vi.fn(async (_value: typeof designSystem) => undefined),
      listPagesDSL: vi.fn(async () => [{ id: "landing", slug: "landing" }]),
      listLayoutsDSL: vi.fn(async () => []),
      listComponentsDSL: vi.fn(async () => [{ id: "slot-shell" }]),
      getPageDSL: vi.fn(async () => databasePage),
      getLayoutDSL: vi.fn(async () => null),
      getComponentDSL: vi.fn(async (id: string) =>
        id === "slot-shell"
          ? {
              id,
              name: "Slot shell",
              nodes: [],
              slots: [
                {
                  name: "content",
                  defaultContent: [
                    {
                      id: "slot-default",
                      type: "Container",
                      props: {},
                      classNames: { base: ["outline-teal-300"] },
                      customClasses: [],
                      styles: {},
                      children: [],
                    },
                  ],
                },
              ],
            }
          : null,
      ),
    };

    await regenerateGlobalCSSArtifacts(adapter as never);
    const savedDesignSystem = adapter.saveDesignSystem.mock.calls[0]?.[0];
    expect(savedDesignSystem).toBeDefined();
    const css = savedDesignSystem!.artifacts.globalCSS;

    expect(css).toContain(".bg-\\[\\#070808\\]");
    expect(css).toContain(".bg-white\\/\\[\\.03\\]");
    expect(css).toContain(".border-white\\/15");
    expect(css).toContain(".shadow-black\\/80");
    expect(css).toContain(".\\[background-size\\:32px_32px\\]");
    expect(css).toContain(".\\[background-position\\:center\\]");
    expect(css).toContain(".hover\\:opacity-90");
    expect(css).toContain(".outline-teal-300");
    expect(css).toContain(".lg\\:grid-cols-\\[\\.9fr_1\\.25fr_\\.7fr\\]");
    expect(savedDesignSystem!.artifacts.unocssClasses).toEqual(
      expect.arrayContaining(["bg-[#070808]", "bg-white/[.03]"]),
    );
  });

  it("moves generated reset and responsive node CSS into the compiled stylesheet", async () => {
    const designSystem = createDefaultUniversalDesignSystem();
    designSystem.fonts.google["google-bricolage"] = {
      id: "google-bricolage",
      family: "Bricolage Grotesque",
      variants: ["200", "300", "400", "500"],
      googleFontsURL:
        "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:ital,wght@0,200;0,300;0,400;0,500&display=swap",
    };
    const adapter = {
      getSiteSettings: vi.fn(async () => ({ utilityEngine: "custom" })),
      getDesignSystem: vi.fn(async () => designSystem),
      listPagesDSL: vi.fn(async () => [
        {
          id: "home",
          slug: "index",
          title: "Home",
        },
      ]),
      listLayoutsDSL: vi.fn(async () => []),
      listComponentsDSL: vi.fn(async () => []),
      getPageDSL: vi.fn(async () => ({
        id: "home",
        slug: "index",
        title: "Home",
        nodes: [
          {
            id: "testimonial-text-1",
            type: "Text",
            props: { text: "Quote" },
            styles: {
              fontFamily: {
                base: "Inter",
                tablet: "DM Sans",
              },
            },
            children: [],
          },
        ],
      })),
      getLayoutDSL: vi.fn(async () => null),
      getComponentDSL: vi.fn(async () => null),
    };

    const result = await buildGlobalCSSArtifactsSnapshot(adapter as never);

    expect(result.designSystem.artifacts.baseCSS).not.toContain("html, body {");
    expect(result.designSystem.artifacts.baseCSS).toContain(
      '@import url("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:ital,wght@0,200;0,300;0,400;0,500&display=swap");',
    );
    expect(result.designSystem.artifacts.baseCSS).toContain(
      "@media (max-width: 1023.98px) {\n  p.aria-testimonial-text-1 { font-family: DM Sans; }\n}",
    );
    expect(result.designSystem.artifacts.globalCSS).not.toContain("html, body {");
  });

  it("keeps starter color tokens while omitting reset and icon-system CSS", async () => {
    const designSystem = buildStarterDesignSystem();
    const adapter = {
      getSiteSettings: vi.fn(async () => ({ utilityEngine: "custom" })),
      getDesignSystem: vi.fn(async () => designSystem),
      listPagesDSL: vi.fn(async () => []),
      listLayoutsDSL: vi.fn(async () => []),
      listComponentsDSL: vi.fn(async () => []),
      getPageDSL: vi.fn(async () => null),
      getLayoutDSL: vi.fn(async () => null),
      getComponentDSL: vi.fn(async () => null),
    };

    const result = await buildGlobalCSSArtifactsSnapshot(adapter as never);
    const globalCSS = result.designSystem.artifacts.globalCSS;

    expect(globalCSS).toContain("/* Design System Colors */");
    expect(globalCSS).not.toContain("html, body {");
    expect(globalCSS).not.toContain("[data-aria-icon-list='root']");
  });

  it("quotes digit-leading custom font families in root tokens and generated node CSS", async () => {
    const designSystem = createDefaultUniversalDesignSystem();
    designSystem.fonts.assignments.body = "1903Sans-Bold";
    const adapter = {
      getSiteSettings: vi.fn(async () => ({ utilityEngine: "custom" })),
      getDesignSystem: vi.fn(async () => designSystem),
      listPagesDSL: vi.fn(async () => [
        {
          id: "home",
          slug: "index",
          title: "Home",
        },
      ]),
      listLayoutsDSL: vi.fn(async () => []),
      listComponentsDSL: vi.fn(async () => []),
      getPageDSL: vi.fn(async () => ({
        id: "home",
        slug: "index",
        title: "Home",
        nodes: [
          {
            id: "hero-copy",
            type: "Text",
            props: { text: "Quote" },
            styles: {
              fontFamily: {
                base: "Inter",
                tablet: "1903Sans-Bold",
              },
            },
            children: [],
          },
        ],
      })),
      getLayoutDSL: vi.fn(async () => null),
      getComponentDSL: vi.fn(async () => null),
    };

    const result = await buildGlobalCSSArtifactsSnapshot(adapter as never);

    expect(result.designSystem.artifacts.globalCSS).toContain(
      "--font-family-body: '1903Sans-Bold';",
    );
    expect(result.designSystem.artifacts.baseCSS).toContain(
      "@media (max-width: 1023.98px) {\n  p.aria-hero-copy { font-family: '1903Sans-Bold'; }\n}",
    );
  });

  it("colorsOnly regen patches palette variables without scanning DSL", async () => {
    const designSystem = createDefaultUniversalDesignSystem();
    designSystem.tokens.colors.palette.primary = "#111111";
    designSystem.tokens.colors.palette["primary-500"] = "#111111";
    designSystem.artifacts.baseCSS = [
      "/* Design System Colors */",
      ":root {",
      "  /* Palette Tokens */",
      "  --primary: #000000;",
      "  --primary-500: #000000;",
      "}",
      "/* Design System Typography */",
      ":root { --font-size-base: 1rem; }",
    ].join("\n");
    designSystem.artifacts.utilityCSS = ".text-primary{color:var(--primary);}";
    designSystem.artifacts.globalCSS = [
      designSystem.artifacts.baseCSS,
      designSystem.artifacts.utilityCSS,
    ].join("\n\n");

    const adapter = {
      getSiteSettings: vi.fn(async () => ({ utilityEngine: "custom" })),
      getDesignSystem: vi.fn(async () => designSystem),
      listPagesDSL: vi.fn(async () => {
        throw new Error("colorsOnly must not scan pages");
      }),
      listLayoutsDSL: vi.fn(async () => []),
      listComponentsDSL: vi.fn(async () => []),
      getPageDSL: vi.fn(async () => null),
      getLayoutDSL: vi.fn(async () => null),
      getComponentDSL: vi.fn(async () => null),
    };

    const result = await buildGlobalCSSArtifactsSnapshot(adapter as never, {
      colorsOnly: true,
    });

    expect(result.designSystem.artifacts.baseCSS).toContain(
      "--primary: #111111;",
    );
    expect(result.designSystem.artifacts.baseCSS).not.toContain(
      "--primary: #000000;",
    );
    expect(result.designSystem.artifacts.utilityCSS).toBe(
      ".text-primary{color:var(--primary);}",
    );
    expect(adapter.listPagesDSL).not.toHaveBeenCalled();
  });

  it("bumps style revision and invalidates stored page artifacts for style mutations", async () => {
    const designSystem = createDefaultUniversalDesignSystem();
    const adapter = {
      getSiteSettings: vi
        .fn()
        .mockResolvedValueOnce({ utilityEngine: "custom", styleRevision: "7" })
        .mockResolvedValueOnce({ utilityEngine: "custom", styleRevision: "7" }),
      saveSiteSettings: vi.fn().mockResolvedValue(undefined),
      getDesignSystem: vi.fn(async () => designSystem),
      saveDesignSystem: vi.fn().mockResolvedValue(undefined),
      listPagesDSL: vi.fn(async () => [
        { id: "home", slug: "index" },
        { id: "about", slug: "about" },
      ]),
      listLayoutsDSL: vi.fn(async () => []),
      listComponentsDSL: vi.fn(async () => []),
      getPageDSL: vi.fn(async () => ({ id: "page", slug: "page", nodes: [] })),
      getLayoutDSL: vi.fn(async () => null),
      getComponentDSL: vi.fn(async () => null),
      deleteSnapshot: vi.fn().mockResolvedValue(undefined),
      deletePageThumbnail: vi.fn().mockResolvedValue(undefined),
    };

    const result = await regenerateGlobalCSSArtifacts(adapter as never, {
      bumpStyleRevision: true,
      invalidatePageRenderArtifacts: true,
    });

    expect(result.styleRevision).not.toBe("7");
    expect(result.invalidatedPageCount).toBe(2);
    expect(adapter.saveSiteSettings.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        styleRevision: result.styleRevision,
      }),
    );
    expect(adapter.deletePageThumbnail).toHaveBeenCalledWith("home");
    expect(adapter.deletePageThumbnail).toHaveBeenCalledWith("about");
    expect(adapter.deleteSnapshot).toHaveBeenCalled();
  });

  it("includes submitted nodes when regenerating publish CSS", async () => {
    const designSystem = createDefaultUniversalDesignSystem();
    const adapter = {
      getSiteSettings: vi.fn(async () => ({ utilityEngine: "unocss" })),
      getDesignSystem: vi.fn(async () => designSystem),
      saveDesignSystem: vi.fn().mockResolvedValue(undefined),
      listPagesDSL: vi.fn(async () => []),
      listLayoutsDSL: vi.fn(async () => []),
      listComponentsDSL: vi.fn(async () => []),
      getPageDSL: vi.fn(async () => null),
      getLayoutDSL: vi.fn(async () => null),
      getComponentDSL: vi.fn(async () => null),
    };

    const submittedNodes = [
      {
        id: "publish-only-node",
        type: "Container",
        className: "bg-fuchsia-500",
        children: [],
      },
    ] as never;

    await regenerateGlobalCSSArtifacts(adapter as never, {
      utilityNodes: submittedNodes,
    });

    const savedDesignSystem = adapter.saveDesignSystem.mock.calls[0]?.[0];
    expect(savedDesignSystem.artifacts.globalCSS).toContain(
      ".bg-fuchsia-500",
    );
  });
});

describe("buildStageRenderStylesData", () => {
  it("places generated node CSS after utility CSS for cascade priority", () => {
    const result = buildStageRenderStylesData({
      storedRenderStyles: {
        baseCSS: [
          "body{background:#ffffff;}",
          "html, body { margin: 0; }",
        ].join("\n\n"),
        baseCSSHash: "base-hash",
        customClassesCSS: "",
        customFontsCSS: "",
        globalCSS: [
          "body{background:#ffffff;}",
          ".bg-white{background-color:#fff;}",
          "html, body { margin: 0; }",
        ].join("\n\n"),
        globalCSSHash: "global-hash",
        lastCompiled: "2026-04-29T00:00:00.000Z",
        styleRevision: "style-1",
        utilityCSS: ".bg-white{background-color:#fff;}",
        utilityCSSHash: "utility-hash",
        utilityEngine: "custom",
      },
      generatedDocumentCss:
        "html, body { min-height: 100%; }\n\ndiv.aria-n_hero { background-color: var(--accent-500); }",
    });

    expect(result.globalCSS.indexOf(".bg-white")).toBeLessThan(
      result.globalCSS.indexOf("div.aria-n_hero"),
    );
    expect(result.globalCSS).toContain("html, body { min-height: 100%; }");
    expect(result.baseCSS).toContain(
      "div.aria-n_hero { background-color: var(--accent-500); }",
    );
  });
});
