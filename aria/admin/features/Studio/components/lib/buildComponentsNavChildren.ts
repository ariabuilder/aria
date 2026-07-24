import { z } from "zod";
import type { ComponentGroup } from "@/lib/schemas/componentGrouping";
import {
  toComponentsListPath,
  type ComponentsRouteFilter,
} from "./componentsRouteFilter";

export const ComponentsNavChildSchema = z.object({
  label: z.string().min(1),
  path: z.string().min(1),
  filter: z.string().min(1),
  groupId: z.string().min(1).optional(),
});

export type ComponentsNavChild = z.infer<typeof ComponentsNavChildSchema>;

export function buildComponentsNavChildren(
  groups: readonly ComponentGroup[],
): ComponentsNavChild[] {
  const allChild: ComponentsNavChild = {
    label: "All Components",
    path: toComponentsListPath("all"),
    filter: "all",
  };

  const groupChildren = [...groups]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((group) => {
      const filter: ComponentsRouteFilter = `group:${group.id}`;
      return {
        label: group.name,
        path: toComponentsListPath(filter),
        filter,
        groupId: group.id,
      };
    });

  return [allChild, ...groupChildren];
}

export function isComponentsNavChildActive(
  child: ComponentsNavChild,
  routePath: string,
  routeFilter: unknown,
  detailAssignmentGroupId?: string | null,
): boolean {
  if (!routePath.startsWith("/components")) {
    return false;
  }

  const isListRoute = routePath === "/components";
  const activeFilter =
    routeFilter === undefined || routeFilter === null || routeFilter === ""
      ? "all"
      : String(routeFilter);

  if (isListRoute) {
    return activeFilter === child.filter;
  }

  if (activeFilter !== "all") {
    return activeFilter === child.filter;
  }

  if (child.filter === "all") {
    return !detailAssignmentGroupId;
  }

  return (
    detailAssignmentGroupId !== undefined &&
    detailAssignmentGroupId !== null &&
    child.groupId === detailAssignmentGroupId
  );
}
