import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionError } from "astro:actions";
import type { AuthAdapter } from "../../lib/auth/adapter";
import { getBootstrapAdministratorProfile } from "../../lib/auth/bootstrapUser";
import type { User } from "../../lib/auth/types";

const BOOTSTRAP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";
const OTHER_ADMIN_ID = "bbbbbbbb-bbbb-4ccc-8ddd-222222222222";
const CONTRIBUTOR_ID = "cccccccc-bbbb-4ccc-8ddd-333333333333";

const getAuthAdapterAsyncMock = vi.fn<() => Promise<AuthAdapter>>();
const requireAdminMock = vi.fn();
const countUsersMock = vi.fn();
const setConfigMock = vi.fn();

vi.mock("../../lib/auth/getAuthAdapter", () => ({
  getAuthAdapterAsync: () => getAuthAdapterAsyncMock(),
}));

vi.mock("../../lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/auth")>();
  return {
    ...actual,
    requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
    hashPassword: vi.fn(async () => "hash"),
    setSessionCookie: vi.fn(),
    clearSessionCookie: vi.fn(),
    getClientIp: vi.fn(() => "127.0.0.1"),
    now: vi.fn(() => "2026-05-26T12:00:00.000Z"),
  };
});

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

function createAdapter(state: {
  users: User[];
  config: Record<string, unknown>;
}): AuthAdapter {
  const users = [...state.users];

  return {
    countUsers: countUsersMock,
    getConfig: vi.fn(async (key: string) => state.config[key] ?? null),
    setConfig: setConfigMock.mockImplementation(
      async (key: string, value: unknown) => {
        state.config[key] = value;
      },
    ),
    getUserById: vi.fn(
      async (id: string) => users.find((u) => u.id === id) ?? null,
    ),
    getUserByEmail: vi.fn(
      async (email: string) => users.find((u) => u.email === email) ?? null,
    ),
    getOldestUserId: vi.fn(async () => users[0]?.id ?? null),
    listUsers: vi.fn(async () => users),
    createUser: vi.fn(async (data) => {
      const created = createUser({
        id: data.id,
        username: data.username,
        email: data.email,
        role: data.role,
        permissionProfile: data.permissionProfile,
        createdAt: data.createdAt,
      });
      users.push(created);
      return created;
    }),
    createFirstUser: vi.fn(async (data) => {
      if (users.length > 0) return null;
      const created = createUser({
        id: data.id,
        username: data.username,
        email: data.email,
        role: data.role,
        permissionProfile: data.permissionProfile,
        createdAt: data.createdAt,
      });
      users.push(created);
      return created;
    }),
    updateUser: vi.fn(async (id, data) => {
      const index = users.findIndex((user) => user.id === id);
      if (index < 0) {
        throw new Error("User not found");
      }
      users[index] = {
        ...users[index],
        ...data,
        permissionProfile:
          data.permissionProfile === undefined
            ? users[index].permissionProfile
            : (data.permissionProfile ?? undefined),
      };
      return users[index];
    }),
    deleteUser: vi.fn(async (id: string) => {
      const index = users.findIndex((user) => user.id === id);
      if (index >= 0) {
        users.splice(index, 1);
      }
    }),
    createSession: vi.fn(),
    clearRateLimit: vi.fn(),
    checkRateLimit: vi.fn(async () => ({
      isLimited: false,
      isLockedOut: false,
    })),
    recordLoginAttempt: vi.fn(),
  } as unknown as AuthAdapter;
}

