import { computed, type ComputedRef } from "vue";
import {
  FeatureFlagIdSchema,
  getFeatureFlagSnapshot,
  type FeatureFlagId,
  type ResolvedFeatureFlags,
} from "../../lib/features";

export function useFeatureFlag(id: FeatureFlagId): ComputedRef<boolean> {
  const parsedId = FeatureFlagIdSchema.parse(id);
  return computed(() => getFeatureFlagSnapshot()[parsedId]);
}

export function useFeatureFlags(): ComputedRef<Readonly<ResolvedFeatureFlags>> {
  return computed(() => getFeatureFlagSnapshot());
}
