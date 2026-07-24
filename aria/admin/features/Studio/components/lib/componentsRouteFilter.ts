import { z } from "zod";

export const COMPONENTS_GROUP_FILTER_PREFIX = "group:" as const;

export const ComponentsBuiltinFilterSchema = z.enum(["all", "locked"]);

export const ComponentsRouteFilterSchema = z.union([
  ComponentsBuiltinFilterSchema,
  z
    .string()
    .regex(/^group:[^\s]+$/, "Expected group:{groupId}"),
]);

export type ComponentsBuiltinFilter = z.infer<
  typeof ComponentsBuiltinFilterSchema
>;
export type ComponentsRouteFilter = z.infer<typeof ComponentsRouteFilterSchema>;

export function parseComponentsRouteFilter(
  raw: unknown,
): ComponentsRouteFilter {
  if (raw === undefined || raw === null || raw === "") {
    return "all";
  }
  const parsed = ComponentsRouteFilterSchema.safeParse(raw);
  if (!parsed.success) {
    return "all";
  }
  return parsed.data;
}

export function getGroupIdFromFilter(
  filter: ComponentsRouteFilter,
): string | null {
  if (!filter.startsWith(COMPONENTS_GROUP_FILTER_PREFIX)) {
    return null;
  }
  const groupId = filter.slice(COMPONENTS_GROUP_FILTER_PREFIX.length);
  return groupId.length > 0 ? groupId : null;
}

export function isGroupRouteFilter(
  filter: ComponentsRouteFilter,
): filter is `${typeof COMPONENTS_GROUP_FILTER_PREFIX}${string}` {
  return filter.startsWith(COMPONENTS_GROUP_FILTER_PREFIX);
}

export function toGroupRouteFilter(groupId: string): ComponentsRouteFilter {
  return `${COMPONENTS_GROUP_FILTER_PREFIX}${groupId}`;
}

export function toComponentsListPath(
  filter: ComponentsRouteFilter,
): string {
  if (filter === "all") {
    return "/components";
  }
  return `/components?filter=${encodeURIComponent(filter)}`;
}
