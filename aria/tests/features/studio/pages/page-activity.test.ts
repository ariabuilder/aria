import { describe, expect, it } from "vitest";
import { buildPageActivityItems } from "../../../../admin/features/Studio/pages/lib/pageActivity";

describe("buildPageActivityItems", () => {
  it("maps page activity rows with restore/delete actions", () => {
    const items = buildPageActivityItems({
      items: [
        {
          id: "v2-0",
          version: "v2",
          userId: "user-2",
          userName: "Jenny Wilson",
          action: "published",
          target: "this page",
          createdAt: "2026-05-12T10:24:00.000Z",
        },
        {
          id: "v1-0",
          version: "v1",
          userId: "user-1",
          userName: "Devon Lane",
          action: "created",
          target: "this page",
          createdAt: "2026-05-10T09:15:00.000Z",
        },
      ],
      canRestore: true,
      canDelete: true,
      protectedVersions: ["v2"],
    });

    expect(items[0]).toMatchObject({
      isHighlighted: true,
      actions: undefined,
    });
    expect(items[1]?.actions?.map((action) => action.id)).toEqual([
      "restore",
      "delete",
    ]);
  });

  it("excludes system activity rows", () => {
    const items = buildPageActivityItems({
      items: [
        {
          id: "v3-0",
          version: "v3",
          userId: "system",
          userName: "System",
          action: "updated",
          target: "this page",
          createdAt: "2026-05-13T10:24:00.000Z",
        },
        {
          id: "v2-0",
          version: "v2",
          userId: "user-2",
          userName: "Jenny Wilson",
          action: "published",
          target: "this page",
          createdAt: "2026-05-12T10:24:00.000Z",
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.userName).toBe("Jenny Wilson");
  });
});
