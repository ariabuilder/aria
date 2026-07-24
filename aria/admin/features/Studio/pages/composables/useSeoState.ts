import { ref, computed } from "vue";
import type { ComputedRef, Ref } from "vue";
import { useSiteSettings } from "@/composables/useSiteSettings";
import { resolvePublicPagePath } from "@/lib/pages/publicPaths";
import { useAgentPanel } from "@/features/Agent/client/composables/useAgentPanel";
import { useAgentAvailability } from "@/features/Agent/client/composables/useAgentAvailability";
import {
  buildAgentSeoContext,
  buildSeoImprovementPrompt,
  buildSeoStudioShellContext,
  canShowSeoAgentLauncher,
  isAgentInferenceReady,
} from "@/features/Agent/lib/seoAgent";
import type { AgentSeoContext } from "@/features/Agent/lib/schemas";
import {
  usePageDetailState,
  type UsePageDetailStateReturn,
} from "./usePageDetailState";
import type { Recommendation } from "../components/SeoRecommendations.vue";
import type { SeoCheck } from "../components/SeoHealthScore.vue";

export interface GooglePreviewData {
  title: string;
  description: string;
  url: string;
}

export interface SeoFieldValues {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  canonical: string;
  noindex: boolean;
  nofollow: boolean;
  structuredData: string;
}

export type PreviewMode = "google" | "social" | "ai";

export interface UseSeoStateReturn {
  /** Current SEO field values (derived from page DSL) */
  seo: {
    title: ComputedRef<string>;
    description: ComputedRef<string>;
    ogTitle: ComputedRef<string>;
    ogDescription: ComputedRef<string>;
    ogImage: ComputedRef<string>;
    canonical: ComputedRef<string>;
    noindex: ComputedRef<boolean>;
    nofollow: ComputedRef<boolean>;
    structuredData: ComputedRef<string>;
  };
  googlePreview: ComputedRef<GooglePreviewData>;
  healthScore: ComputedRef<number>;
  healthChecks: ComputedRef<SeoCheck[]>;
  recommendations: ComputedRef<Recommendation[]>;
  agentSeoContext: ComputedRef<AgentSeoContext | null>;
  previewMode: Ref<PreviewMode>;
  socialPlatform: Ref<string>;
  updateField: <K extends keyof SeoFieldValues>(
    field: K,
    value: SeoFieldValues[K],
  ) => void;
  /** Generate AI suggestions by opening the agent with SEO context */
  generateAiSuggestions: () => Promise<void>;
}

/**
 * `useSeoState` Manages SEO state for the Page Detail View.
 * Derives field values from the page DSL (`page.
 */
