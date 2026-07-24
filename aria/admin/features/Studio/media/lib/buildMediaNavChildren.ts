import { toMediaListPath, type MediaViewFilterId } from "./mediaRouteFilter";

export interface MediaNavChild {
  label: string;
  path: string;
  filter?: MediaViewFilterId;
  groupId?: string;
  section?: "type" | "folder";
}

const TYPE_NAV_CHILDREN: MediaNavChild[] = [
  { label: "All", path: "/media", section: "type" },
  {
    label: "Images",
    path: "/media?filter=image",
    filter: "image",
    section: "type",
  },
  {
    label: "Videos",
    path: "/media?filter=video",
    filter: "video",
    section: "type",
  },
  {
    label: "Fonts",
    path: "/media?filter=font",
    filter: "font",
    section: "type",
  },
  {
    label: "Icons",
    path: "/media?filter=icon",
    filter: "icon",
    section: "type",
  },
  {
    label: "Files",
    path: "/media?filter=file",
    filter: "file",
    section: "type",
  },
];

export function buildMediaNavChildren(): MediaNavChild[] {
  return TYPE_NAV_CHILDREN.map((child) => ({
    ...child,
    path:
      child.filter && child.filter !== "all"
        ? toMediaListPath({ filter: child.filter })
        : "/media",
  }));
}

export function isMediaNavChildActive(
  child: MediaNavChild,
  routePath: string,
  routeFilter: unknown,
  routeGroup: unknown,
): boolean {
  if (!routePath.startsWith("/media")) {
    return false;
  }

  const activeFilter =
    routeFilter === undefined || routeFilter === null || routeFilter === ""
      ? "all"
      : String(routeFilter);
  const activeGroup =
    routeGroup === undefined || routeGroup === null || routeGroup === ""
      ? null
      : String(routeGroup);

  if (child.section === "folder") {
    return child.groupId === activeGroup;
  }

  if (activeGroup) {
    return false;
  }

  if (child.filter !== undefined) {
    return activeFilter === child.filter;
  }

  return activeFilter === "all";
}
