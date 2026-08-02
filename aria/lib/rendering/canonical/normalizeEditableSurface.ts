import { normalizeBuilderNodeClassFieldsTree } from "../../blocks/normalizeBuilderNodeClasses";
import { normalizeResponsiveStyleMap } from "../../blocks/normalizeResponsiveStyleMap";
import { normalizeTypographyNodeTree } from "../../blocks/normalizeTypographyNode";
import { normalizeNodesIcons } from "../../icons/action-normalizers";
import { migratePageDSL } from "../../migrations/propMigrations";
import {
  ComponentDSLSchema,
  LayoutDSLSchema,
  PageDSLSchema,
} from "../../schemas/nodes";
import type { BuilderNode, PageDSL, StyleMap } from "../../types/nodes";
import type {
  NormalizeEditableSurfaceOptions,
  NormalizedRenderSurface,
  RenderSurfaceKind,
  RenderSurfaceSourceByKind,
} from "./contract";
import { RenderContractError, createRenderFailure } from "./errors";
import { sha256Text } from "./hash";
import { normalizeLegacyNodeCompatibility } from "./legacyNodeCompatibility";
import {
  MAX_CANONICAL_SOURCE_BYTES,
  preflightEditableSurface,
} from "./preflight";
import { stableSerializeJson } from "./stableJson";

const PAGE_DERIVED_FIELDS = [
  "version",
  "createdAt",
  "updatedAt",
  "publishedAt",
  "author",
  "contributors",
  "reviewStatus",
  "assignedTo",
  "systemRole",
  "accessMode",
  "hasPassword",
  "isModifiedSincePublish",
  "_publicationDependencies",
  "_computedMetrics",
] as const;

const LAYOUT_DERIVED_FIELDS = [
  "version",
  "createdAt",
  "updatedAt",
  "author",
  "contributors",
  "usage",
] as const;

const COMPONENT_DERIVED_FIELDS = [
  "version",
  "createdAt",
  "updatedAt",
  "author",
  "usage",
] as const;

function normalizationError(
  kind: RenderSurfaceKind,
  stage: string,
  error: unknown,
  issueCount = 1,
): RenderContractError {
  if (error instanceof RenderContractError) {
    return error;
  }
  return new RenderContractError(
    createRenderFailure("RENDER_INPUT_INVALID", {
      surfaceKind: kind,
      stage,
      issueCount,
    }),
    { cause: error },
  );
}

function stripFields(
  source: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  const stripped = { ...source };
  for (const field of fields) {
    delete stripped[field];
  }
  return stripped;
}

function stripDerivedFields(
  kind: RenderSurfaceKind,
  source: unknown,
): Record<string, unknown> {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return source as Record<string, unknown>;
  }
  if (kind === "page")
    return stripFields(source as Record<string, unknown>, PAGE_DERIVED_FIELDS);
  if (kind === "layout")
    return stripFields(
      source as Record<string, unknown>,
      LAYOUT_DERIVED_FIELDS,
    );
  return stripFields(
    source as Record<string, unknown>,
    COMPONENT_DERIVED_FIELDS,
  );
}

function normalizeLegacyNodeTree(node: BuilderNode): BuilderNode {
  const normalized = normalizeLegacyNodeCompatibility(node);
  return {
    ...normalized,
    children: (normalized.children ?? []).map((child) =>
      normalizeLegacyNodeTree(child),
    ),
  };
}

function normalizeClassAliases(
  classNames: BuilderNode["classNames"],
): BuilderNode["classNames"] {
  if (!classNames) return classNames;
  const normalized: NonNullable<BuilderNode["classNames"]> = {};

  for (const [key, tokens] of Object.entries(classNames)) {
    const hasDefaultAlias = key.split(":").includes("default");
    if (!hasDefaultAlias) {
      normalized[key] = [...tokens];
    }
  }
  for (const [key, tokens] of Object.entries(classNames)) {
    const canonicalKey = key
      .split(":")
      .map((part) => (part === "default" ? "base" : part))
      .join(":");
    if (canonicalKey !== key && normalized[canonicalKey] === undefined) {
      normalized[canonicalKey] = [...tokens];
    }
  }
  return normalized;
}

function normalizeResponsiveAliasesInNode(node: BuilderNode): BuilderNode {
  const styles: StyleMap = {};
  for (const [property, value] of Object.entries(node.styles ?? {})) {
    const normalizedValue = normalizeResponsiveStyleMap(value);
    if (Object.keys(normalizedValue).length > 0) {
      (styles as Record<string, unknown>)[property] = normalizedValue;
    }
  }
  return {
    ...node,
    styles,
    classNames: normalizeClassAliases(node.classNames),
    children: (node.children ?? []).map((child) =>
      normalizeResponsiveAliasesInNode(child),
    ),
  };
}

