import { describe, expect, it } from "vitest";
import { isEmptyLibraryComponentPayload } from "../../../admin/features/Nodes/events/shared/libraryComponentGuard";

describe("isEmptyLibraryComponentPayload", () => {
  it("detects library component entries without a master id", () => {
    expect(
      isEmptyLibraryComponentPayload("component", {
        type: "Component",
        reference: { type: "instance", masterId: "" },
      }),
    ).toBe(true);
  });

  it("allows component inserts when a slug is provided", () => {
    expect(
      isEmptyLibraryComponentPayload(
        "component",
        { type: "Component" },
        "hero-block",
      ),
    ).toBe(false);
  });

  it("ignores non-component payloads", () => {
    expect(isEmptyLibraryComponentPayload("text", { type: "text" })).toBe(false);
  });
});
