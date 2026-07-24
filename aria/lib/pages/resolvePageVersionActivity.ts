import type { PageVersionAuthorshipEntry } from "../authorship/schemas";
import { formatActorDisplayName } from "../authorship/reads";
import {
  ActivityMetadataSchema,
  type ActivityMetadata,
} from "../schemas/activity";
import {
  isSystemActivityActor,
} from "../schemas/activityActors";

export function resolvePageVersionActivityMetadata(
  version: PageVersionAuthorshipEntry,
): ActivityMetadata | null {
  const stored = version.activity
    ? ActivityMetadataSchema.safeParse(version.activity)
    : null;
  const parsed = stored?.success ? stored.data : null;

  if (
    parsed &&
    parsed.userId.trim().length > 0 &&
    !isSystemActivityActor(parsed.userId, parsed.userName)
  ) {
    return parsed;
  }

  const createdBy = version.createdBy;
  if (!createdBy?.id) {
    return null;
  }

  const userName = formatActorDisplayName(createdBy);
  if (isSystemActivityActor(createdBy.id, userName)) {
    return null;
  }

  return ActivityMetadataSchema.parse({
    action: parsed?.action ?? "page_updated",
    userId: createdBy.id,
    userName,
    userEmail: createdBy.email,
    userAvatarUrl: createdBy.avatarUrl,
    target: parsed?.target ?? "this page",
    targetId: parsed?.targetId,
    metadata: parsed?.metadata,
  });
}
