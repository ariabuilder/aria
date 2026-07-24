import { z } from "zod";

import {
  BREAKPOINT_WIDTHS,
  type CustomClass,
  type CustomClassesMap,
} from "../../../../lib/schemas/classEditor";
import type {
  ClassManagerUsageIndex,
  ClassManagerUsageLocation,
} from "./classManagerInventory";

function sortBreakpointsDesktopFirst(breakpoints: string[]): string[] {
  return [...breakpoints].sort((a, b) => {
    if (a === "base") return -1;
    if (b === "base") return 1;
    const aWidth = BREAKPOINT_WIDTHS[a] ?? 0;
    const bWidth = BREAKPOINT_WIDTHS[b] ?? 0;
    if (aWidth !== bWidth) return bWidth - aWidth;
    return a.localeCompare(b);
  });
}

export const ClassManagerSegmentSchema = z.enum([
  "all",
  "used",
  "unused",
  "orphaned",
]);

export type ClassManagerSegment = z.infer<typeof ClassManagerSegmentSchema>;

export const ClassManagerSortableColumnSchema = z.enum([
  "status",
  "name",
  "usageCount",
  "variantBreakpoints",
  "createdAt",
  "updatedAt",
]);

export type ClassManagerSortableColumn = z.infer<
  typeof ClassManagerSortableColumnSchema
>;

export const ClassManagerTableSortSchema = z.object({
  id: ClassManagerSortableColumnSchema,
  desc: z.boolean(),
});

export type ClassManagerTableSort = z.infer<typeof ClassManagerTableSortSchema>;

export const ClassManagerTableStateSchema = z.object({
  query: z.string().catch(""),
  segment: ClassManagerSegmentSchema.catch("all"),
  sorting: z.array(ClassManagerTableSortSchema).catch([]),
});

export type ClassManagerTableState = z.infer<
  typeof ClassManagerTableStateSchema
>;

export type ClassManagerRowStatus = "used" | "unused" | "orphaned";

export interface ClassManagerRow {
  id: string;
  name: string;
  status: ClassManagerRowStatus;
  statusLabel: string;
  description: string;
  usageCount: number;
  pageCount: number;
  layoutCount: number;
  componentCount: number;
  collectionSummary: string;
  variantCount: number;
  pseudoVariantCount: number;
  variantBreakpoints: string[];
  variantBreakpointsLabel: string;
  hasAdvancedCss: boolean;
  compoundVariantCount: number;
  cssSummary: string;
  createdAt: string;
  createdAtLabel: string;
  updatedAt: string;
  updatedAtLabel: string;
  searchText: string;
  locations: readonly ClassManagerUsageLocation[];
  classDefinition: CustomClass | null;
}

export interface FilterClassManagerRowsOptions {
  query: string;
  segment: ClassManagerSegment;
}

function buildSearchText(parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .trim()
    .toLowerCase();
}

function formatUpdatedAtLabel(value: string): string {
  if (!value.trim()) {
    return "Not updated yet";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsedDate);
}

function summarizeCollections(row: {
  pageCount: number;
  layoutCount: number;
  componentCount: number;
}): string {
  const parts = [
    row.pageCount > 0
      ? `${row.pageCount} ${row.pageCount === 1 ? "page" : "pages"}`
      : null,
    row.layoutCount > 0
      ? `${row.layoutCount} ${row.layoutCount === 1 ? "layout" : "layouts"}`
      : null,
    row.componentCount > 0
      ? `${row.componentCount} ${row.componentCount === 1 ? "component" : "components"}`
      : null,
  ].filter((part): part is string => typeof part === "string");

  return parts.join(" • ") || "No references";
}

function summarizeClassCss(customClass: CustomClass): string {
  const baseRules = customClass.variants.flatMap((variant) => variant.rules);
  const pseudoRules = customClass.pseudoVariants.flatMap(
    (variant) => variant.rules,
  );
  const compoundRules = (customClass.compoundVariants ?? []).flatMap(
    (variant) => variant.rules,
  );
  const allRules = [...baseRules, ...pseudoRules, ...compoundRules];

  if (allRules.length === 0 && customClass.advancedCss?.trim()) {
    return "Advanced CSS";
  }

  if (allRules.length === 0) {
    return "No rules yet";
  }

  const summary = allRules
    .slice(0, 2)
    .map((rule) => `${rule.property}: ${rule.value}`)
    .join("; ");

  if (customClass.advancedCss?.trim()) {
    return `${summary}; Advanced CSS`;
  }

  return summary;
}

