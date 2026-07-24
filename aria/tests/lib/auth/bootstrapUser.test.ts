import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionError } from "astro:actions";
import type { AuthAdapter } from "../../../lib/auth/adapter";
import {
  BOOTSTRAP_USER_CONFIG_KEY,
  assertBootstrapPermissionsImmutable,
  assertNotLastAdministrator,
  assertUserDeletable,
  canDeleteUserInSettings,
  getBootstrapAdministratorProfile,
  isBootstrapAdministratorProfile,
  normalizeBootstrapUser,
  resolveBootstrapUserId,
} from "../../../lib/auth/bootstrapUser";
import { buildPermissionProfile, type User } from "../../../lib/auth/types";

const BOOTSTRAP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";
const OLDER_ID = "bbbbbbbb-bbbb-4ccc-8ddd-222222222222";
const NEWER_ID = "cccccccc-bbbb-4ccc-8ddd-333333333333";

type UpdateUserData = Parameters<AuthAdapter["updateUser"]>[1];

interface BootstrapTestAdapter
  extends Pick<
    AuthAdapter,
    | "getConfig"
    | "getOldestUserId"
    | "getUserById"
    | "listUsers"
    | "setConfig"
    | "updateUser"
  > {
  setConfigCalls: Array<{ key: string; value: unknown }>;
  updateUserCalls: Array<{ id: string; data: UpdateUserData }>;
}

function createUser(overrides: Partial<User> & Pick<User, "id">): User {
  return {
    id: overrides.id,
    username: overrides.username ?? "user",
    email: overrides.email ?? "user@example.com",
    role: overrides.role ?? "contributor",
    permissionProfile: overrides.permissionProfile,
    totpEnabled: false,
    lastLoginAt: null,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    avatarUrl: null,
  };
}

function createMockAdapter(
  state: {
    config: Record<string, unknown>;
    users: User[];
    oldestId: string | null;
  },
): BootstrapTestAdapter {
  const usersById = () => new Map(state.users.map((user) => [user.id, user]));
  const setConfigCalls: BootstrapTestAdapter["setConfigCalls"] = [];
  const updateUserCalls: BootstrapTestAdapter["updateUserCalls"] = [];

  return {
    getConfig: async <T,>(key: string): Promise<T | null> => {
      const value = state.config[key];
      return value === undefined ? null : (value as T);
    },
    setConfig: async <T,>(key: string, value: T): Promise<void> => {
      setConfigCalls.push({ key, value });
      state.config[key] = value;
    },
    getUserById: vi.fn(async (id: string) => usersById().get(id) ?? null),
    getOldestUserId: vi.fn(async () => state.oldestId),
    listUsers: vi.fn(async () => [...state.users]),
    updateUser: vi.fn(async (id: string, data) => {
      const user = usersById().get(id);
      if (!user) {
        throw new Error("User not found");
      }
      const updated: User = {
        ...user,
        ...data,
        permissionProfile:
          data.permissionProfile === undefined
            ? user.permissionProfile
            : data.permissionProfile ?? undefined,
      };
      state.users = state.users.map((entry) =>
        entry.id === id ? updated : entry,
      );
      updateUserCalls.push({ id, data });
      return updated;
    }),
    setConfigCalls,
    updateUserCalls,
  };
}

