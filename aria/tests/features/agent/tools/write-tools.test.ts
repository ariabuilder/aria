import { describe, expect, it, vi, beforeEach } from "vitest";
import { ariaUpdatePageMeta } from "../../../../admin/features/Agent/lib/tools/content/writeTools";
import type { AgentToolActionContext } from "../../../../admin/features/Agent/lib/tools/types";
import type { SessionUser } from "../../../../lib/auth/types";

const getPageDSL = vi.fn();
const listPagesDSL = vi.fn();

vi.mock("../../../../actions/_shared", () => ({
  getAdapter: vi.fn(async () => ({
    getPageDSL,
    listPagesDSL,
    getSiteSettings: vi.fn(async () => ({})),
    listStoredPageThumbnailKeys: vi.fn(async () => new Set<string>()),
    listStoredComponentThumbnailKeys: vi.fn(async () => new Set<string>()),
  })),
}));

vi.mock("../../../../actions/crud", () => ({
  handleCreateItem: vi.fn(async () => ({ success: true, slug: "contact-us" })),
  handleUpdateItem: vi.fn(async () => ({ success: true, slug: "contact" })),
  handleDeleteItem: vi.fn(async () => ({ success: true })),
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

describe("aria_update_page_meta", () => {
  beforeEach(() => {
    getPageDSL.mockReset();
    listPagesDSL.mockReset();
  });

  it("denies contributors without editPages", async () => {
    const result = await ariaUpdatePageMeta(createContext("contributor"), {
      slug: "contact",
      title: "Contact",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORBIDDEN");
    }
  });

  it("rejects invalid input", async () => {
    const result = await ariaUpdatePageMeta(createContext(), { slug: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  it("returns NOT_FOUND for missing pages", async () => {
    getPageDSL.mockResolvedValue(null);

    const result = await ariaUpdatePageMeta(createContext(), {
      slug: "missing",
      title: "Missing",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("updates title without changing slug", async () => {
    getPageDSL.mockResolvedValue({
      id: "contact",
      slug: "contact",
      title: "Contact",
      nodes: [],
    });

    const result = await ariaUpdatePageMeta(createContext(), {
      slug: "contact",
      title: "Contact Us",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        slug: "contact",
        title: "Contact Us",
      });
    }
  });

  it("blocks renaming the home page slug", async () => {
    getPageDSL.mockResolvedValue({
      id: "index",
      slug: "index",
      title: "Home",
      nodes: [],
    });
    listPagesDSL.mockResolvedValue([
      { id: "index", slug: "index", title: "Home" },
    ]);

    const result = await ariaUpdatePageMeta(createContext(), {
      slug: "index",
      newSlug: "home",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Home page slug");
    }
  });

  it("blocks duplicate slug targets", async () => {
    getPageDSL.mockResolvedValue({
      id: "contact",
      slug: "contact",
      title: "Contact",
      nodes: [],
    });
    listPagesDSL.mockResolvedValue([
      { id: "contact", slug: "contact", title: "Contact" },
      { id: "contact-us", slug: "contact-us", title: "Contact Us" },
    ]);

    const result = await ariaUpdatePageMeta(createContext(), {
      slug: "contact",
      newSlug: "contact-us",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("already exists");
    }
  });
});
