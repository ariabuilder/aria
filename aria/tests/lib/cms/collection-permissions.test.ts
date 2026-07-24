import { describe, expect, it } from "vitest";
import {
  cmsListCollectionPermissions,
  cmsReplaceCollectionPermissions,
} from "../../../lib/cms/storage/access";

type Row = Record<string, unknown>;

function createExecutor() {
  const permissions: Array<{
    principal_id: string;
    collection_id: string;
    action: string;
  }> = [];

  return {
    executor: {
      queryAll: async <T extends Row>(sql: string, args: unknown[] = []) => {
        if (sql.includes("FROM aria_collection_permissions")) {
          const collectionId = String(args[0]);
          return permissions.filter(
            (row) => row.collection_id === collectionId,
          ) as unknown as T[];
        }
        return [] as T[];
      },
      queryFirst: async () => null,
      run: async (sql: string, args: unknown[] = []) => {
        if (sql.startsWith("DELETE FROM aria_collection_permissions")) {
          const collectionId = String(args[0]);
          for (let index = permissions.length - 1; index >= 0; index -= 1) {
            if (permissions[index]?.collection_id === collectionId) {
              permissions.splice(index, 1);
            }
          }
          return;
        }

        if (sql.startsWith("INSERT INTO aria_collection_permissions")) {
          permissions.push({
            principal_id: String(args[0]),
            collection_id: String(args[1]),
            action: String(args[2]),
          });
        }
      },
    },
    permissions,
  };
}

describe("collection permissions storage", () => {
  it("lists and replaces permissions for a collection", async () => {
    const { executor } = createExecutor();

    await cmsReplaceCollectionPermissions(executor, "collection-blog", [
      { principalId: "user-1", action: "read" },
      { principalId: "user-1", action: "update" },
    ]);

    const listed = await cmsListCollectionPermissions(
      executor,
      "collection-blog",
    );

    expect(listed).toEqual([
      {
        principalId: "user-1",
        collectionId: "collection-blog",
        action: "read",
      },
      {
        principalId: "user-1",
        collectionId: "collection-blog",
        action: "update",
      },
    ]);
  });
});