describe("bootstrapUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns config value when present and user exists", async () => {
    const state = {
      config: { [BOOTSTRAP_USER_CONFIG_KEY]: BOOTSTRAP_ID },
      users: [createUser({ id: BOOTSTRAP_ID, role: "administrator" })],
      oldestId: BOOTSTRAP_ID,
    };
    const adapter = createMockAdapter(state);

    await expect(resolveBootstrapUserId(adapter)).resolves.toBe(BOOTSTRAP_ID);
    expect(adapter.setConfigCalls).toEqual([]);
  });

  it("falls back to oldest user and backfills config when config is missing", async () => {
    const state = {
      config: {},
      users: [createUser({ id: OLDER_ID, createdAt: "2026-01-01T00:00:00.000Z" })],
      oldestId: OLDER_ID,
    };
    const adapter = createMockAdapter(state);

    await expect(resolveBootstrapUserId(adapter)).resolves.toBe(OLDER_ID);
    expect(adapter.setConfigCalls).toEqual([
      { key: BOOTSTRAP_USER_CONFIG_KEY, value: OLDER_ID },
    ]);
  });

  it("ignores stale config when user id no longer exists", async () => {
    const state = {
      config: { [BOOTSTRAP_USER_CONFIG_KEY]: BOOTSTRAP_ID },
      users: [createUser({ id: OLDER_ID })],
      oldestId: OLDER_ID,
    };
    const adapter = createMockAdapter(state);

    await expect(resolveBootstrapUserId(adapter)).resolves.toBe(OLDER_ID);
    expect(adapter.setConfigCalls).toEqual([
      { key: BOOTSTRAP_USER_CONFIG_KEY, value: OLDER_ID },
    ]);
  });

  it("assertUserDeletable rejects bootstrap user id", async () => {
    const state = {
      config: { [BOOTSTRAP_USER_CONFIG_KEY]: BOOTSTRAP_ID },
      users: [createUser({ id: BOOTSTRAP_ID, role: "administrator" })],
      oldestId: BOOTSTRAP_ID,
    };
    const adapter = createMockAdapter(state);

    await expect(assertUserDeletable(adapter, BOOTSTRAP_ID)).rejects.toThrow(
      ActionError,
    );
  });

  it("assertBootstrapPermissionsImmutable rejects non-default administrator profile", async () => {
    const state = {
      config: { [BOOTSTRAP_USER_CONFIG_KEY]: BOOTSTRAP_ID },
      users: [createUser({ id: BOOTSTRAP_ID, role: "administrator" })],
      oldestId: BOOTSTRAP_ID,
    };
    const adapter = createMockAdapter(state);

    await expect(
      assertBootstrapPermissionsImmutable(
        adapter,
        BOOTSTRAP_ID,
        buildPermissionProfile("manager"),
      ),
    ).rejects.toThrow(ActionError);
  });

  it("isBootstrapAdministratorProfile accepts canonical administrator profile", () => {
    expect(
      isBootstrapAdministratorProfile(getBootstrapAdministratorProfile()),
    ).toBe(true);
    expect(
      isBootstrapAdministratorProfile(
        buildPermissionProfile("administrator", {
          deny: ["manageSecurity"],
        }),
      ),
    ).toBe(false);
  });

  it("normalizeBootstrapUser repairs role and permission profile", async () => {
    const state = {
      config: { [BOOTSTRAP_USER_CONFIG_KEY]: BOOTSTRAP_ID },
      users: [
        createUser({
          id: BOOTSTRAP_ID,
          role: "administrator",
          permissionProfile: buildPermissionProfile("administrator", {
            deny: ["manageSecurity"],
          }),
        }),
      ],
      oldestId: BOOTSTRAP_ID,
    };
    const adapter = createMockAdapter(state);

    await normalizeBootstrapUser(adapter);

    expect(adapter.updateUserCalls).toEqual([
      {
        id: BOOTSTRAP_ID,
        data: {
          role: "administrator",
          permissionProfile: getBootstrapAdministratorProfile(),
        },
      },
    ]);
  });

  describe("canDeleteUserInSettings", () => {
    const bootstrapAdmin = createUser({
      id: BOOTSTRAP_ID,
      role: "administrator",
      permissionProfile: getBootstrapAdministratorProfile(),
    });

    it("returns false for the bootstrap administrator", () => {
      expect(
        canDeleteUserInSettings(
          bootstrapAdmin,
          [bootstrapAdmin, createUser({ id: NEWER_ID, role: "administrator" })],
          BOOTSTRAP_ID,
        ),
      ).toBe(false);
    });

    it("returns false for the sole resolved administrator", () => {
      expect(
        canDeleteUserInSettings(
          bootstrapAdmin,
          [bootstrapAdmin, createUser({ id: NEWER_ID, role: "contributor" })],
          null,
        ),
      ).toBe(false);
    });

    it("returns true for a non-bootstrap user when multiple administrators exist", () => {
      const secondAdmin = createUser({
        id: NEWER_ID,
        role: "administrator",
        permissionProfile: getBootstrapAdministratorProfile(),
      });

      expect(
        canDeleteUserInSettings(secondAdmin, [bootstrapAdmin, secondAdmin], BOOTSTRAP_ID),
      ).toBe(true);
    });

    it("returns true for a non-administrator contributor", () => {
      const contributor = createUser({ id: NEWER_ID, role: "contributor" });

      expect(
        canDeleteUserInSettings(contributor, [bootstrapAdmin, contributor], BOOTSTRAP_ID),
      ).toBe(true);
    });
  });

  it("assertNotLastAdministrator rejects deleting the only administrator", async () => {
    const state = {
      config: { [BOOTSTRAP_USER_CONFIG_KEY]: BOOTSTRAP_ID },
      users: [
        createUser({
          id: BOOTSTRAP_ID,
          role: "administrator",
          permissionProfile: getBootstrapAdministratorProfile(),
        }),
        createUser({ id: NEWER_ID, role: "contributor" }),
      ],
      oldestId: BOOTSTRAP_ID,
    };
    const adapter = createMockAdapter(state);

    await expect(
      assertNotLastAdministrator(adapter, BOOTSTRAP_ID),
    ).rejects.toThrow(ActionError);
  });
});
