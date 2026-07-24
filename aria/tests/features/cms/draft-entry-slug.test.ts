import { describe, expect, it } from "vitest";

import {
  createReadableDraftEntrySlug,
  DraftEntrySlugSchema,
} from "../../../admin/features/CMS/lib/draftEntrySlug";

describe("CMS draft entry slugs", () => {
  it("creates readable timestamp draft slugs", () => {
    const slug = createReadableDraftEntrySlug(
      new Date(2026, 5, 26, 14, 27, 5),
    );

    expect(slug).toBe("untitled-entry-2026-06-26-142705");
    expect(DraftEntrySlugSchema.parse(slug)).toBe(slug);
  });
});
