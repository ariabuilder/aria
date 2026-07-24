import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import PageDetailOverviewTab from "../../../../admin/features/Studio/pages/components/detail/PageDetailOverviewTab.vue";
import { PageDetailFormSchema } from "../../../../admin/features/Studio/pages/schemas/pageDetailForm";

vi.mock("vue-sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/features/Studio/metrics/composables/useStudioMetrics", () => ({
  useStudioMetrics: () => ({
    canShowMetrics: { value: false },
    isLoadingAvailability: { value: false },
    isLoadingPagesTraffic: { value: false },
    period: { value: "7d" },
    refreshAvailability: vi.fn(async () => {}),
    ensureTrafficLoaded: vi.fn(async () => {}),
    visitsForSlug: () => 0,
    sparklineForSlug: () => [],
  }),
}));

vi.mock("@/composables/useStudioCapabilities", () => ({
  useStudioCapabilities: () => ({
    canViewStudioMetrics: { value: false },
    isReady: { value: true },
  }),
}));

const baseProps = {
  currentError: null,
  analytics: null,
  seoScore: 80,
  isLoading: false,
  isLoaded: true,
  pageSlug: "about",
  pagePath: "/about",
  status: "draft" as const,
  statusLabel: "Draft",
  statusDescription: "Private until you publish it.",
  statusDotClass: "bg-muted-foreground",
  statusSurfaceClass: "border-border bg-muted/20 text-muted-foreground",
};

function mountOverviewTab(
  overrides: Partial<typeof baseProps> & {
    title?: string;
    description?: string;
    slug?: string;
  } = {},
) {
  const { title = "", description = "", slug = "", ...props } = overrides;

  let wrapper: ReturnType<typeof mount>;
  wrapper = mount(PageDetailOverviewTab, {
    props: {
      ...baseProps,
      ...props,
      title,
      description,
      slug,
      "onUpdate:title": (value: string) => wrapper.setProps({ title: value }),
      "onUpdate:description": (value: string) =>
        wrapper.setProps({ description: value }),
      "onUpdate:slug": (value: string) => wrapper.setProps({ slug: value }),
    },
  });
  return wrapper;
}

describe("PageDetailOverviewTab", () => {
  it("renders title, path, and description fields in Page Details", () => {
    const wrapper = mountOverviewTab({
      title: "About Us",
      description: "Company overview page",
      slug: "about",
    });

    expect(wrapper.text()).toContain("Page Details");
    expect(wrapper.text()).toContain("Title");
    expect(wrapper.text()).toContain("Path");
    expect(wrapper.text()).toContain("Description");
    expect(wrapper.text()).toContain("/about");
    expect(wrapper.text()).toContain(
      "Page metadata for editors. Search and social descriptions live on the SEO tab.",
    );

    const titleInput = wrapper.get('input[placeholder="Page title"]');
    expect((titleInput.element as HTMLInputElement).value).toBe("About Us");

    const descriptionInput = wrapper.get("textarea");
    expect((descriptionInput.element as HTMLTextAreaElement).value).toBe(
      "Company overview page",
    );
  });

  it("emits updated title and description from v-models", async () => {
    const wrapper = mount(PageDetailOverviewTab, {
      props: {
        ...baseProps,
        title: "Home",
        description: "",
        slug: "home",
      },
    });

    await wrapper.get('input[placeholder="Page title"]').setValue("New Title");
    await wrapper.get("textarea").setValue("Editor note");

    expect(wrapper.emitted("update:title")?.at(-1)).toEqual(["New Title"]);
    expect(wrapper.emitted("update:description")?.at(-1)).toEqual([
      "Editor note",
    ]);
  });
});

describe("PageDetailFormSchema", () => {
  it("accepts description and round-trips trimmed save values", () => {
    const parsed = PageDetailFormSchema.parse({
      title: "About",
      slug: "about",
      description: "Internal summary",
      layout: "",
      status: "draft",
      parent: null,
    });

    expect(parsed.description).toBe("Internal summary");

    const trimmed = parsed.description?.trim() || undefined;
    expect(trimmed).toBe("Internal summary");
  });

  it("rejects descriptions longer than 500 characters", () => {
    const result = PageDetailFormSchema.safeParse({
      title: "About",
      slug: "about",
      description: "x".repeat(501),
      layout: "",
      status: "draft",
      parent: null,
    });

    expect(result.success).toBe(false);
  });
});
