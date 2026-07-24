import { describe, expect, it } from "vitest";
import {
  generateLiveHtml,
  nodeToHtml,
  nodesToHtml,
} from "../../admin/features/Studio/pages/composables/pagePreviewLiveHtml";
import { EMPTY_PAGE_PREVIEW_RENDER_STYLES } from "../../admin/features/Studio/pages/composables/pagePreviewTypes";
import { createIconRenderResources } from "../../lib/icons/iconRenderResources";

describe("pagePreviewLiveHtml", () => {
  it("wraps text node content in anchors when href props are present", () => {
    const html = nodesToHtml([
      {
        id: "node-1",
        type: "Text",
        props: {
          text: "Jump to pricing",
          href: "#pricing",
          title: "Pricing section",
        },
        styles: {},
        children: [],
      },
    ]);

    expect(html).toContain(
      '<p><a href="#pricing" title="Pricing section">Jump to pricing</a></p>',
    );
    expect(html).not.toContain('<p href="#pricing"');
  });

  it("escapes unsafe attribute values in generated HTML", () => {
    const html = nodeToHtml({
      id: "node-2",
      type: "Text",
      props: {
        text: "Safe text",
        href: '"><script>alert(1)</script>',
      },
      styles: {},
      children: [],
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("builds a complete live preview document shell", () => {
    const html = generateLiveHtml({
      nodes: [
        {
          id: "node-3",
          type: "Section",
          className: "preview-token",
          props: {},
          styles: {},
          children: [],
        },
      ],
      settings: null,
      renderStyles: {
        ...EMPTY_PAGE_PREVIEW_RENDER_STYLES,
        baseCSS: ".preview-token{color:red}",
        utilityCSS: ".utility{color:blue}",
      },
      pageCssVariables: {
        accent: "red",
      },
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain(".preview-token{color:red}");
    expect(html).toContain(".utility{color:blue}");
    expect(html).toContain("--accent: red;");
    expect(html).toContain('body class="preview-mode"');
  });

  it("renders stylesheet-scoped list marker classes in live preview HTML", () => {
    const html = generateLiveHtml({
      nodes: [
        {
          id: "nav-list",
          type: "list",
          props: {},
          styles: {
            listStyleType: { default: "none" },
          },
          children: [
            {
              id: "nav-item",
              type: "listitem",
              props: {},
              styles: {},
              children: [
                {
                  id: "nav-link",
                  type: "link",
                  props: {
                    href: "/features",
                    content: "Features",
                  },
                  styles: {},
                  children: [],
                },
              ],
            },
          ],
        },
      ],
      settings: null,
      renderStyles: {
        ...EMPTY_PAGE_PREVIEW_RENDER_STYLES,
        globalCSS:
          "ul.aria-nav-list { list-style-type: none; }",
      },
      pageCssVariables: {},
    });

    expect(html).toContain('class="aria-nav-list"');
    expect(html).not.toContain('style="list-style-type: none"');
    expect(html).toContain("ul.aria-nav-list { list-style-type: none; }");
  });

  it("inlines browser-resolved canonical icons in preview srcdoc", () => {
    const html = generateLiveHtml({
      nodes: [
        {
          id: "preview-icon",
          type: "Icon",
          props: { icon: "lucide:star" },
          styles: {},
          children: [],
        },
      ],
      settings: null,
      renderStyles: EMPTY_PAGE_PREVIEW_RENDER_STYLES,
      pageCssVariables: {},
      iconResources: createIconRenderResources(
        new Map(),
        new Map([
          [
            "lucide:star",
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1h22" /></svg>',
          ],
        ]),
      ),
    });

    expect(html).toContain('<path d="M1 1h22" />');
    expect(html).not.toContain('class="i-lucide:star"');
  });
});
