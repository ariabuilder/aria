import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AuthMethodsConfig,
  CreateFirstAdminInput,
  PublicAuthMethodsAvailability,
  SessionUser,
  UpdateAuthMethodsConfigInput,
} from "../../lib/auth/types";
import { buildPermissionProfile } from "../../lib/auth/types";

const mocks = vi.hoisted(() => ({
  getAuthAdapterAsync: vi.fn(),
  getAuthMethodsConfig: vi.fn(),
}));

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
    getAuthAdapterAsync: mocks.getAuthAdapterAsync,
    getAuthMethodsConfig: mocks.getAuthMethodsConfig,
  };
});

import {
  createFirstAdmin,
  getAuthMethodAvailability,
  getAuthMethodsConfigAction,
  updateAuthMethodsConfig,
} from "../../actions/auth/index";
import { AuthMethodsConfigSchema } from "../../lib/auth/types";

interface MockActionContext {
  locals: Record<string, unknown>;
  request: Request;
  cookies: {
    get(name: string): undefined;
    set(name: string, value: string, options?: unknown): void;
    delete(name: string, options?: unknown): void;
  };
}

interface ActionWithHandler<TInput, TOutput> {
  handler(input: TInput, context: MockActionContext): Promise<TOutput>;
}

function createContext(): MockActionContext {
  return {
    locals: {},
    request: new Request("https://admin.example.com/setup", {
      headers: { "user-agent": "vitest" },
    }),
    cookies: {
      get: () => undefined,
      set: () => undefined,
      delete: () => undefined,
    },
  };
}

function createSetupAdapter() {
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
    countUsers: vi.fn(async () => 0),
    recordLoginAttempt: vi.fn(async () => {}),
    recordRateLimitBreach: vi.fn(async () => ({
      breachCount: 1,
      lockoutUntil: "2026-01-01T00:15:00.000Z",
    })),
    createUser: vi.fn(async () => setupUser),
    createFirstUser: vi.fn(async () => setupUser),
    setConfig: vi.fn(async () => {}),
    clearRateLimit: vi.fn(async () => {}),
    createSession: vi.fn(async () => {}),
    createAuthEvent: vi.fn(async () => {}),
  };
}

const setupUser = {
  id: "8cc4c08c-2d47-456c-ab66-27a7816db992",
  username: "admin",
  email: "admin@ariabuilder.io",
  role: "administrator",
  permissionProfile: buildPermissionProfile("administrator"),
  totpEnabled: false,
  avatarUrl: null,
  preferences: {},
} satisfies SessionUser;

const setupInput = {
  username: "admin",
  email: "admin@ariabuilder.io",
  password: "recovery-password",
  confirmPassword: "recovery-password",
} satisfies CreateFirstAdminInput;

describe("auth airgap setup action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows password-only bootstrap while passkeys are enabled", async () => {
    const adapter = createSetupAdapter();
    const context = createContext();
    mocks.getAuthAdapterAsync.mockResolvedValue(adapter);
    mocks.getAuthMethodsConfig.mockResolvedValue(
      AuthMethodsConfigSchema.parse({}),
    );

    const action = createFirstAdmin as unknown as ActionWithHandler<
      CreateFirstAdminInput,
      { success: true; user: SessionUser }
    >;

    const result = await action.handler(setupInput, context);

    expect(result).toMatchObject({
      success: true,
      user: {
        id: setupUser.id,
        username: setupUser.username,
        email: setupUser.email,
        role: "administrator",
      },
    });
    expect(adapter.createFirstUser).toHaveBeenCalled();
  });

  it("allows password-only setup when passkeys are disabled for an airgapped workspace", async () => {
    const adapter = createSetupAdapter();
    const context = createContext();
    const cookieSet = vi.spyOn(context.cookies, "set");
    mocks.getAuthAdapterAsync.mockResolvedValue(adapter);
    mocks.getAuthMethodsConfig.mockResolvedValue(
      AuthMethodsConfigSchema.parse({
        passkey: {
          enabled: false,
          rpName: "Aria",
          allowedOrigins: [],
        },
      }),
    );

    const action = createFirstAdmin as unknown as ActionWithHandler<
      CreateFirstAdminInput,
      { success: true; user: SessionUser }
    >;

    const result = await action.handler(setupInput, context);

    expect(result).toMatchObject({
      success: true,
      user: {
        id: setupUser.id,
        username: setupUser.username,
        email: setupUser.email,
        role: setupUser.role,
      },
    });
    expect(adapter.createFirstUser).toHaveBeenCalledWith(
      expect.objectContaining({
        username: setupInput.username,
        email: setupInput.email,
        role: "administrator",
        passwordHash: expect.any(String),
      }),
    );
    expect(adapter.setConfig).toHaveBeenCalledWith(
      "bootstrap_user_id",
      setupUser.id,
    );
    expect(adapter.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: setupUser.id,
        authMethod: "password",
      }),
    );
    expect(adapter.createAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: setupUser.id,
        eventType: "login_success",
        authMethod: "password",
        success: true,
      }),
    );
    expect(cookieSet).toHaveBeenCalled();
  });
});

