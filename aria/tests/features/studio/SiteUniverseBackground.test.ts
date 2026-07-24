import { mount } from "@vue/test-utils";
import { nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteUniverseSchema } from "../../../admin/features/Studio/dashboard/schemas/dashboard";
import SiteUniverseBackground from "../../../admin/features/Studio/dashboard/components/SiteUniverseBackground.vue";
import { useSiteUniverseFocus } from "../../../admin/features/Studio/dashboard/composables/useSiteUniverseFocus";

const navigateTo = vi.hoisted(() => vi.fn());

const universe = SiteUniverseSchema.parse({
  nodes: [
    {
      id: "page-home",
      title: "Home",
      slug: "index",
      status: "published",
      role: "home",
      depth: 1,
      x: 50,
      y: 23,
      size: 4.8,
      attention: "none",
      lastEditedAt: "2026-06-21T12:00:00.000Z",
      isRecent: true,
    },
    {
      id: "page-about",
      title: "About Aria",
      slug: "about",
      status: "draft",
      role: "page",
      depth: 1,
      x: 68,
      y: 30,
      size: 3.2,
      attention: "warning",
      lastEditedAt: null,
      isRecent: false,
    },
  ],
  edges: [
    {
      id: "site-core->page-home",
      from: "site-core",
      to: "page-home",
      path: "M 50 50 C 50 45, 50 28, 50 23",
      durationMs: 8000,
      delayMs: 500,
      opacity: 0.24,
    },
    {
      id: "site-core->page-about",
      from: "site-core",
      to: "page-about",
      path: "M 50 50 C 58 55, 60 35, 68 30",
      durationMs: 9000,
      delayMs: 700,
      opacity: 0.24,
    },
  ],
  cmsSystems: [
    {
      id: "collection-posts",
      name: "posts",
      label: "Posts",
      kind: "content",
      itemCount: 4,
      orbitStartPercent: 20,
      durationMs: 80_000,
      phaseMs: 2_000,
      entries: [
        {
          id: "entry-hello",
          collectionId: "collection-posts",
          collectionName: "posts",
          title: "Hello world",
          slug: "hello-world",
          locale: "en",
          status: "published",
          updatedAt: "2026-06-21T12:00:00.000Z",
          orbitAngleDeg: 30,
          orbitRadiusPx: 38,
          durationMs: 20_000,
          phaseMs: 500,
          size: 6,
        },
      ],
    },
  ],
  satellites: [
    {
      id: "component-satellite:hero",
      componentId: "hero",
      title: "Hero Section",
      source: "custom",
      band: "near",
      orbitCenterX: 43,
      orbitCenterY: 43,
      orbitRadiusPx: 80,
      orbitAngleDeg: 45,
      durationMs: 40_000,
      phaseMs: 8_000,
      size: 6,
    },
  ],
});

vi.mock("@/features/Studio/core/composables", () => ({
  useStudioRouter: () => ({ navigateTo }),
}));

vi.mock(
  "../../../admin/features/Studio/dashboard/composables/useSiteUniverse",
  () => ({
    useSiteUniverse: () => ({ universe: ref(universe) }),
  }),
);

describe("SiteUniverseBackground", () => {
  beforeEach(() => {
    navigateTo.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    const { clearFocus } = useSiteUniverseFocus();
    clearFocus("node");
    clearFocus("stream");
  });

  it("renders page identity and status for every node", () => {
    const wrapper = mount(SiteUniverseBackground, {
      props: { siteTitle: "Aria Docs" },
    });
    const labels = wrapper.findAll(".site-universe-node__label");

    expect(labels).toHaveLength(2);
    expect(labels[0]?.text()).toContain("Home");
    expect(labels[0]?.text()).toContain("Published");
    expect(labels[1]?.text()).toContain("About Aria");
    expect(labels[1]?.text()).toContain("Draft");
    expect(wrapper.get(".site-universe-core__label").text()).toBe("Aria Docs");
    expect(wrapper.find(".site-universe-core button").exists()).toBe(false);
  });

  it("highlights a node and its relationship on hover and focus", async () => {
    const wrapper = mount(SiteUniverseBackground);
    const about = wrapper.get('button[aria-label="About Aria, draft"]');

    await about.trigger("mouseenter");
    await nextTick();

    expect(about.classes()).toContain("site-universe-node--active");
    expect(wrapper.findAll(".site-universe-edge--active")).toHaveLength(1);
    expect(
      wrapper.get('button[aria-label="Home, published"]').classes(),
    ).not.toContain("site-universe-node--related");

    await about.trigger("mouseleave");
    await about.trigger("focus");
    await nextTick();

    expect(about.classes()).toContain("site-universe-node--active");
  });

  it("highlights only Home's core stream when Home is active", async () => {
    const wrapper = mount(SiteUniverseBackground);
    const home = wrapper.get('button[aria-label="Home, published"]');

    await home.trigger("mouseenter");
    await nextTick();

    expect(wrapper.findAll(".site-universe-edge--active")).toHaveLength(1);
    expect(wrapper.get(".site-universe__svg").classes()).toContain(
      "site-universe__svg--active",
    );
  });

  it("opens the page detail route with a single click", async () => {
    vi.useFakeTimers();
    const wrapper = mount(SiteUniverseBackground);

    await wrapper
      .get('button[aria-label="About Aria, draft"]')
      .trigger("click");

    expect(navigateTo).not.toHaveBeenCalled();
    vi.advanceTimersByTime(240);
    expect(navigateTo).toHaveBeenCalledOnce();
    expect(navigateTo).toHaveBeenCalledWith("/pages/about");
  });

  it("renders component satellites and opens component details", async () => {
    const wrapper = mount(SiteUniverseBackground);
    const satellite = wrapper.get(
      'button[aria-label="Hero Section, component"]',
    );

    expect(satellite.text()).toContain("Hero Section");
    await satellite.trigger("click");

    expect(navigateTo).toHaveBeenCalledOnce();
    expect(navigateTo).toHaveBeenCalledWith("/components/hero");
  });

  it("opens CMS collections and localized entries", async () => {
    const wrapper = mount(SiteUniverseBackground);

    await wrapper
      .get('button[aria-label="Posts, collection, 4 entries"]')
      .trigger("click");
    await wrapper
      .get('button[aria-label="Hello world, published entry in Posts"]')
      .trigger("click");

    expect(navigateTo).toHaveBeenNthCalledWith(1, "/collections/posts");
    expect(navigateTo).toHaveBeenNthCalledWith(
      2,
      "/collections/posts/entries/hello-world?locale=en",
    );
  });

  it("activates the branch when any part of its stream is hovered", async () => {
    const wrapper = mount(SiteUniverseBackground);
    const hitTarget = wrapper.findAll(".site-universe-edge__hit-target")[1]!;

    await hitTarget.trigger("pointerenter");
    await nextTick();

    expect(wrapper.findAll(".site-universe-edge--active")).toHaveLength(1);
    expect(
      wrapper.get('button[aria-label="About Aria, draft"]').classes(),
    ).toContain("site-universe-node--active");
  });
});
