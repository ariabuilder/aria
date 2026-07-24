import { describe, expect, it } from "vitest";

import {
  buildReplaceClearStatements,
  PUSH_REPLACE_CLEAR_TABLES,
} from "../../lib/storage/push-canonical-clear";

describe("push-canonical-clear", () => {
  it("does not clear content-sync metadata tables", () => {
    const tables = PUSH_REPLACE_CLEAR_TABLES.join(",");

    expect(tables).not.toContain("aria_content_sync_items");
    expect(tables).not.toContain("aria_content_sync_jobs");
    expect(tables).not.toContain("aria_content_site_state");
  });

  it("builds delete statements for canonical tables", () => {
    const statements = buildReplaceClearStatements();

    expect(statements.length).toBe(PUSH_REPLACE_CLEAR_TABLES.length);
    expect(statements[0]?.sql).toMatch(/^DELETE FROM aria_/);
  });
});
