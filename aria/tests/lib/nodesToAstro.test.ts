import { describe, expect, it } from "vitest";

import { nodesToAstro } from "../../lib/blocks/nodesToAstro";
import type { BuilderNode } from "../../lib/types/nodes";
import { createTestIconRenderResources } from "../helpers/iconRenderResources";

function createNode(overrides: Partial<BuilderNode>): BuilderNode {
  return {
    id: overrides.id || "node-1",
    type: overrides.type || "Button",
    props: overrides.props || {},
    styles: overrides.styles || {},
    children: overrides.children || [],
    ...overrides,
  };
}

describe("nodesToAstro", () => {
  it("preserves managed responsive image delivery in exports", () => {
    const astro = nodesToAstro([
      createNode({
        id: "responsive-image",
        type: "Image",
        props: { src: "/media/source/current/hero.jpg", alt: "Hero" },
        metadata: {
          responsiveImage: {
            sizes: "100vw",
            default: {
              url: "/media/source/current/hero.jpg",
              reference: { mediaId: "hero", variantId: null },
              width: 1_600,
              height: 900,
              allowDerivatives: true,
            },
            sources: {
              mobile: {
                url: "/media/transform/hero-mobile/1-mobile",
                reference: {
                  mediaId: "hero",
                  variantId: "hero-mobile",
                },
                width: 640,
                height: 800,
                allowDerivatives: true,
              },
            },
          },
        },
      }),
    ]);

    expect(astro).toContain('<picture style="display: contents">');
    expect(astro).toContain(
      'srcset="/media/source/current/hero.jpg?width=320 320w',
    );
    expect(astro).toContain('sizes="100vw"');
  });

  it("renders button variants as data attributes instead of raw props", () => {
    const astro = nodesToAstro([
      createNode({
        id: "button-variant",
        type: "Button",
        props: {
          label: "Start",
          variant: "destructive",
        },
      }),
    ]);

    expect(astro).toContain('data-button-variant="destructive"');
    expect(astro).not.toContain(' variant="destructive"');
  });

  it("renders button icons in the configured position", () => {
    const leftAstro = nodesToAstro(
      [
        createNode({
          id: "button-left",
          type: "Button",
          props: {
            label: "Start",
            icon: "i-lucide:rocket",
            iconPosition: "left",
          },
        }),
      ],
      { iconResources: createTestIconRenderResources() },
    );
    const rightAstro = nodesToAstro(
      [
        createNode({
          id: "button-right",
          type: "Button",
          props: {
            label: "Start",
            icon: "i-lucide:rocket",
            iconPosition: "right",
          },
        }),
      ],
      { iconResources: createTestIconRenderResources() },
    );

    expect(leftAstro).toContain("<svg");
    expect(leftAstro).toContain('focusable="false"');
    expect(leftAstro).not.toContain('<span aria-hidden="true"');
    expect(leftAstro).not.toContain('icon="lucide:rocket"');
    expect(leftAstro).toContain('data-button-variant="primary"');
    expect(leftAstro).not.toContain('iconPosition="left"');
    expect(leftAstro.indexOf("<svg")).toBeLessThan(leftAstro.indexOf("Start"));
    expect(rightAstro).toContain("<svg");
    expect(rightAstro).not.toContain('icon="lucide:rocket"');
    expect(rightAstro).toContain('data-button-variant="primary"');
    expect(rightAstro).not.toContain('iconPosition="right"');
    expect(rightAstro.indexOf("Start")).toBeLessThan(
      rightAstro.indexOf("<svg"),
    );
  });

  it("renders button icon spacing without exposing raw button content props", () => {
    const astro = nodesToAstro(
      [
        createNode({
          id: "button-spacing",
          type: "Button",
          props: {
            label: "Start",
            icon: "i-lucide:rocket",
            iconGap: "1rem",
            iconSpaceBetween: true,
          },
        }),
      ],
      { iconResources: createTestIconRenderResources() },
    );

    expect(astro).toContain("gap: 1rem");
    expect(astro).toContain("justify-content: space-between");
    expect(astro).toContain("width: 100%");
    expect(astro).toContain("<svg");
    expect(astro).not.toContain('<span aria-hidden="true"');
    expect(astro).not.toContain('iconGap="1rem"');
    expect(astro).not.toContain("iconSpaceBetween");
  });

  it("renders canonical and legacy lists as semantic Astro list markup", () => {
    const canonicalAstro = nodesToAstro([
      createNode({
        id: "canonical-list",
        type: "list",
        props: {
          ordered: false,
        },
        children: [
          createNode({
            id: "canonical-list-item",
            type: "listitem",
            children: [
              createNode({
                id: "canonical-list-text",
                type: "Text",
                props: {
                  text: "Canonical item",
                },
              }),
            ],
          }),
        ],
      }),
    ]);
    const legacyAstro = nodesToAstro([
      createNode({
        id: "legacy-list",
        type: "list",
        props: {
          ordered: false,
          items: ["Legacy item"],
        },
      }),
    ]);

    expect(canonicalAstro).toContain("<ul>");
    expect(canonicalAstro).toContain("<li>");
    expect(canonicalAstro).toContain("Canonical item");
    expect(legacyAstro).toContain("<ul>");
    expect(legacyAstro).toContain("<li>Legacy item</li>");
    expect(legacyAstro).not.toContain("items=");
  });
});
