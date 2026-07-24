import { describe, expect, it } from "vitest";
import {
  buildSiteUniverseFromPages,
  type SiteUniverseComponentInput,
  type SiteUniversePageInput,
} from "../../../admin/features/Studio/dashboard/composables/useSiteUniverse";
import { SiteUniverseSchema } from "../../../admin/features/Studio/dashboard/schemas/dashboard";

const NOW_MS = Date.parse("2026-06-21T12:00:00.000Z");

function page(
  slug: string,
  overrides: Partial<SiteUniversePageInput> = {},
): SiteUniversePageInput {
  return {
    id: `page-${slug}`,
    title: slug === "index" ? "Home" : slug,
    slug,
    status: "published",
    isModifiedSincePublish: false,
    layout: "default",
    systemRole: "standard",
    accessMode: "public",
    hasPassword: false,
    updatedAt: "2026-06-20T12:00:00.000Z",
    scheduledFor: null,
    ...overrides,
  };
}

function component(
  id: string,
  overrides: Partial<SiteUniverseComponentInput> = {},
): SiteUniverseComponentInput {
  return {
    id,
    name: `Component ${id}`,
    source: "custom",
    updatedAt: "2026-06-20T12:00:00.000Z",
    ...overrides,
  };
}

describe("buildSiteUniverseFromPages", () => {
  it("returns a schema-valid empty universe", () => {
    const universe = buildSiteUniverseFromPages([], NOW_MS);

    expect(universe).toEqual({
      nodes: [],
      edges: [],
      satellites: [],
      cmsSystems: [],
    });
    expect(SiteUniverseSchema.safeParse(universe).success).toBe(true);
  });

  it("preserves nested page ancestry regardless of input order", () => {
    const universe = buildSiteUniverseFromPages(
      [
        page("team", { parent: "company" }),
        page("index"),
        page("company", { parent: "about" }),
        page("about"),
      ],
      NOW_MS,
    );

    const nodeBySlug = new Map(universe.nodes.map((node) => [node.slug, node]));
    const edgeSlugs = universe.edges.map((edge) => {
      const from = universe.nodes.find((node) => node.id === edge.from);
      const to = universe.nodes.find((node) => node.id === edge.to);
      return `${from?.slug ?? edge.from}->${to?.slug}`;
    });

    expect(nodeBySlug.get("index")).toMatchObject({ depth: 1, role: "home" });
    expect(nodeBySlug.get("about")?.depth).toBe(1);
    expect(nodeBySlug.get("company")?.depth).toBe(2);
    expect(nodeBySlug.get("team")?.depth).toBe(3);
    expect(edgeSlugs).toEqual(
      expect.arrayContaining([
        "site-core->index",
        "site-core->about",
        "about->company",
        "company->team",
      ]),
    );
  });

  it("derives status, role, attention, and recency signals", () => {
    const universe = buildSiteUniverseFromPages(
      [
        page("index", { status: "draft" }),
        page("404", {
          status: "archived",
          systemRole: "not-found",
          updatedAt: "2026-05-01T12:00:00.000Z",
        }),
      ],
      NOW_MS,
    );

    expect(universe.nodes.find((node) => node.slug === "index")).toMatchObject({
      status: "draft",
      role: "home",
      attention: "warning",
      isRecent: true,
    });
    expect(universe.nodes.find((node) => node.slug === "404")).toMatchObject({
      status: "archived",
      role: "system",
      attention: "none",
      isRecent: false,
    });
  });

  it("distributes root streams around a virtual site core", () => {
    const universe = buildSiteUniverseFromPages(
      [
        page("index"),
        ...Array.from({ length: 7 }, (_, index) => page(`section-${index}`)),
      ],
      NOW_MS,
    );
    const topLevelNodes = universe.nodes.filter((node) => node.depth === 1);

    expect(universe.nodes.find((node) => node.role === "home")).toMatchObject({
      x: 50,
      y: 23,
      depth: 1,
    });
    expect(topLevelNodes.some((node) => node.x < 50)).toBe(true);
    expect(topLevelNodes.some((node) => node.x > 50)).toBe(true);
    expect(topLevelNodes.some((node) => node.y < 50)).toBe(true);
    expect(topLevelNodes.some((node) => node.y > 50)).toBe(true);
  });

  it("is deterministic and never emits edges for capped nodes", () => {
    const pages = [
      page("index"),
      ...Array.from({ length: 44 }, (_, index) => page(`page-${index}`)),
    ];
    const first = buildSiteUniverseFromPages(pages, NOW_MS);
    const second = buildSiteUniverseFromPages(pages, NOW_MS);
    const visibleIds = new Set([
      "site-core",
      ...first.nodes.map((node) => node.id),
    ]);

    expect(first).toEqual(second);
    expect(first.nodes).toHaveLength(36);
    expect(first.edges.some((edge) => edge.motion === "still")).toBe(true);
    expect(first.edges.some((edge) => edge.motion !== "still")).toBe(true);
    expect(
      new Set(first.edges.map((edge) => edge.durationMs)).size,
    ).toBeGreaterThan(1);
    expect(
      new Set(first.edges.map((edge) => edge.delayMs)).size,
    ).toBeGreaterThan(1);
    expect(
      first.edges.every(
        (edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to),
      ),
    ).toBe(true);
  });

  it("creates a capped deterministic satellite layer from real components", () => {
    const components = [
      component("aria-one", { source: "aria" }),
      ...Array.from({ length: 8 }, (_, index) => component(`custom-${index}`)),
    ];
    const universe = buildSiteUniverseFromPages(
      [page("index")],
      NOW_MS,
      components,
    );

    expect(universe.satellites).toHaveLength(6);
    expect(
      universe.satellites.every((satellite) => satellite.source === "custom"),
    ).toBe(true);
    expect(universe.satellites[0]).toMatchObject({
      componentId: "custom-0",
      title: "Component custom-0",
      band: "near",
      orbitCenterX: 50,
      orbitCenterY: 50,
    });
    expect(universe.satellites.slice(3)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ band: "far", orbitCenterY: 18 }),
        expect.objectContaining({ band: "far", orbitCenterY: 13 }),
      ]),
    );
    expect(SiteUniverseSchema.safeParse(universe).success).toBe(true);
  });
});
