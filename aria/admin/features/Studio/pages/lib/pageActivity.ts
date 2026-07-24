import { normalizeStoredVersion } from "../../../../../lib/storage/pageVersionDelete";
import { isSystemActivityActor } from "../../../../../lib/schemas/activityActors";
import type { ActivityTimelineItem } from "@/features/Core/types/activityTimeline";

const MAX_ACTIVITY_ITEMS = 5;

export interface PageActivitySourceItem {
  id: string;
  version: string;
  userId: string;
  userName: string;
  userAvatarUrl?: string | null;
  action: string;
  target: string;
  createdAt: string;
}

export interface BuildPageActivityItemsInput {
  items: readonly PageActivitySourceItem[];
  protectedVersions?: readonly string[];
  canRestore?: boolean;
  canDelete?: boolean;
  restoreForbiddenMessage?: string;
  deleteForbiddenMessage?: string;
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

function isProtectedVersion(
  version: string,
  protectedVersions: readonly string[],
): boolean {
  const normalized = normalizeStoredVersion(version);
  return protectedVersions.some(
    (candidate) => normalizeStoredVersion(candidate) === normalized,
  );
}

export function buildPageActivityItems(
  input: BuildPageActivityItemsInput,
): ActivityTimelineItem[] {
  const protectedVersions = input.protectedVersions ?? [];

  return [...input.items]
    .filter(
      (item) => !isSystemActivityActor(item.userId, item.userName),
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, MAX_ACTIVITY_ITEMS)
    .map((item, index) => {
      const actions: ActivityTimelineItem["actions"] = [];

      if (index > 0) {
        if (input.canRestore !== false) {
          actions.push({
            id: "restore",
            label: "Restore revision",
            disabledReason: input.restoreForbiddenMessage,
          });
        }

        if (
          input.canDelete &&
          !isProtectedVersion(item.version, protectedVersions)
        ) {
          actions.push({
            id: "delete",
            label: "Delete revision",
            destructive: true,
            disabledReason: input.deleteForbiddenMessage,
          });
        }
      }

      return {
        id: item.id,
        userName: item.userName,
        userAvatarUrl: item.userAvatarUrl,
        action: item.action,
        target: item.target,
        timestamp: formatActivityTimestamp(item.createdAt),
        createdAt: item.createdAt,
        isHighlighted: index === 0,
        actions: actions.length > 0 ? actions : undefined,
      };
    });
}
