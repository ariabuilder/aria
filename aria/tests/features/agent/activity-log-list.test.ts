import { describe, expect, it } from "vitest";
import {
  AgentActivityLogListInputSchema,
  AgentActivityLogListOutputSchema,
} from "../../../admin/features/Agent/lib/schemas";

describe("activity log list schemas", () => {
  it("parses list input with defaults", () => {
    const result = AgentActivityLogListInputSchema.parse({});
    expect(result.limit).toBe(50);
    expect(result.cursor).toBeUndefined();
  });

  it("parses list input with all filters", () => {
    const result = AgentActivityLogListInputSchema.parse({
      cursor: "2026-06-01T00:00:00.000Z",
      limit: 25,
      actor: "user-1",
      transport: "mcp",
      toolName: "aria_list_pages",
      dateFrom: "2026-01-01T00:00:00.000Z",
      dateTo: "2026-06-01T00:00:00.000Z",
    });
    expect(result.limit).toBe(25);
    expect(result.actor).toBe("user-1");
  });

  it("parses list output", () => {
    const result = AgentActivityLogListOutputSchema.parse({
      items: [],
    });
    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeUndefined();
  });

  it("parses list output with cursor", () => {
    const result = AgentActivityLogListOutputSchema.parse({
      items: [
        {
          id: "00000000-0000-0000-0000-000000000000",
          actor: "user-1",
          transport: "mcp",
          toolName: "aria_list_pages",
          resource: null,
          status: "success",
          message: null,
          createdAt: "2026-06-01T00:00:00.000Z",
        },
      ],
      nextCursor: "2026-06-01T00:00:00.000Z",
    });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeDefined();
  });
});
