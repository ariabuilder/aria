import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

import type { AuthAdapter } from "../../../lib/auth/adapter";
import {
  createAuthenticationOptions,
  verifyAuthentication,
} from "../../../lib/auth/methods/passkey";
import type {
  PasskeyCredential,
  WebauthnChallenge,
} from "../../../lib/auth/types";

const verifyAuthenticationResponseMock = vi.hoisted(() => vi.fn());
const generateAuthenticationOptionsMock = vi.hoisted(() => vi.fn());

vi.mock("@simplewebauthn/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@simplewebauthn/server")>();
  return {
    ...actual,
    generateAuthenticationOptions: generateAuthenticationOptionsMock,
    verifyAuthenticationResponse: verifyAuthenticationResponseMock,
  };
});

const USER_ID = "8cc4c08c-2d47-456c-ab66-27a7816db992";
const OTHER_USER_ID = "1cc4c08c-2d47-456c-ab66-27a7816db993";
const CHALLENGE_ID = "7df68f0d-2689-4c4d-ae44-e2c0c2b62b3d";
const CREDENTIAL_ID = "credential-id";
const OTHER_CREDENTIAL_ID = "other-credential-id";

type PasskeyAuthenticationAdapter = Pick<
  AuthAdapter,
  | "consumeWebauthnChallenge"
  | "getConfig"
  | "getPasskeyCredentialByCredentialId"
  | "setConfig"
  | "updatePasskeyCredentialUsage"
>;

type PasskeyAuthenticationOptionsAdapter = Pick<
  AuthAdapter,
  | "createWebauthnChallenge"
  | "getConfig"
  | "listAllPasskeyCredentials"
  | "listPasskeyCredentials"
  | "setConfig"
>;

function createCredential(
  overrides: Partial<PasskeyCredential> = {},
): PasskeyCredential {
  return {
    id: "9925ddd4-5ccc-4a39-bb58-01fbda99f5b0",
    userId: USER_ID,
    credentialId: CREDENTIAL_ID,
    publicKey: "AQID",
    counter: 0,
    deviceName: null,
    transports: [],
    backedUp: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastUsedAt: null,
    ...overrides,
  };
}

