import type { ActivityTimelineItem } from "@/features/Core/types/activityTimeline";
import { isSystemActivityActor } from "../../../../../lib/schemas/activityActors";
import { formatActorDisplayName } from "../../../../../lib/authorship/reads";
import type { ActorRef } from "../../../../../lib/auth/types";

const MAX_ACTIVITY_ITEMS = 5;
const LEGACY_COMPONENT_ACTIVITY_ACTOR = "System";

export interface BuildComponentActivityItemsInput {
  versions: readonly {
    version: string;
    createdAt: string;
    createdBy?: ActorRef;
  }[];
  updatedAt?: string | null;
}

function formatActivityTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

export function buildComponentActivityItems(
  input: BuildComponentActivityItemsInput,
): ActivityTimelineItem[] {
  const sortedVersions = [...input.versions].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  const userAuthoredVersions = sortedVersions.filter((version) => {
    if (!version.createdBy) {
      return false;
    }
    return !isSystemActivityActor(
      version.createdBy.id,
      formatActorDisplayName(version.createdBy),
    );
  });
  const activityVersions =
    userAuthoredVersions.length > 0
      ? userAuthoredVersions
      : sortedVersions.filter((version) => !version.createdBy);

  return activityVersions
    .slice(0, MAX_ACTIVITY_ITEMS)
    .map((version, index) => {
      const actor = version.createdBy;
      const actorId = actor?.id ?? "legacy";
      return {
        id: `${version.version}-${actorId}`,
        userName: actor
          ? formatActorDisplayName(actor)
          : LEGACY_COMPONENT_ACTIVITY_ACTOR,
        userAvatarUrl: actor?.avatarUrl,
        action: "updated",
        target: "this component",
        timestamp: formatActivityTimestamp(version.createdAt),
        createdAt: version.createdAt,
        isHighlighted: index === 0,
      };
    });
}
