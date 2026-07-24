import { afterEach, describe, expect, it } from "vitest";
import { FEATURE_FLAG_DEFINITIONS } from "../../lib/features/flags";
import {
  FeatureFlagIdSchema,
  FeatureFlagRegistrySchema,
} from "../../lib/features/schemas";
import {
  isFeatureEnabled,
  parseFeatureFlagEnvValue,
  resetFeatureFlagsForTests,
  resolveFeatureFlags,
  setFeatureFlagCacheForTests,
} from "../../lib/features/resolve";

describe("feature flags", () => {
  afterEach(() => {
    resetFeatureFlagsForTests();
  });

  it("validates the registry shape at import time", () => {
    expect(() =>
      FeatureFlagRegistrySchema.parse(FEATURE_FLAG_DEFINITIONS),
    ).not.toThrow();
  });

  it("requires every enum id to exist in the registry", () => {
    for (const id of FeatureFlagIdSchema.options) {
      expect(FEATURE_FLAG_DEFINITIONS[id]).toBeDefined();
    }
  });

  it("defaults studio.layouts to false", () => {
    expect(resolveFeatureFlags()["studio.layouts"]).toBe(false);
  });

  it("parses env overrides strictly", () => {
    expect(parseFeatureFlagEnvValue("true")).toBe(true);
    expect(parseFeatureFlagEnvValue("TRUE")).toBe(true);
    expect(parseFeatureFlagEnvValue("1")).toBe(true);
    expect(parseFeatureFlagEnvValue("false")).toBe(false);
    expect(parseFeatureFlagEnvValue("0")).toBe(false);
    expect(parseFeatureFlagEnvValue("yes")).toBeUndefined();
    expect(parseFeatureFlagEnvValue("")).toBeUndefined();
    expect(parseFeatureFlagEnvValue(undefined)).toBeUndefined();
  });

  it("applies overrides before env before defaults", () => {
    const resolved = resolveFeatureFlags({
      env: { PUBLIC_ARIA_FF_STUDIO_LAYOUTS: "true" },
      overrides: { "studio.layouts": false, "studio.agent": false },
    });

    expect(resolved["studio.layouts"]).toBe(false);
  });

  it("reads env overrides when provided", () => {
    const resolved = resolveFeatureFlags({
      env: { PUBLIC_ARIA_FF_STUDIO_LAYOUTS: "true" },
    });

    expect(resolved["studio.layouts"]).toBe(true);
  });

  it("uses lazy cache via isFeatureEnabled", () => {
    setFeatureFlagCacheForTests({
      "studio.layouts": true,
      "studio.agent": false,
    });
    expect(isFeatureEnabled("studio.layouts")).toBe(true);
  });
});
