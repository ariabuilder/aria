import { describe, expect, it } from "vitest";

import { SYSTEM_ACTOR } from "../../../lib/auth/types";
import {
  appendMediaAuthorshipUpdateSets,
  assertNoVersionAuthorshipUpdateSql,
  buildMediaAssetInsertAuthorship,
  buildMediaAuthorshipPatch,
  buildSingletonUpsertAuthorshipAssignments,
  buildVersionInsertAuthorshipColumns,
  resolveVersionAuthorshipForSave,
  STAMPING_ASSET_ROW_COLUMN_NAMES,
  STAMPING_VERSION_COLUMN_NAMES,
} from "../../../lib/authorship/stamping";

const sampleActor = {
  id: "user-1",
  username: "editor",
  email: "editor@example.com",
};

describe("authorship stamping helpers", () => {
  it("builds version insert columns from version authorship", () => {
    const fragment = buildVersionInsertAuthorshipColumns({
      createdBy: sampleActor,
      createdAt: "2026-05-26T00:00:00.000Z",
    });

    expect(fragment.columnNames).toEqual(STAMPING_VERSION_COLUMN_NAMES);
    expect(fragment.values).toEqual([
      "user-1",
      "editor",
      "editor@example.com",
      null,
    ]);
  });

  it("returns empty version fragment when authorship is absent", () => {
    expect(buildVersionInsertAuthorshipColumns(undefined)).toEqual({
      columnNames: [],
      values: [],
    });
  });

  it("throws when versionAuthorship and authorship actors conflict", () => {
    expect(() =>
      resolveVersionAuthorshipForSave(
        {
          versionAuthorship: {
            createdBy: { id: "other-user" },
            createdAt: "2026-05-26T00:00:00.000Z",
          },
        },
        { actor: sampleActor },
        "2026-05-26T00:00:00.000Z",
      ),
    ).toThrow(/does not match/);
  });

  it("prefers explicit versionAuthorship over authorship actor", () => {
    const resolved = resolveVersionAuthorshipForSave(
      {
        versionAuthorship: {
          createdBy: { id: "explicit-user", username: "explicit" },
          createdAt: "ignored",
        },
      },
      undefined,
      "2026-05-26T00:00:00.000Z",
    );

    expect(resolved).toEqual({
      createdBy: { id: "explicit-user", username: "explicit" },
      createdAt: "2026-05-26T00:00:00.000Z",
    });
  });

  it("excludes created_by columns from singleton update assignments", () => {
    const update = buildSingletonUpsertAuthorshipAssignments("update", {
      actor: sampleActor,
    });

    expect(update.columnNames).toEqual([
      "updated_by_id",
      "updated_by_username",
      "updated_by_email",
    ]);
    expect(update.columnNames).not.toContain("created_by_id");
  });

  it("includes create and update columns on singleton insert assignments", () => {
    const insert = buildSingletonUpsertAuthorshipAssignments("insert", {
      actor: sampleActor,
    });

    expect(insert.columnNames).toEqual(STAMPING_ASSET_ROW_COLUMN_NAMES);
  });

  it("clears deleted_by columns on media restore patch", () => {
    const patch = buildMediaAuthorshipPatch("restore", {
      actor: sampleActor,
      mutationKind: "restore",
    });

    expect(patch.setClauses).toContain("deleted_by_id = NULL");
    expect(patch.setClauses).toContain("updated_by_id = ?");
  });

  it("stamps deleted_by columns on media delete patch", () => {
    const patch = buildMediaAuthorshipPatch("delete", {
      actor: sampleActor,
      mutationKind: "delete",
    });

    expect(patch.setClauses).toEqual([
      "deleted_by_id = ?",
      "deleted_by_username = ?",
      "deleted_by_email = ?",
    ]);
  });

  it("builds media insert authorship columns", () => {
    const fragment = buildMediaAssetInsertAuthorship({
      actor: sampleActor,
      mutationKind: "create",
    });

    expect(fragment.columnNames).toEqual(STAMPING_ASSET_ROW_COLUMN_NAMES);
    expect(fragment.values[0]).toBe("user-1");
    expect(fragment.values[3]).toBe("user-1");
  });

  it("appends media authorship update sets", () => {
    const result = appendMediaAuthorshipUpdateSets(
      ["status = 'active'"],
      [],
      "update",
      { actor: SYSTEM_ACTOR, mutationKind: "update" },
    );

    expect(result.setClauses).toContain("status = 'active'");
    expect(result.setClauses).toContain("updated_by_id = ?");
  });

  it("guards against version authorship UPDATE SQL", () => {
    expect(() =>
      assertNoVersionAuthorshipUpdateSql(
        "UPDATE aria_page_versions SET created_by_id = ?",
      ),
    ).toThrow(/must not appear in UPDATE SQL/);

    expect(() =>
      assertNoVersionAuthorshipUpdateSql(
        "INSERT INTO aria_page_versions (created_by_id) VALUES (?)",
      ),
    ).not.toThrow();
  });
});
