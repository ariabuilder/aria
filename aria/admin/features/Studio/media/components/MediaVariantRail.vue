<script setup lang="ts">
import { computed, ref } from "vue";
import type { ComponentPublicInstance } from "vue";
import type { MediaTransformVariant } from "../../../../../lib/media/transforms/schemas";
import {
  FlickeringNavItem,
  SlidingNavIndicator,
  StudioInlineCreateNavRow,
  StudioRailFrame,
} from "@/features/Studio/core/components";
import { useSlidingNavIndicator } from "@/features/Studio/core/composables/useSlidingNavIndicator";
import { resolveButtonEl } from "@/features/Studio/core/utils/resolveButtonEl";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";

const props = withDefaults(
  defineProps<{
    variants: readonly MediaTransformVariant[];
    selectedVariantId: string | null;
    draftVariantName: string | null;
    sourceDimensions?: { width: number; height: number } | null;
    canCreate?: boolean;
  }>(),
  { sourceDimensions: null, canCreate: true },
);

const emit = defineEmits<{
  selectOriginal: [];
  selectVariant: [id: string];
  createVariant: [name: string];
}>();
const { t } = useStudioI18n();

const navButtonEls = new Map<string, HTMLElement>();
const activeKey = computed(() =>
  props.draftVariantName
    ? "draft"
    : props.selectedVariantId
      ? `variant:${props.selectedVariantId}`
      : "original",
);
const {
  navRef,
  indicator,
  indicatorAnimated,
  registerButton,
  onItemEnter,
  onNavLeave,
  updateIndicator,
} = useSlidingNavIndicator({
  enabled: computed(() => true),
  activeKey,
  hoverOnly: true,
  hideWhenOnActive: true,
});
const createRowRef = ref<InstanceType<typeof StudioInlineCreateNavRow> | null>(
  null,
);

function bindNavRef(key: string) {
  return (el: Element | ComponentPublicInstance | null) => {
    const resolved = resolveButtonEl(el);
    const existing = navButtonEls.get(key);
    if (resolved) {
      if (existing === resolved) return;
      navButtonEls.set(key, resolved);
    } else {
      if (!existing) return;
      navButtonEls.delete(key);
    }
    registerButton(key, resolved);
  };
}

function startCreate(): void {
  createRowRef.value?.startCreate();
}

defineExpose({ startCreate });
</script>

<template>
  <StudioRailFrame :title="t('media.variants')" framed>
    <nav
      ref="navRef"
      class="organizer-nav settings-nav page-card-enter relative min-h-0 flex-1 overflow-y-auto bg-background py-0"
      :aria-label="t('media.variants')"
      @scroll="updateIndicator"
      @mouseleave="onNavLeave"
    >
      <SlidingNavIndicator
        :visible="indicator.visible"
        :top="indicator.top"
        :height="indicator.height"
        :animated="indicatorAnimated"
      />

      <FlickeringNavItem
        :ref="bindNavRef('original')"
        :active="activeKey === 'original'"
        class="py-4.5"
        @click="emit('selectOriginal')"
        @mouseenter="onItemEnter('original')"
      >
        <span class="min-w-0 truncate">{{ t("media.original") }}</span>
        <span class="shrink-0 text-2xs tabular-nums text-muted-foreground/60">
          {{ sourceDimensions?.width ?? "—" }} ×
          {{ sourceDimensions?.height ?? "—" }}
        </span>
      </FlickeringNavItem>

      <FlickeringNavItem
        v-if="draftVariantName"
        :ref="bindNavRef('draft')"
        :active="activeKey === 'draft'"
        class="group"
        @mouseenter="onItemEnter('draft')"
      >
        <span class="min-w-0 truncate">{{ draftVariantName }}</span>
        <span class="shrink-0 text-2xs text-muted-foreground">{{
          t("media.draft")
        }}</span>
      </FlickeringNavItem>

      <FlickeringNavItem
        v-for="variant in variants"
        :key="variant.id"
        :ref="bindNavRef(`variant:${variant.id}`)"
        :active="activeKey === `variant:${variant.id}`"
        @click="emit('selectVariant', variant.id)"
        @mouseenter="onItemEnter(`variant:${variant.id}`)"
      >
        <span class="min-w-0 truncate" :title="variant.name">{{
          variant.name
        }}</span>
        <span class="shrink-0 text-2xs tabular-nums text-muted-foreground/60">
          {{ variant.output.width ?? "—" }} × {{ variant.output.height ?? "—" }}
        </span>
      </FlickeringNavItem>

      <StudioInlineCreateNavRow
        ref="createRowRef"
        :label="t('media.newCrop')"
        :placeholder="t('media.variantName')"
        :hint="t('media.sidebar.createHint')"
        :icon="studioIcons.add"
        :disabled="!canCreate"
        @create="emit('createVariant', $event)"
      />
    </nav>
  </StudioRailFrame>
</template>
