/**
 * Client-safe permission profile helpers (no storage/media imports).
 */

import {
  buildPermissionProfile,
  type RolePreset,
  type SessionUser,
  type UserPermissionProfile,
} from "../auth/types";

export function rolePresetFromUserRole(role: RolePreset): RolePreset {
  return role;
}

export function resolveUserPermissionProfile(
  user: SessionUser,
): UserPermissionProfile {
  const rolePreset = rolePresetFromUserRole(user.role);

  if (!user.permissionProfile) {
    return buildPermissionProfile(rolePreset);
  }

  // Session `role` is the source of truth for preset defaults. Stale or
  // mismatched stored profiles must not hide capabilities the role still grants
  // (e.g. UI shows Administrator while profile.rolePreset is still manager).
  if (user.permissionProfile.rolePreset !== rolePreset) {
    return buildPermissionProfile(
      rolePreset,
      user.permissionProfile.capabilityOverrides,
    );
  }

  return user.permissionProfile;
}
