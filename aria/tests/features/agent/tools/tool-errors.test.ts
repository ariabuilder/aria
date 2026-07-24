import { describe, expect, it } from "vitest";
import {
  createToolError,
  formatToolErrorForModel,
  mapActionErrorToToolError,
  toolErrorFromZod,
} from "../../../../admin/features/Agent/lib/tools/toolErrors";
import { z } from "zod";

describe("Agent tool errors", () => {
  it("maps generic not-found errors", () => {
    const error = mapActionErrorToToolError(new Error("Resource not found"));
    expect(error.code).toBe("NOT_FOUND");
  });

  it("formats zod issues", () => {
    const schema = z.object({ slug: z.string().min(1) });
    const parsed = schema.safeParse({});
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const err = toolErrorFromZod("Bad input", parsed.error.issues);
      expect(err.code).toBe("INVALID_INPUT");
      expect(err.zodIssues?.length).toBeGreaterThan(0);
    }
  });

  it("formats model-facing string", () => {
    const text = formatToolErrorForModel(
      createToolError({
        code: "NO_OPEN_DOCUMENT",
        message: "Composer not open",
        suggestedFix: "Open Composer",
      }),
    );
    expect(text).toContain("NO_OPEN_DOCUMENT");
    expect(text).toContain("Open Composer");
  });
});
