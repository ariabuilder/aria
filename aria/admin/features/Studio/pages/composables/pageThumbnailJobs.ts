import {
  PageSnapshotStageSchema,
  type PageSnapshotStage,
} from "@/lib/rendering/pageSnapshots";
import { PageThumbnailPageIdSchema } from "@/lib/rendering/pageThumbnails";
import { actions } from "astro:actions";

const requestedJobs = new Set<string>();

function jobKey(input: {
  pageId: string;
  pageSlug: string;
  stage: PageSnapshotStage;
  force?: boolean;
}): string {
  return `${input.pageId}:${input.pageSlug}:${input.stage}:${input.force ? "force" : "normal"}`;
}

export async function enqueuePageThumbnailJob(input: {
  pageId: string;
  pageSlug: string;
  stage: PageSnapshotStage;
  force?: boolean;
}): Promise<"queued" | "ready" | "failed"> {
  const parsed = {
    pageId: PageThumbnailPageIdSchema.parse(input.pageId),
    pageSlug: input.pageSlug.trim(),
    stage: PageSnapshotStageSchema.parse(input.stage),
    force: input.force === true,
  };
  const key = jobKey(parsed);

  if (!parsed.pageSlug) {
    return "failed";
  }

  if (!parsed.force && requestedJobs.has(key)) {
    return "queued";
  }

  requestedJobs.add(key);

  try {
    const result = await actions.pages.enqueueThumbnail(parsed);
    if (result.error) {
      requestedJobs.delete(key);
      return "failed";
    }
    const status = result.data.status;
    const resolvedStatus =
      status === "ready" || status === "failed" ? status : "queued";
    if (resolvedStatus === "failed") {
      requestedJobs.delete(key);
    }
    return resolvedStatus;
  } catch {
    requestedJobs.delete(key);
    return "failed";
  }
}