function normalizeNodeTree(nodes: readonly BuilderNode[]): BuilderNode[] {
  const legacyNormalized = nodes.map((node) => normalizeLegacyNodeTree(node));
  const typographyNormalized = normalizeTypographyNodeTree(legacyNormalized);
  const classNormalized = normalizeBuilderNodeClassFieldsTree(
    typographyNormalized,
  ).map((result) => result.node);
  for (
    let index = 0;
    index < Math.min(typographyNormalized.length, classNormalized.length);
    index += 1
  ) {
    restoreNodeJsonValueFields(
      typographyNormalized[index] as unknown as Record<string, unknown>,
      classNormalized[index] as unknown as Record<string, unknown>,
    );
  }
  const iconNormalized = normalizeNodesIcons(classNormalized);
  return iconNormalized.map((node) => normalizeResponsiveAliasesInNode(node));
}

function normalizeSurfaceNodeTrees(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...source };
  if (Array.isArray(normalized.nodes)) {
    normalized.nodes = normalizeNodeTree(normalized.nodes as BuilderNode[]);
  }
  if (Array.isArray(normalized.slots)) {
    normalized.slots = normalized.slots.map((slot) => {
      if (!slot || typeof slot !== "object" || Array.isArray(slot)) return slot;
      const normalizedSlot = { ...(slot as Record<string, unknown>) };
      if (Array.isArray(normalizedSlot.defaultContent)) {
        normalizedSlot.defaultContent = normalizeNodeTree(
          normalizedSlot.defaultContent as BuilderNode[],
        );
      }
      return normalizedSlot;
    });
  }
  return normalized;
}

function removeUndefinedObjectProperties<T>(value: T): T {
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      for (const entry of current) stack.push(entry);
      continue;
    }
    for (const [key, entry] of Object.entries(current)) {
      if (entry === undefined) {
        delete (current as Record<string, unknown>)[key];
      } else {
        stack.push(entry);
      }
    }
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  const stack: object[] = [];
  if (value && typeof value === "object") stack.push(value as object);
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || Object.isFrozen(current)) continue;
    for (const child of Object.values(current)) {
      if (child && typeof child === "object" && !Object.isFrozen(child)) {
        stack.push(child);
      }
    }
    Object.freeze(current);
  }
  return value;
}

function applyAuthoritativeSchema<K extends RenderSurfaceKind>(
  kind: K,
  source: Record<string, unknown>,
): RenderSurfaceSourceByKind[K] {
  const result =
    kind === "page"
      ? PageDSLSchema.safeParse(source)
      : kind === "layout"
        ? LayoutDSLSchema.safeParse(source)
        : ComponentDSLSchema.safeParse(source);
  if (!result.success) {
    throw normalizationError(
      kind,
      "schema",
      result.error,
      result.error.issues.length,
    );
  }
  return result.data as RenderSurfaceSourceByKind[K];
}

function restoreNodeJsonValueFields(
  sourceNode: Record<string, unknown>,
  parsedNode: Record<string, unknown>,
): void {
  for (const field of ["props", "a11y"] as const) {
    if (Object.prototype.hasOwnProperty.call(sourceNode, field)) {
      parsedNode[field] = sourceNode[field];
    }
  }

  const sourceData = sourceNode.dataSource;
  const parsedData = parsedNode.dataSource;
  if (
    sourceData &&
    parsedData &&
    typeof sourceData === "object" &&
    typeof parsedData === "object" &&
    !Array.isArray(sourceData) &&
    !Array.isArray(parsedData)
  ) {
    const sourceRecord = sourceData as Record<string, unknown>;
    const parsedRecord = parsedData as Record<string, unknown>;
    for (const field of ["filter", "fallback"] as const) {
      if (Object.prototype.hasOwnProperty.call(sourceRecord, field)) {
        parsedRecord[field] = sourceRecord[field];
      }
    }
  }

  const sourceReference = sourceNode.reference;
  const parsedReference = parsedNode.reference;
  if (
    sourceReference &&
    parsedReference &&
    typeof sourceReference === "object" &&
    typeof parsedReference === "object" &&
    !Array.isArray(sourceReference) &&
    !Array.isArray(parsedReference) &&
    Object.prototype.hasOwnProperty.call(sourceReference, "overrides")
  ) {
    (parsedReference as Record<string, unknown>).overrides = (
      sourceReference as Record<string, unknown>
    ).overrides;
  }

  const sourceChildren = Array.isArray(sourceNode.children)
    ? sourceNode.children
    : [];
  const parsedChildren = Array.isArray(parsedNode.children)
    ? parsedNode.children
    : [];
  for (
    let index = 0;
    index < Math.min(sourceChildren.length, parsedChildren.length);
    index += 1
  ) {
    const sourceChild = sourceChildren[index];
    const parsedChild = parsedChildren[index];
    if (
      sourceChild &&
      parsedChild &&
      typeof sourceChild === "object" &&
      typeof parsedChild === "object" &&
      !Array.isArray(sourceChild) &&
      !Array.isArray(parsedChild)
    ) {
      restoreNodeJsonValueFields(
        sourceChild as Record<string, unknown>,
        parsedChild as Record<string, unknown>,
      );
    }
  }
}

