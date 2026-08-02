import { beforeEach, describe, expect, it, vi } from "vitest";
import { getActionHandler } from "../helpers/actionHandler";

const getUserByIdMock = vi.fn();
const updateUserMock = vi.fn();

vi.mock("astro:actions", () => ({
  ActionError: class MockActionError extends Error {
    code: string;
    constructor(input: { code: string; message: string }) {
      super(input.message);
      this.code = input.code;
    }
  },
  defineAction: (config: { handler: (...args: unknown[]) => unknown }) =>
    config,
}));

vi.mock("../../lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/auth")>();
  return {
    ...actual,
    requireAuth: vi.fn(async () => ({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      username: "admin",
      email: "admin@example.com",
      role: "administrator",
      totpEnabled: false,
    })),
    getAuthAdapterAsync: vi.fn(async () => ({
      getUserById: getUserByIdMock,
      updateUser: updateUserMock,
    })),
  };
});

import { updatePreferences, getMe } from "../../actions/auth/index";

describe("auth preferences actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updatePreferences merges appearance for authenticated user", async () => {
    getUserByIdMock.mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      username: "admin",
      email: "admin@example.com",
      role: "administrator",
      totpEnabled: false,
      lastLoginAt: null,
      createdAt: "2024-01-01T00:00:00.000Z",
      preferences: {},
    });

    updateUserMock.mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      username: "admin",
      email: "admin@example.com",
      role: "administrator",
      totpEnabled: false,
      lastLoginAt: null,
      createdAt: "2024-01-01T00:00:00.000Z",
      preferences: {
        appearance: {
          themeId: "astro",
          colorScheme: "light",
          fontFamily: "Outfit",
          uiZoom: 1,
        },
      },
    });

    const result = await getActionHandler(updatePreferences)(
      {
        appearance: {
          themeId: "astro",
          colorScheme: "light",
          fontFamily: "Outfit",
          uiZoom: 1,
        },
      },
      { locals: {} },
    );

    expect(updateUserMock).toHaveBeenCalledWith(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      expect.objectContaining({
        preferences: expect.stringContaining('"themeId":"astro"'),
      }),
    );
    expect(result.preferences?.appearance?.themeId).toBe("astro");
  });

  it("updatePreferences rejects invalid appearance", async () => {
    getUserByIdMock.mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      username: "admin",
      email: "admin@example.com",
      role: "administrator",
      totpEnabled: false,
      lastLoginAt: null,
      createdAt: "2024-01-01T00:00:00.000Z",
    });

    await expect(
      getActionHandler(updatePreferences)(
        {
          appearance: {
            themeId: "invalid" as unknown as "cloudflare",
            colorScheme: "light",
            fontFamily: "Outfit",
            uiZoom: 1,
          },
        },
        { locals: {} },
      ),
    ).rejects.toThrow();
  });

  it("getMe returns parsed preferences from adapter", async () => {
    getUserByIdMock.mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      username: "admin",
      email: "admin@example.com",
      role: "administrator",
      totpEnabled: false,
      lastLoginAt: null,
      createdAt: "2024-01-01T00:00:00.000Z",
      preferences: {
        appearance: {
          themeId: "astro",
          colorScheme: "dark",
          fontFamily: "Inter",
          uiZoom: 1.1,
        },
      },
    });

    const result = await getActionHandler(getMe)(undefined, { locals: {} });
    expect(result.user.preferences?.appearance?.themeId).toBe("astro");
  });
});
