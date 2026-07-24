import { describe, expect, it, vi } from "vitest";

const loggerMock = vi.fn();

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

describe("authSettingsActionResults", () => {
  it("rejects malformed current user payloads", async () => {
    const { unwrapAuthCurrentUserResult } =
      await import("../../admin/features/Auth/composables/authSettingsActionResults");

    const result = unwrapAuthCurrentUserResult(
      {
        data: {
          user: {
            id: "not-a-uuid",
            username: "andy",
            email: "andy@example.com",
            role: "admin",
            totpEnabled: false,
            lastLoginAt: null,
            createdAt: "2026-03-27T10:00:00.000Z",
          },
        },
        error: null,
      },
      { source: "SecurityView.loadCurrentUser" },
    );

    expect(result).toEqual({
      success: false,
      error: "Failed to load current user",
    });
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[AuthSettings] Invalid getMe response",
      expect.objectContaining({
        source: "SecurityView.loadCurrentUser",
        issues: expect.any(Array),
      }),
    );
  });

  it("unwraps listUsers payloads with bootstrapUserId", async () => {
    const { unwrapAuthUsersListResult } =
      await import("../../admin/features/Auth/composables/authSettingsActionResults");

    const bootstrapUserId = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";

    const result = unwrapAuthUsersListResult(
      {
        data: {
          users: [
            {
              id: bootstrapUserId,
              username: "admin",
              email: "admin@example.com",
              role: "administrator",
              totpEnabled: false,
              lastLoginAt: null,
              createdAt: "2026-03-27T10:00:00.000Z",
            },
          ],
          bootstrapUserId,
        },
        error: null,
      },
      { source: "UsersView.loadUsers" },
    );

    expect(result).toEqual({
      success: true,
      data: {
        users: [
          expect.objectContaining({
            id: bootstrapUserId,
            role: "administrator",
          }),
        ],
        bootstrapUserId,
      },
    });
  });

  it("rejects malformed initTotp payloads", async () => {
    const { unwrapAuthTotpSetupResult } =
      await import("../../admin/features/Auth/composables/authSettingsActionResults");

    const result = unwrapAuthTotpSetupResult(
      {
        data: {
          secret: 42,
        },
        error: null,
      },
      { source: "SecurityView.startTotpSetup" },
    );

    expect(result).toEqual({
      success: false,
      error: "Failed to start 2FA setup",
    });
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[AuthSettings] Invalid initTotp response",
      expect.objectContaining({
        source: "SecurityView.startTotpSetup",
        issues: expect.any(Array),
      }),
    );
  });

  it("rejects malformed users list payloads", async () => {
    const { unwrapAuthUsersListResult } =
      await import("../../admin/features/Auth/composables/authSettingsActionResults");

    const result = unwrapAuthUsersListResult(
      {
        data: {
          users: [
            {
              id: "123",
              username: "editor_a",
              email: "editor@example.com",
              role: "editor",
              totpEnabled: false,
              lastLoginAt: null,
              createdAt: "2026-03-27T10:00:00.000Z",
            },
          ],
        },
        error: null,
      },
      { source: "UsersView.loadUsers" },
    );

    expect(result).toEqual({
      success: false,
      error: "Failed to load users",
    });
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[AuthSettings] Invalid listUsers response",
      expect.objectContaining({
        source: "UsersView.loadUsers",
        issues: expect.any(Array),
      }),
    );
  });
});
