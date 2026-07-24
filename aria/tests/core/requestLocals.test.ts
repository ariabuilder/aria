import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readSessionUserFromLocals,
  type RequestRuntimeLocals,
} from "../../lib/runtime/requestLocals";

describe("requestLocals", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes legacy preferences on request locals", () => {
    const locals: RequestRuntimeLocals = {
      user: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        username: "andy",
        email: "andy@example.com",
        role: "administrator",
        totpEnabled: false,
        preferences: {
          appearance: {
            themeMode: "dark",
            uiZoom: 100,
          } as any,
        },
      },
    };

    expect(readSessionUserFromLocals(locals)).toEqual({
      id: "123e4567-e89b-12d3-a456-426614174000",
      username: "andy",
      email: "andy@example.com",
      role: "administrator",
      totpEnabled: false,
      preferences: {
        appearance: {
          themeId: "aria",
          colorScheme: "dark",
          fontFamily: "Outfit",
          uiZoom: 1,
        },
      },
    });
  });

  it("returns a validated session user from request locals", () => {
    const locals: RequestRuntimeLocals = {
      user: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        username: "andy",
        email: "andy@example.com",
        role: "administrator",
        totpEnabled: false,
      },
    };

    expect(readSessionUserFromLocals(locals)).toEqual(locals.user);
  });

  it("drops invalid session-user payloads from request locals", () => {
    const locals = {
      user: {
        id: "not-a-uuid",
        username: "andy",
        email: "not-an-email",
        role: "admin",
        totpEnabled: false,
      },
    } as unknown as RequestRuntimeLocals;

    expect(readSessionUserFromLocals(locals)).toBeNull();
    expect(locals.user).toBeUndefined();
  });
});
