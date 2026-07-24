import { createClient, type Client } from "@libsql/client";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  database: null as unknown,
  storage: null as unknown,
  authAdapter: null as unknown,
}));

vi.mock("../../lib/api/database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api/database")>()),
  getApiSqlDatabase: vi.fn(async () => state.database),
}));
vi.mock("../../lib/storage/getStorageAdapter", () => ({
  getStorageAdapterAsync: vi.fn(async () => state.storage),
}));
vi.mock("../../lib/auth/getAuthAdapter", () => ({
  getAuthAdapterAsync: vi.fn(async () => state.authAdapter),
}));

import { hmacApiValue, readApiKeyring } from "../../lib/api/crypto";
import { LibSqlApiSqlDatabase } from "../../lib/api/database";
import { ApiHttpError } from "../../lib/api/http";
import { ApiRepository } from "../../lib/api/repository";
import { createOAuthAccessToken } from "../../lib/oauth/codes";
import {
  FIGMA_OAUTH_CLIENT_ID,
  OAUTH_ACCESS_AUDIENCE,
} from "../../lib/oauth/config";
import { OAuthRepository } from "../../lib/oauth/repository";
import { authenticateFigmaOAuthRequest } from "../../lib/oauth/resourceAuth";
import type { FigmaOAuthScope } from "../../lib/oauth/schemas";

const user = {
  id: "10000000-0000-4000-8000-000000000001",
  username: "oauth-user",
  email: "oauth@example.test",
  role: "administrator" as const,
  totpEnabled: false,
};
const keyBytes = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
let keyBinary = "";
for (const byte of keyBytes) keyBinary += String.fromCharCode(byte);
const locals = {
  cfBindings: {
    ARIA_API_KEYRING_KEY_ID: "v1",
    ARIA_API_KEYRING_KEY_V1: btoa(keyBinary),
    ARIA_OAUTH_ENABLED: "true",
    ARIA_CANONICAL_ORIGIN: "https://site.example",
  },
};

