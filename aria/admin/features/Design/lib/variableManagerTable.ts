import { z } from "zod";

import type {
  GlobalStyleVariableAlias,
  GlobalStyleVariableDefinition,
  GlobalStyleVariables,
} from "../../../../lib/styles/universalDesignSystem";
import type { VariableManagerTokenOption } from "./variableManagerTokens";

export const VariableManagerSegmentSchema = z.enum([
  "all",
  "custom",
  "aliases",
]);

export type VariableManagerSegment = z.infer<
  typeof VariableManagerSegmentSchema
>;

export const VariableManagerSourceFilterSchema = z.enum([
  "all",
  "custom",
  "token",
]);

export type VariableManagerSourceFilter = z.infer<
  typeof VariableManagerSourceFilterSchema
>;

export const VariableManagerSortableColumnSchema = z.enum([
  "kind",
  "key",
  "label",
  "source",
  "value",
]);

export type VariableManagerSortableColumn = z.infer<
  typeof VariableManagerSortableColumnSchema
>;

export const VariableManagerTableSortSchema = z.object({
  id: VariableManagerSortableColumnSchema,
  desc: z.boolean(),
});

export type VariableManagerTableSort = z.infer<
  typeof VariableManagerTableSortSchema
>;

export const VariableManagerTableStateSchema = z.object({
  query: z.string().catch(""),
  segment: VariableManagerSegmentSchema.catch("all"),
  sourceFilter: VariableManagerSourceFilterSchema.catch("all"),
  sorting: z.array(VariableManagerTableSortSchema).catch([]),
});

export type VariableManagerTableState = z.infer<
  typeof VariableManagerTableStateSchema
>;

interface VariableManagerBaseRow {
  id: string;
  key: string;
  label: string;
  typeLabel: string;
  sourceType: "custom" | "token" | "direct";
  sourceLabel: string;
  sourceMeta: string;
  valueText: string | undefined;
  searchText: string;
}

export interface VariableManagerCustomRow extends VariableManagerBaseRow {
  kind: "custom";
  variable: GlobalStyleVariableDefinition;
}

export interface VariableManagerAliasRow extends VariableManagerBaseRow {
  kind: "alias";
  alias: GlobalStyleVariableAlias;
  tokenOption: VariableManagerTokenOption | null;
  exposureConflict: string | null;
}

export type VariableManagerRow =
  | VariableManagerCustomRow
  | VariableManagerAliasRow;

export interface FilterVariableManagerRowsOptions {
  query: string;
  segment: VariableManagerSegment;
  sourceFilter: VariableManagerSourceFilter;
}

export function parseVariableManagerTableState(
  value: unknown,
): VariableManagerTableState {
  return VariableManagerTableStateSchema.parse(value);
}

function buildSearchText(parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .trim()
    .toLowerCase();
}

export function buildVariableManagerRows(
  variables: GlobalStyleVariables,
  tokenOptions: readonly VariableManagerTokenOption[],
): VariableManagerRow[] {
  const tokenOptionByValue = new Map(
    tokenOptions.map((option) => [option.value, option] as const),
  );
  const customLabelByKey = new Map(
    Object.entries(variables.custom).map(([key, variable]) => [
      key,
      variable.label.trim() || `--${key}`,
    ]),
  );

  // Precompute token-source -> alias-key lookups once (O(n)) instead of
  // rescanning every alias per row (which was O(n^2) with hundreds of aliases).
  const aliasKeysByTokenSourceKey = new Map<string, string[]>();
  for (const [aliasKey, alias] of Object.entries(variables.aliases)) {
    if (alias.sourceType !== "token" || !alias.sourceKey.trim()) {
      continue;
    }

    const existing = aliasKeysByTokenSourceKey.get(alias.sourceKey);
    if (existing) {
      existing.push(aliasKey);
    } else {
      aliasKeysByTokenSourceKey.set(alias.sourceKey, [aliasKey]);
    }
  }

  function findExposureConflict(
    sourceKey: string,
    excludeAliasKey: string,
  ): string | null {
    const candidates = aliasKeysByTokenSourceKey.get(sourceKey);
    if (!candidates) {
      return null;
    }

    for (const candidateKey of candidates) {
      if (candidateKey !== excludeAliasKey) {
        return candidateKey;
      }
    }

    return null;
  }

  const customRows: VariableManagerCustomRow[] = Object.entries(
    variables.custom,
  ).map(([key, variable]) => ({
    id: `custom:${key}`,
    kind: "custom",
    key,
    label: variable.label,
    typeLabel: "Variable",
    sourceType: "direct",
    sourceLabel: "Direct CSS value",
    sourceMeta: `Referenced as --${key}`,
    valueText: variable.value,
    variable,
    searchText: buildSearchText([
      "custom",
      key,
      variable.label,
      variable.value,
      variable.category,
      variable.description,
    ]),
  }));

  const aliasRows: VariableManagerAliasRow[] = Object.entries(
    variables.aliases,
  ).map(([key, alias]) => {
    const tokenOption =
      alias.sourceType === "token"
        ? (tokenOptionByValue.get(alias.sourceKey) ?? null)
        : null;
    const customSourceLabel =
      alias.sourceType === "custom"
        ? (customLabelByKey.get(alias.sourceKey) ?? alias.sourceKey)
        : "";
    const sourceLabel =
      alias.sourceType === "token"
        ? (tokenOption?.label ?? alias.sourceKey)
        : customSourceLabel || alias.sourceKey || "Choose source variable";
    const sourceMeta =
      alias.sourceType === "token"
        ? (tokenOption?.meta ?? alias.sourceKey)
        : customSourceLabel || alias.sourceKey || "Choose source variable";

    return {
      id: `alias:${key}`,
      kind: "alias",
      key,
      label: alias.label,
      typeLabel: "Alias",
      sourceType: alias.sourceType,
      sourceLabel,
      sourceMeta,
      valueText: alias.fallback,
      alias,
      tokenOption,
      exposureConflict:
        alias.sourceType === "token" && alias.sourceKey.trim()
          ? findExposureConflict(alias.sourceKey, key)
          : null,
      searchText: buildSearchText([
        "alias",
        key,
        alias.label,
        alias.sourceType,
        alias.sourceKey,
        alias.fallback,
        tokenOption?.label,
        tokenOption?.meta,
        customSourceLabel,
        sourceLabel,
        sourceMeta,
      ]),
    };
  });

  return [...customRows, ...aliasRows];
}

export function filterVariableManagerRows(
  rows: readonly VariableManagerRow[],
  options: FilterVariableManagerRowsOptions,
): VariableManagerRow[] {
  const query = options.query.trim().toLowerCase();

  return rows.filter((row) => {
    if (options.segment === "custom" && row.kind !== "custom") {
      return false;
    }

    if (options.segment === "aliases" && row.kind !== "alias") {
      return false;
    }

    if (options.sourceFilter !== "all") {
      if (row.kind !== "alias") {
        return false;
      }

      if (row.alias.sourceType !== options.sourceFilter) {
        return false;
      }
    }

    if (!query) {
      return true;
    }

    return row.searchText.includes(query);
  });
}
