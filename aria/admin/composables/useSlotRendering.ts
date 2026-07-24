import type { BuilderNode } from "../../lib/types/nodes";

export type SlotDefinition = {
  name: string;
  label?: string;
  description?: string;
  isDefault?: boolean;
  required?: boolean;
};

type SlotRenderOptions = {
  hideContent?: boolean;
  ctaLabel?: string;
};

const SLOT_STYLE_ATTR = "data-aria-slot-styles";
const DEFAULT_SLOT_NAME = "default";

export function useSlotRendering() {
  const ensureSlotStyles = (head: HTMLHeadElement): void => {
    let styleEl = head.querySelector(`style[${SLOT_STYLE_ATTR}]`);
    if (!styleEl) {
      styleEl = head.ownerDocument.createElement("style");
      styleEl.setAttribute(SLOT_STYLE_ATTR, "true");
      head.appendChild(styleEl);
    }

    (styleEl as HTMLStyleElement).textContent = `
      /* Slot Mode - White Background */
      body.show-slots {
        background-color: #ffffff;
        transition: background-color 0.3s ease;
        margin: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 60px 120px; /* More padding on sides */
        min-height: 100vh;
        overflow-y: auto;
        font-family: 'Inter', system-ui, sans-serif;
      }

      /* Base Slot Container */
      body.show-slots .builder-slot {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100%;
        max-width: 900px;
        margin: 0 0 40px 0;
        
        background: #ffffff;
        border-radius: 12px;
        border: 1px solid #e4e4e7; /* zinc-200 */
        
        padding: 32px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
        
        transition: all 0.2s ease;
      }

      /* Hover Effect */
      body.show-slots .builder-slot:hover {
        border-color: #a1a1aa; /* zinc-400 */
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.025);
      }

      /* Header Slot */
      body.show-slots .builder-slot[data-slot="header"] {
        border-left: 4px solid #a855f7; /* Purple */
      }

      /* Footer Slot */
      body.show-slots .builder-slot[data-slot="footer"] {
        border-left: 4px solid #22c55e; /* Green */
      }

      /* Default Slot (Main Content) - Half Size */
      body.show-slots .builder-slot[data-slot="default"] {
        border-left: 4px solid #3b82f6; /* Blue */
      }
      
      body.show-slots .builder-slot[data-slot="default"] .slot-content {
        max-height: 40vh; /* Half size approx */
        overflow: hidden;
        mask-image: linear-gradient(to bottom, black 70%, transparent 100%);
        -webkit-mask-image: linear-gradient(to bottom, black 70%, transparent 100%);
        pointer-events: none; /* Disable interaction in preview mode if truncated */
      }

      /* Floating Pill Label */
      body.show-slots .slot-pill {
        position: absolute;
        top: -12px;
        right: 24px;
        padding: 4px 12px;
        border-radius: 9999px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        color: #3f3f46; /* zinc-700 */
        background: #f4f4f5; /* zinc-100 */
        border: 1px solid #e4e4e7;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        z-index: 10;
      }

      /* Internal Title */
      body.show-slots .slot-label {
        font-size: 18px;
        font-weight: 600;
        color: #18181b; /* zinc-900 */
        margin-bottom: 8px;
        font-family: system-ui, -apple-system, sans-serif;
      }

      body.show-slots .slot-description {
        font-size: 13px;
        color: #71717a; /* zinc-500 */
        margin-bottom: 24px;
      }

      /* Slot Controls Container */
      body.show-slots .slot-controls {
        margin-top: 24px;
        padding-top: 24px;
        border-top: 1px solid #f4f4f5;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      /* Empty State */
      body.show-slots .builder-slot.empty {
        background: #fafafa; /* zinc-50 */
        border-style: dashed;
      }
      
      body.show-slots .builder-slot.empty .slot-content {
        display: none;
      }

      /* Content Area */
      body.show-slots .slot-content {
        margin-top: 16px;
        position: relative;
        z-index: 1;
        min-height: 20px;
      }
      
      /* Hide slot chrome when show-slots is off */
      body:not(.show-slots) .builder-slot {
        border: none !important;
        padding: 0 !important;
        margin: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
      }
      body:not(.show-slots) .slot-pill,
      body:not(.show-slots) .slot-label,
      body:not(.show-slots) .slot-description,
      body:not(.show-slots) .slot-controls,
      body:not(.show-slots) .slot-skeleton,
      body:not(.show-slots) .slot-empty-message {
        display: none !important;
      }
    `;
  };

  const toggleSlotVisibilityClass = (
    body: HTMLBodyElement,
    show: boolean,
  ): void => {
    if (show) {
      body.classList.add("show-slots");
    } else {
      body.classList.remove("show-slots");
    }
  };

  const computeSlotBuckets = (
    blocks: BuilderNode[],
    slots?: SlotDefinition[],
  ) => {
    const defaultSlotName =
      slots?.find((s) => s.isDefault)?.name ||
      slots?.[0]?.name ||
      DEFAULT_SLOT_NAME;

    const bucketMap = new Map<string, BuilderNode[]>();
    slots?.forEach((slot) => bucketMap.set(slot.name, []));

    const unassigned: BuilderNode[] = [];

    blocks.forEach((block) => {
      const targetSlot = block.slot || defaultSlotName;
      if (bucketMap.has(targetSlot)) {
        bucketMap.get(targetSlot)?.push(block);
      } else {
        unassigned.push(block);
      }
    });

    return { bucketMap, unassigned, defaultSlotName };
  };

  const buildSlotContainer = (
    doc: Document,
    slot: SlotDefinition,
    nodes: BuilderNode[],
    renderNode: (node: BuilderNode) => HTMLElement,
    options: SlotRenderOptions = {},
  ): HTMLElement => {
    const wrapper = doc.createElement("div");
    wrapper.className = "builder-slot";
    if (nodes.length === 0) {
      wrapper.classList.add("empty");
    }
    wrapper.setAttribute("data-slot", slot.name);

    // Floating Pill Label (e.g. "SLOT:HEADER")
    const pill = doc.createElement("div");
    pill.className = "slot-pill";
    pill.textContent = `SLOT:${slot.name}`;
    wrapper.appendChild(pill);

    const labelEl = doc.createElement("div");
    labelEl.className = "slot-label";
    labelEl.textContent = slot.label || slot.name;
    wrapper.appendChild(labelEl);

    if (slot.description) {
      const descEl = doc.createElement("div");
      descEl.className = "slot-description";
      descEl.textContent = slot.description;
      wrapper.appendChild(descEl);
    }

    const contentWrap = doc.createElement("div");
    contentWrap.className = "slot-content";

    if (!options.hideContent) {
      nodes.forEach((node) => contentWrap.appendChild(renderNode(node)));
    }
    wrapper.appendChild(contentWrap);

    // Controls Container (for Vue component)
    const controls = doc.createElement("div");
    controls.className = "slot-controls";
    wrapper.appendChild(controls);

    return wrapper;
  };

  return {
    ensureSlotStyles,
    toggleSlotVisibilityClass,
    computeSlotBuckets,
    buildSlotContainer,
  };
}
