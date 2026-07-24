<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  provide,
  readonly,
  shallowRef,
  watch,
  type ComponentPublicInstance,
} from "vue";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import ClassManagerView from "../views/ClassManagerView.vue";
import VariableManagerView from "../views/VariableManagerView.vue";
import {
  DESIGN_HEADER_TELEPORT_KEY,
  type DesignHeaderTeleportRefs,
} from "../composables/useDesignHeaderTeleport";
import {
  DESIGN_WORKBENCH_HIGHLIGHT_KEY,
  useDesignWorkbenchDialog,
  type DesignWorkbenchView,
} from "../composables/useDesignWorkbenchDialog";
import {
  DESIGN_HEADER_TELEPORT_TARGETS,
  type DesignHeaderTeleportTarget,
} from "../types";
import { useStudioI18n } from "@/i18n";

const workbench = useDesignWorkbenchDialog();
const { t } = useStudioI18n();
const viewOptions = computed<ReadonlyArray<{
  id: DesignWorkbenchView;
  title: string;
  description: string;
}>>(() => [
  { id: "classes", title: t("design.workbench.classes"), description: t("design.workbench.classesDescription") },
  { id: "variables", title: t("design.workbench.variables"), description: t("design.workbench.variablesDescription") },
]);

const headerTeleportRefs: DesignHeaderTeleportRefs = {
  search: shallowRef<HTMLElement | null>(null),
  toolbar: shallowRef<HTMLElement | null>(null),
  importExport: shallowRef<HTMLElement | null>(null),
  maintenance: shallowRef<HTMLElement | null>(null),
  actions: shallowRef<HTMLElement | null>(null),
};

provide(DESIGN_HEADER_TELEPORT_KEY, headerTeleportRefs);
provide(
  DESIGN_WORKBENCH_HIGHLIGHT_KEY,
  readonly(workbench.highlightClassName),
);

function bindHeaderTeleportTarget(
  target: DesignHeaderTeleportTarget,
  element: Element | ComponentPublicInstance | null,
): void {
  headerTeleportRefs[target].value =
    element instanceof HTMLElement ? element : null;
}

function handleOpenChange(open: boolean): void {
  if (!open) {
    workbench.close();
  }
}

function setActiveView(view: DesignWorkbenchView): void {
  workbench.activeView.value = view;
}

watch(
  () => workbench.isOpen.value,
  (open) => {
    if (!open) {
      workbench.highlightClassName.value = null;
    }
  },
);

onBeforeUnmount(() => {
  workbench.close();
});
</script>

<template>
  <Dialog :open="workbench.isOpen.value" @update:open="handleOpenChange">
    <DialogContent
      class="max-w-none! w-[80dvw]! h-[80dvh]! gap-0 overflow-hidden rounded-lg border border-border bg-background p-0"
    >
      <DialogDescription class="sr-only">
        {{ t("design.workbench.description") }}
      </DialogDescription>
      <DialogTitle class="sr-only">
        {{
          viewOptions.find((view) => view.id === workbench.activeView.value)
            ?.title ?? t("design.workbench.title")
        }}
      </DialogTitle>

      <div class="flex h-full min-h-0 flex-col">
        <header
          class="shrink-0 overflow-hidden border-b border-dashed border-border bg-background px-6 py-4 pr-14"
        >
          <div class="flex items-center justify-between gap-4 overflow-hidden">
            <div
              class="flex shrink-0 items-stretch gap-2"
              role="tablist"
              :aria-label="t('design.workbench.viewLabel')"
            >
              <button
                v-for="view in viewOptions"
                :key="view.id"
                type="button"
                role="tab"
                :aria-selected="workbench.activeView.value === view.id"
                :class="
                  cn(
                    'workbench-view-card flex min-w-[9.5rem] flex-col items-start rounded-md border px-3.5 py-2.5 text-left transition-[background-color,border-color,box-shadow,transform] duration-150',
                    workbench.activeView.value === view.id
                      ? 'workbench-view-card-active border-border bg-background text-foreground shadow-sm'
                      : 'border-transparent bg-muted/60 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground',
                  )
                "
                @click="setActiveView(view.id)"
              >
                <span class="text-sm font-medium leading-tight tracking-tight">
                  {{ view.title }}
                </span>
                <span
                  class="mt-0.5 text-xs leading-snug"
                  :class="
                    workbench.activeView.value === view.id
                      ? 'text-muted-foreground/70'
                      : 'text-muted-foreground/55'
                  "
                >
                  {{ view.description }}
                </span>
              </button>
            </div>

            <TooltipProvider
              :delay-duration="0"
              :skip-delay-duration="0"
              :disable-hoverable-content="true"
              ignore-non-keyboard-focus
            >
              <div
                class="flex shrink-0 items-center justify-end overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <div
                  class="flex shrink-0 items-center gap-0 [&_[data-slot=button]:hover]:z-10 [&_[data-slot=button]:focus-visible]:z-10 [&_[data-slot=button][data-state=open]]:z-10"
                >
                  <div
                    :id="DESIGN_HEADER_TELEPORT_TARGETS.search"
                    :ref="
                      (element) => bindHeaderTeleportTarget('search', element)
                    "
                    class="flex shrink-0 items-center"
                  />
                  <div
                    :id="DESIGN_HEADER_TELEPORT_TARGETS.toolbar"
                    :ref="
                      (element) => bindHeaderTeleportTarget('toolbar', element)
                    "
                    class="flex shrink-0 items-center gap-0"
                  />
                  <div
                    :id="DESIGN_HEADER_TELEPORT_TARGETS.importExport"
                    :ref="
                      (element) =>
                        bindHeaderTeleportTarget('importExport', element)
                    "
                    class="flex shrink-0 items-center gap-0"
                  />
                  <div
                    :id="DESIGN_HEADER_TELEPORT_TARGETS.maintenance"
                    :ref="
                      (element) =>
                        bindHeaderTeleportTarget('maintenance', element)
                    "
                    class="flex shrink-0 items-center gap-0"
                  />
                </div>

                <div
                  :id="DESIGN_HEADER_TELEPORT_TARGETS.actions"
                  :ref="
                    (element) => bindHeaderTeleportTarget('actions', element)
                  "
                  class="flex shrink-0 items-center gap-1.5 pl-2 ml-2"
                />
              </div>
            </TooltipProvider>
          </div>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto overscroll-y-none bg-background">
          <Transition name="workbench-view-panel" mode="out-in">
            <div
              v-if="workbench.activeView.value === 'classes'"
              key="workbench-class-manager"
              class="min-h-full"
            >
              <ClassManagerView />
            </div>
            <div
              v-else
              key="workbench-variable-manager"
              class="min-h-full"
            >
              <VariableManagerView />
            </div>
          </Transition>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.workbench-view-card-active {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
}

.workbench-view-card:active {
  transform: scale(0.985);
}

.workbench-view-panel-enter-active {
  transition: opacity 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

.workbench-view-panel-leave-active {
  transition: opacity 120ms cubic-bezier(0.4, 0, 0.2, 1);
}

.workbench-view-panel-enter-from,
.workbench-view-panel-leave-to {
  opacity: 0;
}
</style>
