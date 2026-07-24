import { describe, expect, it, vi } from "vitest";

import { removePasskey } from "../../../lib/auth/methods/passkey";
import type { AuthAdapter } from "../../../lib/auth/adapter";
import type { UserRecord } from "../../../lib/auth/types";

type PasskeyRemovalAdapter = Pick<
  AuthAdapter,
  "countPasskeyCredentials" | "deletePasskeyCredential" | "getUserByUsername"
>;

const user = {
  id: "de008119-35c5-42a3-ad66-6e6b620838dc",
  username: "admin",
} as const;

function createUserRecord(passwordHash: string): UserRecord {
  return {
    id: user.id,
    username: user.username,
    email: "admin@ariabuilder.io",
    role: "administrator",
    permissionProfile: { rolePreset: "administrator" },
    totpEnabled: false,
    lastLoginAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    avatarUrl: null,
    passwordHash,
  };
}

function createAdapter(options: {
  passkeyCount: number;
  passwordHash: string;
}): PasskeyRemovalAdapter {
  return {
    countPasskeyCredentials: vi.fn(async () => options.passkeyCount),
    getUserByUsername: vi.fn(async () => createUserRecord(options.passwordHash)),
    deletePasskeyCredential: vi.fn(async () => {}),
  };
}

describe("passkey guards", () => {
  it("blocks removing the final passkey without a recovery password", async () => {
    const adapter = createAdapter({ passkeyCount: 1, passwordHash: "" });

    await expect(
      removePasskey(adapter, user, "credential-id"),
    ).rejects.toThrow("Add a recovery password or another passkey first.");

    expect(adapter.deletePasskeyCredential).not.toHaveBeenCalled();
  });

  it("allows removing the final passkey when recovery password exists", async () => {
    const adapter = createAdapter({
      passkeyCount: 1,
      passwordHash: "hashed-password",
    });

    await expect(
      removePasskey(adapter, user, "credential-id"),
    ).resolves.toBeUndefined();

    expect(adapter.deletePasskeyCredential).toHaveBeenCalledWith(
      user.id,
      "credential-id",
    );
  });
});
