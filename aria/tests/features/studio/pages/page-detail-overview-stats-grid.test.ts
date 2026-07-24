import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PageDetailOverviewStatsGrid from "../../../../admin/features/Studio/pages/components/detail/PageDetailOverviewStatsGrid.vue";

const mockState = vi.hoisted(() => ({
  canViewStudioMetrics: { value: false },
  capsReady: { value: true },
  canShowMetrics: { value: false },
  isLoadingAvailability: { value: false },
  isLoadingPagesTraffic: { value: false },
  period: { value: "7d" },
  visitsBySlug: { value: {} as Record<string, number> },
  refreshAvailability: vi.fn(async () => {}),
  ensureTrafficLoaded: vi.fn(async () => {}),
}));

vi.mock("@/composables/useStudioCapabilities", () => ({
  useStudioCapabilities: () => ({
    canViewStudioMetrics: mockState.canViewStudioMetrics,
    isReady: mockState.capsReady,
  }),
}));

vi.mock("@/features/Studio/metrics/composables/useStudioMetrics", () => ({
  useStudioMetrics: () => ({
    canShowMetrics: mockState.canShowMetrics,
    isLoadingAvailability: mockState.isLoadingAvailability,
    isLoadingPagesTraffic: mockState.isLoadingPagesTraffic,
    period: mockState.period,
    refreshAvailability: mockState.refreshAvailability,
    ensureTrafficLoaded: mockState.ensureTrafficLoaded,
    visitsForSlug: (slug: string) => mockState.visitsBySlug.value[slug] ?? 0,
    sparklineForSlug: () => [0, 4, 2, 8, 6, 10, 12],
  }),
}));

type GridProps = {
  pageSlug?: string;
  status: "published" | "draft" | "archived" | "scheduled";
  statusLabel: string;
  statusDescription: string;
  statusDotClass: string;
  statusSurfaceClass: string;
  editorName?: string;
  lastEdited?: string;
  seoScore: number;
};

function mountGrid(overrides: Partial<GridProps> = {}) {
  return mount(PageDetailOverviewStatsGrid, {
    props: {
      pageSlug: "home",
      status: "published",
      statusLabel: "Published",
      statusDescription: "Live and visible to visitors.",
      statusDotClass: "bg-emerald-400",
      statusSurfaceClass:
        "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
      editorName: "Jenny Wilson",
      lastEdited: "2 hours ago",
      seoScore: 92,
      ...overrides,
    },
  });
}

describe("PageDetailOverviewStatsGrid", () => {
  beforeEach(() => {
    mockState.canViewStudioMetrics.value = false;
    mockState.capsReady.value = true;
    mockState.canShowMetrics.value = false;
    mockState.isLoadingAvailability.value = false;
    mockState.isLoadingPagesTraffic.value = false;
    mockState.visitsBySlug.value = {};
    mockState.refreshAvailability.mockClear();
    mockState.ensureTrafficLoaded.mockClear();
  });

  it("renders the four overview cards", () => {
    const wrapper = mountGrid();

    expect(wrapper.text()).toContain("Status");
    expect(wrapper.text()).toContain("Last updated");
    expect(wrapper.text()).toContain("Traffic");
    expect(wrapper.text()).toContain("SEO");
  });

  it("renders status label and description from props", () => {
    const wrapper = mountGrid({
      statusLabel: "Scheduled",
      statusDescription: "Publishes tomorrow.",
    });

    expect(wrapper.text()).toContain("Scheduled");
    expect(wrapper.text()).toContain("Publishes tomorrow.");
  });

  it("renders the last updated fallback when no timestamp exists", () => {
    const wrapper = mountGrid({
      editorName: "",
      lastEdited: "",
    });

    expect(wrapper.text()).toContain("No edits yet");
    expect(wrapper.text()).toContain("Editor unknown");
  });

  it.each([
    [92, "Good"],
    [64, "Needs work"],
    [24, "Poor"],
  ])("renders the SEO label for score %i", (seoScore, label) => {
    const wrapper = mountGrid({ seoScore });

    expect(wrapper.text()).toContain(label);
  });

  it("keeps the traffic card visible when metrics are unavailable", () => {
    mockState.canViewStudioMetrics.value = true;

    const wrapper = mountGrid();

    expect(wrapper.text()).toContain("Traffic");
    expect(wrapper.text()).toContain("Not enabled");
    expect(wrapper.text()).toContain("Studio traffic metrics");
  });

  it("renders traffic visits when metrics are available", () => {
    mockState.canViewStudioMetrics.value = true;
    mockState.canShowMetrics.value = true;
    mockState.visitsBySlug.value = { home: 12400 };

    const wrapper = mountGrid();

    expect(wrapper.text()).toContain("12k");
    expect(wrapper.text()).toContain("Visits in the last 7 days");
  });
});
