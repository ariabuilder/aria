import { describe, expect, it } from "vitest";

import {
  normalizeEditableSurface,
  resolveRenderSurface,
  type RenderDependencyProvider,
} from "../../lib/rendering/canonical";
import {
  compileRenderDocument,
  hasValidRenderDocumentHash,
  serializeRenderDocumentHtml,
  stableSerializeRenderDocument,
} from "../../lib/rendering/canonical/document";
import type {
  BuilderNode,
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "../../lib/types/nodes";
import { createTestIconRenderResources } from "../helpers/iconRenderResources";

declare const __ARIA_FOUNDATION_RUNTIME__: "node" | "workerd";

function textNode(
  id: string,
  content: string,
  element?: "dt" | "dd",
): BuilderNode {
  return {
    id,
    type: element ? "ListItem" : "Text",
    props: element ? { element, content } : { content },
    styles: {},
    children: [],
  };
}

describe("RenderDocumentV1 portable contract", () => {
  it(`compiles one ordered, hashed document in ${__ARIA_FOUNDATION_RUNTIME__}`, async () => {
    const page: PageDSL = {
      id: "home",
      slug: "home",
      title: "Home",
      layout: "shell",
      nodes: [
        {
          id: "impact",
          type: "List",
          props: { element: "dl" },
          styles: {},
          children: [
            {
              id: "impact-group",
              type: "Container",
              props: {},
              styles: {},
              children: [
                textNode("impact-term", "Customer satisfaction", "dt"),
                textNode("impact-value", "98%", "dd"),
              ],
            },
          ],
        },
        {
          id: "steps",
          type: "List",
          props: { ordered: true },
          styles: {},
          children: [
            {
              id: "step-one",
              type: "ListItem",
              props: { content: "First" },
              styles: {},
              children: [],
            },
          ],
        },
      ],
    };
    const layout: LayoutDSL = {
      id: "shell",
      name: "Shell",
      nodes: [
        {
          id: "main-slot",
          type: "Slot",
          props: { name: "main" },
          styles: {},
          children: [],
        },
      ],
      slots: [{ name: "main", isDefault: true, defaultContent: [] }],
      regions: {
        headerComponent: "header",
        footerComponent: "footer",
      },
    };
    const components: ComponentDSL[] = [
      {
        id: "header",
        name: "Header",
        nodes: [
          textNode("header-copy", "Header"),
          {
            id: "header-icon",
            type: "Icon",
            props: { icon: "lucide:rocket" },
            styles: {},
            children: [],
          },
        ],
      },
      {
        id: "footer",
        name: "Footer",
        nodes: [textNode("footer-copy", "Footer")],
      },
    ];
    const dependencies: RenderDependencyProvider = {
      getLayout: async (ref) => (ref.id === layout.id ? layout : null),
      getComponent: async (ref) =>
        components.find((component) => component.id === ref.id) ?? null,
    };
    const normalized = await normalizeEditableSurface({
      kind: "page",
      source: page,
    });
    const surface = await resolveRenderSurface({
      normalized,
      mode: "public",
      route: { path: "/home" },
      providers: { dependencies },
    });
    const iconResources = createTestIconRenderResources();
    const compile = () =>
      compileRenderDocument({
        surface,
        cspHeaderValue: "default-src 'self'",
        iconResources,
        document: {
          title: "Home",
          lang: "en-CA",
          siteSettings: { framework: "custom" },
        },
      });
    const document = await compile();
    const repeated = await compile();
    const html = serializeRenderDocumentHtml(document);

    expect(document.contractVersion).toBe(1);
    expect(document.kind).toBe("page");
    expect(document.document).toMatchObject({
      lang: "en-CA",
      title: "Home",
    });
    expect(document.regions.map((region) => region.role)).toEqual([
      "header",
      "layout",
      "footer",
    ]);
    expect(html.indexOf("Header")).toBeLessThan(html.indexOf("<dl>"));
    expect(html.indexOf("<dl>")).toBeLessThan(html.indexOf("Footer"));
    expect(html).toContain("<dt>Customer satisfaction</dt>");
    expect(html).toContain("<dd>98%</dd>");
    expect(html).toContain("<ol>");
    expect(html).not.toContain("element=");
    expect(html).not.toContain("ordered=");
    expect(document.roots.map((root) => root.tagName)).toEqual([
      "p",
      "svg",
      "div",
      "p",
    ]);
    const layoutChildren = document.roots[2]?.children.filter(
      (child) => child.type === "element",
    );
    expect(layoutChildren?.map((child) => child.tagName)).toEqual(["dl", "ol"]);
    expect(layoutChildren?.[0]?.attributes).not.toContainEqual(
      expect.objectContaining({ name: "element" }),
    );
    expect(document.revision.sourceHash).toBe(normalized.sourceHash);
    expect(document.dependencies).toBe(surface.dependencies);
    expect(document.resources).toBe(surface.resources);
    expect(serializeRenderDocumentHtml(repeated)).toBe(html);
    expect(repeated.documentHash).toBe(document.documentHash);
    expect(document.documentHash).toBe(
      "261c4126fc4d528cb3b07c269a9b626b324fc7b4633d1a889a4df33fa4f700ef",
    );
    expect(stableSerializeRenderDocument(document)).toContain(
      '"contractVersion":1',
    );
    expect(stableSerializeRenderDocument(document)).not.toContain(
      '"documentHash"',
    );
    expect(await hasValidRenderDocumentHash(document)).toBe(true);
    expect(Object.isFrozen(document)).toBe(true);
    expect(Object.isFrozen(document.regions)).toBe(true);
  });
});
