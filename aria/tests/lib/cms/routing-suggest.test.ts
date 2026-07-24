import { describe, expect, it } from "vitest";

import {
  suggestCollectionUrlPattern,
  SuggestCollectionUrlPatternInputSchema,
} from "../../../lib/cms/routing";

describe("suggestCollectionUrlPattern", () => {
  it("builds a slug pattern from the collection name", () => {
    expect(
      suggestCollectionUrlPattern({ collectionName: "posts" }),
    ).toBe("/posts/{slug}");
    expect(
      suggestCollectionUrlPattern({ collectionName: "launch-notes" }),
    ).toBe("/launch-notes/{slug}");
  });

  it("validates input with zod", () => {
    expect(() =>
      suggestCollectionUrlPattern({ collectionName: "Invalid Name" }),
    ).toThrow();
    expect(() => suggestCollectionUrlPattern({ collectionName: "" })).toThrow();
  });

  it("exports a strict input schema", () => {
    expect(
      SuggestCollectionUrlPatternInputSchema.safeParse({
        collectionName: "blog",
      }).success,
    ).toBe(true);
    expect(
      SuggestCollectionUrlPatternInputSchema.safeParse({
        collectionName: "blog",
        extra: true,
      }).success,
    ).toBe(false);
  });
});
