import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();

vi.mock("../../../admin/features/Auth/composables/useAuthApi", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
}));

const SESSION_USER = {
  id: "de008119-35c5-42a3-ad66-6e6b620838dc",
  username: "admin",
  email: "admin@example.com",
  role: "administrator" as const,
  totpEnabled: false,
  avatarUrl: "/uploads/old.avif",
};

describe("useUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getCurrentUserMock.mockResolvedValue({ data: { ...SESSION_USER } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it("patchSessionUser merges profile fields for the current session user", async () => {
    const { useUser, patchSessionUser } =
      await import("../../../admin/features/Auth/composables/useUser");

    const { user, fetchUser } = useUser();
    await fetchUser();

    patchSessionUser({
      id: SESSION_USER.id,
      avatarUrl: "/uploads/new.avif",
      email: "new@example.com",
    });

    expect(user.value).toEqual({
      ...SESSION_USER,
      avatarUrl: "/uploads/new.avif",
      email: "new@example.com",
    });
  });

  it("patchSessionUser no-ops when the target id does not match", async () => {
    const { useUser, patchSessionUser } =
      await import("../../../admin/features/Auth/composables/useUser");

    const { user, fetchUser } = useUser();
    await fetchUser();

    patchSessionUser({
      id: "123e4567-e89b-12d3-a456-426614174000",
      avatarUrl: "/uploads/other.avif",
    });

    expect(user.value).toEqual(SESSION_USER);
  });

  it("patchSessionUser no-ops when no session user is loaded", async () => {
    const { useUser, patchSessionUser } =
      await import("../../../admin/features/Auth/composables/useUser");

    const { user } = useUser();

    patchSessionUser({
      id: SESSION_USER.id,
      avatarUrl: "/uploads/new.avif",
    });

    expect(user.value).toBeNull();
  });

  it("isSessionUserId matches loaded session user", async () => {
    const { useUser, isSessionUserId } =
      await import("../../../admin/features/Auth/composables/useUser");

    const { fetchUser } = useUser();
    await fetchUser();

    expect(isSessionUserId(SESSION_USER.id)).toBe(true);
    expect(isSessionUserId("123e4567-e89b-12d3-a456-426614174000")).toBe(false);
  });

  it("syncSessionUserIfSelf patches avatar for the signed-in user", async () => {
    const { useUser, syncSessionUserIfSelf } =
      await import("../../../admin/features/Auth/composables/useUser");

    const { user, fetchUser } = useUser();
    await fetchUser();

    expect(
      syncSessionUserIfSelf({
        id: SESSION_USER.id,
        avatarUrl: "/uploads/synced.avif",
      }),
    ).toBe(true);

    expect(user.value?.avatarUrl).toBe("/uploads/synced.avif");
  });

  it("preserves the authenticated user when a forced refresh has a transient failure", async () => {
    vi.useFakeTimers();
    const { useUser } =
      await import("../../../admin/features/Auth/composables/useUser");
    const { user, error, fetchUser } = useUser();
    await fetchUser();

    getCurrentUserMock.mockResolvedValue({ error: "Service unavailable" });
    const refresh = fetchUser({ force: true });
    await vi.runAllTimersAsync();
    await refresh;

    expect(getCurrentUserMock).toHaveBeenCalledTimes(4);
    expect(user.value).toEqual(SESSION_USER);
    expect(error.value).toBe("Service unavailable");
  });

  it("clears the authenticated user only after a confirmed signed-out response", async () => {
    const { useUser } =
      await import("../../../admin/features/Auth/composables/useUser");
    const { user, fetchUser } = useUser();
    await fetchUser();

    getCurrentUserMock.mockResolvedValueOnce({ data: null });
    await fetchUser({ force: true });

    expect(user.value).toBeNull();
  });

  it("retries an initial transient failure and accepts the recovered session", async () => {
    vi.useFakeTimers();
    getCurrentUserMock
      .mockResolvedValueOnce({ error: "Service unavailable" })
      .mockResolvedValueOnce({ data: { ...SESSION_USER } });
    const { useUser } =
      await import("../../../admin/features/Auth/composables/useUser");
    const { user, error, fetchUser } = useUser();

    const initialFetch = fetchUser();
    await vi.runAllTimersAsync();
    await initialFetch;

    expect(getCurrentUserMock).toHaveBeenCalledTimes(2);
    expect(user.value).toEqual(SESSION_USER);
    expect(error.value).toBeNull();
  });
});
