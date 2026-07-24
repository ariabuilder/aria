import {
  computed,
  type ComputedRef,
  type MaybeRefOrGetter,
  toValue,
} from "vue";

import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import type { PageDSL } from "../../../lib/types/nodes";

export interface UseComposerSavePublishUiStateOptions {
  currentItemType: MaybeRefOrGetter<"page" | "layout" | "component">;
  currentItemSlug?: MaybeRefOrGetter<string | undefined>;
  currentPage?: MaybeRefOrGetter<PageDSL | null | undefined>;
  canSave?: MaybeRefOrGetter<boolean>;
  hasUnsavedChanges?: MaybeRefOrGetter<boolean>;
  isSaving?: MaybeRefOrGetter<boolean>;
  isPublishing?: MaybeRefOrGetter<boolean>;
  isLoading?: MaybeRefOrGetter<boolean>;
  canPublish?: MaybeRefOrGetter<boolean>;
}

export interface UseComposerSavePublishUiStateReturn {
  isPublished: ComputedRef<boolean>;
  isModifiedSincePublish: ComputedRef<boolean>;
  showUnpublishAction: ComputedRef<boolean>;
  saveTooltipLabel: ComputedRef<string>;
  saveIconClass: ComputedRef<string[]>;
  isSaveDisabled: ComputedRef<boolean>;
  isSaveBusy: ComputedRef<boolean>;
  publishTooltipLabel: ComputedRef<string>;
  publishIconClass: ComputedRef<string[]>;
  isPublishDisabled: ComputedRef<boolean>;
  isPublishBusy: ComputedRef<boolean>;
  livePageHref: ComputedRef<string | null>;
  isVisitDisabled: ComputedRef<boolean>;
  visitTooltipLabel: ComputedRef<string>;
  showPublishControls: ComputedRef<boolean>;
  showVisitControl: ComputedRef<boolean>;
  isActionsDisabled: ComputedRef<boolean>;
}

export function useComposerSavePublishUiState(
  options: UseComposerSavePublishUiStateOptions,
): UseComposerSavePublishUiStateReturn {
  const { t } = useStudioI18n();
  const isPublished = computed(
    () =>
      toValue(options.currentItemType) === "page" &&
      toValue(options.currentPage)?.status === "published",
  );

  const isModifiedSincePublish = computed(
    () =>
      toValue(options.currentItemType) === "page" &&
      toValue(options.currentPage)?.status === "published" &&
      toValue(options.currentPage)?.isModifiedSincePublish === true,
  );

  const showUnpublishAction = computed(
    () =>
      toValue(options.currentItemType) === "page" &&
      isPublished.value &&
      !toValue(options.canPublish) &&
      !toValue(options.isPublishing),
  );

  const saveTooltipLabel = computed(() => {
    if (toValue(options.isSaving)) {
      if (toValue(options.currentItemType) === "component") {
        return t("composer.status.savingComponent");
      }
      if (toValue(options.currentItemType) === "layout") {
        return t("composer.status.savingLayout");
      }
      if (isPublished.value) return t("common.saving");
      return t("composer.status.savingDraft");
    }

    if (!toValue(options.canSave)) return t("composer.status.upToDate");

    if (toValue(options.currentItemType) === "component")
      return t("composer.status.saveComponent");
    if (toValue(options.currentItemType) === "layout") return t("composer.status.saveLayout");
    if (isPublished.value) return t("common.saveChanges");
    return t("composer.status.saveDraft");
  });

  const saveIconClass = computed(() => {
    if (toValue(options.isSaving)) {
      return [studioIcons.refresh, "size-4 animate-spin"];
    }

    if (toValue(options.canSave)) {
      return [studioIcons.save, "size-4 text-red-500"];
    }

    if (isModifiedSincePublish.value) {
      return [studioIcons.save, "size-4 text-amber-600 dark:text-amber-500"];
    }

    return [studioIcons.save, "size-4 text-foreground/35"];
  });

  const isSaveBusy = computed(() => Boolean(toValue(options.isSaving)));

  const isActionsDisabled = computed(
    () =>
      Boolean(toValue(options.isLoading)) ||
      Boolean(toValue(options.isSaving)) ||
      Boolean(toValue(options.isPublishing)) ||
      !toValue(options.currentItemSlug),
  );

  const isSaveDisabled = computed(
    () => isActionsDisabled.value || !toValue(options.canSave),
  );

  const publishTooltipLabel = computed(() => {
    if (toValue(options.isPublishing)) return t("pages.action.publishing");

    if (toValue(options.currentItemType) !== "page") return "";

    if (showUnpublishAction.value) return t("pages.action.unpublish");

    if (!toValue(options.canPublish)) {
      return t("composer.status.upToDate");
    }

    if (isPublished.value) return t("pages.detail.publishChanges");

    return t("composer.status.publishPage");
  });

  const publishIconClass = computed(() => {
    if (toValue(options.isPublishing)) {
      return [studioIcons.loading, "size-4 animate-spin text-primary"];
    }

    if (toValue(options.canPublish)) {
      return [studioIcons.publish, "size-4 text-primary"];
    }

    if (showUnpublishAction.value) {
      return [studioIcons.unpublish, "size-4 text-primary"];
    }

    return [studioIcons.publish, "size-4 text-foreground/30"];
  });

  const isPublishBusy = computed(() => Boolean(toValue(options.isPublishing)));

  const isPublishDisabled = computed(
    () =>
      isActionsDisabled.value ||
      toValue(options.isSaving) ||
      toValue(options.isPublishing) ||
      (!toValue(options.canPublish) && !showUnpublishAction.value),
  );

  const livePageHref = computed(() => {
    if (toValue(options.currentItemType) !== "page") return null;

    const page = toValue(options.currentPage);
    const slug = page?.slug?.trim();
    if (!slug) return null;

    // Build the public path considering parent hierarchy.
    // A child page with parent "about" lives at /about/child, not /child.
    // The parent field encodes the direct parent slug; the SSR handler
    // at [...slug].astro validates the full hierarchy at request time.
    const parent = page?.parent?.trim();
    let path: string;
    if (slug === "index") {
      path = "/";
    } else if (parent && parent !== "index") {
      path = `/${parent}/${slug}`;
    } else {
      path = `/${slug}`;
    }

    return page?.status === "draft" || page?.status === "scheduled"
      ? `${path}?preview=1`
      : path;
  });

  const isVisitDisabled = computed(
    () =>
      isActionsDisabled.value ||
      toValue(options.currentItemType) !== "page" ||
      !livePageHref.value,
  );

  const visitTooltipLabel = computed(() => {
    if (toValue(options.currentItemType) !== "page") {
      return t("composer.status.visitLivePage");
    }

    if (
      toValue(options.currentPage)?.status === "draft" ||
      toValue(options.currentPage)?.status === "scheduled"
    ) {
      return t("composer.status.previewPage");
    }

    return t("composer.options.viewLivePage");
  });

  const showPublishControls = computed(
    () => toValue(options.currentItemType) === "page",
  );

  const showVisitControl = computed(
    () => toValue(options.currentItemType) === "page",
  );

  return {
    isPublished,
    isModifiedSincePublish,
    showUnpublishAction,
    saveTooltipLabel,
    saveIconClass,
    isSaveDisabled,
    isSaveBusy,
    publishTooltipLabel,
    publishIconClass,
    isPublishDisabled,
    isPublishBusy,
    livePageHref,
    isVisitDisabled,
    visitTooltipLabel,
    showPublishControls,
    showVisitControl,
    isActionsDisabled,
  };
}
