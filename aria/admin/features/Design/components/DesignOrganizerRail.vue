<script setup lang="ts">
import { computed } from "vue";
import type { ComponentPublicInstance } from "vue";
import FlickeringNavItem from "@/features/Studio/core/components/FlickeringNavItem.vue";
import SlidingNavIndicator from "@/features/Studio/core/components/SlidingNavIndicator.vue";
import StudioRailFrame from "@/features/Studio/core/components/StudioRailFrame.vue";
import { useSlidingNavIndicator } from "@/features/Studio/core/composables/useSlidingNavIndicator";
import { resolveButtonEl } from "@/features/Studio/core/utils/resolveButtonEl";
import {
  DESIGN_SIDEBAR_CHILDREN,
  DESIGN_PARAM_TO_SECTION,
  type DesignSection,
} from "../types";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  activeSection: DesignSection;
}>();

const emit = defineEmits<{
  selectSection: [section: DesignSection];
}>();
const { t } = useStudioI18n();

const navItems = DESIGN_SIDEBAR_CHILDREN.map((item) => ({
  section: DESIGN_PARAM_TO_SECTION[item.param],
  labelKey: `section.${
    ({ globals: "globalStyles", classes: "classManager", variables: "variableManager" } as const)[item.param] ?? item.param
  }`,
}));

const activeNavKey = computed(() => props.activeSection);

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
  activeKey: activeNavKey,
  hoverOnly: true,
  hideWhenOnActive: true,
});

const registeredNavEls = new Map<
  DesignSection,
  Element | ComponentPublicInstance | null
>();

function bindNavRef(section: DesignSection) {
  return (el: Element | ComponentPublicInstance | null) => {
    if (registeredNavEls.get(section) === el) {
      return;
    }

    registeredNavEls.set(section, el);
    registerButton(section, resolveButtonEl(el));
  };
}

function selectSection(section: DesignSection): void {
  emit("selectSection", section);
}
</script>

<template>
  <StudioRailFrame :title="t('design.title')" framed>
    <nav
      ref="navRef"
      class="organizer-nav settings-nav relative min-h-0 flex-1 overflow-y-auto bg-background py-0"
      :aria-label="t('design.sidebarLabel')"
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
        v-for="item in navItems"
        :key="item.section"
        :ref="bindNavRef(item.section)"
        :active="activeSection === item.section"
        class="py-4.5"
        @mouseenter="onItemEnter(item.section)"
        @click="selectSection(item.section)"
      >
        <span class="min-w-0 truncate">{{ t(`design.${item.labelKey}`) }}</span>
      </FlickeringNavItem>
    </nav>
  </StudioRailFrame>
</template>

<style scoped>
.organizer-nav :deep(.settings-nav-item.nav-border-inactive),
.organizer-nav :deep(.settings-nav-item.hover\:nav-border-hover:hover),
.organizer-nav :deep(.sidebar-nav-target.nav-border-inactive),
.organizer-nav :deep(.sidebar-nav-target.hover\:nav-border-hover:hover) {
  box-shadow: inset 2px 0 0 0 transparent !important;
}
</style>
