import { describe, expect, it } from "vitest";

import {
  assertRemoteResetConfirmed,
  buildRemoteD1ResetSql,
  parseD1DatabaseInfo,
  parseD1SchemaObjects,
  parseRemoteResetArgs,
  parseResetVerification,
} from "../../scripts/reset-remote-d1";

describe("remote D1 reset guard", () => {
  it("defaults to an unconfirmed aria_db target", () => {
    expect(parseRemoteResetArgs([])).toEqual({
      binding: "aria_db",
      confirm: undefined,
      dryRun: false,
      help: false,
    });
    expect(parseRemoteResetArgs(["--dry-run", "--binding=preview_db"])).toEqual(
      {
        binding: "preview_db",
        confirm: undefined,
        dryRun: true,
        help: false,
      },
    );
  });

  it("requires an exact database-name confirmation", () => {
    const database = { id: "db-id", name: "aria-pages" };

    expect(() => assertRemoteResetConfirmed(undefined, database)).toThrow(
      "--confirm=aria-pages",
    );
    expect(() => assertRemoteResetConfirmed("aria_db", database)).toThrow(
      "--confirm=aria-pages",
    );
    expect(() =>
      assertRemoteResetConfirmed("aria-pages", database),
    ).not.toThrow();
  });

  it("rejects unknown or empty options", () => {
    expect(() => parseRemoteResetArgs(["--confirm="])).toThrow(
      "exact remote database name",
    );
    expect(() => parseRemoteResetArgs(["--force"])).toThrow("Unknown option");
  });
});

describe("remote D1 reset SQL", () => {
  it("parses Wrangler metadata and schema rows", () => {
    expect(
      parseD1DatabaseInfo(
        JSON.stringify({ uuid: "db-id", name: "aria-pages" }),
      ),
    ).toEqual({ id: "db-id", name: "aria-pages" });

    const schema = parseD1SchemaObjects(
      JSON.stringify([
        {
          success: true,
          results: [
            { type: "table", name: "aria_users" },
            { type: "view", name: "aria_activity" },
            { type: "table", name: "d1_migrations" },
            { type: "table", name: "sqlite_sequence" },
            { type: "table", name: "_cf_INTERNAL" },
          ],
        },
      ]),
    );

    expect(schema).toEqual([
      { type: "table", name: "aria_users" },
      { type: "view", name: "aria_activity" },
      { type: "table", name: "d1_migrations" },
    ]);
  });

  it("disables foreign keys, drops views first, and includes migration ledgers", () => {
    const sql = buildRemoteD1ResetSql([
      { type: "table", name: "aria_users" },
      { type: "table", name: "d1_migrations" },
      { type: "view", name: 'activity"view' },
    ]);

    expect(sql).toContain("PRAGMA foreign_keys = off;");
    expect(sql).toContain("PRAGMA foreign_keys = on;");
    expect(sql).not.toContain("defer_foreign_keys");
    expect(sql).toContain('DROP VIEW IF EXISTS "activity""view";');
    expect(sql).toContain('DROP TABLE IF EXISTS "aria_users";');
    expect(sql).toContain('DROP TABLE IF EXISTS "d1_migrations";');
    expect(sql.indexOf("DROP VIEW")).toBeLessThan(sql.indexOf("DROP TABLE"));
  });

  it("verifies a remigrated database has no users", () => {
    expect(
      parseResetVerification(
        JSON.stringify([
          { success: true, results: [{ user_count: 0 }] },
          { success: true, results: [{ migration_count: 1 }] },
        ]),
      ),
    ).toEqual({ userCount: 0, migrationCount: 1 });

    expect(() =>
      parseResetVerification(
        JSON.stringify([
          { success: true, results: [{ user_count: 2 }] },
          { success: true, results: [{ migration_count: 1 }] },
        ]),
      ),
    ).toThrow("left 2 user(s) behind");
  });
});