describe("auth bootstrap user actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({
      id: OTHER_ADMIN_ID,
      username: "other-admin",
      email: "other@example.com",
      role: "administrator",
      totpEnabled: false,
    });
  });

  it("createFirstAdmin writes bootstrap_user_id config and canonical permissionProfile", async () => {
    const state = {
      users: [] as User[],
      config: {} as Record<string, unknown>,
    };
    const adapter = createAdapter(state);
    adapter.getConfig = vi.fn(async (key: string) => {
      if (key === "auth_methods_config") {
        return {
          passkey: { enabled: false, rpName: "Aria", allowedOrigins: [] },
          magicLink: { enabled: false, expiryMinutes: 15 },
          password: { enabled: true, recoveryOnly: true },
          oauth: {},
          cloudflareAccess: { enabled: false },
        };
      }
      return state.config[key] ?? null;
    }) as AuthAdapter["getConfig"];
    countUsersMock.mockResolvedValue(0);
    getAuthAdapterAsyncMock.mockResolvedValue(adapter);

    const { createFirstAdmin } = await import("../../actions/auth/index");

    await (
      createFirstAdmin as unknown as {
        handler: (...args: unknown[]) => Promise<unknown>;
      }
    ).handler(
      {
        username: "bootstrap",
        email: "bootstrap@example.com",
        password: "password1",
        confirmPassword: "password1",
      },
      {
        request: new Request("http://localhost"),
        cookies: { set: vi.fn() },
        locals: {},
      },
    );

    expect(setConfigMock).toHaveBeenCalledWith(
      "bootstrap_user_id",
      expect.any(String),
    );
    expect(adapter.createFirstUser).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "administrator",
        permissionProfile: getBootstrapAdministratorProfile(),
      }),
    );
  });

  it("deleteUser rejects bootstrap user", async () => {
    const state = {
      users: [
        createUser({
          id: BOOTSTRAP_ID,
          role: "administrator",
          permissionProfile: getBootstrapAdministratorProfile(),
        }),
        createUser({ id: OTHER_ADMIN_ID, role: "administrator" }),
      ],
      config: { bootstrap_user_id: BOOTSTRAP_ID },
    };
    getAuthAdapterAsyncMock.mockResolvedValue(createAdapter(state));

    const { deleteUser } = await import("../../actions/auth/index");

    await expect(
      (
        deleteUser as unknown as {
          handler: (...args: unknown[]) => Promise<unknown>;
        }
      ).handler({ id: BOOTSTRAP_ID }, { locals: {} }),
    ).rejects.toThrow(ActionError);
  });

  it("updateUser rejects bootstrap permission changes", async () => {
    const state = {
      users: [
        createUser({
          id: BOOTSTRAP_ID,
          role: "administrator",
          permissionProfile: getBootstrapAdministratorProfile(),
        }),
      ],
      config: { bootstrap_user_id: BOOTSTRAP_ID },
    };
    getAuthAdapterAsyncMock.mockResolvedValue(createAdapter(state));

    const { updateUser } = await import("../../actions/auth/index");

    await expect(
      (
        updateUser as unknown as {
          handler: (...args: unknown[]) => Promise<unknown>;
        }
      ).handler(
        {
          id: BOOTSTRAP_ID,
          role: "manager",
        },
        { locals: {} },
      ),
    ).rejects.toThrow(ActionError);
  });

  it("updateUser allows email-only updates for bootstrap user", async () => {
    const state = {
      users: [
        createUser({
          id: BOOTSTRAP_ID,
          role: "administrator",
          permissionProfile: getBootstrapAdministratorProfile(),
          email: "old@example.com",
        }),
      ],
      config: { bootstrap_user_id: BOOTSTRAP_ID },
    };
    const adapter = createAdapter(state);
    getAuthAdapterAsyncMock.mockResolvedValue(adapter);

    const { updateUser } = await import("../../actions/auth/index");

    const result = await (
      updateUser as unknown as {
        handler: (...args: unknown[]) => Promise<{
          success: boolean;
          user: User;
        }>;
      }
    ).handler(
      {
        id: BOOTSTRAP_ID,
        email: "new@example.com",
      },
      { locals: {} },
    );

    expect(result.success).toBe(true);
    expect(result.user.email).toBe("new@example.com");
    expect(result.user.role).toBe("administrator");
    expect(result.user.permissionProfile).toEqual(
      getBootstrapAdministratorProfile(),
    );
  });

  it("deleteUser rejects deleting the last resolved administrator", async () => {
    const state = {
      users: [
        createUser({
          id: BOOTSTRAP_ID,
          role: "administrator",
          permissionProfile: getBootstrapAdministratorProfile(),
        }),
        createUser({ id: CONTRIBUTOR_ID, role: "contributor" }),
      ],
      config: { bootstrap_user_id: BOOTSTRAP_ID },
    };
    getAuthAdapterAsyncMock.mockResolvedValue(createAdapter(state));

    const { deleteUser } = await import("../../actions/auth/index");

    await expect(
      (
        deleteUser as unknown as {
          handler: (...args: unknown[]) => Promise<unknown>;
        }
      ).handler({ id: BOOTSTRAP_ID }, { locals: {} }),
    ).rejects.toThrow(ActionError);
  });
});
