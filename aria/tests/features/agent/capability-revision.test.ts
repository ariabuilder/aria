import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  createCapabilityRevision,
} from "../../../admin/features/Agent/lib/capabilities/revision";

describe("capability revisions", () => {
  it("is stable across object key order and ignores undefined fields", async () => {
    const left = { b: 2, a: { y: undefined, x: 1 } };
    const right = { a: { x: 1 }, b: 2 };

    expect(canonicalJson(left)).toBe('{"a":{"x":1},"b":2}');
    await expect(createCapabilityRevision(left)).resolves.toBe(
      await createCapabilityRevision(right),
    );
  });

  it("changes when nested values change", async () => {
    await expect(createCapabilityRevision({ value: 1 })).resolves.not.toBe(
      await createCapabilityRevision({ value: 2 }),
    );
  });
});
