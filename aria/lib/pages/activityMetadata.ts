import type { AuthorshipSaveContext } from "../storage/adapter";
import { buildActivityMeta, type ActivityAction } from "../schemas/activity";
import { formatActorDisplayName } from "../authorship/reads";

export function buildPageActivityMetadata(
  authorship: AuthorshipSaveContext,
  action: ActivityAction,
  target = "this page",
): string {
  return buildActivityMeta({
    action,
    target,
    userId: authorship.actor.id,
    userName: formatActorDisplayName(authorship.actor),
    userEmail: authorship.actor.email,
    userAvatarUrl: authorship.actor.avatarUrl,
  });
}
