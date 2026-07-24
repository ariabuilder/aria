/** D1 limits: https://developers.cloudflare.com/d1/platform/limits/ */

export const D1_MAX_SQL_STATEMENT_BYTES = 100_000;
export const D1_MAX_STRING_OR_ROW_BYTES = 2_000_000;
/** Leave headroom for SQL wrapper text and escaping when estimating statement size. */
export const D1_SAFE_INLINE_STATEMENT_BYTES = 95_000;

export type PushValidationIssue = {
  level: "error" | "warn";
  message: string;
  resourceType?: string;
  resourceId?: string;
};

export function estimateSqlLiteralStatementBytes(value: string): number {
  const escaped = value.replace(/'/g, "''");
  return escaped.length + 64;
}

export function validateDslJsonPayload(input: {
  resourceType: string;
  resourceId: string;
  dslJson: string;
}): PushValidationIssue[] {
  const issues: PushValidationIssue[] = [];
  const bytes = Buffer.byteLength(input.dslJson, "utf8");

  if (bytes > D1_MAX_STRING_OR_ROW_BYTES) {
    issues.push({
      level: "error",
      message: `${input.resourceType} "${input.resourceId}" dsl_json is ${bytes} bytes (D1 max ${D1_MAX_STRING_OR_ROW_BYTES}). Slim content or split storage before pushing.`,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
    });
    return issues;
  }

  const estimatedStatement = estimateSqlLiteralStatementBytes(input.dslJson);

  if (estimatedStatement > D1_SAFE_INLINE_STATEMENT_BYTES) {
    issues.push({
      level: "warn",
      message: `${input.resourceType} "${input.resourceId}" is ~${Math.round(bytes / 1024)} KB (over D1's 100 KB SQL-file limit). This push uses parameterized writes and is OK; do not use legacy SQL seed for this resource.`,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
    });
  }

  return issues;
}

export function assertNoPushValidationErrors(
  issues: readonly PushValidationIssue[],
): void {
  const errors = issues.filter((issue) => issue.level === "error");

  if (errors.length === 0) {
    return;
  }

  throw new Error(
    `Content push validation failed:\n${errors.map((issue) => `- ${issue.message}`).join("\n")}`,
  );
}
