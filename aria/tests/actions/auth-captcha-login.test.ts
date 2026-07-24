import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthAdapterAsync: vi.fn(),
  verifyTurnstile: vi.fn(),
  requireCapability: vi.fn(),
  createManagedTurnstileWidget: vi.fn(),
  deleteTurnstileWidget: vi.fn(),
  resolveTurnstileAccountId: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  ActionError: class MockActionError extends Error {
    code: string;
    constructor(input: { code: string; message: string }) {
      super(input.message);
      this.code = input.code;
    }
  },
  defineAction: (config: { handler: (...args: unknown[]) => unknown }) => config,
}));

vi.mock("../../lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/auth")>();
  return {
    ...actual,
    getAuthAdapterAsync: mocks.getAuthAdapterAsync,
    verifyTurnstile: mocks.verifyTurnstile,
    requireCapability: mocks.requireCapability,
  };
});

vi.mock("../../lib/cloudflare/turnstile", () => ({
  createManagedTurnstileWidget: mocks.createManagedTurnstileWidget,
  deleteTurnstileWidget: mocks.deleteTurnstileWidget,
  resolveTurnstileAccountId: mocks.resolveTurnstileAccountId,
}));

import {
  createTurnstileWidget,
  getLoginCaptchaConfig,
  login,
} from "../../actions/auth/index";

type LoginAction = {
  handler(
    input: {
      identifier: string;
      password: string;
      rememberMe: boolean;
      captchaToken?: string;
    },
    context: {
      locals: Record<string, unknown>;
      request: Request;
      cookies: Record<string, unknown>;
    },
  ): Promise<{ status: string; remainingAttempts?: number }>;
};

function adapter() {
  return {
    checkRateLimit: vi.fn(async () => ({
      isLimited: false,
      isLockedOut: false,
      attempts: 0,
      remainingAttempts: 10,
      resetAt: null,
      lockoutUntil: null,
      breachCount: 0,
    })),
    getConfig: vi.fn(async () => ({
      provider: "turnstile",
      siteKey: "site-key",
      allowedHostnames: ["admin.example.com"],
    })),
    recordLoginAttempt: vi.fn(async () => {}),
    createAuthEvent: vi.fn(async () => {}),
    getUserByIdentifier: vi.fn(),
  };
}

function context() {
  return {
    locals: { cfBindings: { TURNSTILE_SECRET_KEY: "worker-secret" } },
    request: new Request("https://admin.example.com/admin/login", {
      headers: { "cf-connecting-ip": "203.0.113.2" },
    }),
    cookies: {},
  };
}

describe("password login CAPTCHA enforcement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not continue to credential lookup when Turnstile rejects a token", async () => {
    const authAdapter = adapter();
    mocks.getAuthAdapterAsync.mockResolvedValue(authAdapter);
    mocks.verifyTurnstile.mockResolvedValue({
      success: false,
      error: "CAPTCHA verification failed",
    });

    const result = await (login as unknown as LoginAction).handler(
      {
        identifier: "admin@example.com",
        password: "correct-password",
        rememberMe: false,
        captchaToken: "arbitrary-attacker-token",
      },
      context(),
    );

    expect(result).toMatchObject({ status: "error", remainingAttempts: 9 });
    expect(authAdapter.getUserByIdentifier).not.toHaveBeenCalled();
    expect(authAdapter.recordLoginAttempt).toHaveBeenCalledWith("203.0.113.2");
    expect(mocks.verifyTurnstile).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "arbitrary-attacker-token",
        secretKey: "worker-secret",
        expectedHostnames: ["admin.example.com"],
      }),
    );
  });

  it("counts a missing CAPTCHA token as a failed login attempt", async () => {
    const authAdapter = adapter();
    mocks.getAuthAdapterAsync.mockResolvedValue(authAdapter);

    const result = await (login as unknown as LoginAction).handler(
      {
        identifier: "admin@example.com",
        password: "correct-password",
        rememberMe: false,
      },
      context(),
    );

    expect(result).toMatchObject({ status: "error", remainingAttempts: 9 });
    expect(authAdapter.recordLoginAttempt).toHaveBeenCalledWith("203.0.113.2");
    expect(mocks.verifyTurnstile).not.toHaveBeenCalled();
  });

  it("only exposes the public site key to the unauthenticated login page", async () => {
    const authAdapter = adapter();
    mocks.getAuthAdapterAsync.mockResolvedValue(authAdapter);

    const result = await (
      getLoginCaptchaConfig as unknown as {
        handler(input: object, actionContext: ReturnType<typeof context>): Promise<unknown>;
      }
    ).handler({}, context());

    expect(result).toEqual({
      enabled: true,
      provider: "turnstile",
      siteKey: "site-key",
    });
    expect(JSON.stringify(result)).not.toContain("worker-secret");
    expect(JSON.stringify(result)).not.toContain("allowedHostnames");
  });

  it("provisions a managed widget without returning or persisting its secret in plaintext", async () => {
    const encryptionKey = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
    );
    const authAdapter = {
      getConfig: vi.fn(),
      setConfig: vi.fn(async () => {}),
      createAuthEvent: vi.fn(async () => {}),
    };
    mocks.getAuthAdapterAsync.mockResolvedValue(authAdapter);
    mocks.requireCapability.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001" });
    mocks.createManagedTurnstileWidget.mockResolvedValue({
      siteKey: "site-key",
      secretKey: "provider-verification-secret",
    });
    mocks.resolveTurnstileAccountId.mockResolvedValue("account-id");
    const managedContext = {
      ...context(),
      locals: {
        cfBindings: {
          ARIA_CLOUDFLARE_API_TOKEN: "worker-only-api-token",
          ARIA_CLOUDFLARE_ACCOUNT_ID: "account-id",
          ARIA_TURNSTILE_ENCRYPTION_KEY_V1: encryptionKey,
        },
      },
    };

    const result = await (
      createTurnstileWidget as unknown as {
        handler(input: object, context: typeof managedContext): Promise<unknown>;
      }
    ).handler(
      { allowedHostnames: ["admin.example.com"], name: "Aria password login" },
      managedContext,
    );

    expect(result).toEqual({
      success: true,
      provider: "turnstile",
      siteKey: "site-key",
      allowedHostnames: ["admin.example.com"],
    });
    expect(mocks.createManagedTurnstileWidget).toHaveBeenCalledWith(
      expect.objectContaining({ apiToken: "worker-only-api-token", accountId: "account-id" }),
    );
    expect(JSON.stringify(authAdapter.setConfig.mock.calls)).not.toContain(
      "provider-verification-secret",
    );
  });
});
