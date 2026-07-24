import {
  createDefaultUniversalDesignSystem,
  parseStoredUniversalDesignSystem,
  UniversalDesignSystemSchema,
  type UniversalDesignSystem,
} from "../styles/universalDesignSystem";

export const LEGACY_DESIGN_SYSTEM_ROW_ID = "default";
export const DESIGN_SYSTEM_ROW_ID_PREFIX = `${LEGACY_DESIGN_SYSTEM_ROW_ID}:`;
export const DESIGN_SYSTEM_ROW_ID_LIKE_PATTERN = `${DESIGN_SYSTEM_ROW_ID_PREFIX}%`;

type StoredDesignSystemRow = {
  id: string;
  stylesJson: string;
};

type SerializedDesignSystemRow = {
  id: string;
  stylesJson: string;
  updatedAt: string;
};

type DesignSystemSegmentDefinition = {
  key: string;
  serialize: (designSystem: UniversalDesignSystem) => unknown;
  apply: (target: Record<string, unknown>, value: unknown) => void;
};

function ensureObjectAtPath(
  target: Record<string, unknown>,
  path: string[],
): Record<string, unknown> {
  let cursor = target;

  for (const segment of path) {
    const next = cursor[segment];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      cursor[segment] = {};
    }

    cursor = cursor[segment] as Record<string, unknown>;
  }

  return cursor;
}

function setValueAtPath(
  target: Record<string, unknown>,
  path: string[],
  value: unknown,
): void {
  const parent = ensureObjectAtPath(target, path.slice(0, -1));
  parent[path[path.length - 1] as string] = value;
}

function mergeObjectAtPath(
  target: Record<string, unknown>,
  path: string[],
  value: unknown,
): void {
  const parent = ensureObjectAtPath(target, path);
  Object.assign(parent, value as Record<string, unknown>);
}

export function createDesignSystemSegmentId(key: string): string {
  return `${DESIGN_SYSTEM_ROW_ID_PREFIX}${key}`;
}

function createSegmentId(key: string): string {
  return createDesignSystemSegmentId(key);
}

function parseLegacyDesignSystemRow(
  row: StoredDesignSystemRow | undefined,
): UniversalDesignSystem | null {
  if (!row) {
    return null;
  }

  try {
    return parseStoredUniversalDesignSystem(JSON.parse(row.stylesJson));
  } catch {
    return null;
  }
}

const DESIGN_SYSTEM_SEGMENTS: readonly DesignSystemSegmentDefinition[] = [
  {
    key: "schema",
    serialize: (designSystem) => ({
      schemaVersion: designSystem.schemaVersion,
      authoring: designSystem.authoring,
    }),
    apply: (target, value) => {
      const parsed = value as {
        schemaVersion?: unknown;
        authoring?: unknown;
      };
      target.schemaVersion = parsed.schemaVersion;
      target.authoring = parsed.authoring;
    },
  },
  {
    key: "tokens-colors",
    serialize: (designSystem) => designSystem.tokens.colors,
    apply: (target, value) =>
      setValueAtPath(target, ["tokens", "colors"], value),
  },
  {
    key: "tokens-spacing",
    serialize: (designSystem) => designSystem.tokens.spacing,
    apply: (target, value) =>
      setValueAtPath(target, ["tokens", "spacing"], value),
  },
  {
    key: "tokens-typography",
    serialize: (designSystem) => designSystem.tokens.typography,
    apply: (target, value) =>
      setValueAtPath(target, ["tokens", "typography"], value),
  },
  {
    key: "tokens-borders",
    serialize: (designSystem) => designSystem.tokens.borders,
    apply: (target, value) =>
      setValueAtPath(target, ["tokens", "borders"], value),
  },
  {
    key: "tokens-effects",
    serialize: (designSystem) => designSystem.tokens.effects,
    apply: (target, value) =>
      setValueAtPath(target, ["tokens", "effects"], value),
  },
  {
    key: "tokens-layering",
    serialize: (designSystem) => designSystem.tokens.layering,
    apply: (target, value) =>
      setValueAtPath(target, ["tokens", "layering"], value),
  },
  {
    key: "breakpoints",
    serialize: (designSystem) => designSystem.breakpoints,
    apply: (target, value) => setValueAtPath(target, ["breakpoints"], value),
  },
  {
    key: "fonts",
    serialize: (designSystem) => designSystem.fonts,
    apply: (target, value) => setValueAtPath(target, ["fonts"], value),
  },
  {
    key: "global-styles",
    serialize: (designSystem) => designSystem.globalStyles,
    apply: (target, value) => setValueAtPath(target, ["globalStyles"], value),
  },
  {
    key: "semantic-classes",
    serialize: (designSystem) => designSystem.semanticClasses,
    apply: (target, value) =>
      setValueAtPath(target, ["semanticClasses"], value),
  },
  {
    key: "utilities",
    serialize: (designSystem) => designSystem.utilities,
    apply: (target, value) => setValueAtPath(target, ["utilities"], value),
  },
  {
    key: "artifacts-base-css",
    serialize: (designSystem) => designSystem.artifacts.baseCSS,
    apply: (target, value) =>
      setValueAtPath(target, ["artifacts", "baseCSS"], value),
  },
  {
    key: "artifacts-custom-classes-css",
    serialize: (designSystem) => designSystem.artifacts.customClassesCSS,
    apply: (target, value) =>
      setValueAtPath(target, ["artifacts", "customClassesCSS"], value),
  },
  {
    key: "artifacts-custom-fonts-css",
    serialize: (designSystem) => designSystem.artifacts.customFontsCSS,
    apply: (target, value) =>
      setValueAtPath(target, ["artifacts", "customFontsCSS"], value),
  },
  {
    key: "artifacts-compiled-unocss",
    serialize: (designSystem) => designSystem.artifacts.compiledUnoCSS,
    apply: (target, value) =>
      setValueAtPath(target, ["artifacts", "compiledUnoCSS"], value),
  },
  {
    key: "artifacts-global-css",
    serialize: (designSystem) => designSystem.artifacts.globalCSS,
    apply: (target, value) =>
      setValueAtPath(target, ["artifacts", "globalCSS"], value),
  },
  {
    key: "artifacts-utility-css",
    serialize: (designSystem) => designSystem.artifacts.utilityCSS,
    apply: (target, value) =>
      setValueAtPath(target, ["artifacts", "utilityCSS"], value),
  },
  {
    key: "artifacts-unocss-classes",
    serialize: (designSystem) => designSystem.artifacts.unocssClasses,
    apply: (target, value) =>
      setValueAtPath(target, ["artifacts", "unocssClasses"], value),
  },
  {
    key: "artifacts-meta",
    serialize: (designSystem) => ({
      baseCSSHash: designSystem.artifacts.baseCSSHash,
      globalCSSHash: designSystem.artifacts.globalCSSHash,
      utilityCSSHash: designSystem.artifacts.utilityCSSHash,
      lastCompiled: designSystem.artifacts.lastCompiled,
    }),
    apply: (target, value) => mergeObjectAtPath(target, ["artifacts"], value),
  },
] as const;

