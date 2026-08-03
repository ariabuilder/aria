import { describe, expect, it } from "vitest";

import {
  RenderContractError,
  normalizeEditableSurface,
  stableSerializeJson,
} from "../../lib/rendering/canonical";
import { sha256Text } from "../../lib/rendering/canonical/hash";
import {
  MAX_AUTHORED_NODE_COUNT,
  MAX_CANONICAL_SOURCE_BYTES,
  MAX_CONTAINER_DEPTH,
  preflightEditableSurface,
} from "../../lib/rendering/canonical/preflight";
import type {
  BuilderNode,
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "../../lib/types/nodes";

function builderNode(overrides: Partial<BuilderNode> = {}): BuilderNode {
  return {
    id: "node-1",
    type: "container",
    props: {},
    styles: {},
    children: [],
    ...overrides,
  };
}

function page(overrides: Partial<PageDSL> = {}): PageDSL {
  return {
    id: "page-1",
    title: "Page",
    slug: "page",
    nodes: [builderNode()],
    ...overrides,
  };
}

function layout(overrides: Partial<LayoutDSL> = {}): LayoutDSL {
  return {
    id: "layout-1",
    name: "Layout",
    nodes: [builderNode()],
    slots: [],
    ...overrides,
  };
}

function component(overrides: Partial<ComponentDSL> = {}): ComponentDSL {
  return {
    id: "component-1",
    name: "Component",
    nodes: [builderNode()],
    ...overrides,
  };
}

function expectInputError(operation: () => unknown): RenderContractError {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(RenderContractError);
    const renderError = error as RenderContractError;
    expect(renderError.failure.code).toBe("RENDER_INPUT_INVALID");
    return renderError;
  }
  throw new Error("Expected RenderContractError");
}

async function expectInputErrorAsync(
  operation: () => Promise<unknown>,
): Promise<RenderContractError> {
  try {
    await operation();
  } catch (error) {
    expect(error).toBeInstanceOf(RenderContractError);
    const renderError = error as RenderContractError;
    expect(renderError.failure.code).toBe("RENDER_INPUT_INVALID");
    return renderError;
  }
  throw new Error("Expected RenderContractError");
}

