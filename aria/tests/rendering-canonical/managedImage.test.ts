import { describe, expect, it } from "vitest";

import {
  CanonicalClassTokenSchema,
  ManagedImageProjectionSchema,
  assembleRendererBaseCss,
  assembleRendererStyleBands,
  buildRendererBaseStyleFragment,
  collectRendererStyleRequirements,
  materializeManagedImageDom,
  projectManagedImage,
  serializeCanonicalClassTokens,
  splitCompatibilityRendererBaseCss,
} from "../../lib/rendering/canonical";
import { DEFAULT_BREAKPOINTS, type BuilderNode } from "../../lib/types/nodes";

function createManagedImageNode(): BuilderNode {
  return {
    id: "managed-logo",
    type: "Image",
    props: {
      src: "/media/source/current/logo.png",
      alt: "Company name",
    },
    classNames: { base: ["h-8"] },
    styles: {},
    children: [],
    metadata: {
      responsiveImage: {
        sizes: "100vw",
        default: {
          url: "/media/source/current/logo.png",
          reference: { mediaId: "logo", variantId: null },
          width: 727,
          height: 621,
          allowDerivatives: true,
        },
        sources: {
          mobile: {
            url: "/media/transform/logo-mobile/1-mobile",
            reference: { mediaId: "logo", variantId: "logo-mobile" },
            width: 320,
            height: 320,
            allowDerivatives: true,
          },
        },
      },
    },
  };
}

