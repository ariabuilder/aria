import { describe, expect, it } from "vitest";

import type { CustomClassesMap } from "../../../lib/schemas/classEditor";
import {
  buildClassManagerRows,
  filterClassManagerRows,
  parseClassManagerTableState,
} from "../../../admin/features/Design/lib/classManagerTable";

function createCustomClasses(): CustomClassesMap {
  return {
    "hero-heading": {
      id: "hero-heading",
      name: "hero-heading",
      description: "Hero title styling",
      variants: [
        {
          breakpoint: "base",
          rules: [{ property: "font-size", value: "3rem", important: false }],
        },
      ],
      pseudoVariants: [],
      compoundVariants: [],
      usageCount: 0,
      createdAt: "2026-04-10T10:00:00.000Z",
      updatedAt: "2026-04-12T12:00:00.000Z",
    },
    "card-shell": {
      id: "card-shell",
      name: "card-shell",
      description: "",
      variants: [],
      pseudoVariants: [],
      compoundVariants: [],
      usageCount: 0,
      createdAt: "2026-04-11T10:00:00.000Z",
      updatedAt: "2026-04-11T10:00:00.000Z",
    },
  };
}

describe("classManagerTable", () => {
  it("builds used, unused, and orphaned rows", () => {
    const rows = buildClassManagerRows(createCustomClasses(), {
      "hero-heading": {
        className: "hero-heading",
        references: 2,
        pageCount: 1,
        layoutCount: 0,
        componentCount: 1,
        locations: [
          {
            collection: "pages",
            itemId: "home",
            itemLabel: "Home",
            itemPath: "/home",
            nodeId: "hero",
            nodeLabel: "Hero",
          },
          {
            collection: "components",
            itemId: "teaser",
            itemLabel: "Teaser",
            itemPath: "teaser",
            nodeId: "title",
            nodeLabel: "heading",
          },
        ],
      },
      "missing-class": {
        className: "missing-class",
        references: 1,
        pageCount: 1,
        layoutCount: 0,
        componentCount: 0,
        locations: [
          {
            collection: "pages",
            itemId: "home",
            itemLabel: "Home",
            itemPath: "/home",
            nodeId: "hero",
            nodeLabel: "Hero",
          },
        ],
      },
    });

    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.name === "hero-heading")).toMatchObject({
      status: "used",
      usageCount: 2,
    });
    expect(rows.find((row) => row.name === "card-shell")).toMatchObject({
      status: "unused",
      usageCount: 0,
    });
    expect(rows.find((row) => row.name === "missing-class")).toMatchObject({
      status: "orphaned",
      classDefinition: null,
    });
  });

  it("filters rows by query and segment", () => {
    const rows = buildClassManagerRows(createCustomClasses(), {
      "hero-heading": {
        className: "hero-heading",
        references: 2,
        pageCount: 1,
        layoutCount: 0,
        componentCount: 1,
        locations: [],
      },
    });

    expect(
      filterClassManagerRows(rows, {
        query: "hero",
        segment: "all",
      }).map((row) => row.name),
    ).toEqual(["hero-heading"]);

    expect(
      filterClassManagerRows(rows, {
        query: "",
        segment: "unused",
      }).map((row) => row.name),
    ).toEqual(["card-shell"]);
  });

  it("parses table state through the zod boundary", () => {
    expect(
      parseClassManagerTableState({
        query: "hero",
        segment: "used",
        sorting: [{ id: "name", desc: false }],
      }),
    ).toEqual({
      query: "hero",
      segment: "used",
      sorting: [{ id: "name", desc: false }],
    });

    expect(
      parseClassManagerTableState({
        query: 42,
        segment: "bad",
        sorting: [{ id: "nope", desc: "wrong" }],
      }),
    ).toEqual({
      query: "",
      segment: "all",
      sorting: [],
    });
  });
});