describe("auth methods config actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns public auth method availability without exposing full config", async () => {
    const adapter = createSetupAdapter();
    const config = AuthMethodsConfigSchema.parse({
      passkey: {
        enabled: false,
        rpName: "Aria Private",
        allowedOrigins: ["https://admin.example.com"],
      },
      password: {
        enabled: true,
        recoveryOnly: true,
      },
      magicLink: {
        enabled: false,
      },
    });
    mocks.getAuthAdapterAsync.mockResolvedValue(adapter);
    mocks.getAuthMethodsConfig.mockResolvedValue(config);

    const action = getAuthMethodAvailability as unknown as ActionWithHandler<
      undefined,
      PublicAuthMethodsAvailability
    >;

    await expect(action.handler(undefined, createContext())).resolves.toEqual({
      passkey: {
        enabled: false,
        rpName: "Aria Private",
      },
      password: {
        enabled: true,
        recoveryOnly: true,
      },
      magicLink: {
        enabled: false,
      },
    });
    expect(mocks.getAuthMethodsConfig).toHaveBeenCalledWith(
      adapter,
      expect.objectContaining({ persistDefaultOrigins: false }),
    );
  });

  it("lets administrators read and save passkey auth method config", async () => {
    const adapter = createSetupAdapter();
    const context = createContext();
    context.locals.user = setupUser;
    const currentConfig = AuthMethodsConfigSchema.parse({});
    mocks.getAuthAdapterAsync.mockResolvedValue(adapter);
    mocks.getAuthMethodsConfig.mockResolvedValue(currentConfig);

    const updateAction =
      updateAuthMethodsConfig as unknown as ActionWithHandler<
        UpdateAuthMethodsConfigInput,
        { success: true; config: AuthMethodsConfig }
      >;
    const getAction =
      getAuthMethodsConfigAction as unknown as ActionWithHandler<
        undefined,
        { config: AuthMethodsConfig }
      >;

    const input = {
      passkey: {
        enabled: false,
        rpName: "Airgap Console",
        allowedOrigins: ["https://admin.example.com"],
      },
    } satisfies UpdateAuthMethodsConfigInput;

    await expect(updateAction.handler(input, context)).resolves.toMatchObject({
      success: true,
      config: {
        passkey: input.passkey,
      },
    });
    expect(adapter.setConfig).toHaveBeenCalledWith(
      "auth_methods_config",
      expect.objectContaining({
        passkey: input.passkey,
      }),
    );

    await expect(getAction.handler(undefined, context)).resolves.toEqual({
      config: currentConfig,
    });
    expect(mocks.getAuthMethodsConfig).toHaveBeenCalledWith(
      adapter,
      expect.objectContaining({ persistDefaultOrigins: false }),
    );
  });
});