export const DESIGN_SYSTEM_SEGMENT_KEYS = DESIGN_SYSTEM_SEGMENTS.map(
  (segment) => segment.key,
) as DesignSystemSegmentKey[];

export type DesignSystemSegmentKey = (typeof DESIGN_SYSTEM_SEGMENTS)[number]["key"];

const DESIGN_SYSTEM_SEGMENT_BY_KEY = new Map(
  DESIGN_SYSTEM_SEGMENTS.map((segment) => [segment.key, segment] as const),
);

function isDesignSystemSegmentKey(
  key: string,
): key is DesignSystemSegmentKey {
  return DESIGN_SYSTEM_SEGMENT_BY_KEY.has(key);
}

export function parseStoredDesignSystemSegments(
  rows: readonly StoredDesignSystemRow[],
  segmentKeys: readonly string[],
): UniversalDesignSystem | null {
  const normalizedKeys = [
    ...new Set(segmentKeys.filter(isDesignSystemSegmentKey)),
  ];

  if (normalizedKeys.length === 0) {
    return parseStoredDesignSystemRows(rows);
  }

  const legacyRow = rows.find((row) => row.id === LEGACY_DESIGN_SYSTEM_ROW_ID);
  const segmentedRows = rows.filter((row) =>
    row.id.startsWith(DESIGN_SYSTEM_ROW_ID_PREFIX),
  );

  if (segmentedRows.length === 0) {
    return parseLegacyDesignSystemRow(legacyRow);
  }

  const rowsById = new Map(
    segmentedRows.map((row) => [row.id, row.stylesJson] as const),
  );

  for (const key of normalizedKeys) {
    if (!rowsById.has(createSegmentId(key))) {
      return parseLegacyDesignSystemRow(legacyRow);
    }
  }

  const assembled = createDefaultUniversalDesignSystem() as unknown as Record<
    string,
    unknown
  >;

  try {
    for (const key of normalizedKeys) {
      const segment = DESIGN_SYSTEM_SEGMENT_BY_KEY.get(key);
      const serialized = rowsById.get(createSegmentId(key));
      if (!segment || !serialized) {
        return parseLegacyDesignSystemRow(legacyRow);
      }

      segment.apply(assembled, JSON.parse(serialized));
    }

    return parseStoredUniversalDesignSystem(assembled);
  } catch {
    return parseLegacyDesignSystemRow(legacyRow);
  }
}

export function serializeStoredDesignSystemRows(
  data: UniversalDesignSystem,
  updatedAt: string,
): SerializedDesignSystemRow[] {
  const designSystem = UniversalDesignSystemSchema.parse(data);

  return DESIGN_SYSTEM_SEGMENTS.map((segment) => ({
    id: createSegmentId(segment.key),
    stylesJson: JSON.stringify(segment.serialize(designSystem)),
    updatedAt,
  }));
}

export function parseStoredDesignSystemRows(
  rows: readonly StoredDesignSystemRow[],
): UniversalDesignSystem | null {
  const legacyRow = rows.find((row) => row.id === LEGACY_DESIGN_SYSTEM_ROW_ID);
  const segmentedRows = rows.filter((row) =>
    row.id.startsWith(DESIGN_SYSTEM_ROW_ID_PREFIX),
  );

  if (segmentedRows.length === 0) {
    return parseLegacyDesignSystemRow(legacyRow);
  }

  const rowsById = new Map(
    segmentedRows.map((row) => [row.id, row.stylesJson] as const),
  );
  const assembled: Record<string, unknown> = {};

  try {
    for (const segment of DESIGN_SYSTEM_SEGMENTS) {
      const serialized = rowsById.get(createSegmentId(segment.key));
      if (!serialized) {
        return parseLegacyDesignSystemRow(legacyRow);
      }

      segment.apply(assembled, JSON.parse(serialized));
    }

    return parseStoredUniversalDesignSystem(assembled);
  } catch {
    return parseLegacyDesignSystemRow(legacyRow);
  }
}
