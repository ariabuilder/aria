import { describe, expect, it, vi } from "vitest";
import type { AuthAdapter } from "../../../lib/auth/adapter";
import {
  getAgentConnectionUserId,
  mergeAgentConnectionAuthState,
  resolveSessionUserFromConnectionState,
} from "../../../admin/features/Agent/server/sessionAuth";

const USER_ID = "61e69ad8-1dce-4453-8da8-6e6dbeed47e5";

describe("agent connection auth state", () => {
  it("persists the user id without replacing existing connection state", () => {
    const state = mergeAgentConnectionAuthState(
      { client: { version: 2 }, feature: "chat" },
      USER_ID,
    );

    expect(state).toEqual({
      client: { version: 2 },
      feature: "chat",
      ariaAgentAuth: { userId: USER_ID },
    });
    expect(getAgentConnectionUserId(state)).toBe(USER_ID);
  });

  it("rejects missing or malformed connection identities", () => {
    expect(getAgentConnectionUserId(null)).toBeNull();
    expect(
      getAgentConnectionUserId({ ariaAgentAuth: { userId: "nope" } }),
    ).toBeNull();
  });

  it("rehydrates the current user from the persisted connection identity", async () => {
    const user = {
      id: USER_ID,
      username: "aria_admin",
      name: "Aria Admin",
      email: "admin@example.com",
      role: "administrator" as const,
      totpEnabled: false,
      lastLoginAt: null,
      createdAt: "2026-07-16T00:00:00.000Z",
    };
    const getUserById = vi.fn(async () => user);
    const adapter: Pick<AuthAdapter, "getUserById"> = { getUserById };

    const result = await resolveSessionUserFromConnectionState(
      mergeAgentConnectionAuthState(null, USER_ID),
      adapter,
    );

    expect(getUserById).toHaveBeenCalledWith(USER_ID);
    expect(result).toMatchObject({ id: USER_ID, role: "administrator" });
  });

  it("does not query storage when connection identity is unavailable", async () => {
    const getUserById = vi.fn(async () => null);
    const adapter: Pick<AuthAdapter, "getUserById"> = { getUserById };

    await expect(
      resolveSessionUserFromConnectionState({}, adapter),
    ).resolves.toBeNull();
    expect(getUserById).not.toHaveBeenCalled();
  });
});
