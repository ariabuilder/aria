import {
  buildUserAvatarLookup,
  resolveActorAvatarUrl,
  type AvatarLookupSource,
} from "../../authorship/avatarLookup";
import type { AriaEntryRevision } from "../schemas";

export function enrichCmsRevisionsWithAvatars(
  revisions: readonly AriaEntryRevision[],
  users: readonly AvatarLookupSource[],
): AriaEntryRevision[] {
  const lookup = buildUserAvatarLookup(users);

  return revisions.map((revision) => {
    const actor = revision.authorship?.actor;
    if (!actor) {
      return revision;
    }

    const avatarUrl = resolveActorAvatarUrl(
      actor.id ?? revision.actorId,
      actor.avatarUrl,
      lookup,
    );

    if (!avatarUrl || avatarUrl === actor.avatarUrl) {
      return revision;
    }

    return {
      ...revision,
      authorship: {
        actor: {
          ...actor,
          avatarUrl,
        },
      },
    };
  });
}
