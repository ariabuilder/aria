import { describe, expect, it } from "vitest";

import {
  buildComponentContentStructure,
  contentFieldMatchesTypeFilter,
  flattenContentStructureFields,
} from "../../../../admin/features/Studio/components/lib/componentContentStructure";
import type { BuilderNode, ComponentDSL } from "../../../../lib/types/nodes";

function node(input: {
  id: string;
  type: string;
  props?: BuilderNode["props"];
  children?: BuilderNode[];
  metadata?: BuilderNode["metadata"];
}): BuilderNode {
  return {
    id: input.id,
    type: input.type,
    props: input.props ?? {},
    styles: {},
    children: input.children ?? [],
    metadata: input.metadata,
  };
}

function component(nodes: BuilderNode[]): ComponentDSL {
  return {
    id: "footer",
    name: "Footer",
    nodes,
    propSchema: [
      {
        name: "headline",
        type: "string",
        label: "Headline",
        contentEditor: { enabled: true, order: 2 },
      },
      {
        name: "eyebrow",
        type: "string",
        label: "Eyebrow",
        contentEditor: { enabled: false },
      },
      {
        name: "ctaHref",
        type: "url",
        label: "CTA href",
        contentEditor: { enabled: true, locked: true, order: 1 },
      },
    ],
  };
}

describe("component content structure", () => {
  it("includes eligible fields without exposure gates", () => {
    const structure = buildComponentContentStructure({
      hideLockedFields: false,
      component: component([
        node({
          id: "root",
          type: "Section",
          props: { headline: "Footer", ctaHref: "/contact" },
          metadata: { label: "Footer" },
          children: [
            node({
              id: "links",
              type: "Container",
              metadata: { label: "Links" },
              children: [
                node({
                  id: "about",
                  type: "Text",
                  props: { content: "About", href: "/about" },
                  metadata: {
                    contentEditor: {
                      fields: {
                        content: { label: "About label" },
                        href: { hidden: true },
                      },
                    },
                  },
                }),
              ],
            }),
            node({
              id: "hidden",
              type: "Container",
              metadata: {
                contentEditor: {
                  hidden: true,
                  fields: { title: { enabled: false } },
                },
              },
              props: { title: "Hidden" },
            }),
          ],
        }),
      ]),
    });

    const fields = flattenContentStructureFields(structure);

    expect(structure).toHaveLength(1);
    expect(structure[0]?.fieldCount).toBe(6);
    expect(fields.map((field) => field.label)).toEqual(expect.arrayContaining([
      "CTA href",
      "Eyebrow",
      "Headline",
      "About label",
      "href",
      "title",
    ]));
  });

  it("hides locked fields until the locked preference reveals them", () => {
    const baseComponent = component([
      node({
        id: "root",
        type: "Section",
        props: { headline: "Footer", ctaHref: "/contact" },
        children: [
          node({
            id: "locked-node",
            type: "Text",
            props: { content: "Locked copy" },
            metadata: {
              contentEditor: {
                locked: true,
                fields: { content: { enabled: true } },
              },
            },
          }),
        ],
      }),
    ]);

    const hiddenLocked = flattenContentStructureFields(
      buildComponentContentStructure({ component: baseComponent }),
    );
    const visibleLocked = flattenContentStructureFields(
      buildComponentContentStructure({
        component: baseComponent,
        hideLockedFields: false,
      }),
    );

    expect(hiddenLocked.map((field) => field.propName)).toEqual([
      "headline",
      "eyebrow",
    ]);
    expect(visibleLocked.filter((field) => field.locked)).toHaveLength(2);
    expect(visibleLocked.map((field) => field.propName)).toContain("content");
  });

  it("categorizes editable fields for table filtering", () => {
    const fields = flattenContentStructureFields(
      buildComponentContentStructure({
        hideLockedFields: false,
        component: component([
          node({
            id: "root",
            type: "Section",
            props: {
              headline: "Footer",
              href: "/footer",
              coverImage: "/cover.jpg",
            },
            children: [
              node({
                id: "button",
                type: "Button",
                props: {
                  label: "Get started",
                  href: "/start",
                },
              }),
            ],
          }),
        ]),
      }),
    );

    expect(fields.find((field) => field.propName === "headline")?.category).toBe(
      "text",
    );
    expect(fields.find((field) => field.propName === "href")?.category).toBe(
      "links",
    );
    expect(fields.find((field) => field.propName === "coverImage")?.category).toBe(
      "media",
    );
    expect(
      fields.find(
        (field) => field.nodeId === "button" && field.propName === "label",
      )?.category,
    ).toBe("actions");
    expect(
      fields
        .filter((field) => contentFieldMatchesTypeFilter(field, "actions"))
        .map((field) => `${field.nodeId}:${field.propName}`),
    ).toEqual(
      expect.arrayContaining([
        "root:ctaHref",
        "button:label",
        "button:href",
      ]),
    );
  });
});
