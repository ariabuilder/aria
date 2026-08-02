import { describe, expect, it } from "vitest";

import {
  collectNodeStylesheet,
  nodesToHtmlDocument,
  nodesToHtmlFragmentWithStylesheet,
  nodesToHtmlWithLayout,
} from "../../lib/blocks/nodesToHtml";
import { createBreakpointDefinitionsFromUniversalBreakpoints } from "../../lib/styles/universalDesignSystem";
import { normalizeIconValue } from "../../lib/icons/reference";
import type { BuilderNode } from "../../lib/types/nodes";
import type { StructuredTextDocument } from "../../lib/cms/structuredText";
import { createTestIconRenderResources } from "../helpers/iconRenderResources";

function createNode(overrides: Partial<BuilderNode>): BuilderNode {
  return {
    id: overrides.id || "node-1",
    type: overrides.type || "Text",
    props: overrides.props || {},
    styles: overrides.styles || {},
    children: overrides.children || [],
    ...overrides,
  };
}

describe("nodesToHtml", () => {
  it("uses caller-provided Global Styles instead of a hardcoded document reset", () => {
    const fallbackHtml = nodesToHtmlDocument([], {
      inlineGlobalStylesCSS:
        "html {\n  margin: 1rem;\n}\n\nbody {\n  padding: var(--page-gutter);\n}",
    });
    const bareHtml = nodesToHtmlDocument([]);

    expect(fallbackHtml).toContain("html {\n  margin: 1rem;");
    expect(fallbackHtml).toContain("body {\n  padding: var(--page-gutter);");
    expect(bareHtml).not.toContain("html, body {");
  });

  function withIcons() {
    return { iconResources: createTestIconRenderResources() };
  }
  it("drops executable and malformed HTML attributes from node props", () => {
    const html = nodesToHtmlDocument(
      [
        createNode({
          id: "unsafe-link",
          type: "Link",
          props: {
            text: "Safe label",
            href: "java\nscript:alert(1)",
            onload: "alert(1)",
            srcdoc: "<script>alert(1)</script>",
            style: "background:url(javascript:alert(1))",
            "bad attribute": "value",
            title: "Allowed title",
          },
        }),
      ],
      withIcons(),
    );

    expect(html).toContain('title="Allowed title"');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("onload");
    expect(html).not.toContain("srcdoc");
    expect(html).not.toContain("bad attribute");
    expect(html).not.toContain("background:url");
  });

  it("renders responsive style rules against an internal class selector", () => {
    const html = nodesToHtmlDocument(
      [
        createNode({
          id: "hero.title",
          type: "Text",
          props: { text: "Hello" },
          styles: {
            color: { base: "red", tablet: "blue" },
          },
        }),
      ],
      withIcons(),
    );

    expect(html).toContain('class="aria-hero-title"');
    expect(html).toContain("p.aria-hero-title { color: red; }");
    expect(html).toContain(
      "@media (max-width: 1279.98px) {\n  p.aria-hero-title { color: blue; }\n}",
    );
    expect(html).not.toContain('style="color: red"');
    expect(html).not.toContain("data-node-id");
  });

  it("renders managed responsive images as ordered picture sources", () => {
    const html = nodesToHtmlDocument([
      createNode({
        id: "responsive-hero",
        type: "Image",
        props: {
          src: "/media/source/current/hero.jpg",
          alt: "Team at work",
        },
        metadata: {
          responsiveImage: {
            sizes: "(max-width: 767px) 100vw, 50vw",
            default: {
              url: "/media/source/current/hero.jpg",
              reference: { mediaId: "hero", variantId: null },
              width: 2_400,
              height: 1_600,
              allowDerivatives: true,
            },
            sources: {
              tablet: {
                url: "/media/transform/hero-tablet/1-tablet",
                reference: {
                  mediaId: "hero",
                  variantId: "hero-tablet",
                },
                width: 1_280,
                height: 960,
                allowDerivatives: true,
              },
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

    expect(html).toContain('<picture style="display: contents">');
    expect(html).toContain(
      'media="(max-width: 767.98px)" srcset="/media/transform/hero-mobile/1-mobile/320 320w',
    );
    expect(html).toContain(
      'media="(max-width: 1279.98px)" srcset="/media/transform/hero-tablet/1-tablet/320 320w',
    );
    expect(html.indexOf("767.98px")).toBeLessThan(html.indexOf("1279.98px"));
    expect(html).toContain(
      'srcset="/media/source/current/hero.jpg?width=320 320w',
    );
    expect(html).toContain('sizes="(max-width: 767px) 100vw, 50vw"');
  });

  it("renders structured text content props as semantic HTML", () => {
    const content = [
      {
        _type: "block",
        _key: "block-1",
        style: "normal",
        markDefs: [],
        children: [
          {
            _type: "span",
            _key: "span-1",
            text: "Hello <CMS>",
            marks: ["strong"],
          },
        ],
      },
    ] satisfies StructuredTextDocument;

    const html = nodesToHtmlDocument(
      [
        createNode({
          id: "body",
          type: "Text",
          props: { content },
        }),
      ],
      withIcons(),
    );

    expect(html).toContain("<p><strong>Hello &lt;CMS&gt;</strong></p>");
    expect(html).not.toContain("[object Object]");
  });

  it("uses layout defaultContent when page has no nodes for a slot", () => {
    const layoutNodes = [
      createNode({
        id: "layout-root",
        type: "Section",
        props: {},
        children: [
          createNode({
            id: "slot-header",
            type: "Slot",
            props: { name: "header" },
            children: [],
          }),
        ],
      }),
    ];

    const html = nodesToHtmlWithLayout([], layoutNodes, {
      layoutSlots: [
        {
          name: "header",
          defaultContent: [
            createNode({
              id: "header-text",
              type: "Text",
              props: { text: "Global header" },
            }),
          ],
        },
      ],
    });

    expect(html).toContain("Global header");
  });

  it("does not render a wrapper element for multi-node slot insertion", () => {
    const layoutNodes = [
      createNode({
        id: "layout-root",
        type: "Section",
        props: {},
        children: [
          createNode({
            id: "slot-main",
            type: "Slot",
            props: { name: "main" },
            children: [],
          }),
        ],
      }),
    ];

    const pageNodes = [
      createNode({
        id: "first",
        type: "Text",
        props: { text: "First" },
        slot: "main",
      }),
      createNode({
        id: "second",
        type: "Text",
        props: { text: "Second" },
        slot: "main",
      }),
    ];

    const html = nodesToHtmlWithLayout(pageNodes, layoutNodes);

    expect(html).toContain("<section>");
    expect(html).toContain("<p>First</p>");
    expect(html).toContain("<p>Second</p>");
    expect(html).not.toContain('slot="');
    expect(html).not.toContain("<div>\n      <p>First</p>");
  });

  it("normalizes legacy corner props into styles instead of HTML attributes", () => {
    const html = nodesToHtmlDocument([
      createNode({
        id: "hero-image",
        type: "Image",
        props: {
          src: "/hero.jpg",
          alt: "Hero",
          borderTopLeftRadius: "8px",
          borderBottomRightRadius: "24px",
        },
      }),
    ]);

    expect(html).toContain(
      ".aria-hero-image { border-top-left-radius: 8px; border-bottom-right-radius: 24px; }",
    );
    expect(html).not.toContain(
      'style="border-top-left-radius: 8px; border-bottom-right-radius: 24px"',
    );
    expect(html).not.toContain('borderTopLeftRadius="8px"');
    expect(html).not.toContain('borderBottomRightRadius="24px"');
  });

  it("omits paste-import srcset and sizes from published image markup", () => {
    const html = nodesToHtmlDocument([
      createNode({
        id: "hero-image",
        type: "Image",
        props: {
          src: "/uploads/Veil.avif",
          alt: "Logo",
          srcset: "/_astro/hero.png 200w, /_astro/hero-2x.png 520w",
          sizes: "(max-width: 800px) 100vw, 620px",
        },
      }),
    ]);

    expect(html).toContain('src="/uploads/Veil.avif"');
    expect(html).not.toContain("srcset=");
    expect(html).not.toContain("sizes=");
  });

  it("normalizes image fit and position props into styles instead of HTML attributes", () => {
    const html = nodesToHtmlDocument([
      createNode({
        id: "hero-image",
        type: "Image",
        props: {
          src: "/hero.jpg",
          alt: "Hero",
          objectFit: "cover",
          objectPosition: "top right",
        },
      }),
    ]);

    expect(html).toContain(
      ".aria-hero-image { object-fit: cover; object-position: top right; }",
    );
    expect(html).not.toContain(
      'style="object-fit: cover; object-position: top right"',
    );
    expect(html).not.toContain('objectFit="cover"');
    expect(html).not.toContain('objectPosition="top right"');
  });

  it("uses the semantic tag override and omits the raw element prop attribute", () => {
    const html = nodesToHtmlDocument([
      createNode({
        id: "hero-container",
        type: "Container",
        props: {
          element: "section",
          id: "hero-section",
        },
        a11y: {
          ariaLabel: "Hero banner",
        },
      }),
    ]);

    expect(html).toContain("<section");
    expect(html).toContain('id="hero-section"');
    expect(html).toContain('aria-label="Hero banner"');
    expect(html).not.toContain('element="section"');
  });

  it("omits empty aria-label values from published html", () => {
    const html = nodesToHtmlDocument([
      createNode({
        id: "empty-a11y",
        type: "Container",
        props: {
          id: "content-root",
        },
        a11y: {
          ariaLabel: "",
        },
      }),
    ]);

    expect(html).toContain('<div id="content-root">');
    expect(html).not.toContain("aria-label");
  });

  it("wraps heading and text nodes in anchors when href is set", () => {
    const html = nodesToHtmlDocument([
      createNode({
        id: "pricing-heading",
        type: "Heading",
        props: {
          level: 2,
          text: "Pricing",
          href: "#pricing",
          title: "Jump to pricing",
        },
      }),
      createNode({
        id: "contact-text",
        type: "Text",
        props: {
          text: "Contact us",
          href: "/contact",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    ]);

    expect(html).toContain(
      '<h2><a href="#pricing" title="Jump to pricing">Pricing</a></h2>',
    );
    expect(html).toContain(
      '<p><a href="/contact" target="_blank" rel="noopener noreferrer">Contact us</a></p>',
    );
    expect(html).not.toContain('<h2 href="#pricing"');
    expect(html).not.toContain('<p href="/contact"');
  });

  it("renders buttons with href as anchors instead of invalid button href markup", () => {
    const html = nodesToHtmlDocument([
      createNode({
        id: "cta-button",
        type: "Button",
        props: {
          text: "Contact sales",
          variant: "destructive",
          href: "/contact",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    ]);

    expect(html).toContain(
      '<a data-button-variant="destructive" href="/contact" target="_blank" rel="noopener noreferrer">Contact sales</a>',
    );
    expect(html).not.toContain('<button href="/contact"');
    expect(html).not.toContain(' variant="destructive"');
  });

  it("renders linked images as anchors instead of invalid img href markup", () => {
    const html = nodesToHtmlDocument([
      createNode({
        id: "brand-image",
        type: "Image",
        props: {
          src: "/uploads/Aria.png",
          alt: "Aria Builder",
          href: "/",
          title: "Aria Builder",
        },
        styles: {
          width: { base: "45px" },
        },
      }),
    ]);

    expect(html).toContain(
      '<a href="/" title="Aria Builder"><img class="aria-brand-image" src="/uploads/Aria.png" alt="Aria Builder" /></a>',
    );
    expect(html).toContain("img.aria-brand-image { width: 45px;");
    expect(html).not.toContain(
      '<img style="width: 45px" src="/uploads/Aria.png" alt="Aria Builder" href="/"',
    );
  });

  it("wraps linked container children in anchors instead of invalid div href markup", () => {
    const html = nodesToHtmlDocument([
      createNode({
        id: "feature-card",
        type: "Container",
        props: {
          href: "/features",
          target: "_blank",
          rel: "noopener noreferrer",
        },
        children: [
          createNode({
            id: "feature-title",
            type: "Heading",
            props: {
              level: 3,
              text: "Features",
            },
          }),
        ],
      }),
    ]);

    expect(html).toContain(
      '<a href="/features" target="_blank" rel="noopener noreferrer">',
    );
    expect(html).toContain("<h3>Features</h3>");
    expect(html).toContain("</a>");
    expect(html).not.toContain('<div href="/features"');
  });

  it("renders linked empty containers with an anchor child", () => {
    const html = nodesToHtmlDocument([
      createNode({
        id: "empty-card",
        type: "Section",
        props: {
          href: "/pricing",
        },
        children: [],
      }),
    ]);

    expect(html).toContain('<a href="/pricing"></a>');
    expect(html).toContain("<section>");
    expect(html).toContain("</section>");
    expect(html).not.toContain('<section href="/pricing"');
  });

  it("renders blog cards with one outer anchor and no nested link tags", () => {
    const html = nodesToHtmlDocument([
      createNode({
        id: "blog-card",
        type: "Container",
        props: {
          href: "/blog/shipping-a-calmer-cms",
        },
        children: [
          createNode({
            id: "image-link",
            type: "Link",
            props: {},
            classNames: {
              base: ["group", "relative", "block", "h-48"],
            },
            children: [
              createNode({
                id: "cover-image",
                type: "Image",
                props: {
                  src: "/uploads/face.webp",
                  alt: "Cover",
                },
              }),
            ],
          }),
          createNode({
            id: "card-body",
            type: "Container",
            children: [
              createNode({
                id: "card-title",
                type: "Heading",
                props: {
                  level: 1,
                  text: "Shipping a Calmer CMS",
                  href: "/blog/shipping-a-calmer-cms",
                },
              }),
            ],
          }),
        ],
      }),
    ]);

    expect(html).toContain('<a href="/blog/shipping-a-calmer-cms">');
    expect(html).toContain("<h1>Shipping a Calmer CMS</h1>");
    expect(html).toContain('class="group relative block h-48"');
    expect(html).not.toMatch(/<a href="[^"]*">\s*<a[\s>]/);
    expect(html).not.toMatch(/<h1[^>]*>\s*<a[\s>]/);
  });

  it("renders canonical list item children as semantic list markup", () => {
    const html = nodesToHtmlDocument([
      createNode({
        id: "features-list",
        type: "list",
        props: {
          ordered: true,
        },
        children: [
          createNode({
            id: "feature-item-1",
            type: "listitem",
            children: [
              createNode({
                id: "feature-text-1",
                type: "Text",
                props: { text: "First item" },
              }),
            ],
          }),
          createNode({
            id: "feature-item-2",
            type: "listitem",
            children: [
              createNode({
                id: "feature-text-2",
                type: "Text",
                props: { text: "Second item" },
              }),
            ],
          }),
        ],
      }),
    ]);

    expect(html).toContain("<ol>");
    expect(html).toContain("<li>");
    expect(html).toContain("<p>First item</p>");
    expect(html).toContain("<p>Second item</p>");
    expect(html).not.toContain("items=");
  });

  it("renders linked icon-style list items as whole-row anchors by default", () => {
    const html = nodesToHtmlDocument(
      [
        createNode({
          id: "features-list",
          type: "list",
          children: [
            createNode({
              id: "feature-item-1",
              type: "listitem",
              props: {
                href: "/features",
              },
              children: [
                createNode({
                  id: "feature-icon-1",
                  type: "icon",
                  props: { icon: "i-lucide:star" },
                }),
                createNode({
                  id: "feature-text-1",
                  type: "Text",
                  props: { text: "Features" },
                }),
              ],
            }),
          ],
        }),
      ],
      withIcons(),
    );

    expect(html).toContain("<li>");
    expect(html).toContain('<a href="/features">');
    expect(html.indexOf('<a href="/features">')).toBeLessThan(
      html.indexOf("<svg"),
    );
    expect(html.indexOf("<svg")).toBeLessThan(html.indexOf("Features"));
    expect(html).not.toContain('<li href="/features"');
  });

  it("renders canonical icons inline without the Iconify runtime", () => {
    const html = nodesToHtmlDocument(
      [
        createNode({
          id: "feature-icon",
          type: "icon",
          props: {
            icon: normalizeIconValue("i-lucide:circle-check"),
          },
        }),
      ],
      withIcons(),
    );

    expect(html).toContain("<svg");
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).not.toContain("<iconify-icon");
    expect(html).not.toContain("code.iconify.design");
    expect(html).not.toContain("aria-icon-alias.js");
  });

  it("does not leak raw icon props into rendered icon markup", () => {
    const html = nodesToHtmlDocument(
      [
        createNode({
          id: "feature-icon",
          type: "icon",
          props: {
            icon: normalizeIconValue("i-lucide:circle-check"),
          },
        }),
      ],
      withIcons(),
    );

    expect(html).toContain("<svg");
    expect(html).not.toContain('icon="lucide:circle-check"');
    expect(html).not.toContain("<iconify-icon");
    expect(html).not.toContain("&quot;");
    expect(html).not.toContain("pack");
    expect(html).not.toContain("source");
  });

  it("renders published pages with global CSS using stylesheet mode and no inline responsive styles", () => {
    const html = nodesToHtmlDocument(
      [
        createNode({
          id: "n_5l4pbx9u",
          type: "Container",
          props: { element: "section" },
          styles: {
            backgroundColor: {
              base: "var(--primary-400)",
              laptop: "red",
              mobile: "var(--info-800)",
            },
          },
          children: [],
        }),
      ],
      {
        globalCSSEnabled: true,
        globalCSSHash: "test-hash",
        inlineGeneratedDocumentCss: false,
      },
    );

    expect(html).toContain('class="aria-n_5l4pbx9u"');
    expect(html).not.toContain('style="background-color: var(--primary-400)"');
    expect(html).not.toContain("@media (max-width:");
  });

  it("collectNodeStylesheet emits base and breakpoint background rules", () => {
    const stylesheet = collectNodeStylesheet(
      [
        createNode({
          id: "n_5l4pbx9u",
          type: "Container",
          styles: {
            backgroundColor: {
              base: "var(--primary-400)",
              laptop: "red",
              mobile: "var(--info-800)",
            },
          },
          children: [],
        }),
      ],
      [
        { name: "base", minWidth: "1280px", label: "Desktop" },
        { name: "laptop", minWidth: "1024px", label: "Laptop" },
        { name: "mobile", minWidth: "0px", label: "Mobile" },
      ],
    );

    expect(stylesheet).toContain(
      "div.aria-n_5l4pbx9u { background-color: var(--primary-400); }",
    );
    expect(stylesheet).toContain(
      "@media (max-width: 1279.98px) {\n  div.aria-n_5l4pbx9u { background-color: red; }\n}",
    );
    expect(stylesheet).toContain(
      "@media (max-width: 1023.98px) {\n  div.aria-n_5l4pbx9u { background-color: var(--info-800); }\n}",
    );
  });

  it("emits nested list marker styles in stylesheet-backed export output", () => {
    const preview = nodesToHtmlFragmentWithStylesheet([
      createNode({
        id: "outer-list",
        type: "list",
        styles: {
          listStyleType: { base: "disc" },
        },
        children: [
          createNode({
            id: "parent-item",
            type: "listitem",
            children: [
              createNode({
                id: "inner-list",
                type: "list",
                styles: {
                  listStyleType: { default: "none" },
                },
                children: [
                  createNode({
                    id: "child-item",
                    type: "listitem",
                    children: [
                      createNode({
                        id: "child-link",
                        type: "link",
                        props: {
                          href: "/features",
                          content: "Features",
                        },
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ]);

    expect(preview.html).toContain('class="aria-inner-list"');
    expect(preview.html).not.toContain('style="');
    expect(preview.stylesheet).toContain(
      "ul.aria-inner-list { list-style-type: none; }",
    );
  });

  it("renders stylesheet-backed fragment previews without inline node styles", () => {
    const preview = nodesToHtmlFragmentWithStylesheet([
      createNode({
        id: "hero.title",
        type: "Text",
        props: { text: "Hello" },
        styles: {
          color: { base: "red", tablet: "blue" },
          margin: { base: "0" },
        },
      }),
    ]);

    expect(preview.html).toContain('class="aria-hero-title"');
    expect(preview.html).not.toContain('style="');
    expect(preview.stylesheet).toContain(
      "p.aria-hero-title { color: red; margin: 0; }",
    );
    expect(preview.stylesheet).toContain(
      "@media (max-width: 1279.98px) {\n  p.aria-hero-title { color: blue; }\n}",
    );
  });

  it("renders text-scoped list item links without wrapping the whole row", () => {
    const html = nodesToHtmlDocument(
      [
        createNode({
          id: "features-list",
          type: "list",
          children: [
            createNode({
              id: "feature-item-1",
              type: "listitem",
              props: {
                href: "/features",
                linkScope: "text",
              },
              children: [
                createNode({
                  id: "feature-icon-1",
                  type: "icon",
                  props: { icon: "i-lucide:star" },
                }),
                createNode({
                  id: "feature-text-1",
                  type: "Text",
                  props: { text: "Features" },
                }),
              ],
            }),
          ],
        }),
      ],
      withIcons(),
    );

    expect(html).toContain("<li>");
    expect(html).toContain('<a href="/features">');
    expect(html.indexOf("<svg")).toBeLessThan(
      html.indexOf('<a href="/features">'),
    );
    expect(html.indexOf('<a href="/features">')).toBeLessThan(
      html.indexOf("Features"),
    );
    expect(html).not.toContain('<li href="/features"');
  });

  it("renders button icons in the configured position", () => {
    const leftHtml = nodesToHtmlDocument(
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
      withIcons(),
    );
    const rightHtml = nodesToHtmlDocument(
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
      withIcons(),
    );

    expect(leftHtml).toContain("text-foreground/80");
    expect(leftHtml).toContain("<svg");
    expect(leftHtml).toContain('focusable="false"');
    expect(leftHtml).not.toContain('<span aria-hidden="true"');
    expect(leftHtml).not.toContain('icon="lucide:rocket"');
    expect(leftHtml).toContain('data-button-variant="primary"');
    expect(leftHtml).not.toContain('iconPosition="left"');
    expect(leftHtml.indexOf("<svg")).toBeLessThan(leftHtml.indexOf("Start"));
    expect(rightHtml).toContain("<svg");
    expect(rightHtml).not.toContain('icon="lucide:rocket"');
    expect(rightHtml).toContain('data-button-variant="primary"');
    expect(rightHtml).not.toContain('iconPosition="right"');
    expect(rightHtml.indexOf("Start")).toBeLessThan(rightHtml.indexOf("<svg"));
  });

  it("renders button icon spacing without exposing raw button content props", () => {
    const html = nodesToHtmlDocument(
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
      withIcons(),
    );

    expect(html).toContain("gap: 1rem");
    expect(html).toContain("justify-content: space-between");
    expect(html).toContain("width: 100%");
    expect(html).toContain("<svg");
    expect(html).not.toContain('<span aria-hidden="true"');
    expect(html).not.toContain('iconGap="1rem"');
    expect(html).not.toContain("iconSpaceBetween");
  });

  it("renders background-image and gradient styles as inline CSS", () => {
    const html = nodesToHtmlDocument([
      createNode({
        id: "hero",
        type: "container",
        styles: {
          backgroundImage: {
            base: "linear-gradient(180deg, #111 0%, #222 100%)",
          },
          backgroundSize: {
            base: "cover",
          },
        },
        children: [],
      }),
    ]);

    expect(html).toContain(
      "background-image: linear-gradient(180deg, #111 0%, #222 100%)",
    );
    expect(html).toContain("background-size: cover");
  });

  it("escapes quoted url() values in inline background-image styles", () => {
    const html = nodesToHtmlDocument([
      createNode({
        id: "hero",
        type: "container",
        styles: {
          backgroundImage: {
            base: 'url("/uploads/face-7c4f59.webp")',
          },
          backgroundSize: {
            base: "cover",
          },
          backgroundPosition: {
            base: "center left",
          },
        },
        children: [],
      }),
    ]);

    expect(html).toContain(
      '.aria-hero { background-image: url("/uploads/face-7c4f59.webp"); background-size: cover; background-position: center left; }',
    );
    expect(html).toContain('class="aria-hero"');
    expect(html).not.toContain(
      'style="background-image: url(&quot;/uploads/face-7c4f59.webp&quot;); background-size: cover; background-position: center left"',
    );
    expect(html).not.toContain('url(" uploads');
    expect(html).not.toContain('uploads=""');
  });

  it("normalizes legacy desktop style keys when generating stylesheet rules", () => {
    const stylesheet = collectNodeStylesheet(
      [
        createNode({
          id: "legacy-section",
          type: "Container",
          styles: {
            backgroundColor: {
              desktop: "#993939",
              tablet: "#0c7521e8",
            },
          },
          children: [],
        }),
      ],
      [
        {
          name: "base",
          minWidth: "1280px",
          canvasWidth: 1440,
          label: "Desktop",
        },
        {
          name: "tablet",
          minWidth: "768px",
          canvasWidth: 768,
          label: "Tablet",
        },
      ],
    );

    expect(stylesheet).toContain(
      "div.aria-legacy-section { background-color: #993939; }",
    );
  });

  it("emits seed-config breakpoint colors without engulfing desktop in tablet media", () => {
    const breakpoints = createBreakpointDefinitionsFromUniversalBreakpoints([
      {
        id: "base",
        label: "Desktop",
        icon: "Monitor",
        minWidth: 1440,
        canvasWidth: 1440,
        enabled: true,
        isDefault: true,
        order: 0,
      },
      {
        id: "testing",
        label: "Testing",
        icon: "Monitor",
        minWidth: 2400,
        canvasWidth: 2400,
        enabled: true,
        isDefault: false,
        order: 1,
      },
      {
        id: "laptop",
        label: "Laptop",
        icon: "Laptop",
        minWidth: 1024,
        canvasWidth: 1024,
        enabled: true,
        isDefault: true,
        order: 2,
      },
      {
        id: "tablet",
        label: "Tablet",
        icon: "Tablet",
        minWidth: 768,
        canvasWidth: 768,
        enabled: true,
        isDefault: true,
        order: 3,
      },
      {
        id: "mobile",
        label: "Mobile",
        icon: "Smartphone",
        minWidth: 0,
        canvasWidth: 375,
        enabled: true,
        isDefault: true,
        order: 4,
      },
    ]);

    const stylesheet = collectNodeStylesheet(
      [
        createNode({
          id: "n_hzzm7948",
          type: "Section",
          styles: {
            backgroundColor: {
              base: "#993939",
              testing: "var(--secondary-800)",
              laptop: "var(--warning-700)",
              tablet: "#0c7521e8",
              mobile: "#666060",
            },
          },
          children: [],
        }),
      ],
      breakpoints,
    );

    expect(stylesheet).toContain(
      "section.aria-n_hzzm7948 { background-color: #993939; }",
    );
    expect(stylesheet).toContain(
      "@media (max-width: 1439.98px) {\n  section.aria-n_hzzm7948 { background-color: var(--warning-700); }\n}",
    );
    expect(stylesheet).toContain(
      "@media (max-width: 1023.98px) {\n  section.aria-n_hzzm7948 { background-color: #0c7521e8; }\n}",
    );
    expect(stylesheet).toContain(
      "@media (max-width: 767.98px) {\n  section.aria-n_hzzm7948 { background-color: #666060; }\n}",
    );
    expect(stylesheet).toContain(
      "@media (min-width: 2400px) {\n  section.aria-n_hzzm7948 { background-color: var(--secondary-800); }\n}",
    );
    expect(stylesheet).not.toContain("2399.98px");
  });
});
