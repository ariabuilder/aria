import { hasEffectiveCapability } from "../auth/hasEffectiveCapability";
import type { SessionUser } from "../auth/types";
import type { FigmaOAuthScope } from "./schemas";

/**
 * Checks only the site-wide capability floor for a Figma scope. Resource and
 * ownership policy remains the responsibility of the concrete provider route.
 */
export function hasCurrentFigmaScopeCapability(
  user: SessionUser,
  scope: FigmaOAuthScope,
): boolean {
  switch (scope) {
    case "figma:context:read":
      return (
        hasEffectiveCapability(user, "editPages") ||
        hasEffectiveCapability(user, "editCms")
      );
    case "figma:assets:write":
      return hasEffectiveCapability(user, "uploadMedia");
    case "figma:imports:write":
      return hasEffectiveCapability(user, "editPages");
  }
}
