import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { pages } from "../../../../actions/pages";
import { ariaListPages } from "../../../../admin/features/Agent/lib/tools/content/readTools";
import type { AgentToolActionContext } from "../../../../admin/features/Agent/lib/tools/types";
import type { SessionUser } from "../../../../lib/auth/types";
import { SQLiteStorageAdapter } from "../../../../lib/storage/sqlite";
import { getActionHandler } from "../../../helpers/actionHandler";

const TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000";

const adminUser: SessionUser = {
  id: TEST_USER_ID,
  username: "admin",
  email: "admin@example.com",
  role: "administrator",
  totpEnabled: false,
  preferences: {},
};

let client: Client;
let adapter: SQLiteStorageAdapter;

vi.mock("../../../../lib/storage/getStorageAdapter", () => ({
  getStorageAdapterAsync: vi.fn(async () => adapter),
  clearStorageAdapterCache: vi.fn(),
}));

vi.mock("../../../../lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/auth")>();
  return {
    ...actual,
    requireAuth: vi.fn(async () => adminUser),
    requireOperation: vi.fn(async () => adminUser),
  };
});

function createContext(): AgentToolActionContext {
  return {
    locals: {} as App.Locals,
    request: new Request("https://aria.test/admin"),
    user: adminUser,
  };
}

describe("ariaListPages integration", () => {
  beforeAll(() => {
    client = createClient({ url: "file::memory:" });
    adapter = new SQLiteStorageAdapter(client, {
      seedStarterPages: true,
    });
  });

  afterAll(() => {
    client.close();
  });

  it("lists pages from sqlite through the tool handler", async () => {
    const result = await ariaListPages(createContext(), {});
    expect(result.ok, result.ok ? undefined : result.error.message).toBe(true);
    if (result.ok) {
      expect(result.data.pages.length).toBeGreaterThan(0);
    }
  });

  it("pages.listInventory handler returns data directly", async () => {
    const raw = await getActionHandler(pages.listInventory)(
      undefined,
      {
        locals: {} as App.Locals,
        request: new Request("https://aria.test/admin"),
      },
    );
    expect(Array.isArray((raw as { pages: unknown[] }).pages)).toBe(true);
    expect((raw as { pages: unknown[] }).pages.length).toBeGreaterThan(0);
  });
});
