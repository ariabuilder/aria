<script setup lang="ts">
import {
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  shallowRef,
  computed,
  type ComponentPublicInstance,
} from "vue";

import { useDesignViewState } from "../composables";
import { Button } from "@/components/ui/button";
import FrameworkView from "./FrameworkView.vue";
import ColorSystemView from "./ColorSystemView.vue";
import FontView from "./FontView.vue";
import BreakpointsView from "./BreakpointsView.vue";
import IconsView from "./IconsView.vue";
import GlobalStylesView from "./GlobalStylesView.vue";
import VariableManagerView from "./VariableManagerView.vue";
import ClassManagerView from "./ClassManagerView.vue";
import DesignOrganizerRail from "../components/DesignOrganizerRail.vue";

import DesignAssetImportDialog from "../dialogs/DesignAssetImportDialog.vue";
import { useVariableManagerBootstrap } from "../composables/useVariableManagerBootstrap";
import { studioIcons } from "@/lib/icons";
import { PageHeader } from "@/features/Studio/core/components";
import HeaderActionTooltip from "@/features/Studio/core/components/HeaderActionTooltip.vue";
import StudioLeftRailReveal from "@/features/Studio/core/components/StudioLeftRailReveal.vue";
import {
  DESIGN_HEADER_TELEPORT_KEY,
  type DesignHeaderTeleportRefs,
} from "../composables/useDesignHeaderTeleport";
import {
  DESIGN_HEADER_TELEPORT_TARGETS,
  type DesignHeaderTeleportTarget,
} from "../types";
import { useStudioI18n } from "@/i18n";

/**
 * Design View
 *
 * Main container for Studio Design section that switches between
 * different design system configuration views.
 */

const { currentView, isSaving, setSection } = useDesignViewState();
const { t } = useStudioI18n();

const sectionMessageKey = computed(() => {
  const keyBySection = {
    framework: "framework",
    breakpoints: "breakpoints",
    colors: "colors",
    typography: "typography",
    "global-styles": "globalStyles",
    icons: "icons",
    "class-manager": "classManager",
    "variable-manager": "variableManager",
  } as const;
  return keyBySection[currentView.value];
});
const headerTitle = computed(() =>
  t(`design.section.${sectionMessageKey.value}`),
);
const headerDescription = computed(() =>
  t(`design.description.${sectionMessageKey.value}`),
);

const { loadVariableManagerBootstrap } = useVariableManagerBootstrap();

const importDialogOpen = ref(false);

const headerTeleportRefs: DesignHeaderTeleportRefs = {
  search: shallowRef<HTMLElement | null>(null),
  toolbar: shallowRef<HTMLElement | null>(null),
  importExport: shallowRef<HTMLElement | null>(null),
  maintenance: shallowRef<HTMLElement | null>(null),
  actions: shallowRef<HTMLElement | null>(null),
};

provide(DESIGN_HEADER_TELEPORT_KEY, headerTeleportRefs);

function bindHeaderTeleportTarget(
  target: DesignHeaderTeleportTarget,
  element: Element | ComponentPublicInstance | null,
): void {
  headerTeleportRefs[target].value =
    element instanceof HTMLElement ? element : null;
}

function onBeforeUnloadHandler(e: BeforeUnloadEvent): void {
  if (isSaving.value) {
    e.preventDefault();
    e.returnValue = "";
  }
}

onMounted((): void => {
  window.addEventListener("beforeunload", onBeforeUnloadHandler);
  void loadVariableManagerBootstrap(undefined, { silent: true });
});

onBeforeUnmount((): void => {
  window.removeEventListener("beforeunload", onBeforeUnloadHandler);
});
</script>

<template>
  <div class="flex h-full min-h-0 gap-1.5 overflow-hidden bg-sidebar">
    <StudioLeftRailReveal>
      <DesignOrganizerRail
        :active-section="currentView"
        @select-section="setSection"
      />
    </StudioLeftRailReveal>

    <section
      class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-solid border-border bg-background"
    >
      <PageHeader
        :title="headerTitle"
        :description="headerDescription"
        hide-create
      >
        <template #search>
          <div
            :id="DESIGN_HEADER_TELEPORT_TARGETS.search"
            :ref="(element) => bindHeaderTeleportTarget('search', element)"
          />
        </template>
        <template #toolbar>
          <HeaderActionTooltip
            v-if="
              currentView !== 'class-manager' &&
              currentView !== 'variable-manager' &&
              currentView !== 'typography'
            "
            :label="t('design.importAssets')"
          >
            <Button
              variant="headerAction"
              size="icon-header"
              @click="importDialogOpen = true"
            >
              <span :class="[studioIcons.upload, 'size-3.5 shrink-0']" />
            </Button>
          </HeaderActionTooltip>
          <div
            :id="DESIGN_HEADER_TELEPORT_TARGETS.toolbar"
            :ref="(element) => bindHeaderTeleportTarget('toolbar', element)"
          />
          <div
            :id="DESIGN_HEADER_TELEPORT_TARGETS.importExport"
            :ref="(element) => bindHeaderTeleportTarget('importExport', element)"
            class="flex shrink-0 items-center gap-0"
          />
        </template>
        <template #actions>
          <div
            :id="DESIGN_HEADER_TELEPORT_TARGETS.maintenance"
            :ref="(element) => bindHeaderTeleportTarget('maintenance', element)"
            class="flex shrink-0 items-center gap-0"
          />
          <div
            :id="DESIGN_HEADER_TELEPORT_TARGETS.actions"
            :ref="(element) => bindHeaderTeleportTarget('actions', element)"
            class="flex shrink-0 items-center gap-1.5"
          />
        </template>
      </PageHeader>

      <div class="min-h-0 flex-1 overflow-y-auto overscroll-y-none">
        <ColorSystemView v-if="currentView === 'colors'" />
        <FrameworkView v-else-if="currentView === 'framework'" />
        <BreakpointsView v-else-if="currentView === 'breakpoints'" />
        <FontView v-else-if="currentView === 'typography'" />
        <GlobalStylesView v-else-if="currentView === 'global-styles'" />
        <VariableManagerView
          v-else-if="currentView === 'variable-manager'"
          key="variable-manager"
        />
        <ClassManagerView
          v-else-if="currentView === 'class-manager'"
          key="class-manager"
        />
        <IconsView v-else-if="currentView === 'icons'" />
      </div>
    </section>

    <DesignAssetImportDialog
      :open="importDialogOpen"
      @update:open="importDialogOpen = $event"
    />
  </div>
</template>