function restoreJsonValueFields(
  source: Record<string, unknown>,
  parsed: Record<string, unknown>,
): void {
  for (const field of ["frontmatter"] as const) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      parsed[field] = source[field];
    }
  }

  const sourceSeo = source.seo;
  const parsedSeo = parsed.seo;
  if (
    sourceSeo &&
    parsedSeo &&
    typeof sourceSeo === "object" &&
    typeof parsedSeo === "object" &&
    !Array.isArray(sourceSeo) &&
    !Array.isArray(parsedSeo) &&
    Object.prototype.hasOwnProperty.call(sourceSeo, "structuredData")
  ) {
    (parsedSeo as Record<string, unknown>).structuredData = (
      sourceSeo as Record<string, unknown>
    ).structuredData;
  }

  const restoreNodes = (sourceNodes: unknown, parsedNodes: unknown): void => {
    if (!Array.isArray(sourceNodes) || !Array.isArray(parsedNodes)) return;
    for (
      let index = 0;
      index < Math.min(sourceNodes.length, parsedNodes.length);
      index += 1
    ) {
      const sourceNode = sourceNodes[index];
      const parsedNode = parsedNodes[index];
      if (
        sourceNode &&
        parsedNode &&
        typeof sourceNode === "object" &&
        typeof parsedNode === "object" &&
        !Array.isArray(sourceNode) &&
        !Array.isArray(parsedNode)
      ) {
        restoreNodeJsonValueFields(
          sourceNode as Record<string, unknown>,
          parsedNode as Record<string, unknown>,
        );
      }
    }
  };

  restoreNodes(source.nodes, parsed.nodes);
  if (Array.isArray(source.slots) && Array.isArray(parsed.slots)) {
    for (
      let index = 0;
      index < Math.min(source.slots.length, parsed.slots.length);
      index += 1
    ) {
      const sourceSlot = source.slots[index];
      const parsedSlot = parsed.slots[index];
      if (
        sourceSlot &&
        parsedSlot &&
        typeof sourceSlot === "object" &&
        typeof parsedSlot === "object"
      ) {
        restoreNodes(
          (sourceSlot as Record<string, unknown>).defaultContent,
          (parsedSlot as Record<string, unknown>).defaultContent,
        );
      }
    }
  }
}

function assertPortableObjectPrototypes(
  kind: RenderSurfaceKind,
  source: unknown,
): void {
  const stack: unknown[] = [source];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      for (const entry of current) stack.push(entry);
      continue;
    }
    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) {
      throw normalizationError(kind, "schema-output", new TypeError());
    }
    for (const entry of Object.values(current)) stack.push(entry);
  }
}

export async function normalizeEditableSurface<K extends RenderSurfaceKind>(
  input: {
    kind: K;
    source: unknown;
  },
  options: NormalizeEditableSurfaceOptions = {},
): Promise<NormalizedRenderSurface<K>> {
  const preflight = preflightEditableSurface(input);
  let source = stripDerivedFields(input.kind, preflight.source);

  if (input.kind === "page") {
    try {
      source = migratePageDSL(source as unknown as PageDSL)
        .dsl as unknown as Record<string, unknown>;
    } catch (error) {
      throw normalizationError(input.kind, "page-migrations", error);
    }
  }

  try {
    source = normalizeSurfaceNodeTrees(source);
  } catch (error) {
    throw normalizationError(input.kind, "node-normalization", error);
  }

  const parsed = applyAuthoritativeSchema(input.kind, source);
  restoreJsonValueFields(source, parsed as unknown as Record<string, unknown>);
  assertPortableObjectPrototypes(input.kind, parsed);
  removeUndefinedObjectProperties(parsed);
  const serialized = stableSerializeJson(parsed);
  const canonicalSourceBytes = new TextEncoder().encode(serialized).byteLength;
  if (canonicalSourceBytes > MAX_CANONICAL_SOURCE_BYTES) {
    throw new RenderContractError(
      createRenderFailure("RENDER_INPUT_INVALID", {
        surfaceKind: input.kind,
        stage: "canonical-size",
        issue: "source-size",
        violatedLimit: "canonicalSourceBytes",
        maximum: MAX_CANONICAL_SOURCE_BYTES,
        actual: canonicalSourceBytes,
        issueCount: 1,
      }),
    );
  }
  const normalized: NormalizedRenderSurface<K> = {
    contractVersion: 1,
    kind: input.kind,
    source: parsed,
    sourceHash: await sha256Text(serialized),
  };

  return options.freeze === true ? deepFreeze(normalized) : normalized;
}
