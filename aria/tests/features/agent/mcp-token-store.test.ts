import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listMcpTokenRecords,
  revokeMcpTokenRecord,
  updateMcpTokenScopes,
} from "../../../admin/features/Agent/lib/mcp/tokenStore";
import type { SessionUser } from "../../../lib/auth";

const { getTokenDbMock, tokenDb } = vi.hoisted(() => {
  const tokenDb = {
    execute: vi.fn(),
    queryAll: vi.fn(),
    queryFirst: vi.fn(),
  };
  return {
    getTokenDbMock: vi.fn(),
    tokenDb,
  };
});

vi.mock("../../../admin/features/Agent/lib/mcp/tokenDb", () => ({
  getTokenDb: (...args: unknown[]) => getTokenDbMock(...args),
}));

const USER: SessionUser = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  username: "editor",
  email: "editor@example.com",
  role: "contributor",
  totpEnabled: false,
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "660e8400-e29b-41d4-a716-446655440000",
    type: "personal",
    name: "Personal",
    token_hash: "hash",
    token_prefix: "aria_mcp_abcd",
    user_id: USER.id,
    created_by_user_id: USER.id,
    created_by_username: USER.username,
    scopes: JSON.stringify(["mcp:read"]),
    expires_at: null,
    created_at: "2026-06-29T00:00:00.000Z",
    last_used_at: null,
    revoked_at: null,
    ...overrides,
  };
}

describe("MCP token store authorization filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTokenDbMock.mockResolvedValue(tokenDb);
    tokenDb.execute.mockResolvedValue(undefined);
    tokenDb.queryAll.mockResolvedValue([]);
    tokenDb.queryFirst.mockResolvedValue(null);
  });

  it("lists only the actor's active personal tokens in personal mode", async () => {
    tokenDb.queryAll.mockResolvedValue([row()]);

    await listMcpTokenRecords({
      locals: {},
      actorUser: USER,
      mode: "personal",
    });

    expect(tokenDb.queryAll).toHaveBeenCalledWith(
      expect.stringContaining("type = ? AND user_id = ?"),
      ["personal", USER.id],
    );
  });

  it("lists all active tokens in global mode", async () => {
    await listMcpTokenRecords({
      locals: {},
      actorUser: USER,
      mode: "global",
    });

    expect(tokenDb.queryAll).toHaveBeenCalledWith(
      expect.stringContaining("revoked_at IS NULL"),
      [],
    );
  });

  it("does not revoke a token outside the actor's personal scope", async () => {
    tokenDb.queryFirst.mockResolvedValue(null);

    const revoked = await revokeMcpTokenRecord({
      locals: {},
      actorUser: USER,
      mode: "personal",
      tokenId: "770e8400-e29b-41d4-a716-446655440000",
    });

    expect(revoked).toBe(false);
    expect(tokenDb.execute).not.toHaveBeenCalled();
  });

  it("updates only an authorized personal token", async () => {
    tokenDb.queryFirst
      .mockResolvedValueOnce({ id: "660e8400-e29b-41d4-a716-446655440000" })
      .mockResolvedValueOnce(row({ scopes: JSON.stringify(["mcp:read"]) }));

    await updateMcpTokenScopes({
      locals: {},
      actorUser: USER,
      mode: "personal",
      tokenId: "660e8400-e29b-41d4-a716-446655440000",
      scopes: ["mcp:read"],
    });

    expect(tokenDb.queryFirst.mock.calls[0]).toEqual([
      expect.stringContaining("type = ? AND user_id = ?"),
      ["660e8400-e29b-41d4-a716-446655440000", "personal", USER.id],
    ]);
    expect(tokenDb.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE aria_mcp_tokens SET scopes = ?"),
      [JSON.stringify(["mcp:read"]), "660e8400-e29b-41d4-a716-446655440000"],
    );
  });
});
