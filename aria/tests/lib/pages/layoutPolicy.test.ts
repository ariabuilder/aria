import { describe, expect, it, vi } from "vitest";

vi.mock("astro:actions", () => ({
  ActionError: class MockActionError extends Error {
    code: string;
    constructor(input: { code: string; message: string }) {
      super(input.message);
      this.code = input.code;
    }
  },
}));

import { assertPageLayoutChangeAllowed } from "../../../lib/pages/layoutPolicy.server";
import { normalizePageLayoutRef } from "../../../lib/pages/layoutPolicy";
import { requireCapability } from "../../../lib/auth";
import type { SessionUser } from "../../../lib/auth/types";

vi.mock("../../../lib/auth", () => ({
  requireCapability: vi.fn(),
}));

const manager: SessionUser = {
  id: "33333333-3333-4333-8333-333333333333",
  username: "manager",
  email: "manager@example.com",
  role: "manager",
  totpEnabled: false,
};

function createContext(user: SessionUser) {
  return {
    cookies: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
      headers: vi.fn(),
    },
    locals: { user },
  } as never;
}

describe("layoutPolicy", () => {
  it("normalizes empty layout refs to undefined", () => {
    expect(normalizePageLayoutRef(undefined)).toBeUndefined();
    expect(normalizePageLayoutRef(null)).toBeUndefined();
    expect(normalizePageLayoutRef("")).toBeUndefined();
    expect(normalizePageLayoutRef("  ")).toBeUndefined();
    expect(normalizePageLayoutRef("blog")).toBe("blog");
  });

  it("treats empty string and undefined as equivalent for layout changes", async () => {
    await assertPageLayoutChangeAllowed(createContext(manager), "", undefined);
    expect(requireCapability).not.toHaveBeenCalled();
  });

  it("requires editPageStructure when layout changes", async () => {
    vi.mocked(requireCapability).mockResolvedValueOnce(manager);

    await assertPageLayoutChangeAllowed(
      createContext(manager),
      "old-layout",
      "new-layout",
    );

    expect(requireCapability).toHaveBeenCalledWith(
      expect.anything(),
      "editPageStructure",
    );
  });
});