export function useSeoState(
  pageDetailState?: UsePageDetailStateReturn,
): UseSeoStateReturn {
  const { page } = pageDetailState ?? usePageDetailState();
  const { generalSettings } = useSiteSettings();

  const previewMode = ref<PreviewMode>("google");
  const socialPlatform = ref("facebook");

  const seo = {
    title: computed(() => page.value?.settings?.seo?.title ?? ""),
    description: computed(() => page.value?.settings?.seo?.description ?? ""),
    ogTitle: computed(() => page.value?.settings?.seo?.ogTitle ?? ""),
    ogDescription: computed(
      () => page.value?.settings?.seo?.ogDescription ?? "",
    ),
    ogImage: computed(() => page.value?.settings?.seo?.ogImage ?? ""),
    canonical: computed(() => page.value?.settings?.seo?.canonical ?? ""),
    noindex: computed(() => page.value?.settings?.seo?.noindex ?? false),
    nofollow: computed(() => page.value?.settings?.seo?.nofollow ?? false),
    structuredData: computed(() => {
      const sd = page.value?.settings?.seo?.structuredData;
      if (!sd) return "";
      try {
        return JSON.stringify(sd, null, 2);
      } catch {
        return "";
      }
    }),
  };

  const googlePreview = computed<GooglePreviewData>(() => {
    const siteUrl = generalSettings.value.siteUrl.trim().replace(/\/+$/, "");
    const slug = page.value?.slug ?? "";
    const publicPath =
      slug.length > 0
        ? resolvePublicPagePath(slug, [{ slug, parent: page.value?.parent }])
        : "/";
    const fallbackUrl = siteUrl
      ? `${siteUrl}${publicPath === "/" ? "/" : publicPath}`
      : publicPath;

    return {
      title: seo.title.value || page.value?.title || "Untitled",
      description: seo.description.value || page.value?.description || "",
      url: seo.canonical.value || fallbackUrl,
    };
  });

  const healthScore = computed(() => {
    let score = 0;
    if (seo.title.value) score += 25;
    if (seo.description.value) score += 25;
    if (seo.ogImage.value) score += 15;
    if (seo.ogTitle.value) score += 10;
    if (seo.ogDescription.value) score += 10;
    if (
      seo.title.value &&
      seo.title.value.length >= 30 &&
      seo.title.value.length <= 60
    )
      score += 5;
    if (!seo.noindex.value) score += 10;
    return Math.min(score, 100);
  });

  const healthChecks = computed<SeoCheck[]>(() => [
    {
      id: "meta-title",
      label: "Meta Title",
      status: seo.title.value ? "pass" : "error",
      message: seo.title.value
        ? `${seo.title.value.length} characters`
        : "Meta title is missing",
    },
    {
      id: "meta-description",
      label: "Meta Description",
      status: seo.description.value
        ? "pass"
        : page.value?.description
          ? "warning"
          : "error",
      message: seo.description.value
        ? `${seo.description.value.length} characters`
        : "Meta description is missing",
    },
    {
      id: "og-image",
      label: "OG Image",
      status: seo.ogImage.value ? "pass" : "warning",
      message: seo.ogImage.value
        ? "Set"
        : "Not set — social cards won't have an image",
    },
    {
      id: "noindex",
      label: "Search Indexing",
      status: seo.noindex.value ? "warning" : "pass",
      message: seo.noindex.value
        ? "Page is hidden from search engines"
        : "Page is visible to search engines",
    },
  ]);

  const recommendations = computed<Recommendation[]>(() => {
    const recs: Recommendation[] = [];

    if (!seo.title.value) {
      recs.push({
        id: "add-title",
        type: "improvement",
        priority: "high",
        title: "Add a meta title",
        description:
          "Search engines display your meta title in search results.",
        actionLabel: "Add title",
      });
    }

    if (!seo.description.value) {
      recs.push({
        id: "add-description",
        type: "improvement",
        priority: "high",
        title: "Add a meta description",
        description: "A compelling description improves click-through rates.",
        actionLabel: "Add description",
      });
    }

    if (!seo.ogImage.value) {
      recs.push({
        id: "add-og-image",
        type: "improvement",
        priority: "medium",
        title: "Add an Open Graph image",
        description:
          "Social media platforms use this image when the page is shared.",
        actionLabel: "Add image",
      });
    }

    if (seo.title.value && seo.title.value.length > 60) {
      recs.push({
        id: "title-too-long",
        type: "warning",
        priority: "medium",
        title: "Meta title is too long",
        description: `Title is ${seo.title.value.length} characters. Keep it under 60 for best SERP display.`,
        actionLabel: "Trim title",
      });
    }

    return recs;
  });

  function updateField<K extends keyof SeoFieldValues>(
    field: K,
    value: SeoFieldValues[K],
  ): void {
    const p = page.value;
    if (!p) return;

    const currentSeo = p.settings?.seo ?? {};

    // structuredData is special - parse from JSON string to object
    const updatedSeo =
      field === "structuredData"
        ? {
            ...currentSeo,
            [field]: parseStructuredData(value as string),
          }
        : {
            ...currentSeo,
            [field]: value,
          };

    page.value = {
      ...p,
      settings: {
        ...(p.settings ?? {}),
        seo: updatedSeo,
      },
    };
  }

  function parseStructuredData(
    value: string,
  ): Record<string, unknown> | undefined {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      // Invalid JSON — return current value unchanged
      return page.value?.settings?.seo?.structuredData;
    }
  }

  const agentSeoContext = computed<AgentSeoContext | null>(() => {
    const slug = page.value?.slug;
    if (!slug) return null;

    return buildAgentSeoContext({
      pageSlug: slug,
      pageTitle: page.value?.title,
      pageDescription: page.value?.description,
      systemRole: page.value?.systemRole,
      parent: page.value?.parent,
      nodes: page.value?.nodes,
      currentSeo: page.value?.settings?.seo,
      siteUrl: generalSettings.value.siteUrl,
      siteName: generalSettings.value.siteName,
      field: "general",
    });
  });

  async function generateAiSuggestions(): Promise<void> {
    const slug = page.value?.slug;
    if (!slug) return;

    const agentPanel = useAgentPanel();
    const availabilityState = useAgentAvailability();
    await availabilityState.refresh();

    const availability = availabilityState.availability.value;
    if (!canShowSeoAgentLauncher(availability)) {
      return;
    }

    const seoContext = agentSeoContext.value;
    if (!seoContext) return;

    const autoSend = isAgentInferenceReady(availability);
    agentPanel.open({
      seoContext,
      shellContext: buildSeoStudioShellContext(
        slug,
        page.value?.title,
        page.value?.id,
      ),
      seed: buildSeoImprovementPrompt(page.value?.title, slug),
      composerMode: "agent",
      autoSend,
      focusComposer: !autoSend,
    });
  }

  return {
    seo,
    googlePreview,
    healthScore,
    healthChecks,
    recommendations,
    agentSeoContext,
    previewMode,
    socialPlatform,
    updateField,
    generateAiSuggestions,
  };
}
