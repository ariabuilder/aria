<script setup lang="ts">
import { computed } from "vue";
import ErrorBanner from "@/features/Studio/core/components/ErrorBanner.vue";
import type { PageDetailError } from "@/lib/errors/pageDetailErrors";
import {
  SeoFieldInput,
  SeoRecommendations,
  AdvancedSeoSettings,
} from "../index";
import type { Recommendation } from "../SeoRecommendations.vue";
import type { AgentSeoContext } from "@/features/Agent/lib/schemas";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  currentError: PageDetailError | null;
  recommendations: Recommendation[];
  pageSlug?: string;
  pageTitle?: string;
  agentSeoContext?: AgentSeoContext | null;
  isSaving?: boolean;
  hasPendingSave?: boolean;
}>();

const metaTitle = defineModel<string>("metaTitle", { default: "" });
const metaDescription = defineModel<string>("metaDescription", { default: "" });
const ogTitle = defineModel<string>("ogTitle", { default: "" });
const ogDescription = defineModel<string>("ogDescription", { default: "" });
const canonical = defineModel<string>("canonical", { default: "" });
const noindex = defineModel<boolean>("noindex", { default: false });
const nofollow = defineModel<boolean>("nofollow", { default: false });
const { t } = useStudioI18n();

function characterHint(count: number, message: string): string {
  return t("pages.seo.characters", { count, message });
}

const emit = defineEmits<{
  dismissError: [];
  retryLoad: [];
}>();

const saveStatusLabel = computed(() => {
  if (props.isSaving) return t("pages.detail.saving");
  if (props.hasPendingSave) return t("pages.access.unsavedChanges");
  return t("pages.seo.saved");
});

const metaTitleHint = computed(() => {
  const length = metaTitle.value.trim().length;
  if (!length) {
    return {
      text: t("pages.seo.addSearchTitle"),
      tone: "error" as const,
    };
  }
  if (length < 30) {
    return {
      text: characterHint(length, t("pages.seo.titleShort")),
      tone: "warning" as const,
    };
  }
  if (length > 60) {
    return {
      text: characterHint(length, t("pages.seo.mayTruncateSearch")),
      tone: "warning" as const,
    };
  }
  return {
    text: characterHint(length, t("pages.seo.goodSearchLength")),
    tone: "success" as const,
  };
});

const metaDescriptionHint = computed(() => {
  const length = metaDescription.value.trim().length;
  if (!length) {
    return {
      text: t("pages.seo.addSearchDescription"),
      tone: "error" as const,
    };
  }
  if (length < 70) {
    return {
      text: characterHint(length, t("pages.seo.descriptionShort")),
      tone: "warning" as const,
    };
  }
  if (length > 160) {
    return {
      text: characterHint(length, t("pages.seo.mayTruncateSearch")),
      tone: "warning" as const,
    };
  }
  return {
    text: characterHint(length, t("pages.seo.goodSearchLength")),
    tone: "success" as const,
  };
});

const ogTitleHint = computed(() => {
  const length = ogTitle.value.trim().length;
  if (!length) {
    return {
      text: t("pages.seo.fallbackSearchTitle"),
      tone: "muted" as const,
    };
  }
  if (length > 60) {
    return {
      text: characterHint(length, t("pages.seo.socialTitleLong")),
      tone: "warning" as const,
    };
  }
  return {
    text: characterHint(length, t("pages.seo.goodSocialTitle")),
    tone: "success" as const,
  };
});

const ogDescriptionHint = computed(() => {
  const length = ogDescription.value.trim().length;
  if (!length) {
    return {
      text: t("pages.seo.fallbackSearchDescription"),
      tone: "muted" as const,
    };
  }
  if (length > 160) {
    return {
      text: characterHint(length, t("pages.seo.mayTruncateSocial")),
      tone: "warning" as const,
    };
  }
  return {
    text: characterHint(length, t("pages.seo.goodSocialDescription")),
    tone: "success" as const,
  };
});

const robotsSummary = computed(() => {
  if (noindex.value && nofollow.value) return t("pages.seo.robots.both");
  if (noindex.value) return t("pages.seo.robots.noindex");
  if (nofollow.value) return t("pages.seo.robots.nofollow");
  return t("pages.seo.robots.all");
});
</script>

<template>
  <div class="max-w-4xl space-y-7">
    <ErrorBanner
      :error="currentError"
      @dismiss="emit('dismissError')"
      @retry="emit('retryLoad')"
    />

    <div class="grid gap-7">
      <SeoRecommendations
        :recommendations="recommendations"
        :page-slug="pageSlug"
        :page-title="pageTitle"
        :agent-seo-context="agentSeoContext"
      />

      <section class="grid gap-5 border-t border-dashed border-border/70 pt-5">
        <div class="flex min-h-7 items-center justify-between gap-3">
          <h2 class="m-0 text-sm font-medium text-muted-foreground">
            {{ t("pages.seo.search") }}
          </h2>
          <span class="text-2xs text-muted-foreground/70">
            {{ robotsSummary }}
          </span>
        </div>
        <div class="grid gap-5">
          <SeoFieldInput
            :label="t('cms.title')"
            v-model="metaTitle"
            :max-length="60"
            :hint-text="metaTitleHint.text"
            :hint-tone="metaTitleHint.tone"
            :placeholder="t('pages.seo.searchTitle')"
          />
          <SeoFieldInput
            :label="t('pages.column.description')"
            v-model="metaDescription"
            :max-length="160"
            :hint-text="metaDescriptionHint.text"
            :hint-tone="metaDescriptionHint.tone"
            :placeholder="t('pages.seo.searchDescription')"
          />
        </div>
      </section>

      <section class="grid gap-5 border-t border-dashed border-border/70 pt-5">
        <div class="flex min-h-7 items-center justify-between gap-3">
          <h2 class="m-0 text-sm font-medium text-muted-foreground">
            {{ t("pages.seo.social") }}
          </h2>
          <span class="text-2xs text-muted-foreground/70">
            {{ saveStatusLabel }}
          </span>
        </div>
        <div class="grid gap-5">
          <SeoFieldInput
            :label="t('pages.seo.ogTitle')"
            v-model="ogTitle"
            :max-length="60"
            :hint-text="ogTitleHint.text"
            :hint-tone="ogTitleHint.tone"
            :placeholder="t('pages.seo.openGraphTitle')"
          />
          <SeoFieldInput
            :label="t('pages.seo.ogDescription')"
            v-model="ogDescription"
            :max-length="160"
            :hint-text="ogDescriptionHint.text"
            :hint-tone="ogDescriptionHint.tone"
            :placeholder="t('pages.seo.openGraphDescription')"
          />
        </div>
      </section>

      <AdvancedSeoSettings
        v-model:canonical="canonical"
        v-model:noindex="noindex"
        v-model:nofollow="nofollow"
      />
    </div>
  </div>
</template>