function createChallenge(): WebauthnChallenge {
  return {
    id: CHALLENGE_ID,
    challenge: "challenge",
    purpose: "login",
    userId: null,
    expiresAt: "2026-01-01T00:05:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function createResponse(
  overrides: Partial<AuthenticationResponseJSON> = {},
): AuthenticationResponseJSON {
  return {
    id: CREDENTIAL_ID,
    rawId: CREDENTIAL_ID,
    response: {
      clientDataJSON: "client-data",
      authenticatorData: "authenticator-data",
      signature: "signature",
    },
    type: "public-key",
    clientExtensionResults: {},
    authenticatorAttachment: "platform",
    ...overrides,
  };
}

async function getConfig<T>(_key: string): Promise<T | null> {
  return null;
}

async function setConfig<T>(_key: string, _value: T): Promise<void> {}

function createAdapter(
  credential: PasskeyCredential | null,
): PasskeyAuthenticationAdapter {
  return {
    consumeWebauthnChallenge: vi.fn(async () => createChallenge()),
    getConfig,
    getPasskeyCredentialByCredentialId: vi.fn(async () => credential),
    setConfig,
    updatePasskeyCredentialUsage: vi.fn(async () => {}),
  };
}

function createOptionsAdapter(
  overrides: Partial<PasskeyAuthenticationOptionsAdapter> = {},
): PasskeyAuthenticationOptionsAdapter {
  return {
    createWebauthnChallenge: vi.fn(async () => {}),
    getConfig,
    listAllPasskeyCredentials: vi.fn(async () => [
      createCredential(),
      createCredential({
        id: "other-passkey-row-id",
        userId: OTHER_USER_ID,
        credentialId: OTHER_CREDENTIAL_ID,
      }),
    ]),
    listPasskeyCredentials: vi.fn(async () => [createCredential()]),
    setConfig,
    ...overrides,
  };
}

describe("passkey authentication", () => {
  it("accepts synced passkeys that keep the WebAuthn counter at zero", async () => {
    const adapter = createAdapter(createCredential({ counter: 0 }));
    verifyAuthenticationResponseMock.mockResolvedValueOnce({
      verified: true,
      authenticationInfo: {
        credentialID: CREDENTIAL_ID,
        newCounter: 0,
      },
    });

    const result = await verifyAuthentication({
      adapter,
      requestUrl: "https://admin.example.com/admin/login",
      challengeId: CHALLENGE_ID,
      response: createResponse(),
    });

    expect(result).toEqual({
      userId: USER_ID,
      credentialId: CREDENTIAL_ID,
      newCounter: 0,
    });
    expect(
      vi.mocked(adapter.updatePasskeyCredentialUsage).mock.calls[0]?.[0],
    ).toBe(CREDENTIAL_ID);
    expect(
      vi.mocked(adapter.updatePasskeyCredentialUsage).mock.calls[0]?.[1]
        .counter,
    ).toBe(0);
  });

  it("does not move a stored counter backwards after verification", async () => {
    const adapter = createAdapter(createCredential({ counter: 5 }));
    verifyAuthenticationResponseMock.mockResolvedValueOnce({
      verified: true,
      authenticationInfo: {
        credentialID: CREDENTIAL_ID,
        newCounter: 0,
      },
    });

    const result = await verifyAuthentication({
      adapter,
      requestUrl: "https://admin.example.com/admin/login",
      challengeId: CHALLENGE_ID,
      response: createResponse(),
    });

    expect(result.newCounter).toBe(5);
    expect(
      vi.mocked(adapter.updatePasskeyCredentialUsage).mock.calls[0]?.[1]
        .counter,
    ).toBe(5);
  });

  it("throws credential_not_found when the response id is not registered", async () => {
    const adapter = createAdapter(null);

    await expect(
      verifyAuthentication({
        adapter,
        requestUrl: "http://localhost:4321/admin/login",
        challengeId: CHALLENGE_ID,
        response: createResponse({ id: "unknown-id", rawId: "unknown-id" }),
      }),
    ).rejects.toMatchObject({
      code: "credential_not_found",
    });
    expect(verifyAuthenticationResponseMock).not.toHaveBeenCalled();
  });

  it("throws signature_invalid when verification returns verified false", async () => {
    const adapter = createAdapter(createCredential());
    verifyAuthenticationResponseMock.mockResolvedValueOnce({
      verified: false,
      authenticationInfo: {
        credentialID: CREDENTIAL_ID,
        newCounter: 0,
      },
    });

    await expect(
      verifyAuthentication({
        adapter,
        requestUrl: "http://localhost:4321/admin/login",
        challengeId: CHALLENGE_ID,
        response: createResponse(),
      }),
    ).rejects.toMatchObject({
      code: "signature_invalid",
    });
  });
});

describe("createAuthenticationOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateAuthenticationOptionsMock.mockResolvedValue({
      challenge: "login-challenge",
    });
  });

  it("scopes allowCredentials to all workspace passkeys when no userId is provided", async () => {
    const adapter = createOptionsAdapter();

    const result = await createAuthenticationOptions({
      adapter,
      requestUrl: "http://localhost:4321/admin/login",
    });

    expect(adapter.listAllPasskeyCredentials).toHaveBeenCalled();
    expect(adapter.listPasskeyCredentials).not.toHaveBeenCalled();
    expect(generateAuthenticationOptionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rpID: "localhost",
        allowCredentials: [
          { id: CREDENTIAL_ID, transports: [] },
          { id: OTHER_CREDENTIAL_ID, transports: [] },
        ],
      }),
    );
    expect(result).toEqual({
      challengeId: expect.any(String),
      options: { challenge: "login-challenge" },
    });
    expect(adapter.createWebauthnChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        challenge: "login-challenge",
        purpose: "login",
        userId: null,
      }),
    );
  });

  it("scopes allowCredentials to the matched user when userId is provided", async () => {
    const adapter = createOptionsAdapter();

    await createAuthenticationOptions({
      adapter,
      requestUrl: "http://localhost:4321/admin/login",
      userId: USER_ID,
    });

    expect(adapter.listPasskeyCredentials).toHaveBeenCalledWith(USER_ID);
    expect(adapter.listAllPasskeyCredentials).not.toHaveBeenCalled();
    expect(generateAuthenticationOptionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        allowCredentials: [{ id: CREDENTIAL_ID, transports: [] }],
      }),
    );
  });
});
