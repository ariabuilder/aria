import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  ariaListPages,
  ariaReadPage,
} from "../../../../admin/features/Agent/lib/tools/content/readTools";
import { readResourceForTool } from "../../../../admin/features/Agent/lib/tools/content/readResource";
import type { AgentToolActionContext } from "../../../../admin/features/Agent/lib/tools/types";
import type { SessionUser } from "../../../../lib/auth/types";
import type { PageDSL } from "../../../../lib/types/nodes";

const getPublishedPageDSL = vi.fn();
const getPageDSL = vi.fn();

vi.mock("../../../../actions/_shared", () => ({
  getAdapter: vi.fn(async () => ({
    getPublishedPageDSL,
    getPageDSL,
    getLayoutDSL: vi.fn(),
    getComponentDSL: vi.fn(),
  })),
}));

vi.mock("../../../../lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/auth")>();
  return {
    ...actual,
    requireOperation: vi.fn(async () => undefined),
  };
});

const TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000";

function createContext(
  role: SessionUser["role"] = "administrator",
): AgentToolActionContext {
  return {
    locals: {} as App.Locals,
    request: new Request("https://aria.test"),
    user: {
      id: TEST_USER_ID,
      username: "test",
      email: "test@example.com",
      role,
      totpEnabled: false,
      preferences: {},
    },
  };
}

describe("read tools", () => {
  beforeEach(() => {
    getPublishedPageDSL.mockReset();
    getPageDSL.mockReset();
  });

  it("denies page list for contributors without page access", async () => {
    const result = await ariaListPages(createContext("contributor"), {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORBIDDEN");
      expect(result.error.message).toContain("page content");
    }
  });

  it("rejects invalid read page input", async () => {
    const result = await ariaReadPage(createContext(), { slug: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  it("loads published pages via getPublishedPageDSL", async () => {
    getPublishedPageDSL.mockResolvedValue({
      id: "pricing",
      slug: "pricing",
      title: "Pricing",
      nodes: [],
      status: "published",
    });

    const result = await readResourceForTool(createContext(), {
      collection: "pages",
      slug: "pricing",
      target: "published",
    });

    expect(result.ok).toBe(true);
    expect(getPublishedPageDSL).toHaveBeenCalledWith("pricing");
    if (result.ok) {
      expect((result.data as PageDSL).slug).toBe("pricing");
    }
  });

  it("loads draft pages via getPageDSL", async () => {
    getPageDSL.mockResolvedValue({
      id: "home",
      slug: "home",
      title: "Home",
      nodes: [],
      status: "draft",
    });

    const result = await readResourceForTool(createContext(), {
      collection: "pages",
      slug: "home",
      target: "draft",
    });

    expect(result.ok).toBe(true);
    expect(getPageDSL).toHaveBeenCalledWith("home");
  });
});