function getStatusLabel(status: ClassManagerRowStatus): string {
  switch (status) {
    case "used":
      return "Used";
    case "unused":
      return "Unused";
    case "orphaned":
      return "Orphaned";
  }
}

export function parseClassManagerTableState(
  value: unknown,
): ClassManagerTableState {
  return ClassManagerTableStateSchema.parse(value);
}

export function buildClassManagerRows(
  customClasses: CustomClassesMap,
  usageIndex: ClassManagerUsageIndex,
): ClassManagerRow[] {
  const rows: ClassManagerRow[] = Object.entries(customClasses).map(
    ([name, customClass]) => {
      const usage = usageIndex[name];
      const usageCount = usage?.references ?? 0;
      const pageCount = usage?.pageCount ?? 0;
      const layoutCount = usage?.layoutCount ?? 0;
      const componentCount = usage?.componentCount ?? 0;
      const status: ClassManagerRowStatus = usageCount > 0 ? "used" : "unused";

      return {
        id: `defined:${name}`,
        name,
        status,
        statusLabel: getStatusLabel(status),
        description: customClass.description?.trim() || "",
        usageCount,
        pageCount,
        layoutCount,
        componentCount,
        collectionSummary: summarizeCollections({
          pageCount,
          layoutCount,
          componentCount,
        }),
        variantCount: customClass.variants.length,
        pseudoVariantCount: customClass.pseudoVariants.length,
        variantBreakpoints: (() => {
          const names = customClass.variants.map((v) => v.breakpoint);
          return sortBreakpointsDesktopFirst([...new Set(names)]);
        })(),
        variantBreakpointsLabel: (() => {
          const names = customClass.variants.map((v) => v.breakpoint);
          const unique = [...new Set(names)];
          return sortBreakpointsDesktopFirst(unique).join(", ");
        })(),
        hasAdvancedCss: Boolean(customClass.advancedCss?.trim()),
        compoundVariantCount: customClass.compoundVariants?.length ?? 0,
        cssSummary: summarizeClassCss(customClass),
        createdAt: customClass.createdAt,
        createdAtLabel: formatUpdatedAtLabel(customClass.createdAt),
        updatedAt: customClass.updatedAt,
        updatedAtLabel: formatUpdatedAtLabel(customClass.updatedAt),
        searchText: buildSearchText([
          name,
          status,
          customClass.description,
          summarizeClassCss(customClass),
          summarizeCollections({ pageCount, layoutCount, componentCount }),
          customClass.createdAt,
          customClass.updatedAt,
          ...new Set(customClass.variants.map((v) => v.breakpoint)),
        ]),
        locations: usage?.locations ?? [],
        classDefinition: customClass,
      };
    },
  );

  for (const [name, usage] of Object.entries(usageIndex)) {
    if (customClasses[name]) {
      continue;
    }

    rows.push({
      id: `orphaned:${name}`,
      name,
      status: "orphaned",
      statusLabel: getStatusLabel("orphaned"),
      description: "Referenced by content but missing from the class registry.",
      usageCount: usage.references,
      pageCount: usage.pageCount,
      layoutCount: usage.layoutCount,
      componentCount: usage.componentCount,
      collectionSummary: summarizeCollections(usage),
      variantCount: 0,
      pseudoVariantCount: 0,
      variantBreakpoints: [],
      variantBreakpointsLabel: "",
      hasAdvancedCss: false,
      compoundVariantCount: 0,
      cssSummary: "Missing class definition",
      createdAt: "",
      createdAtLabel: "N/A",
      updatedAt: "",
      updatedAtLabel: "Missing definition",
      searchText: buildSearchText([
        name,
        "orphaned",
        "missing class definition",
        summarizeCollections(usage),
      ]),
      locations: usage.locations,
      classDefinition: null,
    });
  }

  return rows;
}

export function filterClassManagerRows(
  rows: readonly ClassManagerRow[],
  options: FilterClassManagerRowsOptions,
): ClassManagerRow[] {
  const query = options.query.trim().toLowerCase();

  return rows.filter((row) => {
    if (options.segment !== "all" && row.status !== options.segment) {
      return false;
    }

    if (!query) {
      return true;
    }

    return row.searchText.includes(query);
  });
}
