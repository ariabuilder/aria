/**
 * Bootstrap (original) administrator identity and immutability guards.
 */

import { ActionError } from "astro:actions";
import { resolveUserPermissionProfile } from "../authorship/permissionProfile";
import type { AuthAdapter } from "./adapter";
import {
  BootstrapUserIdSchema,
  buildPermissionProfile,
  permissionProfilesEqual,
  type User,
  type UserPermissionProfile,
} from "./types";

export const BOOTSTRAP_USER_CONFIG_KEY = "bootstrap_user_id";

const CANONICAL_BOOTSTRAP_PROFILE: UserPermissionProfile =
  buildPermissionProfile("administrator");

type BootstrapConfigAdapter = Pick<
  AuthAdapter,
  "getConfig" | "getOldestUserId" | "getUserById" | "setConfig"
>;

type BootstrapNormalizeAdapter = BootstrapConfigAdapter &
  Pick<AuthAdapter, "updateUser">;

type BootstrapListUsersAdapter = Pick<AuthAdapter, "listUsers">;

export function getBootstrapAdministratorProfile(): UserPermissionProfile {
  return buildPermissionProfile("administrator");
}

export function isBootstrapAdministratorProfile(
  profile: UserPermissionProfile,
): boolean {
  return permissionProfilesEqual(profile, CANONICAL_BOOTSTRAP_PROFILE);
}

async function parseBootstrapConfigValue(
  adapter: Pick<AuthAdapter, "getConfig">,
): Promise<string | null> {
  const raw = await adapter.getConfig<unknown>(BOOTSTRAP_USER_CONFIG_KEY);
  if (raw === null || raw === undefined) {
    return null;
  }

  const parsed = BootstrapUserIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function resolveBootstrapUserId(
  adapter: BootstrapConfigAdapter,
): Promise<string | null> {
  const fromConfig = await parseBootstrapConfigValue(adapter);

  if (fromConfig) {
    const user = await adapter.getUserById(fromConfig);
    if (user) {
      return fromConfig;
    }
  }

  const oldestId = await adapter.getOldestUserId();
  if (!oldestId) {
    return null;
  }

  await adapter.setConfig(BOOTSTRAP_USER_CONFIG_KEY, oldestId);
  return oldestId;
}

export async function isBootstrapUser(
  adapter: BootstrapConfigAdapter,
  userId: string,
): Promise<boolean> {
  const bootstrapId = await resolveBootstrapUserId(adapter);
  return bootstrapId !== null && bootstrapId === userId;
}

export async function assertUserDeletable(
  adapter: BootstrapConfigAdapter,
  userId: string,
): Promise<void> {
  if (await isBootstrapUser(adapter, userId)) {
    throw new ActionError({
      code: "BAD_REQUEST",
      message: "Cannot delete the original administrator account",
    });
  }
}

export async function assertBootstrapPermissionsImmutable(
  adapter: BootstrapConfigAdapter,
  userId: string,
  nextProfile: UserPermissionProfile,
): Promise<void> {
  if (!(await isBootstrapUser(adapter, userId))) {
    return;
  }

  if (!isBootstrapAdministratorProfile(nextProfile)) {
    throw new ActionError({
      code: "BAD_REQUEST",
      message:
        "Cannot change permissions for the original administrator account",
    });
  }
}

export async function normalizeBootstrapUser(
  adapter: BootstrapNormalizeAdapter,
): Promise<void> {
  const bootstrapId = await resolveBootstrapUserId(adapter);
  if (!bootstrapId) {
    return;
  }

  const user = await adapter.getUserById(bootstrapId);
  if (!user) {
    return;
  }

  const canonicalProfile = getBootstrapAdministratorProfile();
  const storedProfile =
    user.permissionProfile ?? buildPermissionProfile(user.role);

  const needsRoleFix = user.role !== "administrator";
  const needsProfileFix = !permissionProfilesEqual(
    storedProfile,
    canonicalProfile,
  );

  if (needsRoleFix || needsProfileFix) {
    await adapter.updateUser(bootstrapId, {
      role: "administrator",
      permissionProfile: canonicalProfile,
    });
  }
}

export function countResolvedAdministrators(users: User[]): number {
  return users.filter(
    (user) =>
      resolveUserPermissionProfile(user).rolePreset === "administrator",
  ).length;
}

/**
 * Whether the Users settings UI may offer delete for a target user.
 * Mirrors server guards in deleteUser (bootstrap + last administrator).
 */
export function canDeleteUserInSettings(
  user: User,
  users: User[],
  bootstrapUserId: string | null,
): boolean {
  if (bootstrapUserId !== null && user.id === bootstrapUserId) {
    return false;
  }

  if (
    resolveUserPermissionProfile(user).rolePreset === "administrator" &&
    countResolvedAdministrators(users) <= 1
  ) {
    return false;
  }

  return true;
}

export async function assertNotLastAdministrator(
  adapter: BootstrapListUsersAdapter,
  targetUserId: string,
): Promise<void> {
  const users = await adapter.listUsers();
  const target = users.find((user) => user.id === targetUserId);
  if (!target) {
    return;
  }

  if (resolveUserPermissionProfile(target).rolePreset !== "administrator") {
    return;
  }

  if (countResolvedAdministrators(users) <= 1) {
    throw new ActionError({
      code: "BAD_REQUEST",
      message: "Cannot delete the last administrator account",
    });
  }
}
