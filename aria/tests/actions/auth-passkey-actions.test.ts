import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AuthenticationResponseJSONInput,
  BeginPasskeySetupInput,
  BeginPasskeySetupResponse,
  CompletePasskeySetupInput,
  LoginResponse,
  NewPasskeyCredential,
  PasskeyCredential,
  PasskeyLoginOptionsResponse,
  PasskeyLoginVerifyInput,
  SessionUser,
  User,
  UserRecord,
  UserRole,
  UserPermissionProfile,
} from "../../lib/auth/types";
import { buildPermissionProfile } from "../../lib/auth/types";

const USER_ID = "8cc4c08c-2d47-456c-ab66-27a7816db992";
const REGISTER_CHALLENGE_ID = "a9a9f60b-4650-4e47-a5aa-c58d58a1fef3";
const LOGIN_CHALLENGE_ID = "7df68f0d-2689-4c4d-ae44-e2c0c2b62b3d";
const CREDENTIAL_ID = "credential-id";

const mocks = vi.hoisted(() => ({
  createAuthenticationOptions: vi.fn(),
  createRegistrationOptions: vi.fn(),
  getAuthAdapterAsync: vi.fn(),
  verifyAuthentication: vi.fn(),
  verifyRegistrationCeremony: vi.fn(),
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
    createAuthenticationOptions: mocks.createAuthenticationOptions,
    createRegistrationOptions: mocks.createRegistrationOptions,
    getAuthAdapterAsync: mocks.getAuthAdapterAsync,
    verifyAuthentication: mocks.verifyAuthentication,
    verifyRegistrationCeremony: mocks.verifyRegistrationCeremony,
  };
});

import {
  beginPasskeySetup,
  completePasskeySetup,
  passkeyLoginOptions,
  passkeyLoginVerify,
} from "../../actions/auth/index";
import { PasskeyAuthFailureError } from "../../lib/auth";

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

function createContext(path = "/setup"): MockActionContext {
  return {
    locals: {},
    request: new Request(`https://admin.example.com${path}`, {
      headers: { "user-agent": "vitest" },
    }),
    cookies: {
      get: () => undefined,
      set: () => undefined,
      delete: () => undefined,
    },
  };
}

const sessionUser = {
  id: USER_ID,
  username: "admin",
  email: "admin@ariabuilder.io",
  role: "administrator",
  permissionProfile: buildPermissionProfile("administrator"),
  totpEnabled: true,
  avatarUrl: null,
  preferences: {},
} satisfies SessionUser;

const user = {
  ...sessionUser,
  lastLoginAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
} satisfies User;

const userRecord = {
  ...user,
  passwordHash: "hashed-password",
} satisfies UserRecord;

function createCredential(overrides: Partial<PasskeyCredential> = {}) {
  return {
    id: "9925ddd4-5ccc-4a39-bb58-01fbda99f5b0",
    userId: USER_ID,
    credentialId: CREDENTIAL_ID,
    publicKey: "public-key",
    counter: 1,
    deviceName: "First passkey",
    transports: [],
    backedUp: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastUsedAt: null,
    ...overrides,
  } satisfies PasskeyCredential;
}

function createPasskeyActionAdapter() {
  const config = new Map<string, unknown>();
  type CreateUserInput = {
    id: string;
    username: string;
    email: string;
    passwordHash: string;
    role: UserRole;
    createdAt: string;
    permissionProfile?: UserPermissionProfile;
  };

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
    clearRateLimit: vi.fn(async () => {}),
    countUsers: vi.fn(async () => 0),
    createAuthEvent: vi.fn(async () => {}),
    createPasskeyCredential: vi.fn(async (credential: NewPasskeyCredential) =>
      createCredential({
        id: credential.id,
        userId: credential.userId,
        credentialId: credential.credentialId,
        publicKey: credential.publicKey,
        counter: credential.counter,
        deviceName: credential.deviceName,
        transports: credential.transports,
        backedUp: credential.backedUp,
        createdAt: credential.createdAt,
        lastUsedAt: credential.lastUsedAt,
      }),
    ),
    createSession: vi.fn(async () => ({
      id: "3d67fe89-5222-4f67-a66f-e95510269127",
      userId: USER_ID,
      expiresAt: "2026-01-08T00:00:00.000Z",
      rememberMe: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      authMethod: "passkey",
      ip: "127.0.0.1",
      userAgent: "vitest",
    })),
    createUser: vi.fn(async (input: CreateUserInput) => ({
      ...user,
      id: input.id,
      username: input.username,
      email: input.email,
      role: input.role,
      permissionProfile: input.permissionProfile,
      createdAt: input.createdAt,
    })),
    createFirstUser: vi.fn(async (input: CreateUserInput) => ({
      ...user,
      id: input.id,
      username: input.username,
      email: input.email,
      role: input.role,
      permissionProfile: input.permissionProfile,
      createdAt: input.createdAt,
    })),
    deleteConfig: vi.fn(async (key: string) => {
      config.delete(key);
    }),
    deleteUser: vi.fn(async () => {}),
    getConfig: vi.fn(async <T>(key: string): Promise<T | null> => {
      return config.has(key) ? (config.get(key) as T) : null;
    }),
    getTotpSecret: vi.fn(async () => "totp-secret"),
    getUserById: vi.fn(async () => user),
    getUserByIdentifier: vi.fn(async () => userRecord),
    recordLoginAttempt: vi.fn(async () => {}),
    recordRateLimitBreach: vi.fn(async () => ({
      breachCount: 1,
      lockoutUntil: "2026-01-01T00:15:00.000Z",
    })),
    setConfig: vi.fn(async <T>(key: string, value: T) => {
      config.set(key, value);
    }),
    updateUser: vi.fn(async () => user),
  };
}

