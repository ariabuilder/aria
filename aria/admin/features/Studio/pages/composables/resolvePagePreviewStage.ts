import {
  resolvePagePreviewStage as resolvePagePreviewStageFromLib,
  type PagePreviewStageInput,
} from "@/lib/rendering/pageSnapshots";
import type { Page } from "@/composables/useBuilderData";

export type { PagePreviewStageInput };

export function resolvePagePreviewStage(
  page: Page | PagePreviewStageInput,
): "draft" | "published" {
  return resolvePagePreviewStageFromLib(page);
}
