import { beforeEach, describe, expect, it, vi } from "vitest";

const loggerMock = vi.fn();
const authActions = vi.hoisted(() => ({
  checkSetupRequired: vi.fn(),
  getAuthMethodAvailability: vi.fn(),
  getLoginCaptchaConfig: vi.fn(),
  createFirstAdmin: vi.fn(),
  beginPasskeySetup: vi.fn(),
  completePasskeySetup: vi.fn(),
  passkeyLoginOptions: vi.fn(),
  passkeyLoginVerify: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  getMe: vi.fn(),
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: { auth: authActions },
}));

vi.mock("@/lib/utils/logger", () => ({
  log: (...args: unknown[]) => loggerMock(...args),
}));

const user = {
  id: "de008119-35c5-42a3-ad66-6e6b620838dc",
  username: "admin",
  email: "admin@example.com",
  role: "administrator",
  totpEnabled: false,
  preferences: {},
};

describe("useAuthApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the generated checkSetupRequired action and validates its result", async () => {
    authActions.checkSetupRequired.mockResolvedValue({
      data: { setupRequired: true },
      error: undefined,
    });
    const { checkSetupRequired } =
      await import("../../../admin/features/Auth/composables/useAuthApi");

    await expect(checkSetupRequired()).resolves.toBe(true);
    expect(authActions.checkSetupRequired).toHaveBeenCalledWith({});
  });

  it("uses the generated action client for password login", async () => {
    authActions.login.mockResolvedValue({
      data: { status: "success", user },
      error: undefined,
    });
    const { loginUser } =
      await import("../../../admin/features/Auth/composables/useAuthApi");

    await expect(
      loginUser({
        identifier: "admin@example.com",
        password: "StrongPass123!",
        rememberMe: false,
      }),
    ).resolves.toMatchObject({ data: { status: "success", user } });
    expect(authActions.login).toHaveBeenCalledWith({
      identifier: "admin@example.com",
      password: "StrongPass123!",
      rememberMe: false,
      captchaToken: undefined,
      totpCode: undefined,
    });
  });

  it("maps action errors without issuing a raw HTTP mutation", async () => {
    authActions.login.mockResolvedValue({
      data: undefined,
      error: { message: "Invalid credentials" },
    });
    const { loginUser } =
      await import("../../../admin/features/Auth/composables/useAuthApi");

    await expect(
      loginUser({
        identifier: "admin@example.com",
        password: "wrong-password",
        rememberMe: false,
      }),
    ).resolves.toEqual({ error: "Invalid credentials" });
  });

  it("validates password-reset input before invoking the action", async () => {
    const { requestPasswordReset } =
      await import("../../../admin/features/Auth/composables/useAuthApi");

    await expect(
      requestPasswordReset({ email: "not-an-email" }),
    ).resolves.toEqual({ error: "A valid email address is required" });
    expect(authActions.requestPasswordReset).not.toHaveBeenCalled();
  });

  it("validates a current-user response returned by the generated action", async () => {
    authActions.getMe.mockResolvedValue({
      data: {
        user: {
          ...user,
          totpEnabled: true,
          preferences: {
            appearance: {
              themeMode: "astro",
              uiZoom: "100",
              primaryColor: "#112233",
            },
          },
        },
      },
      error: undefined,
    });
    const { getCurrentUser } =
      await import("../../../admin/features/Auth/composables/useAuthApi");

    await expect(getCurrentUser()).resolves.toMatchObject({
      data: {
        username: "admin",
        preferences: {
          appearance: { themeId: "astro", colorScheme: "dark", uiZoom: 1 },
        },
      },
    });
    expect(authActions.getMe).toHaveBeenCalledWith({});
  });

  it("distinguishes a confirmed expired session from a transport failure", async () => {
    const { getCurrentUser } =
      await import("../../../admin/features/Auth/composables/useAuthApi");

    authActions.getMe.mockResolvedValueOnce({
      data: undefined,
      error: { code: "UNAUTHORIZED", message: "Session expired or invalid" },
    });
    await expect(getCurrentUser()).resolves.toEqual({ data: null });

    authActions.getMe.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(getCurrentUser()).resolves.toEqual({
      error: "An unexpected error occurred",
    });
  });

  it("uses action-client contracts for passkey and password-reset mutations", async () => {
    authActions.beginPasskeySetup.mockResolvedValue({
      data: {
        pendingSetupId: "de008119-35c5-42a3-ad66-6e6b620838dc",
        challengeId: "7df68f0d-2689-4c4d-ae44-e2c0c2b62b3d",
        options: { challenge: "challenge" },
      },
      error: undefined,
    });
    authActions.confirmPasswordReset.mockResolvedValue({
      data: { success: true, message: "Password has been reset. Please log in." },
      error: undefined,
    });
    const { beginPasskeySetup, confirmPasswordReset } =
      await import("../../../admin/features/Auth/composables/useAuthApi");

    await expect(
      beginPasskeySetup({ username: "admin", email: "admin@example.com" }),
    ).resolves.toMatchObject({ data: { options: { challenge: "challenge" } } });
    await expect(
      confirmPasswordReset({ token: "reset-token", newPassword: "StrongPass123!" }),
    ).resolves.toMatchObject({ data: { success: true } });
    expect(authActions.beginPasskeySetup).toHaveBeenCalledWith({
      username: "admin",
      email: "admin@example.com",
    });
    expect(authActions.confirmPasswordReset).toHaveBeenCalledWith({
      token: "reset-token",
      newPassword: "StrongPass123!",
    });
  });
});
