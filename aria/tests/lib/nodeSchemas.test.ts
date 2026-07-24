import { describe, expect, it } from "vitest";

import {
  BuilderNodeSchema,
  ComponentDSLSchema,
  PageDSLSchema,
} from "../../lib/schemas/nodes";

describe("node schemas", () => {
  it("accepts component instances with componentRef", () => {
    const node = {
      id: "component-node",
      type: "Component",
      props: {},
      styles: {},
      children: [],
      componentRef: "heading-01",
      reference: {
        type: "instance",
        masterId: "heading-01",
      },
    };

    expect(BuilderNodeSchema.safeParse(node).success).toBe(true);
  });

  it("accepts page DSL trees containing component instance nodes", () => {
    const page = {
      id: "index",
      title: "Index",
      slug: "index",
      status: "draft",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      nodes: [
        {
          id: "section-1",
          type: "Section",
          props: {},
          styles: {},
          children: [
            {
              id: "container-1",
              type: "Container",
              props: {},
              styles: {},
              children: [
                {
                  id: "component-node",
                  type: "Component",
                  props: {},
                  styles: {},
                  children: [],
                  componentRef: "heading-01",
                  reference: {
                    type: "instance",
                    masterId: "heading-01",
                  },
                },
              ],
            },
          ],
        },
      ],
      frontmatter: {},
      settings: { breakpoints: [] },
      layout: "default",
      version: "1",
    };

    expect(PageDSLSchema.safeParse(page).success).toBe(true);
  });

  it("retains page policy metadata used by composer CMS state", () => {
    const page = {
      id: "post-template",
      title: "Post Template",
      slug: "post-template",
      status: "draft",
      nodes: [],
      systemRole: "cms-entry",
      accessMode: "public",
      hasPassword: false,
    };

    const parsed = PageDSLSchema.parse(page);

    expect(parsed.systemRole).toBe("cms-entry");
    expect(parsed.accessMode).toBe("public");
    expect(parsed.hasPassword).toBe(false);
  });

  it("drops legacy page-level header and footer assignments", () => {
    const parsed = PageDSLSchema.parse({
      id: "legacy-page",
      title: "Legacy page",
      slug: "legacy-page",
      nodes: [],
      regions: {
        headerComponent: "old-header",
        footerComponent: "old-footer",
      },
    });

    expect(parsed).not.toHaveProperty("regions");
  });

  it("accepts content editor settings on nodes and component prop schema", () => {
    const component = {
      id: "footer",
      name: "Footer",
      nodes: [
        {
          id: "footer-root",
          type: "Section",
          props: { title: "Footer" },
          styles: {},
          children: [],
          metadata: {
            contentEditor: {
              enabled: true,
              label: "Footer section",
              fields: {
                title: {
                  enabled: true,
                  locked: true,
                  label: "Title",
                  order: 1,
                },
              },
            },
          },
        },
      ],
      propSchema: [
        {
          name: "headline",
          type: "string",
          contentEditor: {
            enabled: true,
            hidden: false,
            label: "Headline",
            order: 2,
          },
        },
      ],
      settings: {
        cmsPreview: {
          collectionId: "blog",
          entryId: "post-1",
          entrySlug: "post-1",
        },
      },
    };

    const parsed = ComponentDSLSchema.parse(component);

    expect(parsed.propSchema?.[0]?.contentEditor?.enabled).toBe(true);
    expect(
      parsed.nodes[0]?.metadata?.contentEditor?.fields?.title?.locked,
    ).toBe(true);
    expect(parsed.settings?.cmsPreview?.entrySlug).toBe("post-1");
  });
});
