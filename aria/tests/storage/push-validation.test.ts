import { describe, expect, it } from "vitest";

import {
  assertNoPushValidationErrors,
  D1_MAX_STRING_OR_ROW_BYTES,
  D1_SAFE_INLINE_STATEMENT_BYTES,
  estimateSqlLiteralStatementBytes,
  validateDslJsonPayload,
} from "../../lib/storage/push-validation";

describe("push-validation", () => {
  it("flags payloads above the D1 row limit", () => {
    const issues = validateDslJsonPayload({
      resourceType: "page",
      resourceId: "index",
      dslJson: "x".repeat(D1_MAX_STRING_OR_ROW_BYTES + 1),
    });

    expect(issues.some((issue) => issue.level === "error")).toBe(true);
    expect(() => assertNoPushValidationErrors(issues)).toThrow(
      /Content push validation failed/,
    );
  });

  it("warns when inline SQL would exceed the safe statement threshold", () => {
    const payload = "x".repeat(D1_SAFE_INLINE_STATEMENT_BYTES);
    const issues = validateDslJsonPayload({
      resourceType: "page",
      resourceId: "index",
      dslJson: payload,
    });

    expect(issues.some((issue) => issue.level === "warn")).toBe(true);
    assertNoPushValidationErrors(issues);
  });

  it("accounts for SQL escaping in statement size estimates", () => {
    const escapedEstimate = estimateSqlLiteralStatementBytes("it's");
    expect(escapedEstimate).toBeGreaterThan(Buffer.byteLength("it's", "utf8"));
  });
});
