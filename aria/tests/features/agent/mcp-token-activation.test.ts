import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getStorageAdapterAsyncMock,
  createMcpTokenRecordMock,
  filterAllowedMcpScopesMock,
  assertMcpScopesAllowedForUserMock,
  requireAuthMock,
  requireOperationMock,
  touchContentRevisionForActionMock,
} = vi.hoisted(() => ({
  getStorageAdapterAsyncMock: vi.fn(),
  createMcpTokenRecordMock: vi.fn(),
  filterAllowedMcpScopesMock: vi.fn(),
  assertMcpScopesAllowedForUserMock: vi.fn(),
  requireAuthMock: vi.fn(),
  requireOperationMock: vi.fn(),
  touchContentRevisionForActionMock: vi.fn(),
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

vi.mock("../../../lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/auth")>();
  return {
    ...actual,
    requireAuth: requireAuthMock,
    requireOperation: requireOperationMock,
  };
});

vi.mock("../../../lib/storage/getStorageAdapter", () => ({
  getStorageAdapterAsync: getStorageAdapterAsyncMock,
}));

vi.mock("../../../lib/content-sync/mutations", () => ({
  touchContentRevisionForAction: touchContentRevisionForActionMock,
}));

vi.mock("../../../admin/features/Agent/lib/mcp/tokenStore", () => ({
  createMcpTokenRecord: createMcpTokenRecordMock,
  listMcpTokenRecords: vi.fn(),
  revokeMcpTokenRecord: vi.fn(),
  updateMcpTokenScopes: vi.fn(),
}));

vi.mock("../../../admin/features/Agent/lib/mcp/scopes", () => ({
  filterAllowedMcpScopes: filterAllowedMcpScopesMock,
  assertMcpScopesAllowedForUser: assertMcpScopesAllowedForUserMock,
}));

import { agent } from "../../../admin/features/Agent/actions/agent";

const USER = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  username: "admin",
  email: "admin@example.com",
  role: "administrator" as const,
  totpEnabled: false,
};

describe("MCP token activation", () => {
  const storageAdapter = {
    getSiteSettings: vi.fn(),
    saveSiteSettings: vi.fn(),
    appendSettingsAuditEntry: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue(USER);
    requireOperationMock.mockResolvedValue(USER);
    filterAllowedMcpScopesMock.mockImplementation((scopes) => scopes);
    getStorageAdapterAsyncMock.mockResolvedValue(storageAdapter);
    storageAdapter.getSiteSettings.mockResolvedValue({
      agent: { mcpEnabled: false },
    });
    storageAdapter.saveSiteSettings.mockResolvedValue(undefined);
    storageAdapter.appendSettingsAuditEntry.mockResolvedValue(undefined);
    touchContentRevisionForActionMock.mockResolvedValue(undefined);
    createMcpTokenRecordMock.mockResolvedValue({
      token: "aria_mcp_secret",
      record: {
        id: "660e8400-e29b-41d4-a716-446655440000",
        type: "personal",
        name: "Personal",
        tokenPrefix: "aria_mcp_secret",
        userId: USER.id,
        createdByUserId: USER.id,
        createdByUsername: USER.username,
        scopes: ["mcp:read"],
        expiresAt: null,
        createdAt: "2026-07-14T00:00:00.000Z",
        lastUsedAt: null,
        revokedAt: null,
      },
    });
  });

  it("enables MCP before issuing the first token", async () => {
    await (agent.createMcpToken as any).handler(
      { type: "personal", name: "Personal", scopes: ["mcp:read"] },
      { locals: {} },
    );

    expect(storageAdapter.saveSiteSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: expect.objectContaining({ mcpEnabled: true }),
      }),
      expect.anything(),
    );
    expect(storageAdapter.appendSettingsAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: "enable-mcp" }),
    );
    expect(
      storageAdapter.saveSiteSettings.mock.invocationCallOrder[0],
    ).toBeLessThan(createMcpTokenRecordMock.mock.invocationCallOrder[0]);
  });
});