describe("editable surface normalization parity", () => {
  it("normalizes all surface kinds without mutating callers", async () => {
    const sources = {
      page: page(),
      layout: layout(),
      component: component(),
    } as const;
    const before = structuredClone(sources);

    const pageResult = await normalizeEditableSurface({
      kind: "page",
      source: sources.page,
    });
    const layoutResult = await normalizeEditableSurface({
      kind: "layout",
      source: sources.layout,
    });
    const componentResult = await normalizeEditableSurface({
      kind: "component",
      source: sources.component,
    });

    expect(sources).toEqual(before);
    expect(pageResult.kind).toBe("page");
    expect(layoutResult.kind).toBe("layout");
    expect(componentResult.kind).toBe("component");
    expect(pageResult.source.nodes[0]?.classNames).toEqual({ base: [] });
    expect(layoutResult.source.slots).toEqual([]);
    expect(componentResult.source.nodes).toHaveLength(1);
  });

  it("is idempotent and independent of key insertion order and render mode", async () => {
    const firstSource = page({
      frontmatter: { zebra: true, alpha: "a" },
    });
    const secondSource = {
      nodes: firstSource.nodes,
      slug: firstSource.slug,
      title: firstSource.title,
      id: firstSource.id,
      frontmatter: { alpha: "a", zebra: true },
    };

    const first = await normalizeEditableSurface({
      kind: "page",
      source: firstSource,
      mode: "preview",
    } as unknown as Parameters<typeof normalizeEditableSurface>[0]);
    const second = await normalizeEditableSurface({
      kind: "page",
      source: secondSource,
      mode: "public",
    } as unknown as Parameters<typeof normalizeEditableSurface>[0]);
    const repeated = await normalizeEditableSurface({
      kind: "page",
      source: first.source,
    });

    expect(first.sourceHash).toBe(second.sourceHash);
    expect(repeated.sourceHash).toBe(first.sourceHash);
    expect(repeated.source).toEqual(first.source);
  });

  it("changes sourceHash only for retained authored changes", async () => {
    const base = page();
    const changed = page({ title: "Changed" });
    const projected = {
      ...base,
      version: "99",
      updatedAt: "2099-01-01T00:00:00.000Z",
      author: { id: "server-user" },
      isModifiedSincePublish: true,
      _computedMetrics: {
        sectionCount: 1,
        componentCount: 0,
        mediaCount: 0,
        dynamicCount: 0,
        customCodeCount: 0,
        computedAt: "2099-01-01T00:00:00.000Z",
        contentHash: "legacy",
      },
    };

    const baseResult = await normalizeEditableSurface({
      kind: "page",
      source: base,
    });
    const changedResult = await normalizeEditableSurface({
      kind: "page",
      source: changed,
    });
    const projectedResult = await normalizeEditableSurface({
      kind: "page",
      source: projected,
    });

    expect(changedResult.sourceHash).not.toBe(baseResult.sourceHash);
    expect(projectedResult.sourceHash).toBe(baseResult.sourceHash);
    expect(projectedResult.source).not.toHaveProperty("version");
    expect(projectedResult.source).not.toHaveProperty("_computedMetrics");
  });

  it("strips only documented layout/component projections", async () => {
    const layoutResult = await normalizeEditableSurface({
      kind: "layout",
      source: layout({
        version: "2",
        updatedAt: "now",
        author: { id: "user" },
        usage: { activePages: 2 },
        tags: ["retained"],
      }),
    });
    const componentResult = await normalizeEditableSurface({
      kind: "component",
      source: component({
        version: "3",
        author: { id: "user" },
        usage: { activeInstances: 3 },
        source: "aria",
        packId: "core",
        packVersion: "2.3.0",
        tier: "pro",
        isLocked: true,
        schemaVersion: "7",
      }),
    });

    expect(layoutResult.source).not.toHaveProperty("usage");
    expect(layoutResult.source.tags).toEqual(["retained"]);
    expect(componentResult.source).not.toHaveProperty("author");
    expect(componentResult.source).toMatchObject({
      source: "aria",
      packId: "core",
      packVersion: "2.3.0",
      tier: "pro",
      isLocked: true,
      schemaVersion: "7",
    });
  });

  it("hashes packVersion independently from the storage revision", async () => {
    const first = await normalizeEditableSurface({
      kind: "component",
      source: component({
        source: "aria",
        packId: "core",
        packVersion: "1.0.0",
        version: "41",
      }),
    });
    const samePackNewRevision = await normalizeEditableSurface({
      kind: "component",
      source: component({
        source: "aria",
        packId: "core",
        packVersion: "1.0.0",
        version: "42",
      }),
    });
    const updatedPack = await normalizeEditableSurface({
      kind: "component",
      source: component({
        source: "aria",
        packId: "core",
        packVersion: "2.0.0",
        version: "42",
      }),
    });

    expect(samePackNewRevision.sourceHash).toBe(first.sourceHash);
    expect(updatedPack.sourceHash).not.toBe(first.sourceHash);
    expect(first.source).not.toHaveProperty("version");
    expect(first.source.packVersion).toBe("1.0.0");
  });

  it("requires x.y.z pack versions", async () => {
    const error = await expectInputErrorAsync(() =>
      normalizeEditableSurface({
        kind: "component",
        source: component({
          source: "aria",
          packId: "core",
          packVersion: "1.0",
        }),
      }),
    );

    expect(error.failure.context).toMatchObject({
      surfaceKind: "component",
      stage: "schema",
    });
  });

  it("normalizes legacy props, typography, classes, icons, and aliases", async () => {
    const result = await normalizeEditableSurface({
      kind: "component",
      source: component({
        nodes: [
          builderNode({
            id: "image-node",
            type: "image",
            props: {
              borderRadius: 12,
              objectFit: "cover",
              objectPosition: "center",
              aspectRatio: "16 / 9",
              icon: "i-lucide:star",
            },
            styles: {
              borderRadius: { base: "4px" },
              width: { default: "100%", tablet: "50%" },
            },
            classNames: {
              default: ["first", "second"],
              base: ["canonical", "order"],
              "hover:default": ["hover-one", "hover-two"],
              "default:hover": ["legacy-order"],
              "hover:base": ["canonical-hover"],
              "hover:default-theme": ["theme-token"],
            },
            children: [
              builderNode({
                id: "heading-node",
                type: "Heading",
                props: { content: "Hello", level: 3 },
              }),
            ],
          }),
        ],
      }),
    });

    const image = result.source.nodes[0];
    const heading = image?.children[0];
    expect(image?.props).not.toHaveProperty("borderRadius");
    expect(image?.props).not.toHaveProperty("objectFit");
    expect(image?.styles.borderRadius).toEqual({ base: "4px" });
    expect(image?.styles.objectFit).toEqual({ base: "cover" });
    expect(image?.styles.width).toEqual({ base: "100%", tablet: "50%" });
    expect(image?.classNames?.base).toEqual(["canonical", "order"]);
    expect(image?.classNames?.["hover:base"]).toEqual(["canonical-hover"]);
    expect(image?.classNames?.["base:hover"]).toEqual(["legacy-order"]);
    expect(image?.classNames?.["hover:default-theme"]).toEqual(["theme-token"]);
    expect(image?.classNames).not.toHaveProperty("default");
    expect(image?.classNames).not.toHaveProperty("hover:default");
    expect(image?.props.icon).toMatchObject({ id: "lucide:star" });
    expect(heading).toMatchObject({
      type: "heading",
      props: { text: "Hello", content: "Hello", level: 3 },
    });
  });

  it("deep-freezes only the returned surface when requested", async () => {
    const source = component({
      nodes: [builderNode({ props: { config: { enabled: true } } })],
    });
    const frozen = await normalizeEditableSurface(
      { kind: "component", source },
      { freeze: true },
    );
    const mutable = await normalizeEditableSurface({
      kind: "component",
      source,
    });

    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.source)).toBe(true);
    expect(Object.isFrozen(frozen.source.nodes[0])).toBe(true);
    expect(Object.isFrozen(frozen.source.nodes[0]?.props.config)).toBe(true);
    expect(frozen.source.nodes[0]?.props).not.toBe(source.nodes[0]?.props);
    expect(Object.isFrozen(source)).toBe(false);
    expect(Object.isFrozen(source.nodes[0]?.props)).toBe(false);
    expect(Object.isFrozen(source.nodes[0]?.props.config)).toBe(false);
    expect(Object.isFrozen(mutable)).toBe(false);
    expect(mutable.sourceHash).toBe(frozen.sourceHash);
  });

  it("produces a byte-stable portable fixture", async () => {
    const result = await normalizeEditableSurface({
      kind: "page",
      source: page({
        title: "Portable",
        nodes: [
          builderNode({
            id: "portable-heading",
            type: "Heading",
            props: { content: "Portable", level: 1 },
            classNames: { base: ["font-bold", "text-4xl"] },
          }),
        ],
      }),
    });
    const serialized = stableSerializeJson(result.source);

    expect(serialized).toBe(
      '{"id":"page-1","nodes":[{"children":[],"classNames":{"base":["font-bold","text-4xl"]},"customClasses":[],"id":"portable-heading","props":{"content":"Portable","level":1,"text":"Portable"},"styles":{},"type":"heading"}],"slug":"page","title":"Portable"}',
    );
    expect(result.sourceHash).toBe(
      "5b969a469cb73636d288d38cee4fb2d26e4e030ec57b1381c1e260a0989a1d89",
    );
  });

  it("enforces the final canonical size against the bytes used for sourceHash", async () => {
    const sourceWithPayload = (payload: string) =>
      component({
        nodes: [builderNode({ props: { payload } })],
      });
    const baseline = await normalizeEditableSurface({
      kind: "component",
      source: sourceWithPayload(""),
    });
    const baselineBytes = new TextEncoder().encode(
      stableSerializeJson(baseline.source),
    ).byteLength;
    const exactPayload = "x".repeat(MAX_CANONICAL_SOURCE_BYTES - baselineBytes);
    const exact = await normalizeEditableSurface({
      kind: "component",
      source: sourceWithPayload(exactPayload),
    });
    const serialized = stableSerializeJson(exact.source);

    expect(new TextEncoder().encode(serialized)).toHaveLength(
      MAX_CANONICAL_SOURCE_BYTES,
    );
    expect(exact.sourceHash).toBe(await sha256Text(serialized));

    const error = await expectInputErrorAsync(() =>
      normalizeEditableSurface({
        kind: "component",
        source: sourceWithPayload(`${exactPayload}x`),
      }),
    );
    expect(error.failure.context).toEqual({
      surfaceKind: "component",
      stage: "canonical-size",
      issue: "source-size",
      violatedLimit: "canonicalSourceBytes",
      maximum: MAX_CANONICAL_SOURCE_BYTES,
      actual: MAX_CANONICAL_SOURCE_BYTES + 1,
      issueCount: 1,
    });
    expect(JSON.stringify(error.failure)).not.toContain(
      exactPayload.slice(0, 32),
    );
  });
});