describe("canonical managed-image projection", () => {
  it("projects intrinsic dimensions, delivery attributes, and renderer ownership", () => {
    const projection = projectManagedImage({
      node: createManagedImageNode(),
      breakpoints: DEFAULT_BREAKPOINTS,
    });

    expect(projection).toMatchObject({
      width: 727,
      height: 621,
      sizes: "100vw",
      classToken: { name: "aria-managed-image", origin: "renderer" },
      styleRequirements: ["managed-image-intrinsic-ratio"],
    });
    expect(projection?.srcSet).toContain("logo.png?width=320 320w");
    expect(projection?.sources[0]?.media).toBe("(max-width: 767.98px)");
  });

  it("fails closed for unmanaged and malformed input", () => {
    const unmanaged: BuilderNode = {
      id: "url-image",
      type: "Image",
      props: { src: "https://example.com/logo.png" },
      styles: {},
      children: [],
    };
    const malformed = {
      type: "Image",
      metadata: { responsiveImage: { width: "727" } },
    };

    expect(
      projectManagedImage({
        node: unmanaged,
        breakpoints: DEFAULT_BREAKPOINTS,
      }),
    ).toBeNull();
    expect(
      projectManagedImage({
        node: malformed,
        breakpoints: DEFAULT_BREAKPOINTS,
      }),
    ).toBeNull();
    expect(collectRendererStyleRequirements([unmanaged])).toEqual(new Set());
    expect(
      collectRendererStyleRequirements([
        {
          ...createManagedImageNode(),
          metadata: {
            responsiveImage: {
              sizes: "100vw",
              default: {
                url: "https://example.com/logo.png",
                reference: { mediaId: "logo", variantId: null },
                width: 727,
                height: 621,
                allowDerivatives: true,
              },
              sources: {},
            },
          },
        },
      ]),
    ).toEqual(new Set());
    expect(() =>
      ManagedImageProjectionSchema.parse({ width: 727, unexpected: true }),
    ).toThrow();
  });

  it("materializes the same managed attributes without persisting renderer classes", () => {
    const node = createManagedImageNode();
    const projection = projectManagedImage({
      node,
      breakpoints: DEFAULT_BREAKPOINTS,
    });
    expect(projection).not.toBeNull();
    if (!projection) return;

    const image = document.createElement("img");
    image.className = "h-8 custom-logo";
    image.src = "/media/source/current/logo.png";
    const rendered = materializeManagedImageDom(image, projection);

    expect(rendered.localName).toBe("picture");
    expect(rendered.getAttribute("style")).toBe("display: contents;");
    expect(rendered.querySelector("source")?.getAttribute("sizes")).toBe(
      "100vw",
    );
    expect(rendered.querySelector("img")?.getAttribute("class")).toBe(
      "h-8 custom-logo aria-managed-image",
    );
    expect(rendered.querySelector("img")?.getAttribute("width")).toBe("727");
    expect(rendered.querySelector("img")?.getAttribute("height")).toBe("621");
    expect(node.classNames).toEqual({ base: ["h-8"] });
  });

  it("keeps renderer tokens out of utility order and produces a stable fragment hash", async () => {
    expect(
      serializeCanonicalClassTokens([
        CanonicalClassTokenSchema.parse({
          name: "aria-n_logo",
          origin: "style-scope",
        }),
        CanonicalClassTokenSchema.parse({
          name: "aria-managed-image",
          origin: "renderer",
        }),
        CanonicalClassTokenSchema.parse({
          name: "motion-safe",
          origin: "runtime",
        }),
        CanonicalClassTokenSchema.parse({
          name: "brand-logo",
          origin: "custom",
        }),
        CanonicalClassTokenSchema.parse({ name: "h-8", origin: "utility" }),
      ]),
    ).toBe("h-8 brand-logo motion-safe aria-managed-image aria-n_logo");

    const css = assembleRendererBaseCss(["managed-image-intrinsic-ratio"]);
    const first = await buildRendererBaseStyleFragment([
      "managed-image-intrinsic-ratio",
    ]);
    const second = await buildRendererBaseStyleFragment([
      "managed-image-intrinsic-ratio",
    ]);

    expect(css).toBe(
      ":where(img.aria-managed-image) {\n  width: auto;\n  height: auto;\n}",
    );
    expect(first?.hash).toHaveLength(64);
    expect(second?.hash).toBe(first?.hash);
    expect(await buildRendererBaseStyleFragment([])).toBeNull();

    const ordered = assembleRendererStyleBands({
      rendererBaseCss: css,
      documentCss: ":root { --brand: red; }",
      utilityCss: ".h-8 { height: 2rem; }",
      customClassesCss: ".brand-logo { display: block; }",
      contextRulesCss: "@media (min-width: 80rem) {}",
      nodeCss: ".aria-n_logo { width: 4rem; }",
    });
    expect(ordered.indexOf(":where(img.aria-managed-image)")).toBeLessThan(
      ordered.indexOf(":root"),
    );
    expect(ordered.indexOf(":root")).toBeLessThan(ordered.indexOf(".h-8"));
    expect(
      assembleRendererStyleBands({
        rendererBaseCss: "",
        documentCss: ":root {}",
        utilityCss: "",
        customClassesCss: "",
        contextRulesCss: "",
        nodeCss: "",
      }),
    ).toBe(":root {}");
  });

  it("lets utility, custom, and Inspector dimensions override the zero-specificity invariant", () => {
    const style = document.createElement("style");
    style.textContent = [
      assembleRendererBaseCss(["managed-image-intrinsic-ratio"]),
      ".h-8 { height: 2rem; }",
      ".w-full { width: 100%; }",
      ".w-8 { width: 2rem; }",
      ".custom-logo { width: 5rem; }",
      ".aria-n_logo { height: 4rem; }",
    ].join("\n");
    document.head.appendChild(style);

    const createImage = (className: string): CSSStyleDeclaration => {
      const image = document.createElement("img");
      image.className = `aria-managed-image ${className}`;
      image.setAttribute("width", "727");
      image.setAttribute("height", "621");
      document.body.appendChild(image);
      return getComputedStyle(image);
    };

    expect(createImage("h-8").height).toBe("2rem");
    expect(createImage("w-full").width).toBe("100%");
    expect(createImage("h-8 w-8").width).toBe("2rem");
    expect(createImage("h-8 w-8").height).toBe("2rem");
    expect(createImage("custom-logo").width).toBe("5rem");
    expect(createImage("aria-n_logo").height).toBe("4rem");

    style.remove();
    document.body.replaceChildren();
  });

  it("splits only a registered renderer fragment at the persisted CSS boundary", () => {
    const rendererCss = assembleRendererBaseCss([
      "managed-image-intrinsic-ratio",
    ]);
    const documentCss = ":root { --brand: red; }";

    expect(
      splitCompatibilityRendererBaseCss(`${rendererCss}\n\n${documentCss}`),
    ).toEqual({ rendererBaseCss: rendererCss, remainingCss: documentCss });
    expect(splitCompatibilityRendererBaseCss(rendererCss)).toEqual({
      rendererBaseCss: rendererCss,
      remainingCss: "",
    });

    const foreignCss = `/* user css */\n${rendererCss}\n\n${documentCss}`;
    expect(splitCompatibilityRendererBaseCss(foreignCss)).toEqual({
      rendererBaseCss: "",
      remainingCss: foreignCss,
    });
    const similarCss = rendererCss.replace("height: auto", "height: inherit");
    expect(splitCompatibilityRendererBaseCss(similarCss)).toEqual({
      rendererBaseCss: "",
      remainingCss: similarCss,
    });
  });
});
