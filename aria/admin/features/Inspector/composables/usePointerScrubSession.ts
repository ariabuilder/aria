import { onBeforeUnmount } from "vue";

interface PointerScrubMoveContext {
  deltaX: number;
  deltaY: number;
  event: MouseEvent;
}

interface StartPointerScrubOptions {
  event: MouseEvent;
  threshold?: number;
  cursor?: string;
  onStart?: () => void;
  onMove: (context: PointerScrubMoveContext) => void;
  onCommit?: () => void;
  onCancel?: () => void;
  onCleanup?: () => void;
}

interface UsePointerScrubSessionReturn {
  start: (options: StartPointerScrubOptions) => void;
  cancelActive: () => void;
}

const DEFAULT_THRESHOLD = 2;
const DEFAULT_CURSOR = "ew-resize";

export function usePointerScrubSession(): UsePointerScrubSessionReturn {
  let activeCleanup: (() => void) | null = null;

  function cancelActive(): void {
    activeCleanup?.();
    activeCleanup = null;
  }

  function start(options: StartPointerScrubOptions): void {
    cancelActive();

    const startX = options.event.clientX;
    const startY = options.event.clientY;
    const threshold = options.threshold ?? DEFAULT_THRESHOLD;
    const cursor = options.cursor ?? DEFAULT_CURSOR;
    let hasMoved = false;

    function cleanup(): void {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      options.onCleanup?.();
      activeCleanup = null;
    }

    function onMouseMove(event: MouseEvent): void {
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;

      if (
        !hasMoved &&
        (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold)
      ) {
        hasMoved = true;
        // Defer preventDefault until scrubbing starts so click-to-focus still
        // works on inputs. Once dragging, suppress native text selection
        // (needed for reliable document-level mousemove on Windows).
        event.preventDefault();
        if (document.activeElement instanceof HTMLInputElement) {
          document.activeElement.blur();
        }
        document.body.style.cursor = cursor;
        document.body.style.userSelect = "none";
        options.onStart?.();
      }

      if (!hasMoved) {
        return;
      }

      options.onMove({ deltaX, deltaY, event });
    }

    function onMouseUp(): void {
      cleanup();

      if (!hasMoved) {
        return;
      }

      options.onCommit?.();
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape" || !hasMoved) {
        return;
      }

      event.preventDefault();
      cleanup();
      options.onCancel?.();
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown);
    activeCleanup = cleanup;
  }

  onBeforeUnmount(() => {
    cancelActive();
  });

  return {
    start,
    cancelActive,
  };
}
