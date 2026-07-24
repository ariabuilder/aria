import { defineAction, ActionError } from "astro:actions";
import {
  CreateUserInputSchema,
  UpdateUserInputSchema,
  DeleteUserInputSchema,
  ResetUserPasswordInputSchema,
  getAuthAdapterAsync,
  hashPassword,
  now,
  requireAdmin,
  resolveBootstrapUserId,
  assertUserDeletable,
  assertBootstrapPermissionsImmutable,
  normalizeBootstrapUser,
  assertNotLastAdministrator,
} from "../../lib/auth";
import {
  buildPermissionProfile,
  permissionProfilesEqual,
  type UserPermissionProfile,
} from "../../lib/auth/types";
import { getStorageAdapterAsync } from "../../lib/storage/getStorageAdapter";
import { z } from "astro/zod";
import { generateId } from "./_shared";

export const listUsers = defineAction({
  handler: async (_, context) => {
    await requireAdmin(context);
    const adapter = await getAuthAdapterAsync(context.locals);

    await normalizeBootstrapUser(adapter);
    const users = await adapter.listUsers();
    const bootstrapUserId = await resolveBootstrapUserId(adapter);

    return { users, bootstrapUserId };
  },
});

/**
 * Create a new user
 *
 * Admin only - creates a user with specified role.
 */

export const createUser = defineAction({
  input: CreateUserInputSchema,
  handler: async (input, context) => {
    await requireAdmin(context);
    const adapter = await getAuthAdapterAsync(context.locals);

    // Check if username already exists
    const existing = await adapter.getUserByUsername(input.username);
    if (existing) {
      throw new ActionError({
        code: "CONFLICT",
        message: "Username already exists",
      });
    }

    // Check if email already exists (if provided)
    if (input.email) {
      const existingEmail = await adapter.getUserByEmail(input.email);
      if (existingEmail) {
        throw new ActionError({
          code: "CONFLICT",
          message: "Email already in use",
        });
      }
    }

    const passwordHash = await hashPassword(input.password);
    const permissionProfile = input.permissionProfile ?? {
      rolePreset: input.role,
    };
    const user = await adapter.createUser({
      id: generateId(),
      username: input.username,
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      createdAt: now(),
      permissionProfile,
    });

    return { success: true, user };
  },
});

/**
 * Update a user
 *
 * Admin only - update user's email or role.
 * Invalidates sessions when role or permission profile changes for security.
 */

export const updateUser = defineAction({
  input: UpdateUserInputSchema,
  handler: async (input, context) => {
    const currentUser = await requireAdmin(context);
    const adapter = await getAuthAdapterAsync(context.locals);

    await normalizeBootstrapUser(adapter);

    // Get the user to update
    const targetUser = await adapter.getUserById(input.id);
    if (!targetUser) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    const existingProfile =
      targetUser.permissionProfile ?? buildPermissionProfile(targetUser.role);

    const requestedRole = input.permissionProfile?.rolePreset ?? input.role;

    // Prevent demoting yourself from admin
    if (
      input.id === currentUser.id &&
      requestedRole &&
      requestedRole !== "administrator"
    ) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Cannot demote yourself from admin",
      });
    }

    // Check email uniqueness if changing
    if (input.email !== undefined && input.email !== targetUser.email) {
      if (input.email) {
        const existingEmail = await adapter.getUserByEmail(input.email);
        if (existingEmail && existingEmail.id !== input.id) {
          throw new ActionError({
            code: "CONFLICT",
            message: "Email already in use",
          });
        }
      }
    }

    let nextRole = targetUser.role;
    let nextProfile: UserPermissionProfile = existingProfile;
    let shouldUpdateAuthFields = false;

    if (input.permissionProfile !== undefined) {
      nextProfile = input.permissionProfile;
      nextRole = input.permissionProfile.rolePreset;
      shouldUpdateAuthFields = true;
    } else if (input.role !== undefined) {
      nextRole = input.role;
      nextProfile = buildPermissionProfile(
        input.role,
        existingProfile.capabilityOverrides,
      );
      shouldUpdateAuthFields = true;
    } else if (
      targetUser.role !== existingProfile.rolePreset ||
      !permissionProfilesEqual(targetUser.permissionProfile, existingProfile)
    ) {
      nextRole = existingProfile.rolePreset;
      nextProfile = existingProfile;
      shouldUpdateAuthFields = true;
    }

    const normalizedExistingProfile =
      targetUser.permissionProfile ?? buildPermissionProfile(targetUser.role);
    const authChanged =
      shouldUpdateAuthFields &&
      (nextRole !== targetUser.role ||
        !permissionProfilesEqual(normalizedExistingProfile, nextProfile));

    if (shouldUpdateAuthFields) {
      await assertBootstrapPermissionsImmutable(adapter, input.id, nextProfile);
    }

    const updated = await adapter.updateUser(input.id, {
      name: input.name,
      email: input.email,
      avatarUrl: input.avatarUrl,
      ...(shouldUpdateAuthFields
        ? {
            role: nextRole,
            permissionProfile: nextProfile,
          }
        : {}),
    });

    if (authChanged) {
      await adapter.deleteUserSessions(input.id);
    }

    return { success: true, user: updated, sessionInvalidated: authChanged };
  },
});

