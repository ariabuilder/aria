import { describe, expect, it } from "vitest";

import {
  BORDER_STYLE_LABELS,
  BorderStyleSchema,
} from "../../admin/features/Inspector/schemas/border.schema";

describe("border schema", () => {
  it("accepts the hidden border style and exposes its label", () => {
    expect(BorderStyleSchema.safeParse("hidden").success).toBe(true);
    expect(BORDER_STYLE_LABELS.hidden).toBe("Hidden");
  });
});
