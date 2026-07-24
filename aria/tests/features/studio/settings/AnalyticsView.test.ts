import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount, type VueWrapper } from "@vue/test-utils";

const {
  analytics,
  availability,
  setStudioCloudflareTrafficMock,
  refreshAvailabilityMock,
} = vi.hoisted(() => {
  const { ref } = require("vue") as typeof import("vue");

  return {
    analytics: ref({
      version: 1 as const,
      activeProviders: [],
      providers: {},
      studioDisplay: { cloudflareTraffic: false },
    }),
    availability: ref({
      available: false,
      canShowStudioMetrics: false,
      platform: "cloudflare" as const,
      credentialsReady: true,
      zoneConfigured: true,
      siteToggleEnabled: false,
      cloudflareTrafficEnabled: false,
      canViewMetrics: true,
      canConfigureMetrics: true,
      analyticsReadGranted: true as boolean | undefined,
    }),
    setStudioCloudflareTrafficMock: vi.fn(),
    refreshAvailabilityMock: vi.fn(),
  };
});

vi.mock("@/composables/useSiteSettings", () => ({
  useSiteSettings: () => ({
    analytics,
    ANALYTICS_PROVIDERS: [],
    loadSettings: vi.fn(),
    isAnalyticsProviderActive: vi.fn(() => false),
    activateAnalyticsProvider: vi.fn(),
    deactivateAnalyticsProvider: vi.fn(),
    removeAnalyticsProvider: vi.fn(),
    setAnalyticsProviderField: vi.fn(),
    setStudioCloudflareTraffic: setStudioCloudflareTrafficMock,
  }),
}));

vi.mock("@/composables/useCapabilities", () => ({
  useCapabilities: () => ({
    hasCapability: vi.fn(() => true),
  }),
}));

vi.mock("@/features/Studio/metrics/composables/useStudioMetrics", () => ({
  useStudioMetrics: () => ({
    availability,
    isCloudflarePlatform: { value: true },
    refreshAvailability: refreshAvailabilityMock,
    clearMetricsSessionCache: vi.fn(),
    isLoadingAvailability: { value: false },
  }),
}));

vi.mock("@/i18n", () => ({
  useStudioI18n: () => ({
    t: vi.fn((key: string) => key),
  }),
}));

vi.mock(
  "../../../../admin/features/Studio/settings/composables/useSettingsTabHydrate",
  () => ({
    useSettingsTabHydrate: vi.fn(),
  }),
);

vi.mock("vue-sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

import { Switch } from "../../../../admin/components/ui/switch";
import AnalyticsView from "../../../../admin/features/Studio/settings/components/AnalyticsView.vue";

describe("AnalyticsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analytics.value = {
      version: 1,
      activeProviders: [],
      providers: {},
      studioDisplay: { cloudflareTraffic: false },
    };
    availability.value = {
      ...availability.value,
      platform: "cloudflare",
      credentialsReady: true,
      zoneConfigured: true,
      siteToggleEnabled: false,
      cloudflareTrafficEnabled: false,
      analyticsReadGranted: true,
    };
    setStudioCloudflareTrafficMock.mockImplementation(
      async (enabled: boolean) => {
        analytics.value = {
          ...analytics.value,
          studioDisplay: { cloudflareTraffic: enabled },
        };
        availability.value = {
          ...availability.value,
          siteToggleEnabled: enabled,
          cloudflareTrafficEnabled: enabled,
        };
      },
    );
    refreshAvailabilityMock.mockResolvedValue(undefined);
  });

  it("persists Cloudflare traffic when the switch is enabled", async () => {
    const wrapper = shallowMount(AnalyticsView, {
      global: {
        stubs: {
          Teleport: true,
          SettingsRow: { template: "<div><slot /></div>" },
        },
      },
    });
    const toggle = wrapper.findComponent(Switch) as unknown as VueWrapper;

    expect(toggle.props()).toMatchObject({ modelValue: false });

    toggle.vm.$emit("update:modelValue", true);
    await flushPromises();

    expect(setStudioCloudflareTrafficMock).toHaveBeenCalledWith(true);
    expect(refreshAvailabilityMock).toHaveBeenCalledWith(true);
    expect(toggle.props()).toMatchObject({ modelValue: true });

    wrapper.unmount();
  });

  it("presents missing analytics credentials as optional post-deploy setup", () => {
    availability.value = {
      ...availability.value,
      credentialsReady: false,
      zoneConfigured: false,
      analyticsReadGranted: undefined,
    };

    const wrapper = shallowMount(AnalyticsView, {
      global: {
        stubs: {
          Teleport: true,
          SettingsRow: { template: "<div><slot /></div>" },
        },
      },
    });

    expect(wrapper.text()).toContain(
      "settings.analytics.warning.credentialsOptional",
    );
    expect(wrapper.text()).toContain("ARIA_CLOUDFLARE_ANALYTICS_TOKEN");
    expect(wrapper.text()).toContain("ARIA_CLOUDFLARE_ZONE_ID");
    expect(wrapper.text()).not.toContain("ARIA_CLOUDFLARE_API_TOKEN");
    expect(wrapper.text()).toContain("Zone → Analytics → Read");
    expect(
      wrapper
        .find('a[href^="https://dash.cloudflare.com/profile/api-tokens"]')
        .exists(),
    ).toBe(true);
    expect(
      wrapper
        .find(
          'a[href="https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/"]',
        )
        .exists(),
    ).toBe(true);
    expect(
      wrapper
        .find('a[href="https://ariabuilder.io/docs/deployment/cloudflare/"]')
        .exists(),
    ).toBe(true);
    const toggle = wrapper.findComponent(Switch) as unknown as VueWrapper;
    expect(toggle.props()).toMatchObject({ disabled: true });

    wrapper.unmount();
  });
});
