import { describe, expect, it } from "vitest";

import { buildComponentActivityItems } from "../../../../admin/features/Studio/components/lib/componentActivity";
import { GetComponentVersionsOutputSchema } from "../../../../lib/schemas/componentVersions";
import type { ComponentVersionEntry } from "../../../../lib/schemas/componentVersions";

function expectedTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

describe("buildComponentActivityItems", () => {
  it("returns no items for system-only versions", () => {
    const items = buildComponentActivityItems({
      versions: [
        {
          version: "system-id",
          createdAt: "2026-07-04T10:00:00.000Z",
          createdBy: { id: "system", username: "aria" },
        },
        {
          version: "system-name",
          createdAt: "2026-07-04T11:00:00.000Z",
          createdBy: { id: "user-1", username: "System" },
        },
      ],
    });

    expect(items).toEqual([]);
  });

  it("returns recent user-authored versions newest first", () => {
    const older = "2026-07-04T09:00:00.000Z";
    const newer = "2026-07-04T12:30:00.000Z";
    const versions: ComponentVersionEntry[] = [
      {
        version: "component-v1",
        createdAt: older,
        createdBy: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          username: "editor-a",
          email: "editor-a@example.com",
          avatarUrl: "https://example.com/avatar.png",
        },
      },
      {
        version: "component-v2",
        createdAt: newer,
        createdBy: {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          username: "publisher-b",
          email: "publisher-b@example.com",
        },
      },
    ];

    const items = buildComponentActivityItems({ versions });

    expect(items).toMatchObject([
      {
        id: "component-v2-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        userName: "publisher-b",
        action: "updated",
        target: "this component",
        timestamp: expectedTimestamp(newer),
        createdAt: newer,
        isHighlighted: true,
      },
      {
        id: "component-v1-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        userName: "editor-a",
        userAvatarUrl: "https://example.com/avatar.png",
        action: "updated",
        target: "this component",
        timestamp: expectedTimestamp(older),
        createdAt: older,
        isHighlighted: false,
      },
    ]);
  });

  it("renders legacy rows without actor columns when no authored versions exist", () => {
    const createdAt = "2026-07-04T09:00:00.000Z";
    const parsed = GetComponentVersionsOutputSchema.parse({
      versions: [{ version: "legacy-v1", createdAt }],
    });

    expect(buildComponentActivityItems({ versions: parsed.versions })).toEqual([
      {
        id: "legacy-v1-legacy",
        userName: "System",
        userAvatarUrl: undefined,
        action: "updated",
        target: "this component",
        timestamp: expectedTimestamp(createdAt),
        createdAt,
        isHighlighted: true,
      },
    ]);
  });
});
