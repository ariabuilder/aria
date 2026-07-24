import { type ComputedRef } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import type { PageDSL } from "@/lib/types/nodes";

export type PageSeoSnapshot = NonNullable<
  NonNullable<PageDSL["settings"]>["seo"]
>;
import { useDebouncedSettingsSave } from "@/features/Studio/settings/composables/useDebouncedSettingsSave";
import { UpdateSeoActionResultSchema } from "./seoSchemas";

function serializePageSeo(seo: PageSeoSnapshot | undefined): string {
  if (!seo) {
    return JSON.stringify({ noindex: false, nofollow: false });
  }

  return JSON.stringify({
    title: seo.title ?? "",
    description: seo.description ?? "",
    keywords: seo.keywords ?? [],
    canonical: seo.canonical ?? "",
    ogTitle: seo.ogTitle ?? "",
    ogDescription: seo.ogDescription ?? "",
    ogImage: seo.ogImage ?? "",
    ogType: seo.ogType ?? "",
    twitterCard: seo.twitterCard ?? "",
    twitterSite: seo.twitterSite ?? "",
    twitterCreator: seo.twitterCreator ?? "",
    structuredData: seo.structuredData ?? null,
    noindex: seo.noindex ?? false,
    nofollow: seo.nofollow ?? false,
  });
}

export function buildPageSeoUpdatePayload(
  seo: PageSeoSnapshot | undefined,
): Record<string, unknown> {
  const normalized = seo ?? {};
  return {
    title: normalized.title?.trim() || undefined,
    description: normalized.description?.trim() || undefined,
    keywords: normalized.keywords?.length ? [...normalized.keywords] : undefined,
    canonical: normalized.canonical?.trim() || undefined,
    ogTitle: normalized.ogTitle?.trim() || undefined,
    ogDescription: normalized.ogDescription?.trim() || undefined,
    ogImage: normalized.ogImage?.trim() || undefined,
    ogType: normalized.ogType?.trim() || undefined,
    twitterCard: normalized.twitterCard || undefined,
    twitterSite: normalized.twitterSite?.trim() || undefined,
    twitterCreator: normalized.twitterCreator?.trim() || undefined,
    structuredData: normalized.structuredData,
    noindex: normalized.noindex ?? false,
    nofollow: normalized.nofollow ?? false,
  };
}

export interface UseDebouncedPageSeoSaveOptions {
  slug: ComputedRef<string>;
  getSeo: () => PageSeoSnapshot | undefined;
  canSave: ComputedRef<boolean>;
}

export function useDebouncedPageSeoSave(
  options: UseDebouncedPageSeoSaveOptions & {
    onSaved?: (seo: PageSeoSnapshot | undefined) => void;
  },
) {
  return useDebouncedSettingsSave<PageSeoSnapshot | undefined>({
    getPayload: options.getSeo,
    serialize: serializePageSeo,
    save: async (seo) => {
      if (!options.canSave.value) return;

      const slug = options.slug.value.trim();
      if (!slug) return;

      const result = await actions.pages.updateSeo({
        slug,
        seo: buildPageSeoUpdatePayload(seo),
      });

      if (result.error) {
        throw new Error(result.error.message ?? "Failed to save SEO settings");
      }

      const parsed = UpdateSeoActionResultSchema.safeParse(result.data);
      if (!parsed.success || !parsed.data.success) {
        throw new Error(
          parsed.success
            ? (parsed.data.error?.message ?? "Failed to save SEO settings")
            : "Failed to save SEO settings",
        );
      }

      options.onSaved?.(
        (parsed.data.data?.seo as PageSeoSnapshot | undefined) ?? seo,
      );
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to save SEO settings",
      );
    },
  });
}
