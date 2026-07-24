import { resolveUserPermissionProfile } from "../authorship/permissionProfile";
import {
  resolveEffectiveCapabilities,
  type Capability,
  type SessionUser,
} from "./types";

export function hasEffectiveCapability(
  user: SessionUser,
  capability: Capability,
): boolean {
  const effective = resolveEffectiveCapabilities(
    resolveUserPermissionProfile(user),
  );
  return effective.includes(capability);
}
