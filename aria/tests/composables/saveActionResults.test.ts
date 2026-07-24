import { describe, expect, it } from "vitest";

describe("saveActionResults", () => {
  it("accepts save payloads with a version and optional embedded success", async () => {
    const { parseSaveActionData } =
      await import("../../admin/composables/saveActionResults");

    expect(parseSaveActionData({ version: "v1" }, "page")).toEqual({
      version: "v1",
    });
    expect(
      parseSaveActionData(
        { version: "v-component", success: true },
        "component",
      ),
    ).toEqual({
      version: "v-component",
      success: true,
    });
  });

  it("rejects malformed or embedded-failure save payloads", async () => {
    const { parseSaveActionData } =
      await import("../../admin/composables/saveActionResults");

    expect(() =>
      parseSaveActionData({ version: 42, success: true }, "component"),
    ).toThrow("Invalid component save response");

    expect(() =>
      parseSaveActionData(
        { version: "v-component", success: false },
        "component",
      ),
    ).toThrow("Invalid component save response");
  });
});
