import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("site API OpenAPI contract", () => {
  it("documents the exact implemented routes, scopes, and mutation headers", async () => {
    const document = JSON.parse(
      await readFile(
        resolve(process.cwd(), "aria/docs/openapi/site-api-v1.json"),
        "utf8",
      ),
    ) as {
      paths: Record<
        string,
        Record<
          string,
          { operationId?: string; "x-aria-scopes"?: string[]; parameters?: Array<{ $ref?: string }> }
        >
      >;
    };
    expect(Object.keys(document.paths).sort()).toEqual(
      [
        "/openapi.json",
        "/collections",
        "/collections/{collectionId}",
        "/collections/{collectionId}/entries",
        "/collections/{collectionId}/entries/{entryId}",
        "/collections/{collectionId}/entries/{entryId}/publish",
        "/collections/{collectionId}/entries/{entryId}/unpublish",
        "/collections/{collectionId}/entries/{entryId}/revisions/{revisionId}/restore",
      ].sort(),
    );
    expect(document.paths["/collections"]?.get?.["x-aria-scopes"]).toEqual([
      "collections:read",
    ]);
    expect(
      document.paths["/collections/{collectionId}/entries"]?.post?.[
        "x-aria-scopes"
      ],
    ).toEqual(["entries:write"]);
    for (const path of [
      "/collections/{collectionId}/entries/{entryId}",
      "/collections/{collectionId}/entries/{entryId}/publish",
      "/collections/{collectionId}/entries/{entryId}/unpublish",
      "/collections/{collectionId}/entries/{entryId}/revisions/{revisionId}/restore",
    ]) {
      const method = path.endsWith("/{entryId}") ? "patch" : "post";
      const references = document.paths[path]?.[method]?.parameters?.map(
        (parameter) => parameter.$ref,
      );
      expect(references).toContain("#/components/parameters/IdempotencyKey");
      expect(references).toContain("#/components/parameters/IfMatch");
    }
  });
});
