/**
 * Aria Motion stage iframe preview
 */

import { watch, type Ref } from "vue";
import { ARIA_MOTION_RUNTIME_URL } from "../../../../../lib/motion/runtime/renderMotionScriptTag";

declare global {
  interface Window {
    AriaMotion?: {
      init: (container?: Document | Element) => void;
    };
  }
}

const MOTION_SCRIPT_ID = "aria-motion-runtime-script";

function ensureMotionScript(doc: Document): void {
  if (doc.getElementById(MOTION_SCRIPT_ID)) {
    return;
  }

  const script = doc.createElement("script");
  script.id = MOTION_SCRIPT_ID;
  script.src = ARIA_MOTION_RUNTIME_URL;
  script.defer = true;
  doc.head.appendChild(script);
}

function initMotionInDocument(doc: Document): void {
  if (doc.defaultView?.AriaMotion) {
    doc.defaultView.AriaMotion.init(doc);
    return;
  }

  const script = doc.getElementById(MOTION_SCRIPT_ID);
  if (!script) {
    return;
  }

  script.addEventListener(
    "load",
    () => {
      doc.defaultView?.AriaMotion?.init(doc);
    },
    { once: true },
  );
}

export function useMotionPreview(iframeRef: Ref<HTMLIFrameElement | null>) {
  function refreshMotionPreview(): void {
    const doc = iframeRef.value?.contentDocument;
    if (!doc) {
      return;
    }

    ensureMotionScript(doc);
    initMotionInDocument(doc);
  }

  watch(iframeRef, () => {
    refreshMotionPreview();
  });

  return {
    refreshMotionPreview,
  };
}
