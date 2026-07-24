/**
 * Resolve actor avatar URLs from snapshots with live user profile fallback.
 */

export type AvatarLookupSource = Readonly<
  Pick<{ id: string; avatarUrl?: string | null }, "id" | "avatarUrl">
>;

export function buildUserAvatarLookup(
  users: readonly AvatarLookupSource[],
): Map<string, string | null> {
  const lookup = new Map<string, string | null>();
  for (const user of users) {
    const avatarUrl = user.avatarUrl?.trim();
    lookup.set(user.id, avatarUrl || null);
  }
  return lookup;
}

export function resolveActorAvatarUrl(
  actorId: string | null | undefined,
  snapshotAvatarUrl: string | null | undefined,
  lookup: ReadonlyMap<string, string | null>,
): string | undefined {
  const snapshot = snapshotAvatarUrl?.trim();
  if (snapshot) {
    return snapshot;
  }
  if (!actorId) {
    return undefined;
  }
  const resolved = lookup.get(actorId)?.trim();
  return resolved || undefined;
}
