import { STATUS_SURFACE } from "@/lib/statusTokens";
import type { Page } from "@/composables/useBuilderData";

export interface PagePolicyBadge {
  readonly key:
    | "not-found"
    | "cms-collection"
    | "cms-entry"
    | "password"
    | "private"
    | "unlisted";
  readonly label:
    | "404"
    | "Collection"
    | "Entry"
    | "Password"
    | "Private"
    | "Unlisted";
}

export const PAGE_POLICY_BADGE_CLASS_BY_KEY: Readonly<
  Record<PagePolicyBadge["key"], string>
> = {
  "not-found": STATUS_SURFACE.info,
  "cms-collection": STATUS_SURFACE.violet,
  "cms-entry": STATUS_SURFACE.violet,
  password: STATUS_SURFACE.warning,
  private: STATUS_SURFACE.rose,
  unlisted: STATUS_SURFACE.cyan,
};

export function getPagePolicyBadges(
  page: Pick<Page, "systemRole" | "accessMode">,
): readonly PagePolicyBadge[] {
  if (page.systemRole === "not-found") {
    return [{ key: "not-found", label: "404" }];
  }

  if (page.systemRole === "cms-collection") {
    return [{ key: "cms-collection", label: "Collection" }];
  }

  if (page.systemRole === "cms-entry") {
    return [{ key: "cms-entry", label: "Entry" }];
  }

  switch (page.accessMode) {
    case "password":
      return [{ key: "password", label: "Password" }];
    case "private":
      return [{ key: "private", label: "Private" }];
    case "unlisted":
      return [{ key: "unlisted", label: "Unlisted" }];
    default:
      return [];
  }
}
