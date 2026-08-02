import { describe, expect, it } from "vitest";

import {
  RenderContractError,
  normalizeEditableSurface,
  resolveRenderSurface,
  type RenderDependencyProvider,
  type RenderManifestRecordInput,
} from "../../lib/rendering/canonical";
import type {
  BuilderNode,
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "../../lib/types/nodes";

function textNode(id: string, content: string, slot?: string): BuilderNode {
  return {
    id,
    type: "Text",
    props: { content },
    styles: {},
    children: [],
    ...(slot ? { slot } : {}),
  };
}

function componentNode(id: string, componentId: string): BuilderNode {
  return {
    id,
    type: "Component",
    props: { componentId },
    styles: {},
    children: [],
  };
}

function providers(
  input: {
    layouts?: readonly LayoutDSL[];
    components?: readonly ComponentDSL[];
  } = {},
): RenderDependencyProvider {
  const layouts = new Map(
    (input.layouts ?? []).map((layout) => [layout.id, layout]),
  );
  const components = new Map(
    (input.components ?? []).map((component) => [component.id, component]),
  );
  return {
    getLayout: async (ref) => layouts.get(ref.id) ?? null,
    getComponent: async (ref) => components.get(ref.id) ?? null,
  };
}

describe("resolved render surface portable contract", () => {
  it("resolves ordered regions, slot precedence, components, and manifests", async () => {
    const page: PageDSL = {
      id: "home",
      slug: "home",
      title: "Home",
      layout: "shell",
      nodes: [textNode("page-main", "Page main", "main")],
    };
    const layout: LayoutDSL = {
      id: "shell",
      name: "Shell",
      version: "layout-v3",
      nodes: [
        {
          id: "main-slot",
          type: "Slot",
          props: { name: "main" },
          styles: {},
          children: [textNode("legacy-main", "Legacy main")],
        },
      ],
      slots: [
        {
          name: "main",
          isDefault: true,
          defaultContent: [textNode("default-main", "Default main")],
        },
      ],
      regions: {
        headerComponent: "site-header",
        footerComponent: "site-footer",
      },
    };
    const header: ComponentDSL = {
      id: "site-header",
      name: "Site header",
      version: "component-v2",
      nodes: [componentNode("nested-instance", "brand")],
    };
    const footer: ComponentDSL = {
      id: "site-footer",
      name: "Site footer",
      nodes: [textNode("footer-copy", "Footer")],
    };
    const brand: ComponentDSL = {
      id: "brand",
      name: "Brand",
      nodes: [textNode("brand-copy", "Brand")],
    };
    const normalized = await normalizeEditableSurface(
      { kind: "page", source: page },
      { freeze: true },
    );
    const surface = await resolveRenderSurface({
      normalized,
      mode: "public",
      route: { path: "/home", locale: "en" },
      dependencyVersions: {
        layout: { id: "shell", version: "layout-v3" },
        components: {
          "site-header": "component-v2",
          "site-footer": "component-v1",
          brand: "component-v4",
        },
      },
      providers: {
        dependencies: providers({
          layouts: [layout],
          components: [header, footer, brand],
        }),
        data: {
          resolveData: async (input) => ({
            regions: input.regions,
            records: [
              { kind: "cms", id: "z-entry", value: { title: "Z" } },
              { kind: "cms", id: "a-entry", value: { title: "A" } },
            ],
          }),
        },
        resources: {
          resolveResources: async (input) => {
            const records: RenderManifestRecordInput[] = [
              { kind: "media", id: "hero", value: { src: "/hero.webp" } },
              { kind: "icon", id: "star", value: { body: "<path />" } },
            ];
            return { regions: input.regions, records };
          },
        },
        styles: {
          resolveStyleArtifact: async () => ({
            id: "global",
            revision: "styles-v8",
            value: { hash: "compiled-css-v8" },
          }),
        },
      },
    });

    expect(surface.regions.map((region) => region.role)).toEqual([
      "header",
      "layout",
      "footer",
    ]);
    expect(surface.regions[1]?.roots[0]?.children[0]?.sourceNodeId).toBe(
      "page-main",
    );
    expect(JSON.stringify(surface.regions)).not.toContain("default-main");
    expect(JSON.stringify(surface.regions)).not.toContain("legacy-main");
    expect(
      surface.dependencies.records.map(
        (record) => `${record.kind}:${record.id}`,
      ),
    ).toEqual([
      "component:brand",
      "component:site-footer",
      "component:site-header",
      "layout:shell",
    ]);
    expect(surface.data.records.map((record) => record.id)).toEqual([
      "a-entry",
      "z-entry",
    ]);
    expect(surface.resources.records.map((record) => record.kind)).toEqual([
      "icon",
      "media",
    ]);
    const runtimeIds = surface.regions.flatMap((region) =>
      region.roots.flatMap(function collect(node): string[] {
        return [node.runtimeId, ...node.children.flatMap(collect)];
      }),
    );
    expect(new Set(runtimeIds).size).toBe(runtimeIds.length);
    expect(Object.isFrozen(surface)).toBe(true);
    expect(Object.isFrozen(surface.regions[0]?.roots[0])).toBe(true);
  });

  it("runs data resolution after component expansion", async () => {
    const component: ComponentDSL = {
      id: "card",
      name: "Card",
      nodes: [textNode("bound-title", "Before")],
    };
    const normalized = await normalizeEditableSurface({
      kind: "page",
      source: {
        id: "home",
        slug: "home",
        title: "Home",
        nodes: [componentNode("card-instance", "card")],
      },
    });
    const surface = await resolveRenderSurface({
      normalized,
      mode: "preview",
      route: { path: "/home" },
      providers: {
        dependencies: providers({ components: [component] }),
        data: {
          resolveData: async (input) => {
            expect(JSON.stringify(input.regions)).toContain("bound-title");
            return { regions: input.regions };
          },
        },
      },
    });
    expect(surface.regions[0]?.roots[0]?.children[0]?.sourceNodeId).toBe(
      "bound-title",
    );
  });

  it("resolves layout and component slot defaults before manifest collection", async () => {
    const layout = await normalizeEditableSurface({
      kind: "layout",
      source: {
        id: "shell",
        name: "Shell",
        nodes: [
          {
            id: "main-outlet",
            type: "Slot",
            props: { name: "main" },
            styles: {},
            children: [],
          },
        ],
        slots: [
          {
            name: "main",
            isDefault: true,
            defaultContent: [textNode("layout-default", "Layout default")],
          },
        ],
      },
    });
    const layoutSurface = await resolveRenderSurface({
      normalized: layout,
      mode: "preview",
      route: { path: "/layouts/shell" },
      providers: { dependencies: providers() },
    });
    expect(JSON.stringify(layoutSurface.regions)).toContain("layout-default");

    const card: ComponentDSL = {
      id: "card",
      name: "Card",
      nodes: [
        {
          id: "card-outlet",
          type: "Slot",
          props: { name: "content" },
          styles: {},
          children: [],
        },
      ],
      slots: [
        {
          name: "content",
          isDefault: true,
          defaultContent: [textNode("card-default", "Card default")],
        },
      ],
    };
    const page = await normalizeEditableSurface({
      kind: "page",
      source: {
        id: "home",
        slug: "home",
        title: "Home",
        nodes: [
          {
            ...componentNode("card-instance", "card"),
            children: [textNode("card-override", "Card override", "content")],
          },
        ],
      },
    });
    const pageSurface = await resolveRenderSurface({
      normalized: page,
      mode: "preview",
      route: { path: "/home" },
      providers: { dependencies: providers({ components: [card] }) },
    });
    expect(JSON.stringify(pageSurface.regions)).toContain("card-override");
    expect(JSON.stringify(pageSurface.regions)).not.toContain("card-default");
  });

  it("fails deterministically for missing dependencies and cycles", async () => {
    const missing = await normalizeEditableSurface({
      kind: "page",
      source: {
        id: "missing",
        slug: "missing",
        title: "Missing",
        nodes: [componentNode("instance", "missing-card")],
      },
    });
    await expect(
      resolveRenderSurface({
        normalized: missing,
        mode: "public",
        route: { path: "/missing" },
        providers: { dependencies: providers() },
      }),
    ).rejects.toMatchObject({
      failure: { code: "RENDER_DEPENDENCY_MISSING" },
    });

    const cycleA: ComponentDSL = {
      id: "a",
      name: "A",
      nodes: [componentNode("a-to-b", "b")],
    };
    const cycleB: ComponentDSL = {
      id: "b",
      name: "B",
      nodes: [componentNode("b-to-a", "a")],
    };
    const cyclic = await normalizeEditableSurface({
      kind: "component",
      source: cycleA,
    });
    await expect(
      resolveRenderSurface({
        normalized: cyclic,
        mode: "preview",
        route: { path: "/components/a" },
        providers: {
          dependencies: providers({ components: [cycleA, cycleB] }),
        },
      }),
    ).rejects.toBeInstanceOf(RenderContractError);
    await expect(
      resolveRenderSurface({
        normalized: cyclic,
        mode: "preview",
        route: { path: "/components/a" },
        providers: {
          dependencies: providers({ components: [cycleA, cycleB] }),
        },
      }),
    ).rejects.toMatchObject({
      failure: { code: "RENDER_DEPENDENCY_CYCLE" },
    });
  });

  it("keeps render identity deterministic and mode-sensitive", async () => {
    const normalized = await normalizeEditableSurface({
      kind: "page",
      source: {
        id: "plain",
        slug: "plain",
        title: "Plain",
        nodes: [textNode("copy", "Hello")],
      },
    });
    const request = {
      normalized,
      route: { path: "/plain" },
      providers: { dependencies: providers() },
    } as const;
    const first = await resolveRenderSurface({ ...request, mode: "public" });
    const second = await resolveRenderSurface({ ...request, mode: "public" });
    const preview = await resolveRenderSurface({ ...request, mode: "preview" });

    expect(first.renderInputHash).toBe(second.renderInputHash);
    expect(first.renderInputHash).not.toBe(preview.renderInputHash);
    expect(first.normalized.sourceHash).toBe(preview.normalized.sourceHash);
  });
});
