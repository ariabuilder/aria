import { tool } from "ai";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { createRuntimeCapabilityRegistry } from "../../../admin/features/Agent/lib/capabilities/runtimeRegistry";
import {
  describeAllowedCommand,
  parseExecuteCommand,
  searchAllowedCommands,
} from "../../../admin/features/Agent/lib/tools/commandDiscovery";

const allowed = createRuntimeCapabilityRegistry({
  aria_list_pages: tool({
    description: "List all site pages.",
    inputSchema: z.object({}).strict(),
  }),
  aria_read_page: tool({
    description: "Read one page by slug.",
    inputSchema: z.object({ slug: z.string() }).strict(),
  }),
  aria_delete_document: tool({
    description: "Permanently delete a page, layout, or component.",
    inputSchema: z
      .object({
        collection: z.enum(["pages", "layouts", "components"]),
        slug: z.string(),
      })
      .strict(),
  }),
});

describe("command discovery", () => {
  it("searches only the supplied session catalog", () => {
    expect(searchAllowedCommands({ query: "page" }, allowed)).toEqual([
      expect.objectContaining({ command: "aria_list_pages" }),
      expect.objectContaining({ command: "aria_read_page" }),
      expect.objectContaining({ command: "aria_delete_document" }),
    ]);
  });

  it("describes the full command contract", async () => {
    await expect(
      describeAllowedCommand({ command: "aria_delete_document" }, allowed),
    ).resolves.toMatchObject({
      description: "Permanently delete a page, layout, or component.",
      domain: "content",
      risk: "destructive",
      confirmation: "always",
      inputSchema: {
        type: "object",
        properties: {
          collection: expect.any(Object),
          slug: expect.any(Object),
        },
      },
    });
  });

  it("rejects commands outside the supplied profile", () => {
    expect(() =>
      parseExecuteCommand({ command: "aria_publish_page", input: {} }, allowed),
    ).toThrow(/unavailable/i);
  });
});
