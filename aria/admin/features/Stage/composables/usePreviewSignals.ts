import { z } from "zod";
import type { $ZodIssue } from "zod/v4/core";

import { log } from "@/lib/utils/logger";
import { LayoutDSLSchema, PageDSLSchema } from "../../../../lib/schemas/nodes";
import { useSignals } from "../../../composables/useSignals";

const PreviewSignalTypeSchema = z.enum([
  "render-dsl",
  "highlight-node",
  "scroll-to-node",
  "refresh",
]);

const PreviewSignalPrefix = "aria:preview:";

export const PreviewRenderPayloadSchema = z
  .object({
    page: PageDSLSchema,
    layout: LayoutDSLSchema.optional(),
  })
  .strict();

export const PreviewHighlightPayloadSchema = z
  .object({
    nodeId: z.string().trim().min(1).nullable(),
  })
  .strict();

export const PreviewScrollPayloadSchema = z
  .object({
    nodeId: z.string().trim().min(1),
  })
  .strict();

export type PreviewRenderPayload = z.infer<typeof PreviewRenderPayloadSchema>;
export type PreviewHighlightPayload = z.infer<
  typeof PreviewHighlightPayloadSchema
>;
export type PreviewScrollPayload = z.infer<typeof PreviewScrollPayloadSchema>;

function buildPreviewSignalType(
  type: z.infer<typeof PreviewSignalTypeSchema>,
): string {
  return `${PreviewSignalPrefix}${type}`;
}

function warnInvalidPreviewPayload(
  type: z.infer<typeof PreviewSignalTypeSchema>,
  issues: $ZodIssue[],
): void {
  log("warn", `[usePreviewSignals] Ignored invalid ${type} payload`, {
    issues,
  });
}

export function usePreviewSignals(options: { debug?: boolean } = {}) {
  const { frameRef, signal } = useSignals({ debug: options.debug });

  function registerPreviewFrame(iframe: HTMLIFrameElement | null): void {
    frameRef.value = iframe ?? undefined;
  }

  function signalRenderDSL(payload: PreviewRenderPayload): boolean {
    const parsed = PreviewRenderPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPreviewPayload("render-dsl", parsed.error.issues);
      return false;
    }

    signal(buildPreviewSignalType("render-dsl"), parsed.data);
    return true;
  }

  function signalHighlightNode(payload: PreviewHighlightPayload): boolean {
    const parsed = PreviewHighlightPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPreviewPayload("highlight-node", parsed.error.issues);
      return false;
    }

    signal(buildPreviewSignalType("highlight-node"), parsed.data);
    return true;
  }

  function signalScrollToNode(payload: PreviewScrollPayload): boolean {
    const parsed = PreviewScrollPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      warnInvalidPreviewPayload("scroll-to-node", parsed.error.issues);
      return false;
    }

    signal(buildPreviewSignalType("scroll-to-node"), parsed.data);
    return true;
  }

  function signalRefresh(): boolean {
    signal(buildPreviewSignalType("refresh"));
    return true;
  }

  return {
    registerPreviewFrame,
    signalRenderDSL,
    signalHighlightNode,
    signalScrollToNode,
    signalRefresh,
  };
}