/**
 * Delete a user
 *
 * Admin only - permanently delete a user.
 */

export const deleteUser = defineAction({
  input: DeleteUserInputSchema,
  handler: async (input, context) => {
    const currentUser = await requireAdmin(context);
    const adapter = await getAuthAdapterAsync(context.locals);

    if (input.id === currentUser.id) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Cannot delete your own account",
      });
    }

    const targetUser = await adapter.getUserById(input.id);
    if (!targetUser) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    await assertUserDeletable(adapter, input.id);
    await assertNotLastAdministrator(adapter, input.id);

    // Remove the account identifier from public UGC before deleting the auth
    // record. The comment itself remains as a minimal moderation tombstone.
    const storageAdapter = await getStorageAdapterAsync(context.locals);
    await storageAdapter.anonymizePublicCommentsForDeletedAuthor(input.id);

    // Delete user (also deletes sessions)
    await adapter.deleteUser(input.id);

    return { success: true };
  },
});

/**
 * Reset a user's password (admin override)
 *
 * Admin only - set a new password without knowing the old one.
 */

export const resetUserPassword = defineAction({
  input: ResetUserPasswordInputSchema,
  handler: async (input, context) => {
    await requireAdmin(context);
    const adapter = await getAuthAdapterAsync(context.locals);

    const targetUser = await adapter.getUserById(input.userId);
    if (!targetUser) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    const passwordHash = await hashPassword(input.newPassword);
    await adapter.updateUser(input.userId, { passwordHash });

    // Invalidate all sessions for that user
    await adapter.deleteUserSessions(input.userId);

    return { success: true, message: "Password reset successfully" };
  },
});

/**
 * Update CAPTCHA configuration
 *
 * Admin only - configure CAPTCHA provider and keys.
 */

const UploadAvatarInputSchema = z.object({
  userId: z.string(),
  file: z.instanceof(File),
});

const RemoveAvatarInputSchema = z.object({
  userId: z.string(),
});

/**
 * Upload a user avatar image.
 * Stored under user-avatars/ namespace (hidden from media library).
 */
export const uploadAvatar = defineAction({
  input: UploadAvatarInputSchema,
  handler: async ({ userId, file }, context) => {
    await requireAdmin(context);
    const storageAdapter = await getStorageAdapterAsync(context.locals);
    const adapter = await getAuthAdapterAsync(context.locals);

    const user = await adapter.getUserById(userId);
    if (!user)
      throw new ActionError({ code: "NOT_FOUND", message: "User not found" });

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    if (!["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: `Unsupported image type: .${ext}`,
      });
    }
    if (file.size > 2 * 1024 * 1024) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Avatar must be under 2MB",
      });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const path = `user-avatars/${userId}.${ext}`;
    await storageAdapter.saveMedia(path, buffer, {
      contentType: file.type || `image/${ext}`,
    });
    const avatarUrl = `/uploads/${path}`;
    await adapter.updateUser(userId, { avatarUrl });
    return { success: true, avatarUrl };
  },
});

export const removeAvatar = defineAction({
  input: RemoveAvatarInputSchema,
  handler: async ({ userId }, context) => {
    await requireAdmin(context);
    const storageAdapter = await getStorageAdapterAsync(context.locals);
    const adapter = await getAuthAdapterAsync(context.locals);

    const user = await adapter.getUserById(userId);
    if (!user)
      throw new ActionError({ code: "NOT_FOUND", message: "User not found" });

    for (const ext of ["jpg", "jpeg", "png", "webp", "gif"]) {
      try {
        await storageAdapter.deleteMedia(`user-avatars/${userId}.${ext}`);
      } catch {
        /* ok */
      }
    }
    await adapter.updateUser(userId, { avatarUrl: null });
    return { success: true };
  },
});