const beginSetupInput = {
  username: "admin",
  email: "admin@ariabuilder.io",
} satisfies BeginPasskeySetupInput;

const registrationResponse = {
  id: CREDENTIAL_ID,
  rawId: CREDENTIAL_ID,
  response: {
    clientDataJSON: "client-data",
    attestationObject: "attestation",
  },
  type: "public-key",
  clientExtensionResults: {},
} satisfies CompletePasskeySetupInput["response"];

const authenticationResponse = {
  id: CREDENTIAL_ID,
  rawId: CREDENTIAL_ID,
  response: {
    clientDataJSON: "client-data",
    authenticatorData: "authenticator-data",
    signature: "signature",
  },
  type: "public-key",
  clientExtensionResults: {},
} satisfies AuthenticationResponseJSONInput;

describe("passkey setup actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRegistrationOptions.mockResolvedValue({
      challengeId: REGISTER_CHALLENGE_ID,
      options: { challenge: "register-challenge" },
    });
    mocks.verifyRegistrationCeremony.mockImplementation(
      async (context: { userId: string }) =>
        createCredential({ userId: context.userId }),
    );
  });

  it("creates first admin through begin and complete passkey setup", async () => {
    const adapter = createPasskeyActionAdapter();
    const context = createContext("/admin/setup");
    const cookieSet = vi.spyOn(context.cookies, "set");
    mocks.getAuthAdapterAsync.mockResolvedValue(adapter);

    const beginAction = beginPasskeySetup as unknown as ActionWithHandler<
      BeginPasskeySetupInput,
      BeginPasskeySetupResponse
    >;
    const completeAction = completePasskeySetup as unknown as ActionWithHandler<
      CompletePasskeySetupInput,
      { success: true; user: SessionUser }
    >;

    const beginResult = await beginAction.handler(beginSetupInput, context);

    expect(beginResult).toEqual({
      pendingSetupId: expect.any(String),
      challengeId: REGISTER_CHALLENGE_ID,
      options: { challenge: "register-challenge" },
    });
    expect(mocks.createRegistrationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter,
        requestUrl: "https://admin.example.com/admin/setup",
        user: expect.objectContaining(beginSetupInput),
        challengeUserId: null,
        existingCredentials: [],
      }),
    );

    const completeResult = await completeAction.handler(
      {
        pendingSetupId: beginResult.pendingSetupId,
        challengeId: beginResult.challengeId,
        response: registrationResponse,
        password: "recovery-password",
        confirmPassword: "recovery-password",
        deviceName: "First passkey",
      },
      context,
    );

    expect(completeResult).toMatchObject({
      success: true,
      user: {
        id: expect.any(String),
        username: "admin",
        role: "administrator",
      },
    });
    expect(adapter.createFirstUser).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        username: "admin",
        email: "admin@ariabuilder.io",
        role: "administrator",
        passwordHash: expect.any(String),
      }),
    );
    const createdUserId = completeResult.user.id;
    expect(adapter.createPasskeyCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: createdUserId,
        credentialId: CREDENTIAL_ID,
      }),
    );
    expect(adapter.setConfig).toHaveBeenCalledWith(
      "bootstrap_user_id",
      createdUserId,
    );
    expect(adapter.deleteConfig).toHaveBeenCalledWith(
      `auth_pending_passkey_setup:${beginResult.pendingSetupId}`,
    );
    expect(adapter.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: createdUserId,
        authMethod: "passkey",
        rememberMe: false,
      }),
    );
    expect(adapter.createAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: createdUserId,
        eventType: "passkey_registered",
        authMethod: "passkey",
        success: true,
      }),
    );
    expect(adapter.createAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: createdUserId,
        eventType: "login_success",
        authMethod: "passkey",
        success: true,
      }),
    );
    expect(cookieSet).toHaveBeenCalled();
  });

  it("rejects complete setup when pending setup state is missing", async () => {
    const adapter = createPasskeyActionAdapter();
    mocks.getAuthAdapterAsync.mockResolvedValue(adapter);

    const completeAction = completePasskeySetup as unknown as ActionWithHandler<
      CompletePasskeySetupInput,
      unknown
    >;

    await expect(
      completeAction.handler(
        {
          pendingSetupId: "77104749-4eb9-4922-b961-b93748681d05",
          challengeId: REGISTER_CHALLENGE_ID,
          response: registrationResponse,
          password: "recovery-password",
          confirmPassword: "recovery-password",
          deviceName: "First passkey",
        },
        createContext("/admin/setup"),
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Passkey setup expired. Start again.",
    });

    expect(adapter.createFirstUser).not.toHaveBeenCalled();
    expect(adapter.createPasskeyCredential).not.toHaveBeenCalled();
  });
});

