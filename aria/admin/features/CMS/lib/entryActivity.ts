import type { AriaEntryRevision } from "../../../../lib/cms/schemas";
import { isSystemActivityActor } from "../../../../lib/schemas/activityActors";
import type { ActivityTimelineItem } from "@/features/Core/types/activityTimeline";

const MAX_ACTIVITY_ITEMS = 5;

export interface CmsEntryActivityInput {
  revisions: readonly AriaEntryRevision[];
  targetLabel?: string;
  status?: string;
  createdAt?: string | null;
  createdBy?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
  publishedAt?: string | null;
  publishedBy?: string | null;
  canRestore?: boolean;
  restoreForbiddenMessage?: string;
}

interface RevisionActivityCopy {
  action: string;
  target?: string;
}

function formatActivityTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  const locale = typeof document === "undefined"
    ? undefined
    : document.documentElement.lang || undefined;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function revisionActorName(revision: AriaEntryRevision): string {
  return (
    revision.authorship?.actor?.username?.trim() ||
    revision.actorId.trim() ||
    "Unknown user"
  );
}

function revisionMessageToActivity(
  message: string | undefined,
  targetLabel: string,
): RevisionActivityCopy {
  const normalized = (message ?? "").trim().toLowerCase();

  if (normalized.includes("created entry")) {
    return { action: "created", target: targetLabel };
  }
  if (normalized.includes("before published")) {
    return { action: "published", target: targetLabel };
  }
  if (normalized.includes("before scheduled")) {
    return { action: "scheduled", target: targetLabel };
  }
  if (normalized.includes("before archived")) {
    return { action: "archived", target: targetLabel };
  }
  if (normalized.includes("before draft")) {
    return { action: "unpublished", target: targetLabel };
  }
  if (normalized.includes("restored")) {
    return { action: "restored", target: "content" };
  }
  if (normalized.includes("duplicated")) {
    return { action: "duplicated", target: targetLabel };
  }
  if (normalized.includes("before update")) {
    return { action: "updated", target: "content" };
  }

  return { action: "saved", target: "a revision" };
}

function revisionActorAvatar(revision: AriaEntryRevision): string | undefined {
  const actor = revision.authorship?.actor;
  return actor?.avatarUrl?.trim() || undefined;
}

function isUserRevision(revision: AriaEntryRevision): boolean {
  const actor = revision.authorship?.actor;
  if (!actor?.id && !actor?.username) {
    return false;
  }
  return !isSystemActivityActor(
    actor?.id ?? revision.actorId,
    actor?.username,
  );
}

function buildRevisionActivityItem(
  revision: AriaEntryRevision,
  input: CmsEntryActivityInput,
  targetLabel: string,
): ActivityTimelineItem {
  const copy = revisionMessageToActivity(revision.message, targetLabel);

  return {
    id: revision.id,
    userName: revisionActorName(revision),
    userAvatarUrl: revisionActorAvatar(revision),
    action: copy.action,
    target: copy.target ?? targetLabel,
    timestamp: formatActivityTimestamp(revision.createdAt),
    createdAt: revision.createdAt,
    actions: [
      {
        id: "restore",
        label: "Restore revision",
        disabled: input.canRestore === false,
        disabledReason: input.restoreForbiddenMessage,
      },
    ],
  };
}

function buildFallbackActivityItems(
  input: CmsEntryActivityInput,
  targetLabel: string,
): ActivityTimelineItem[] {
  const items: ActivityTimelineItem[] = [];

  if (input.publishedAt && input.publishedBy) {
    items.push({
      id: `fallback-published:${input.publishedAt}`,
      userName: input.publishedBy,
      action: "published",
      target: targetLabel,
      timestamp: formatActivityTimestamp(input.publishedAt),
      createdAt: input.publishedAt,
    });
  }

  if (
    input.updatedAt &&
    input.updatedBy &&
    input.updatedAt !== input.publishedAt
  ) {
    items.push({
      id: `fallback-updated:${input.updatedAt}`,
      userName: input.updatedBy,
      action: "updated",
      target: "content",
      timestamp: formatActivityTimestamp(input.updatedAt),
      createdAt: input.updatedAt,
    });
  }

  if (input.createdAt && input.createdBy) {
    items.push({
      id: `fallback-created:${input.createdAt}`,
      userName: input.createdBy,
      action: "created",
      target: targetLabel,
      timestamp: formatActivityTimestamp(input.createdAt),
      createdAt: input.createdAt,
    });
  }

  return items
    .filter((item) => !isSystemActivityActor(undefined, item.userName))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, MAX_ACTIVITY_ITEMS)
    .map((item, index) => ({
      ...item,
      isHighlighted: index === 0,
    }));
}

export function buildCmsEntryActivityItems(
  input: CmsEntryActivityInput,
): ActivityTimelineItem[] {
  const targetLabel = input.targetLabel?.trim() || "this entry";

  if (input.revisions.length > 0) {
    const items = [...input.revisions]
      .filter(isUserRevision)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, MAX_ACTIVITY_ITEMS)
      .map((revision) =>
        buildRevisionActivityItem(revision, input, targetLabel),
      )
      .map((item, index) => ({
        ...item,
        isHighlighted: index === 0,
      }));

    return items;
  }

  return buildFallbackActivityItems(input, targetLabel);
}
