import { afterEach, describe, expect, it } from "vitest";
import {
  getComposerItemFeatureDisabledMessage,
  isComposerItemFeatureEnabled,
  LAYOUT_COMPOSER_DISABLED_MESSAGE,
} from "../../lib/features/composerAccess";
import {
  resetFeatureFlagsForTests,
  setFeatureFlagCacheForTests,
} from "../../lib/features/resolve";

describe("composer feature access", () => {
  afterEach(() => {
    resetFeatureFlagsForTests();
  });

  it("blocks layout composer when studio.layouts is disabled", () => {
    setFeatureFlagCacheForTests({
      "studio.layouts": false,
      "studio.agent": false,
    });
    expect(isComposerItemFeatureEnabled("layout")).toBe(false);
    expect(getComposerItemFeatureDisabledMessage("layout")).toBe(
      LAYOUT_COMPOSER_DISABLED_MESSAGE,
    );
  });

  it("allows page and component composer regardless of studio.layouts", () => {
    setFeatureFlagCacheForTests({
      "studio.layouts": false,
      "studio.agent": false,
    });
    expect(isComposerItemFeatureEnabled("page")).toBe(true);
    expect(isComposerItemFeatureEnabled("component")).toBe(true);
    expect(getComposerItemFeatureDisabledMessage("page")).toBeNull();
  });

  it("allows layout composer when studio.layouts is enabled", () => {
    setFeatureFlagCacheForTests({
      "studio.layouts": true,
      "studio.agent": false,
    });
    expect(isComposerItemFeatureEnabled("layout")).toBe(true);
    expect(getComposerItemFeatureDisabledMessage("layout")).toBeNull();
  });
});
