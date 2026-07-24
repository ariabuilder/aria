import { inject, onMounted, onUnmounted, ref, type Ref } from "vue";
import { toast } from "vue-sonner";
import { useStudioI18n } from "@/i18n";

import type { AddElementPayload } from "@/types/app";
import { APP_INJECTION_KEYS } from "@/features/Core/types/injectionKeys";
import { useInjectedStageIframeRef } from "@/features/Core";
import { useDragDrop } from "@/composables/useDragDrop";
import { useCanvasDrop } from "@/features/Stage/dragdrop/useCanvasDrop";
import {
  CanvasDropDetailSchema,
  LibraryDragPayloadSchema,
} from "@/features/Nodes/events/shared/nodeEventSchemas";
import {
  ComponentDragPayloadSchema,
  ComponentInsertPayloadSchema,
} from "@/lib/schemas/componentPreview";
import { isEmptyLibraryComponentPayload } from "@/features/Nodes/events/shared/libraryComponentGuard";
import { Z_INDEX } from "@/lib/zIndex";
import { log } from "@/lib/utils/logger";

const ROOT_DROP_ZONE_ID = "__aria-root__" as const;
const DRAG_SOURCE = "components" as const;

export interface UseComposerComponentInsertOptions {
  onInsert: (payload: AddElementPayload) => void;
  pickerTargetSlot?: Ref<string>;
}

function readComponentSlug(data: Record<string, unknown>): string | null {
  if (typeof data.componentSlug === "string" && data.componentSlug.trim()) {
    return data.componentSlug.trim();
  }

  const reference = data.reference;
  if (
    reference &&
    typeof reference === "object" &&
    "masterId" in reference &&
    typeof (reference as { masterId: unknown }).masterId === "string" &&
    (reference as { masterId: string }).masterId.trim()
  ) {
    return (reference as { masterId: string }).masterId.trim();
  }

  return null;
}

export function useComposerComponentInsert(
  options: UseComposerComponentInsertOptions,
) {
  const { t } = useStudioI18n();
  const stageIframeRef = useInjectedStageIframeRef();
  const activeLayoutSlot = inject(APP_INJECTION_KEYS.activeLayoutSlot, null);
  const showLayoutSlotGroups = inject(
    APP_INJECTION_KEYS.showLayoutSlotGroups,
    ref(true),
  );
  const { startDrag, endDrag, dragSource } = useDragDrop();
  const canvasDrop = useCanvasDrop(stageIframeRef);

  function buildInsertPayload(componentId: string): AddElementPayload | null {
    const slotName =
      options.pickerTargetSlot?.value.trim() ||
      (showLayoutSlotGroups.value &&
        activeLayoutSlot?.isLayoutSlotEditing.value
        ? activeLayoutSlot.activeSlot.value.name
        : "");

    const candidate = {
      type: "component",
      componentSlug: componentId,
      data: {
        type: "Component",
        props: {},
        styles: {},
        children: [],
        ...(slotName ? { slot: slotName } : {}),
        reference: { type: "instance", masterId: componentId },
      },
    };

    const parsed = ComponentInsertPayloadSchema.safeParse(candidate);
    if (!parsed.success) {
      log("warn", "[useComposerComponentInsert] Invalid insert payload", {
        componentId,
        issues: parsed.error.issues,
      });
      return null;
    }

    return parsed.data;
  }

  function insertComponent(componentId: string): void {
    const payload = buildInsertPayload(componentId);
    if (!payload) {
      toast.error(t("composer.invalidComponentSelection"));
      return;
    }

    options.onInsert(payload);
  }

  function handleDragStart(
    componentId: string,
    event: DragEvent,
    displayName?: string,
  ): void {
    const payload = buildInsertPayload(componentId);
    if (!payload) {
      event.preventDefault();
      return;
    }

    const dragPayload = ComponentDragPayloadSchema.safeParse(payload);
    if (!dragPayload.success) {
      event.preventDefault();
      log("warn", "[useComposerComponentInsert] Invalid drag payload", {
        componentId,
        issues: dragPayload.error.issues,
      });
      return;
    }

    const libraryPayload = LibraryDragPayloadSchema.safeParse({
      ...payload.data,
      type: payload.type,
      componentSlug: payload.componentSlug,
    });

    if (!libraryPayload.success) {
      event.preventDefault();
      return;
    }

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData(
        "application/json",
        JSON.stringify(libraryPayload.data),
      );
      event.dataTransfer.setData("text/plain", componentId);

      const ghostLabel = displayName?.trim() || componentId;
      const ghostEl = document.createElement("div");
      ghostEl.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        padding: 8px 12px;
        background: var(--popover);
        color: var(--primary);
        border-radius: var(--radius-sm);
        font-size: var(--text-sm);
        font-weight: 600;
        pointer-events: none;
        z-index: ${Z_INDEX.dragGhost};
        white-space: nowrap;
        opacity: 0.70;
      `;
      ghostEl.textContent = `+ ${ghostLabel}`;
      document.body.appendChild(ghostEl);
      event.dataTransfer.setDragImage(ghostEl, 8, 8);
      setTimeout(() => ghostEl.remove(), 0);
    }

    startDrag(DRAG_SOURCE, libraryPayload.data);

    if (stageIframeRef.value) {
      canvasDrop.startDrag(libraryPayload.data);
    }
  }

  function handleDragEnd(): void {
    endDrag();
    canvasDrop.endDrag();
  }

  function handleCanvasDrop(event: Event): void {
    if (dragSource.value !== DRAG_SOURCE) {
      return;
    }

    if (!(event instanceof CustomEvent)) {
      return;
    }

    const parsedDrop = CanvasDropDetailSchema.safeParse(event.detail);
    if (!parsedDrop.success) {
      log("warn", "[useComposerComponentInsert] Ignoring invalid canvas:drop", {
        issues: parsedDrop.error.issues,
      });
      return;
    }

    const { zone, data, insertionIndex } = parsedDrop.data;

    if (isEmptyLibraryComponentPayload(data.type, data)) {
      options.onInsert({ type: data.type, data });
      return;
    }

    const componentSlug = readComponentSlug(data);
    if (!componentSlug) {
      log("warn", "[useComposerComponentInsert] Drop missing componentSlug", {
        data,
      });
      return;
    }

    const payload = buildInsertPayload(componentSlug);
    if (!payload) {
      toast.error(t("composer.invalidComponentSelection"));
      return;
    }

    options.onInsert({
      ...payload,
      parentId: zone.id === ROOT_DROP_ZONE_ID ? undefined : zone.id,
      insertionMode: zone.id === ROOT_DROP_ZONE_ID ? "root" : "parent",
      position: insertionIndex,
    });
  }

  onMounted(() => {
    canvasDrop.init();
    window.addEventListener("canvas:drop", handleCanvasDrop);
  });

  onUnmounted(() => {
    window.removeEventListener("canvas:drop", handleCanvasDrop);
    endDrag();
    canvasDrop.destroy();
  });

  return {
    insertComponent,
    handleDragStart,
    handleDragEnd,
  };
}
