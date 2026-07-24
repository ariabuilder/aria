import { describe, expect, it } from "vitest";
import { mergeCatalogModels } from "../../../admin/features/Agent/lib/inference/catalogMerge";
import { fetchOpencodeModels } from "../../../admin/features/Agent/lib/inference/opencodeCatalog";
import {
  opencodeModelDisplayName,
  OPENCODE_ZEN_ENSURED_MODELS,
} from "../../../admin/features/Agent/lib/inference/opencodeProviders";

describe("OpenCode catalog", () => {
  it("formats known model display names", () => {
    expect(opencodeModelDisplayName("big-pickle")).toBe("Big Pickle");
    expect(opencodeModelDisplayName("opencode/big-pickle")).toBe("Big Pickle");
    expect(opencodeModelDisplayName("gpt-5.4-mini")).toBe("Gpt 5.4 Mini");
  });

  it("merges API models with fallback entries", () => {
    const merged = mergeCatalogModels(
      [{ id: "opencode/gpt-5", name: "GPT 5" }],
      [{ id: "opencode/big-pickle", name: "Big Pickle" }],
    );

    expect(merged).toEqual([
      { id: "opencode/big-pickle", name: "Big Pickle" },
      { id: "opencode/gpt-5", name: "GPT 5" },
    ]);
  });

  it("ensures big-pickle is included for zen when API omits it", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          object: "list",
          data: [{ id: "gpt-5", object: "model", owned_by: "opencode" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    try {
      const models = await fetchOpencodeModels("zen", "test-key");
      expect(models.some((model) => model.id === "big-pickle")).toBe(true);
      expect(
        models.find((model) => model.id === "big-pickle")?.name,
      ).toBe("Big Pickle");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not inject zen ensured models into go catalog", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ object: "list", data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    try {
      const models = await fetchOpencodeModels("go", "test-key");
      expect(models.some((model) => model.id === "big-pickle")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps ensured model metadata stable", () => {
    expect(OPENCODE_ZEN_ENSURED_MODELS).toEqual([
      { id: "big-pickle", name: "Big Pickle" },
    ]);
  });
});
