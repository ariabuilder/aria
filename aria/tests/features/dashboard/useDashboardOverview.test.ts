import { describe, expect, it } from "vitest";

import { selectContinueWorkingPage } from "@/features/Studio/dashboard/composables/useDashboardOverview";

describe("selectContinueWorkingPage", () => {
  it("prefers the seeded home page over newer system pages", () => {
    const result = selectContinueWorkingPage([
      {
        id: "index",
        updatedAt: "2026-07-16T10:00:00.000Z",
        systemRole: "standard" as const,
      },
      {
        id: "not-found",
        updatedAt: "2026-07-16T10:00:03.000Z",
        systemRole: "not-found" as const,
      },
      {
        id: "blog-post",
        updatedAt: "2026-07-16T10:00:04.000Z",
        systemRole: "cms-entry" as const,
      },
    ]);

    expect(result?.id).toBe("index");
  });

  it("uses the most recently updated standard page after editing begins", () => {
    const result = selectContinueWorkingPage([
      {
        id: "index",
        updatedAt: "2026-07-16T10:00:00.000Z",
        systemRole: "standard" as const,
      },
      {
        id: "about",
        updatedAt: "2026-07-16T11:00:00.000Z",
        systemRole: "standard" as const,
      },
      {
        id: "not-found",
        updatedAt: "2026-07-16T12:00:00.000Z",
        systemRole: "not-found" as const,
      },
    ]);

    expect(result?.id).toBe("about");
  });
});
