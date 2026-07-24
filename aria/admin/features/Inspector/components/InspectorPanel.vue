<script setup lang="ts">
/**
 * InspectorPanel - Main Inspector Sidebar Component
 *
 * The primary right sidebar for editing selected element properties.
 * Orchestrates tabs, header, and property editing.
 *
 * @component
 */
import { computed, provide } from "vue";
import { Button } from "@/components/ui/button";
import { studioIcons } from "@/lib/icons";
import { useInspector } from "../composables/useInspector";
import InspectorHeader from "./InspectorHeader.vue";
import InspectorTabs from "./InspectorTabs.vue";
import InspectorEmpty from "./InspectorEmpty.vue";
import DesignTab from "../tabs/DesignTab.vue";
import PropsTab from "../tabs/PropsTab.vue";
import MotionTab from "../tabs/MotionTab.vue";
import type { LayoutDSL } from "../../../../lib/types/nodes";
import type { InspectorPseudoState } from "../../../../lib/schemas/classEditor";
import { useClassEditor } from "../composables/useClassEditor";
import { useStudioI18n } from "@/i18n";

// PROPS & EMITS

interface Props {
  currentItemType?: "page" | "layout" | "component";
  currentItemSlug?: string;
  currentLayoutSlug?: string;
  currentLayout?: LayoutDSL | null;
  layoutMetadata?: {
    layoutType?: string;
    slots?: Array<{ name: string; required: boolean }>;
    description?: string;
  };
}

const props = withDefaults(defineProps<Props>(), {
  currentItemType: undefined,
  currentItemSlug: undefined,
  currentLayoutSlug: undefined,
  currentLayout: null,
  layoutMetadata: undefined,
});

const emit = defineEmits<{
  updateLayout: [layoutSlug: string];
  updateLayoutMetadata: [metadata: NonNullable<Props["layoutMetadata"]>];
  detachInstance: [nodeId: string];
  /** Open the source component in the Composer */
  editComponent: [componentId: string];
}>();

const inspector = useInspector();
const classEditor = useClassEditor();
const { t } = useStudioI18n();

// Provide inspector to child components
provide("inspector", inspector);
provide(
  "currentItemType",
  computed(() => props.currentItemType),
);
provide(
  "currentItemSlug",
  computed(() => props.currentItemSlug),
);

const hasSelection = computed(() => inspector.hasSelection.value);
const isLocked = computed(() => inspector.isLocked.value);
const elementContext = computed(() => inspector.elementContext.value);
const selectedPseudo = computed(() => inspector.selectedPseudo.value);
const hasActiveCustomClass = computed(
  () => classEditor.activeClassName.value !== null,
);
const hasPseudoRules = computed(
  () => (classEditor.activeClass.value?.pseudoVariants.length ?? 0) > 0,
);

function handleDetachInstance() {
  const nodeId = elementContext.value.nodeId;
  if (nodeId) {
    emit("detachInstance", nodeId);
  }
}

function handleEditComponent() {
  const componentId = elementContext.value.componentRef;
  if (componentId) {
    emit("editComponent", componentId);
  }
}

function handlePseudoChange(value: InspectorPseudoState) {
  if (!hasActiveCustomClass.value) {
    inspector.resetPseudo();
    return;
  }

  inspector.setSelectedPseudo(value);
}
</script>

<template>
  <!-- Inspector Panel (Right Sidebar) -->
  <aside
    class="h-full min-h-0 w-full flex flex-col overflow-hidden hide-scrollbars bg-background"
  >
    <InspectorHeader
      :element-context="elementContext"
      :is-locked="isLocked"
      :selected-pseudo="selectedPseudo"
      :pseudo-enabled="hasActiveCustomClass"
      :has-pseudo-rules="hasPseudoRules"
      @update:selected-pseudo="handlePseudoChange"
    />

    <!-- Tabs -->
    <InspectorTabs
      :active-tab="inspector.activeTab.value"
      @update:active-tab="inspector.setTab"
    />

    <!-- Content -->
    <div class="flex-1 overflow-hidden min-w-0 flex flex-col">
      <div class="flex-1 min-h-0 flex flex-col">
        <!-- Component Instance Lock Message -->
        <div
          v-if="isLocked && elementContext.componentRef"
          class="m-4 rounded-md border border-primary/30 bg-primary/5 p-4 text-sm"
        >
          <div class="flex items-start gap-3">
            <span
              :class="[studioIcons.lock, 'mt-0.5 size-4 shrink-0 text-primary']"
              aria-hidden="true"
            />
            <div class="flex-1">
              <div class="mb-1 font-medium text-foreground">
                {{ t("inspector.locked.title") }}
              </div>
              <div class="mb-3 text-xs leading-relaxed text-muted-foreground">
                {{ t("inspector.locked.description", { component: elementContext.componentRef }) }}
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <Button variant="default" size="xs" @click="handleEditComponent">
                  {{ t("inspector.locked.editComponent") }}
                </Button>
                <Button variant="outline" size="xs" @click="handleDetachInstance">
                  {{ t("inspector.locked.detach") }}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State (no selection) -->
        <InspectorEmpty v-else-if="!hasSelection" />

        <!-- Tab Content -->
        <Transition v-else name="tab-panel" mode="out-in">
          <div
            :key="inspector.activeTab.value"
            class="flex-1 min-h-0 flex flex-col"
          >
            <KeepAlive>
              <DesignTab
                v-if="inspector.activeTab.value === 'design'"
                :current-item-type="props.currentItemType"
                :current-item-slug="props.currentItemSlug"
                :current-layout-slug="props.currentLayoutSlug"
                :current-layout="props.currentLayout"
                :layout-metadata="props.layoutMetadata"
                @update-layout="(slug: string) => emit('updateLayout', slug)"
                @update-layout-metadata="
                  (meta: NonNullable<Props['layoutMetadata']>) =>
                    emit('updateLayoutMetadata', meta)
                "
              />

              <PropsTab
                v-else-if="inspector.activeTab.value === 'props'"
                :current-item-type="props.currentItemType"
                :current-item-slug="props.currentItemSlug"
              />

              <MotionTab
                v-else-if="inspector.activeTab.value === 'motion'"
                :current-item-type="props.currentItemType"
                :current-item-slug="props.currentItemSlug"
              />
            </KeepAlive>
          </div>
        </Transition>
      </div>
    </div>
  </aside>
</template>