describe("passkey login actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAuthenticationOptions.mockResolvedValue({
      challengeId: LOGIN_CHALLENGE_ID,
      options: { challenge: "login-challenge" },
    });
    mocks.verifyAuthentication.mockResolvedValue({
      userId: USER_ID,
      credentialId: CREDENTIAL_ID,
      newCounter: 2,
    });
  });

  it("creates passkey login options for an identifier hint", async () => {
    const adapter = createPasskeyActionAdapter();
    mocks.getAuthAdapterAsync.mockResolvedValue(adapter);

    const action = passkeyLoginOptions as unknown as ActionWithHandler<
      { identifier: string },
      PasskeyLoginOptionsResponse
    >;

    await expect(
      action.handler(
        { identifier: "admin@ariabuilder.io" },
        createContext("/admin/login"),
      ),
    ).resolves.toEqual({
      challengeId: LOGIN_CHALLENGE_ID,
      options: { challenge: "login-challenge" },
    });
    expect(adapter.getUserByIdentifier).toHaveBeenCalledWith(
      "admin@ariabuilder.io",
    );
    expect(mocks.createAuthenticationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter,
        requestUrl: "https://admin.example.com/admin/login",
        userId: USER_ID,
      }),
    );
  });

  it("creates a passkey session and skips TOTP for TOTP-enabled users", async () => {
    const adapter = createPasskeyActionAdapter();
    const context = createContext("/admin/login");
    const cookieSet = vi.spyOn(context.cookies, "set");
    mocks.getAuthAdapterAsync.mockResolvedValue(adapter);

    const action = passkeyLoginVerify as unknown as ActionWithHandler<
      PasskeyLoginVerifyInput,
      LoginResponse
    >;

    await expect(
      action.handler(
        {
          challengeId: LOGIN_CHALLENGE_ID,
          response: authenticationResponse,
          rememberMe: true,
        },
        context,
      ),
    ).resolves.toMatchObject({
      status: "success",
      user: {
        id: USER_ID,
        totpEnabled: true,
      },
    });
    expect(adapter.getTotpSecret).not.toHaveBeenCalled();
    expect(adapter.clearRateLimit).toHaveBeenCalled();
    expect(adapter.updateUser).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ lastLoginAt: expect.any(String) }),
    );
    expect(adapter.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        authMethod: "passkey",
        rememberMe: true,
      }),
    );
    expect(adapter.createAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        eventType: "login_success",
        authMethod: "passkey",
        success: true,
      }),
    );
    expect(cookieSet).toHaveBeenCalled();
  });

  it("records an attempt and audit event when passkey verification fails", async () => {
    const adapter = createPasskeyActionAdapter();
    mocks.getAuthAdapterAsync.mockResolvedValue(adapter);
    mocks.verifyAuthentication.mockRejectedValue(new Error("expired"));

    const action = passkeyLoginVerify as unknown as ActionWithHandler<
      PasskeyLoginVerifyInput,
      LoginResponse
    >;

    await expect(
      action.handler(
        {
          challengeId: LOGIN_CHALLENGE_ID,
          response: authenticationResponse,
          rememberMe: false,
        },
        createContext("/admin/login"),
      ),
    ).resolves.toEqual({
      status: "error",
      message:
        "Passkey sign-in failed. Try again or use another sign-in method.",
      remainingAttempts: 9,
    });
    expect(adapter.recordLoginAttempt).toHaveBeenCalled();
    expect(adapter.createSession).not.toHaveBeenCalled();
    expect(adapter.createAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "passkey_auth_failure",
        authMethod: "passkey",
        success: false,
        metadata: { failureCode: "invalid_credentials" },
      }),
    );
  });

  it("returns a workspace-specific message when the passkey is not registered", async () => {
    const adapter = createPasskeyActionAdapter();
    mocks.getAuthAdapterAsync.mockResolvedValue(adapter);
    mocks.verifyAuthentication.mockRejectedValue(
      new PasskeyAuthFailureError("credential_not_found"),
    );

    const action = passkeyLoginVerify as unknown as ActionWithHandler<
      PasskeyLoginVerifyInput,
      LoginResponse
    >;

    await expect(
      action.handler(
        {
          challengeId: LOGIN_CHALLENGE_ID,
          response: authenticationResponse,
          rememberMe: false,
        },
        createContext("/admin/login"),
      ),
    ).resolves.toEqual({
      status: "error",
      message:
        "This passkey isn't registered with this workspace. Try another passkey or sign in with password.",
      remainingAttempts: 9,
    });
    expect(adapter.createAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { failureCode: "credential_not_found" },
      }),
    );
  });
});
