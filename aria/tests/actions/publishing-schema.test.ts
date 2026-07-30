import { describe, expect, it } from "vitest";

import { PublishPageInputSchema } from "../../actions/publishing";

const validPublishInput = {
  id: "page-1",
  expectedVersion: "draft-v1",
};

describe("PublishPageInputSchema", () => {
  it("accepts only an exact saved revision pointer", () => {
    expect(PublishPageInputSchema.safeParse(validPublishInput).success).toBe(
      true,
    );
  });

  it("rejects missing versions and stale client-side page snapshots", () => {
    expect(
      PublishPageInputSchema.safeParse({
        id: "page-1",
      }).success,
    ).toBe(false);
    expect(
      PublishPageInputSchema.safeParse({
        ...validPublishInput,
        nodes: [{ id: "hero", type: "Section" }],
      }).success,
    ).toBe(false);
  });
});
