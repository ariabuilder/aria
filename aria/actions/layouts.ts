/**
 * Layout slot content actions — persist `layout.slots[].defaultContent`.
 */

import { defineAction } from "astro:actions";
import type { LayoutDSL } from "../lib/types/nodes";
import { LayoutDSLSchema } from "../lib/schemas/nodes";
import {
  UpdateLayoutSlotContentInputSchema,
  UpdateLayoutSlotContentResultSchema,
} from "../lib/schemas/slotEditing";
import { setSlotDefaultContent } from "../lib/layouts/slotEditing";
import {
  getAdapter,
  getResource,
  resolveAuthorizedMutation,
  saveResource,
} from "./_shared";
import { log as baseLog } from "../lib/utils/logger";

type LogLevel = "debug" | "info" | "warn" | "error";

function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  baseLog(level, `[Aria Layouts] ${message}`, context);
}

function sanitizeSlug(slug: string): string {
  return slug
    .replace(/[<>'"&]/g, "")
    .replace(/\.\./g, "")
    .trim();
}

function validateSlug(slug: string): boolean {
  const slugRegex = /^[a-zA-Z0-9_-]+$/;
  return slugRegex.test(slug) && slug.length > 0 && slug.length <= 255;
}

export const layouts = {
  /**
   * Update a single layout slot's `defaultContent` tree (global per layout).
   */
  updateSlotContent: defineAction({
    accept: "json",
    input: UpdateLayoutSlotContentInputSchema,
    handler: async (input, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "layouts.updateSlotContent",
        "save-layout",
      );

      const layoutSlug = sanitizeSlug(input.layoutSlug);
      if (!validateSlug(layoutSlug)) {
        throw new Error(`Invalid layout slug: ${input.layoutSlug}`);
      }

      const adapter = await getAdapter(context);
      const existing = (await getResource(
        adapter,
        "layouts",
        layoutSlug,
      )) as LayoutDSL;

      const withSlotContent = setSlotDefaultContent(
        existing,
        input.slotName,
        input.nodes,
      );

      const validated = LayoutDSLSchema.parse(withSlotContent);

      const version = await saveResource(
        adapter,
        context,
        "layouts",
        layoutSlug,
        validated,
        authorship,
      );

      const result = UpdateLayoutSlotContentResultSchema.parse({
        success: true,
        version,
        layoutId: validated.id,
        slotName: input.slotName,
      });

      log("info", "Updated layout slot defaultContent", {
        layoutSlug,
        slotName: input.slotName,
        nodeCount: input.nodes.length,
      });

      return result;
    },
  }),
};
