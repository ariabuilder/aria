import type { ActivityMetadata } from "./activity";

export const SYSTEM_ACTIVITY_USER_ID = "system";
export const SYSTEM_ACTIVITY_USER_NAME = "System";

export function isSystemActivityActor(
  userId?: string | null,
  userName?: string | null,
): boolean {
  const normalizedId = userId?.trim().toLowerCase();
  const normalizedName = userName?.trim().toLowerCase();

  if (normalizedId === SYSTEM_ACTIVITY_USER_ID) {
    return true;
  }
  if (normalizedName === SYSTEM_ACTIVITY_USER_NAME.toLowerCase()) {
    return true;
  }
  return false;
}

export function isUserActivityMetadata(
  activity: ActivityMetadata | null | undefined,
): activity is ActivityMetadata {
  return Boolean(
    activity &&
      activity.userId.trim().length > 0 &&
      !isSystemActivityActor(activity.userId, activity.userName),
  );
}