describe("iterative editable-surface preflight", () => {
  it("accepts the exact 2 MiB boundary and rejects one byte over", () => {
    const emptyBytes = new TextEncoder().encode(
      JSON.stringify({ payload: "" }),
    ).byteLength;
    const exact = {
      payload: "x".repeat(MAX_CANONICAL_SOURCE_BYTES - emptyBytes),
    };
    const over = { payload: `${exact.payload}x` };

    expect(
      preflightEditableSurface({ kind: "page", source: exact }).sourceBytes,
    ).toBe(MAX_CANONICAL_SOURCE_BYTES);
    const error = expectInputError(() =>
      preflightEditableSurface({ kind: "page", source: over }),
    );
    expect(error.failure.context).toMatchObject({
      violatedLimit: "canonicalSourceBytes",
      maximum: MAX_CANONICAL_SOURCE_BYTES,
      actual: MAX_CANONICAL_SOURCE_BYTES + 1,
    });
  });

  it("accepts 5,000 authored nodes including slot defaults and rejects one over", () => {
    const nodes = Array.from({ length: MAX_AUTHORED_NODE_COUNT }, () => ({}));
    const exact = preflightEditableSurface({
      kind: "layout",
      source: { nodes: [], slots: [{ name: "main", defaultContent: nodes }] },
    });
    expect(exact.authoredNodeCount).toBe(MAX_AUTHORED_NODE_COUNT);

    const error = expectInputError(() =>
      preflightEditableSurface({
        kind: "layout",
        source: {
          nodes: [{}],
          slots: [{ name: "main", defaultContent: nodes }],
        },
      }),
    );
    expect(error.failure.context).toMatchObject({
      violatedLimit: "authoredNodeCount",
      maximum: MAX_AUTHORED_NODE_COUNT,
      actual: MAX_AUTHORED_NODE_COUNT + 1,
    });
  });

  it("accepts container depth 64 and rejects depth 65", () => {
    const nested = (arrayDepth: number): unknown => {
      let value: unknown = null;
      for (let index = 0; index < arrayDepth; index += 1) value = [value];
      return { value };
    };

    const exact = preflightEditableSurface({
      kind: "component",
      source: nested(MAX_CONTAINER_DEPTH - 1),
    });
    expect(exact.maximumContainerDepth).toBe(MAX_CONTAINER_DEPTH);
    const error = expectInputError(() =>
      preflightEditableSurface({
        kind: "component",
        source: nested(MAX_CONTAINER_DEPTH),
      }),
    );
    expect(error.failure.context).toMatchObject({
      violatedLimit: "containerDepth",
      maximum: MAX_CONTAINER_DEPTH,
      actual: MAX_CONTAINER_DEPTH + 1,
    });
  });

  it("rejects cyclic, accessor, custom-prototype, and unsupported input", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const accessor = {};
    Object.defineProperty(accessor, "secret", {
      enumerable: true,
      get: () => "authored-content",
    });
    class CustomValue {}

    const invalidValues: unknown[] = [
      cyclic,
      accessor,
      new CustomValue(),
      { value: () => undefined },
      { value: Symbol("value") },
      { value: BigInt(1) },
      { value: Number.NaN },
      { value: Number.POSITIVE_INFINITY },
      { value: Array(1) },
      { value: [undefined] },
    ];

    for (const source of invalidValues) {
      expectInputError(() =>
        preflightEditableSurface({ kind: "page", source }),
      );
    }
  });

  it("clones repeated acyclic references and removes undefined object keys", () => {
    const shared = { retained: true, removed: undefined };
    const result = preflightEditableSurface({
      kind: "page",
      source: { first: shared, second: shared },
    });
    const source = result.source as {
      first: Record<string, unknown>;
      second: Record<string, unknown>;
    };

    expect(source.first).toEqual({ retained: true });
    expect(source.second).toEqual({ retained: true });
    expect(source.first).not.toBe(source.second);
  });

  it("preserves authored __proto__ keys without changing prototypes", async () => {
    const root = component();
    Object.defineProperty(root, "__proto__", {
      value: { polluted: true },
      enumerable: true,
      configurable: true,
      writable: true,
    });
    const preflight = preflightEditableSurface({
      kind: "component",
      source: root,
    }).source as Record<string, unknown>;

    expect(Object.getPrototypeOf(preflight)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(preflight, "__proto__")).toBe(
      true,
    );
    await expectInputErrorAsync(() =>
      normalizeEditableSurface({ kind: "component", source: root }),
    );

    const protoNode = builderNode({ a11y: {} });
    const props = component({ nodes: [protoNode] });
    Object.defineProperty(props.nodes[0]!.props, "__proto__", {
      value: { retained: "json-value" },
      enumerable: true,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(props.nodes[0]!.a11y!, "__proto__", {
      value: { customAccessibility: true },
      enumerable: true,
      configurable: true,
      writable: true,
    });
    const normalized = await normalizeEditableSurface({
      kind: "component",
      source: props,
    });
    const normalizedProps = normalized.source.nodes[0]?.props as Record<
      string,
      unknown
    >;

    expect(
      Object.prototype.hasOwnProperty.call(normalizedProps, "__proto__"),
    ).toBe(true);
    expect(normalizedProps.__proto__).toEqual({ retained: "json-value" });
    expect(
      Object.prototype.hasOwnProperty.call(
        normalized.source.nodes[0]?.a11y,
        "__proto__",
      ),
    ).toBe(true);
    expect(stableSerializeJson(normalized.source)).toContain(
      '"__proto__":{"retained":"json-value"}',
    );
    expect(
      (Object.prototype as { polluted?: boolean }).polluted,
    ).toBeUndefined();
  });

  it("normalizes null-prototype surfaces identically", async () => {
    const plain = component();
    const nullPrototype = Object.assign(Object.create(null), plain);
    const plainResult = await normalizeEditableSurface({
      kind: "component",
      source: plain,
    });
    const nullPrototypeResult = await normalizeEditableSurface({
      kind: "component",
      source: nullPrototype,
    });

    expect(nullPrototypeResult.source).toEqual(plainResult.source);
    expect(nullPrototypeResult.sourceHash).toBe(plainResult.sourceHash);
  });

  it("returns safe scalar error context without authored content", () => {
    const authoredSecret = "do-not-leak-this-content";
    const cyclic: Record<string, unknown> = { authoredSecret };
    cyclic.self = cyclic;
    const error = expectInputError(() =>
      preflightEditableSurface({ kind: "component", source: cyclic }),
    );

    expect(error.failure.context).toMatchObject({
      surfaceKind: "component",
      stage: "preflight",
      issueCount: 1,
    });
    expect(JSON.stringify(error.failure)).not.toContain(authoredSecret);
  });
});
