import { describe, expect, it, vi } from "vitest";
import type { SessionUser } from "../../lib/auth/types";

vi.mock("astro:actions", () => ({
  ActionError: class MockActionError extends Error {
    code: string;
    constructor(input: { code: string; message: string }) {
      super(input.message);
      this.code = input.code;
    }
  },
  defineAction: <T extends Record<string, unknown>>(config: T) => config,
}));

const actor: SessionUser = {
  id: "22222222-2222-4222-8222-222222222222",
  username: "editor",
  email: "editor@example.com",
  role: "content-editor",
  totpEnabled: false,
};

function createContext() {
  return {
    locals: { user: actor },
  } as never;
}

interface GoogleFontListResult {
  success: true;
  fonts: Array<{
    family: string;
    variants: string[];
    subsets: string[];
    category: string;
  }>;
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

describe("fonts.listGoogle", () => {
  it("returns popular fonts first in stable alphabetical order", async () => {
    const { handleListGoogleFonts } = await import("../../actions/fonts");

    const result = (await handleListGoogleFonts(
      { limit: 5, offset: 0 },
      createContext(),
    )) as GoogleFontListResult;

    expect(result).toMatchObject({
      success: true,
      total: 1899,
      offset: 0,
      limit: 5,
      hasMore: true,
    });
    expect(result.fonts.map((font) => font.family)).toEqual([
      "Bricolage Grotesque",
      "DM Sans",
      "Fira Code",
      "Geist",
      "Instrument Serif",
    ]);
  });

  it("paginates without changing the filtered total", async () => {
    const { handleListGoogleFonts } = await import("../../actions/fonts");

    const firstPage = (await handleListGoogleFonts(
      { limit: 3, offset: 0 },
      createContext(),
    )) as GoogleFontListResult;
    const secondPage = (await handleListGoogleFonts(
      { limit: 3, offset: 3 },
      createContext(),
    )) as GoogleFontListResult;

    expect(firstPage.total).toBe(1899);
    expect(secondPage).toMatchObject({
      total: 1899,
      offset: 3,
      limit: 3,
      hasMore: true,
    });
    expect(secondPage.fonts.map((font) => font.family)).toEqual([
      "Geist",
      "Instrument Serif",
      "Inter",
    ]);
  });

  it("combines search and category before applying pagination", async () => {
    const { handleListGoogleFonts } = await import("../../actions/fonts");

    const result = (await handleListGoogleFonts(
      {
        search: "mono",
        category: "monospace",
        limit: 2,
        offset: 1,
      },
      createContext(),
    )) as GoogleFontListResult;

    expect(result).toMatchObject({
      success: true,
      offset: 1,
      limit: 2,
      hasMore: true,
    });
    expect(result.total).toBeGreaterThan(result.fonts.length);
    expect(result.fonts).toHaveLength(2);
    expect(
      result.fonts.every(
        (font) =>
          font.category === "monospace" &&
          font.family.toLowerCase().includes("mono"),
      ),
    ).toBe(true);
  });
});