describe("Figma OAuth resource authentication", () => {
  let client: Client;
  let repository: OAuthRepository;
  let siteId: string;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    for (const migration of [
      "0001_baseline_schema.sql",
      "0002_api_foundation.sql",
      "0003_api_idempotency_leases.sql",
      "0004_api_lifecycle_hardening.sql",
      "0005_integration_events.sql",
      "0006_webhook_delivery.sql",
      "0007_oauth_provider.sql",
    ]) {
      await client.executeMultiple(
        await readFile(
          resolve(process.cwd(), `aria/migrations/${migration}`),
          "utf8",
        ),
      );
    }
    await client.execute({
      sql: `INSERT INTO aria_users (
        id, username, email, password_hash, role, created_at
      ) VALUES (?, ?, ?, 'unused', ?, ?)`,
      args: [
        user.id,
        user.username,
        user.email,
        user.role,
        "2026-07-20T12:00:00.000Z",
      ],
    });
    const database = new LibSqlApiSqlDatabase(client);
    state.database = database;
    repository = new OAuthRepository(database);
    siteId = await new ApiRepository(database).getOrCreateSiteIdentity(
      "20000000-0000-4000-8000-000000000001",
    );
    await repository.ensureBuiltInFigmaClient(siteId);
    state.storage = {
      getSiteSettings: vi.fn(async () => null),
      consumeRateLimit: vi.fn(async (input: { limit: number }) => ({
        allowed: true,
        count: 1,
        remaining: input.limit - 1,
        resetAt: Date.now() + 60_000,
      })),
    };
    state.authAdapter = { getUserById: vi.fn(async () => user) };
  });

  afterEach(() => client.close());

  async function issueAccessToken(
    scopes: readonly FigmaOAuthScope[],
    options: {
      audience?: string;
      boundSiteId?: string;
      clientStatus?: "active" | "disabled";
      expiresAt?: string;
      familyStatus?: "active" | "revoked";
      grantScopes?: readonly FigmaOAuthScope[];
      grantSiteId?: string;
      grantStatus?: "active" | "revoked";
    } = {},
  ) {
    const suffix = crypto.randomUUID();
    const grantId = `grant-${suffix}`;
    const familyId = `family-${suffix}`;
    const accessId = `access-${suffix}`;
    const access = createOAuthAccessToken();
    const now = "2026-07-20T12:00:00.000Z";
    await client.batch(
      [
        {
          sql: `INSERT INTO aria_oauth_grants (
            id, site_id, client_id, principal_id, scopes_json, status,
            consented_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            grantId,
            options.grantSiteId ?? siteId,
            FIGMA_OAUTH_CLIENT_ID,
            user.id,
            JSON.stringify(options.grantScopes ?? scopes),
            options.grantStatus ?? "active",
            now,
            now,
            now,
          ],
        },
        {
          sql: `INSERT INTO aria_oauth_refresh_families (
            id, site_id, client_id, grant_id, principal_id, status,
            current_generation, absolute_expires_at, created_at,
            last_rotated_at, revoked_at
          ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
          args: [
            familyId,
            siteId,
            FIGMA_OAUTH_CLIENT_ID,
            grantId,
            user.id,
            options.familyStatus ?? "active",
            "2099-01-01T00:00:00.000Z",
            now,
            now,
            options.familyStatus === "revoked" ? now : null,
          ],
        },
        {
          sql: `INSERT INTO aria_oauth_access_tokens (
            id, site_id, client_id, grant_id, principal_id,
            refresh_family_id, token_prefix, token_digest, key_id, audience,
            scopes_json, expires_at, revoked_at, last_used_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'v1', ?, ?, ?, NULL, NULL, ?)`,
          args: [
            accessId,
            options.boundSiteId ?? siteId,
            FIGMA_OAUTH_CLIENT_ID,
            grantId,
            user.id,
            familyId,
            access.prefix,
            await hmacApiValue(
              readApiKeyring(locals),
              "oauth-access",
              access.token,
            ),
            options.audience ?? OAUTH_ACCESS_AUDIENCE,
            JSON.stringify(scopes),
            options.expiresAt ?? "2099-01-01T00:00:00.000Z",
            now,
          ],
        },
      ],
      "write",
    );
    if (options.clientStatus === "disabled") {
      await client.execute({
        sql: `UPDATE aria_oauth_clients SET status = 'disabled' WHERE id = ?`,
        args: [FIGMA_OAUTH_CLIENT_ID],
      });
    }
    return { access, accessId, familyId, grantId };
  }

  function authenticate(
    token: string,
    requiredScopes: readonly FigmaOAuthScope[],
    headers: HeadersInit = {},
    requestLocals = locals,
    origin = "https://site.example",
  ) {
    return authenticateFigmaOAuthRequest({
      request: new Request(`${origin}/api/v1/integrations/figma/context`, {
        headers: { Authorization: `Bearer ${token}`, ...headers },
      }),
      locals: requestLocals,
      requestId: crypto.randomUUID(),
      requiredScopes,
    });
  }

  it("reconstructs the current principal and touches valid token activity", async () => {
    const issued = await issueAccessToken(["figma:context:read"]);
    const result = await authenticate(issued.access.token, [
      "figma:context:read",
    ]);

    expect(result.siteId).toBe(siteId);
    expect(result.user).toEqual(user);
    expect(result.accessToken.id).toBe(issued.accessId);
    expect(
      (result.actionContext.locals as { user?: typeof user }).user,
    ).toEqual(user);
    const activity = await client.execute({
      sql: `SELECT t.last_used_at AS token_used, g.last_used_at AS grant_used
            FROM aria_oauth_access_tokens t
            JOIN aria_oauth_grants g ON g.id = t.grant_id
            WHERE t.id = ?`,
      args: [issued.accessId],
    });
    expect(activity.rows[0]?.token_used).not.toBeNull();
    expect(activity.rows[0]?.grant_used).not.toBeNull();
  });

  it("rejects a valid token that lacks the route scope", async () => {
    const issued = await issueAccessToken(["figma:context:read"]);
    let error: ApiHttpError;
    try {
      await authenticate(issued.access.token, ["figma:assets:write"]);
      throw new Error("Expected OAuth resource authentication to fail");
    } catch (cause) {
      if (!(cause instanceof ApiHttpError)) throw cause;
      error = cause;
    }
    expect(error).toMatchObject({ status: 403, code: "forbidden" });
    expect(error.headers.get("WWW-Authenticate")).toContain(
      'error="insufficient_scope"',
    );
    expect(error.headers.get("WWW-Authenticate")).toContain(
      'scope="figma:assets:write"',
    );
  });

  it("does not let token scopes exceed the persisted grant", async () => {
    const issued = await issueAccessToken(["figma:assets:write"], {
      grantScopes: ["figma:context:read"],
    });
    await expect(
      authenticate(issued.access.token, ["figma:assets:write"]),
    ).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });

  it("rechecks the principal capability on every request", async () => {
    const issued = await issueAccessToken(["figma:imports:write"]);
    state.authAdapter = {
      getUserById: vi.fn(async () => ({ ...user, role: "contributor" })),
    };
    await expect(
      authenticate(issued.access.token, ["figma:imports:write"]),
    ).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });

  it.each([
    ["expired token", { expiresAt: "2020-01-01T00:00:00.000Z" }],
    ["wrong audience", { audience: "another-audience" }],
    ["wrong site", { boundSiteId: "20000000-0000-4000-8000-000000000099" }],
    [
      "inconsistent authority binding",
      { grantSiteId: "20000000-0000-4000-8000-000000000099" },
    ],
    ["disabled client", { clientStatus: "disabled" as const }],
    ["revoked grant", { grantStatus: "revoked" as const }],
    ["revoked refresh family", { familyStatus: "revoked" as const }],
  ])("rejects a token with %s", async (_label, options) => {
    const issued = await issueAccessToken(["figma:context:read"], options);
    await expect(
      authenticate(issued.access.token, ["figma:context:read"]),
    ).rejects.toMatchObject({ status: 401, code: "unauthorized" });
  });

  it("rejects a modified secret even when its lookup prefix exists", async () => {
    const issued = await issueAccessToken(["figma:context:read"]);
    const replacement = issued.access.token.endsWith("x") ? "y" : "x";
    await expect(
      authenticate(`${issued.access.token.slice(0, -1)}${replacement}`, [
        "figma:context:read",
      ]),
    ).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    const audits = await client.execute({
      sql: `SELECT resource_id, outcome, metadata_json
            FROM aria_integration_audit
            WHERE event_type = 'oauth.resource.denied'`,
      args: [],
    });
    expect(audits.rows[0]).toMatchObject({
      resource_id: issued.accessId,
      outcome: "invalid_token",
    });
    expect(JSON.stringify(audits.rows)).not.toContain(issued.access.token);
  });

  it("rejects an adapter result for a different principal", async () => {
    const issued = await issueAccessToken(["figma:context:read"]);
    state.authAdapter = {
      getUserById: vi.fn(async () => ({
        ...user,
        id: "10000000-0000-4000-8000-000000000099",
      })),
    };
    await expect(
      authenticate(issued.access.token, ["figma:context:read"]),
    ).rejects.toMatchObject({ status: 401, code: "unauthorized" });
  });

  it("rejects cookie credentials even when the bearer token is valid", async () => {
    const issued = await issueAccessToken(["figma:context:read"]);
    await expect(
      authenticate(issued.access.token, ["figma:context:read"], {
        Cookie: "aria_session=not-accepted",
      }),
    ).rejects.toMatchObject({ status: 400, code: "bad_request" });
  });

  it("denies resource authentication when OAuth is disabled", async () => {
    const issued = await issueAccessToken(["figma:context:read"]);
    await expect(
      authenticate(
        issued.access.token,
        ["figma:context:read"],
        {},
        {
          cfBindings: {
            ...locals.cfBindings,
            ARIA_OAUTH_ENABLED: "false",
          },
        },
      ),
    ).rejects.toMatchObject({ status: 401, code: "unauthorized" });
  });

  it("denies a token presented through a non-canonical origin", async () => {
    const issued = await issueAccessToken(["figma:context:read"]);
    await expect(
      authenticate(
        issued.access.token,
        ["figma:context:read"],
        {},
        locals,
        "https://alias.example",
      ),
    ).rejects.toMatchObject({ status: 401, code: "unauthorized" });
  });
});
