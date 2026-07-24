import {
  getCanonicalContentPropName,
  getContentPropAliases,
  isContentEditableType,
  isContentMultilineType,
} from "../blocks/contentContract";
import type { BuilderNode, LayoutDSL, PageDSL } from "../types/nodes";
import type {
  TranslationManifest,
  TranslationManifestEntry,
} from "./siteTranslationSchemas";

export type LocalizableDsl =
  | Pick<PageDSL, "nodes">
  | Pick<LayoutDSL, "nodes" | "slots">;

const SENTINEL = "__aria_locale_value__";

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

/** A deterministic non-cryptographic fingerprint for immutable source snapshots. */
function fingerprint(value: unknown): string {
  const source = stableJson(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `phase34-${(hash >>> 0).toString(16).padStart(16, "0")}`;
}

function nodePath(nodeId: string, prop: string): string {
  return `node:${encodeURIComponent(nodeId)}:prop:${prop}`;
}

function decodeNodePath(path: string): { nodeId: string; prop: string } | null {
  const match = /^node:([^:]+):prop:([A-Za-z0-9_-]+)$/.exec(path);
  if (!match) return null;
  try {
    return { nodeId: decodeURIComponent(match[1]!), prop: match[2]! };
  } catch {
    return null;
  }
}

function visitNodes(
  source: LocalizableDsl,
  visit: (node: BuilderNode) => void,
): void {
  const walk = (nodes: BuilderNode[]) => {
    for (const node of nodes) {
      visit(node);
      walk(node.children ?? []);
    }
  };
  walk(source.nodes ?? []);
  if ("slots" in source) {
    for (const slot of source.slots ?? []) walk(slot.defaultContent ?? []);
  }
}

function findNode(source: LocalizableDsl, id: string): BuilderNode | null {
  let found: BuilderNode | null = null;
  visitNodes(source, (node) => {
    if (node.id === id) found = node;
  });
  return found;
}

function entriesFor(source: LocalizableDsl): TranslationManifestEntry[] {
  const entries: TranslationManifestEntry[] = [];
  const paths = new Set<string>();
  const add = (entry: TranslationManifestEntry) => {
    if (paths.has(entry.path)) {
      throw new Error(
        `Localization source contains duplicate translatable path: ${entry.path}`,
      );
    }
    paths.add(entry.path);
    entries.push(entry);
  };

  visitNodes(source, (node) => {
    const props = node.props as Record<string, unknown>;
    if (isContentEditableType(node.type)) {
      const property = [
        getCanonicalContentPropName(node.type),
        ...getContentPropAliases(node.type),
      ]
        .filter((key): key is string => Boolean(key))
        .find((key) => typeof props[key] === "string");
      if (property) {
        add({
          path: nodePath(node.id, property),
          kind: isContentMultilineType(node.type) ? "rich-text" : "text",
          required: false,
          nullable: false,
          allowEmpty: true,
          maxBytes: 262_144,
        });
      }
    }
    if (typeof props.alt === "string") {
      add({
        path: nodePath(node.id, "alt"),
        kind: "media-alt",
        required: false,
        nullable: false,
        allowEmpty: true,
        maxBytes: 2_000,
      });
    }
  });
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

export function buildTranslationManifest(
  source: LocalizableDsl,
): TranslationManifest {
  const entries = entriesFor(source);
  const projection = JSON.parse(JSON.stringify(source)) as LocalizableDsl;
  for (const entry of entries) {
    const location = decodeNodePath(entry.path)!;
    const node = findNode(projection, location.nodeId);
    if (node) (node.props as Record<string, unknown>)[location.prop] = SENTINEL;
  }
  return {
    entries,
    hash: fingerprint(entries),
    structureHash: fingerprint(projection),
  };
}

/**
 * Enforces immutable localized snapshots. Only manifest-listed string values may differ
 * from their exact source revision, and the stored path.
 */
export function assertLocalizedSnapshot(input: {
  source: LocalizableDsl;
  candidate: LocalizableDsl;
  translatedPaths: string[];
  sourceManifestHash: string;
  sourceStructureHash: string;
}): TranslationManifest {
  const manifest = buildTranslationManifest(input.source);
  if (
    input.sourceManifestHash !== manifest.hash ||
    input.sourceStructureHash !== manifest.structureHash
  ) {
    throw new Error(
      "The localized draft was created from a different canonical source snapshot.",
    );
  }
  const candidateManifest = buildTranslationManifest(input.candidate);
  if (candidateManifest.structureHash !== manifest.structureHash) {
    throw new Error(
      "Localized drafts may not change page or layout structure.",
    );
  }
  const paths = new Set(manifest.entries.map((entry) => entry.path));
  const suppliedPaths = new Set(input.translatedPaths);
  if (
    suppliedPaths.size !== input.translatedPaths.length ||
    [...suppliedPaths].some((path) => !paths.has(path))
  ) {
    throw new Error(
      "Localized draft contains a field outside the canonical translation manifest.",
    );
  }
  for (const entry of manifest.entries) {
    const location = decodeNodePath(entry.path)!;
    const sourceNode = findNode(input.source, location.nodeId);
    const candidateNode = findNode(input.candidate, location.nodeId);
    const sourceValue = sourceNode?.props?.[location.prop];
    const candidateValue = candidateNode?.props?.[location.prop];
    if (typeof candidateValue !== "string") {
      throw new Error(`Localized value ${entry.path} must remain a string.`);
    }
    const changed = sourceValue !== candidateValue;
    if (changed !== suppliedPaths.has(entry.path)) {
      throw new Error(
        `Localized path ${entry.path} does not match the draft changes.`,
      );
    }
  }
  return manifest;
}

export function getLocalizedFieldValue(
  source: LocalizableDsl,
  path: string,
): string | null {
  const location = decodeNodePath(path);
  if (!location) return null;
  const value = findNode(source, location.nodeId)?.props?.[location.prop];
  return typeof value === "string" ? value : null;
}

/** Updates a manifest-addressed value without exposing tree-array paths. */
export function setLocalizedFieldValue(
  source: LocalizableDsl,
  path: string,
  value: string,
): boolean {
  const location = decodeNodePath(path);
  if (!location) return false;
  const node = findNode(source, location.nodeId);
  if (!node || typeof node.props?.[location.prop] !== "string") return false;
  (node.props as Record<string, unknown>)[location.prop] = value;
  return true;
}
