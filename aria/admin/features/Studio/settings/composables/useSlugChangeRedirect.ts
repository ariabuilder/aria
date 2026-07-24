import { ref } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { buildStudioPagePathMap } from "@/lib/pages/publicPaths";
import { parseRedirectRulePayload } from "@/composables/redirectsActionResults";
import { useStudioI18n } from "@/i18n";

export interface SlugChangeRedirectPromptState {
  fromPath: string;
  toPath: string;
  pageTitle: string;
}

const pendingPrompt = ref<SlugChangeRedirectPromptState | null>(null);
const isCreating = ref(false);
const redirectsRevision = ref(0);

export function useSlugChangeRedirect() {
  const { t } = useStudioI18n();
  function offerRedirectAfterSlugChange(input: {
    pages: readonly { slug: string; parent?: string | null }[];
    oldSlug: string;
    newSlug: string;
    pageTitle: string;
  }): void {
    if (input.oldSlug === input.newSlug) {
      return;
    }

    const pathMap = buildStudioPagePathMap(
      input.pages.map((page) => ({
        slug: page.slug,
        parent: page.parent ?? undefined,
      })),
    );
    const fromPath = pathMap.get(input.oldSlug);
    const toPath = pathMap.get(input.newSlug);
    if (!fromPath || !toPath || fromPath === toPath) {
      return;
    }

    pendingPrompt.value = {
      fromPath,
      toPath,
      pageTitle: input.pageTitle,
    };
  }

  function dismissRedirectPrompt(): void {
    pendingPrompt.value = null;
  }

  async function createSuggestedRedirect(): Promise<boolean> {
    const pending = pendingPrompt.value;
    if (!pending) {
      return false;
    }

    isCreating.value = true;
    try {
      const { data, error } = await actions.redirects.create({
        fromPath: pending.fromPath,
        toPath: pending.toPath,
        statusCode: 301,
        enabled: true,
        note: `Auto-suggested after slug change for "${pending.pageTitle}"`,
      });
      if (error) {
        throw new Error(error.message ?? t("settings.redirects.createFailed"));
      }
      parseRedirectRulePayload(data);
      toast.success(
        t("settings.redirects.created", {
          from: pending.fromPath,
          to: pending.toPath,
        }),
      );
      pendingPrompt.value = null;
      redirectsRevision.value += 1;
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings.redirects.createFailed"),
      );
      return false;
    } finally {
      isCreating.value = false;
    }
  }

  return {
    pendingPrompt,
    isCreating,
    redirectsRevision,
    offerRedirectAfterSlugChange,
    dismissRedirectPrompt,
    createSuggestedRedirect,
  };
}
