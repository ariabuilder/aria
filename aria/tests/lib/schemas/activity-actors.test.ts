import { describe, expect, it } from "vitest";
import {
  isSystemActivityActor,
  isUserActivityMetadata,
} from "../../../lib/schemas/activityActors";
import { resolvePageVersionActivityMetadata } from "../../../lib/pages/resolvePageVersionActivity";

describe("activity actor helpers", () => {
  it("detects system actors", () => {
    expect(isSystemActivityActor("system", "System")).toBe(true);
    expect(isSystemActivityActor("user-1", "System")).toBe(true);
    expect(isSystemActivityActor("user-1", "admin")).toBe(false);
  });

  it("resolves user activity from version authorship when metadata is missing", () => {
    const activity = resolvePageVersionActivityMetadata({
      version: "v2",
      createdAt: "2026-05-12T10:24:00.000Z",
      createdBy: {
        id: "user-1",
        username: "admin",
        email: "admin@example.test",
        avatarUrl: "/uploads/admin.avif",
      },
      activity: null,
    });

    expect(activity).toMatchObject({
      action: "page_updated",
      userId: "user-1",
      userName: "admin",
      target: "this page",
    });
  });

  it("drops system-only versions", () => {
    const activity = resolvePageVersionActivityMetadata({
      version: "v3",
      createdAt: "2026-05-13T10:24:00.000Z",
      activity: {
        action: "page_updated",
        userId: "system",
        userName: "System",
        target: "this page",
      },
    });

    expect(activity).toBeNull();
    expect(
      isUserActivityMetadata({
        action: "page_updated",
        userId: "system",
        userName: "System",
        target: "this page",
      }),
    ).toBe(false);
  });
});
