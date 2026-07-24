import { describe, expect, it, vi } from "vitest";

import { logAuthEvent } from "../../../lib/auth/audit";
import { SessionSchema, type NewAuthEvent } from "../../../lib/auth/types";

describe("auth audit foundation", () => {
  it("records validated events and truncates user agents", async () => {
    const createAuthEvent = vi.fn(async (_event: NewAuthEvent) => {});
    const longUserAgent = "a".repeat(600);

    await logAuthEvent(
      { createAuthEvent },
      {
        userId: "de008119-35c5-42a3-ad66-6e6b620838dc",
        eventType: "login_success",
        authMethod: "password",
        ip: "127.0.0.1",
        userAgent: longUserAgent,
        success: true,
        metadata: { bootstrap: true },
      },
    );

    expect(createAuthEvent).toHaveBeenCalledWith({
      userId: "de008119-35c5-42a3-ad66-6e6b620838dc",
      eventType: "login_success",
      authMethod: "password",
      ip: "127.0.0.1",
      userAgent: "a".repeat(512),
      success: true,
      metadata: { bootstrap: true },
    });
  });

  it("does not throw when audit storage fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const createAuthEvent = vi.fn(async (_event: NewAuthEvent) => {
      throw new Error("audit unavailable");
    });

    await expect(
      logAuthEvent(
        { createAuthEvent },
        {
          eventType: "logout",
          authMethod: "session",
          success: true,
        },
      ),
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it("accepts modern session metadata while keeping legacy sessions valid", () => {
    expect(
      SessionSchema.parse({
        id: "de008119-35c5-42a3-ad66-6e6b620838dc",
        userId: "f05c4792-b03f-4c05-a41f-88b1ac9183cc",
        expiresAt: "2026-06-27T12:00:00.000Z",
        rememberMe: false,
        createdAt: "2026-06-20T12:00:00.000Z",
        authMethod: "password",
        ip: "127.0.0.1",
        userAgent: "Vitest",
      }),
    ).toMatchObject({
      authMethod: "password",
      ip: "127.0.0.1",
      userAgent: "Vitest",
    });

    const legacySession = SessionSchema.parse({
        id: "de008119-35c5-42a3-ad66-6e6b620838dc",
        userId: "f05c4792-b03f-4c05-a41f-88b1ac9183cc",
        expiresAt: "2026-06-27T12:00:00.000Z",
        rememberMe: false,
        createdAt: "2026-06-20T12:00:00.000Z",
    });
    expect(legacySession.authMethod).toBeUndefined();
    expect(legacySession.ip).toBeUndefined();
    expect(legacySession.userAgent).toBeUndefined();
  });
});
