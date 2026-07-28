<!-- Preview iframe: render, select, hover, and drag-drop. -->
<script setup lang="ts">

import { actions } from "astro:actions";
import { z } from "zod";

import {
  ref,
  onMounted,
  onUnmounted,
  watch,
  computed,
  h,
  render,
  inject,
} from "vue";

import type {
  BuilderNode,
  LayoutDSL,
  BreakpointDefinition,
} from "../../../../lib/types/nodes";
import {
  classNamesToString,
  createEmptyClassNames,
} from "../../../../lib/schemas/classEditor";
import {
  compileMotionClassString,
  compileMotionDataAttributes,
  compileParallaxClassString,
  compileParallaxDataAttributes,
} from "../../../../lib/motion/compile";
import { readAriaMotionCss } from "../../../../lib/motion/css/readAriaMotionCss";
import { nodeTreeRequiresMotionStyles } from "../../../../lib/motion/runtime";
import {
  getNativeTagForRenderableNode,
  resolveRenderedButtonVariant,
  stripConsumedRenderPropsForNode,
  type RenderableNodeTagContext,
} from "../../../../lib/blocks/renderSemantics";
import {
  findListItemTextLinkChildIndex,
  isTextLinkWrapperNodeType,
  resolveListItemLinkScope,
  shouldStripContainerLinkWrapperProps,
  shouldWrapContainerChildrenInLink,
  stripLinkPropsForContainerWrapper,
  stripTextLinkWrapperPropsFromNode,
} from "../../../../lib/blocks/listItemLinks";
import { BUTTON_VARIANT_ATTRIBUTE } from "../../../../lib/blocks/buttonVariants";
import {
  buildButtonContentRowStyle,
  buildButtonIconStyle,
  getButtonIconHostClassName,
  getButtonIconPosition,
} from "../../../../lib/blocks/buttonContent";
import {
  isRenderableContainerNodeType,
  isStructuralContainerNodeType,
  normalizeContainerNodeType,
} from "../../../../lib/blocks/containerTypes";
import { createDesktopFirstFallbackBreakpoints } from "../../../../lib/styles/responsiveBreakpoints";
import { getSiteSettingsUtilityEngine } from "../../../../lib/storage/adapter";
import { resolveRenderableContentValue } from "../../../../lib/cms/structuredText";
import { sortRootBlocksByLayoutSlot } from "../../../../lib/layouts/resolveNodeSlot";
import { useCanonicalBreakpoints } from "../../../composables/useCanonicalBreakpoints";
import { log } from "@/lib/utils/logger";
import {
  getStageDropFeedbackCss,
  resolveAdminPrimaryColor,
} from "../styles/stageDropFeedback";
import wireframeStyles from "../../../styles/wireframe.css?raw";

import { useFrameCoords } from "../composables/useFrameCoords";
import { useCanvasReorder } from "../dragdrop/useCanvasReorder";
import { useStageInteractionEngine } from "../interaction";
import { useCanvasOverlays } from "../../../composables/useCanvasOverlays";
import { useDragDrop } from "../../../composables/useDragDrop";
import { useBlockData, useComponentFetcher } from "../../Blocks";
import { useBeacon } from "../../Beacon";
import { useBuilderData } from "../../../composables/useBuilderData";
import { useSlotRendering } from "../../../composables/useSlotRendering";
import { useClassEditor } from "../../Inspector/composables/useClassEditor";
import { usePropertySchema } from "../../Inspector/composables/usePropertySchema";
import { useMotionPreview } from "../../Inspector/motion/composables/useMotionPreview";
import { useSiteSettings } from "../../../composables/useSiteSettings";
import { useViewport } from "../../../composables/useViewport";
import {
  usePropertySave,
  useUnoConfig,
  type UnoRuntimeConfig,
} from "../../Core";
import {
  useIframeSetup,
  STAGE_CONTENT_ROOT_ATTR,
  THEME_STYLES,
  type IframeRenderStyles,
} from "../composables/useIframeSetup";
import { useComponentConversion } from "../composables/useComponentConversion";
import { useCanvasUtils } from "../composables/useCanvasUtils";
import { useStageGlobalCanvasEvents } from "../composables/useStageGlobalCanvasEvents";
import { useAddElementsOverlayBridge } from "../composables/useAddElementsOverlayBridge";
import { useStageInlineEditing } from "../composables/useStageInlineEditing";
import { useStageLiveCanvasUpdates } from "../composables/useStageLiveCanvasUpdates";
import { useToolbarActions } from "../composables/useToolbarActions";
import { useStageSignals } from "../composables/useStageSignals";
import { useOverlayListeners } from "../composables/useOverlayListeners";
import { hydrateIconHost } from "../utils/canvasIconHydration";
import {
  applyImagePresentationToElement,
  attachBrokenMediaFallback,
  resolveImageObjectFit,
  resolveImageObjectPosition,
  resolveStageMediaSrc,
  syncImageEmptyStateAttribute,
} from "../utils/imagePresentation";
import { normalizeCanvasAttributeProps } from "../utils/canvasRenderAttributes";
import { createStageRenderFreshnessTracker } from "../utils/renderFreshness";
import {
  resolveStageBlockRootTag,
  shouldDeferLinkBlockContent,
  shouldDeferTypographyBlockContent,
} from "../utils/stageBlockRootTag";
import { findStageNodeElement } from "../utils/findStageNodeElement";
import { HTML_PASTE_COMPLETE_EVENT } from "../../Nodes/events/clipboardMarkup";
import { requestStageUnoExtractDebounced } from "../utils/requestStageUnoExtract";
import {
  CANVAS_BODY_BACKGROUND_FALLBACK,
  hasAuthoredCanvasBackgroundCss,
  resolveCanvasBodyBackground,
} from "../utils/canvasBackgroundFallback";
import { getContentStyleTargetElement } from "../utils/nodeStyleRuntime";
import { useSlotActions } from "../composables/useSlotActions";
import { useDropReorder } from "../composables/useDropReorder";
import { useAgentCanvasBuildPresentation } from "../composables/useAgentCanvasBuildPresentation";
import {
  collectResponsiveStyleCSS,
  stylesToResponsiveCSS,
  toStylePropertyName,
} from "../utils/stageResponsiveStyles";

import { CreateComponentDialog } from "../../Blocks";
import CanvasOverlayLayer from "./CanvasOverlayLayer.vue";

import { slugify } from "../../../../lib/utils/slugify";
import {
  buildRenderedCodeMarkup,
  getCodeBlockRenderMode,
  inferCodeLanguage,
} from "../../../../lib/utils/codeLanguage";
import { nextStartupInstanceId, traceStartup } from "@/lib/startupTrace";
import { resolveCmsTemplateNodeId } from "../../../../lib/cms/resolveBoundNodes";
import { APP_INJECTION_KEYS } from "../../Core/types/injectionKeys";
import type { CmsPreviewEntryContext } from "../../CMS/composables/useCmsPreviewEntryContext";
import { resolveCmsCanvasBlocks } from "../../CMS/composables/useCmsCanvasResolution";

interface UnoRuntimeWindow extends Window {
  __unocss?: UnoRuntimeConfig;
  __unocss_runtime?: {
    uno?: {
      setConfig: (config: UnoRuntimeConfig) => Promise<void>;
      extractAll: () => Promise<void>;
    };
    update?: () => void;
  };
}

const STAGE_BODY_BACKGROUND_FALLBACK_ATTR =
  "data-aria-stage-body-background-fallback";

const ComponentGroupingStateSchema = z.object({
  groups: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
    }),
  ),
  assignments: z.record(z.string(), z.string()),
});

const ComponentGroupingResultSchema = z.union([
  z.object({
    success: z.literal(true),
    data: ComponentGroupingStateSchema,
  }),
  z.object({
    success: z.literal(false),
    error: z
      .object({
        message: z.string().optional(),
      })
      .optional(),
  }),
]);

const StageRenderStylesResultSchema = z.union([
  z.object({
    success: z.literal(true),
    data: z.object({
      baseCSS: z.string(),
      baseCSSHash: z.string(),
      customClassesCSS: z.string(),
      customFontsCSS: z.string(),
      globalCSS: z.string(),
      globalCSSHash: z.string(),
      lastCompiled: z.string(),
      styleRevision: z.string(),
      utilityCSS: z.string(),
      utilityCSSHash: z.string(),
      utilityEngine: z.enum(["unocss", "custom"]),
    }),
  }),
  z.object({
    success: z.literal(false),
    error: z
      .object({
        message: z.string().optional(),
      })
      .optional(),
  }),
]);

const EMPTY_RENDER_STYLES: IframeRenderStyles = {
  baseCSS: "",
  baseCSSHash: "",
  customClassesCSS: "",
  customFontsCSS: "",
  globalCSS: "",
  globalCSSHash: "",
  lastCompiled: "",
  styleRevision: "",
  utilityCSS: "",
  utilityCSSHash: "",
  utilityEngine: "custom",
};

interface Props {
  blocks: readonly BuilderNode[];
  currentLayout?: LayoutDSL | null;
  currentItemType?: "page" | "layout" | "component";
  currentItemSlug?: string;
  showOutlines?: boolean;
  wireframeMode?: boolean;
  selectedBlockId?: string | null;
  width?: string | number;
  height?: string | number;
}

const props = withDefaults(defineProps<Props>(), {
  currentLayout: null,
  showOutlines: false,
  wireframeMode: false,
  selectedBlockId: null,
});

const cmsPreviewEntryContext = inject<CmsPreviewEntryContext | null>(
  APP_INJECTION_KEYS.cmsPreviewEntryContext,
  null,
);

const emit = defineEmits<{
  selectBlock: [selection: import("../types").StageSelectBlockInput];
  addBlock: [block: BuilderNode, parentId: string | null];
  deleteBlock: [id: string];
  duplicateBlock: [id: string];
  detachComponent: [id: string];
  replaceBlockWithComponent: [id: string, componentSlug: string];
  editComponent: [id: string];
  reorderBlock: [
    operation: {
      sourceParentId: string | null;
      sourceIndex: number;
      targetParentId: string | null;
      targetIndex: number;
    },
  ];
  openPicker: [slotName: string];
  componentCreated: [];
  ready: [];
}>();

const DEFAULT_HEADING_LEVEL = 2;
const SCROLL_BEHAVIOR: ScrollBehavior = "smooth";
const SCROLL_BLOCK: ScrollLogicalPosition = "center";
const STYLE_READY_REVEAL_BUDGET_MS = 500;
const UNO_EXTRACT_DEBOUNCE_MS = 80;
const SEMANTIC_PRIORITY: Record<string, number> = {
  Heading: 5,
  Text: 4,
  Paragraph: 4,
  Link: 3,
  Button: 3,
  Image: 1,
  Component: 6,
};

const iframeRef = ref<HTMLIFrameElement | null>(null);
const { refreshMotionPreview } = useMotionPreview(iframeRef);

/** Track last external selection snapshot to avoid duplicate overlay work */
const lastExternalSelectionKey = ref("");
/** One-shot resync after iframe render when DOM nodes are rebuilt */
const pendingSelectionOverlayResync = ref(false);

/** Tracks if iframe has completed loading */
const isCanvasReady = ref(false);

/** Tracks if we've already rendered (prevents duplicate renders) */
const hasRenderedOnce = ref(false);

/** Tracks if we've emitted canvas-ready */
const hasEmittedReady = ref(false);

const insertionIndicatorEl = ref<HTMLDivElement | null>(null);

let isUnmounted = false;
const stageFrameInstanceId = nextStartupInstanceId("stage-frame");
let unoExtractTimeoutId: number | null = null;
const stageRenderFreshness = createStageRenderFreshnessTracker();
let renderedBlocksForStyleSync: readonly BuilderNode[] = [];

const { worldToFrameLocal, getElementAtWorldPoint } = useFrameCoords(iframeRef);
const { isDragging } = useDragDrop();
const canvasReorder = useCanvasReorder(iframeRef);

// Overlay system for selection, hover, and drag-drop indicators
const overlayLayerRef = ref<InstanceType<typeof CanvasOverlayLayer> | null>(
  null,
);
const canvasOverlays = useCanvasOverlays({
  iframeRef,
  debug: import.meta.env.DEV,
  getBlocks: () => [...props.blocks],
});
const stageInteractionEngine = useStageInteractionEngine({ iframeRef });

useAddElementsOverlayBridge({
  showAddElementsDropFeedback:
    stageInteractionEngine.showAddElementsDropFeedback,
  hideAddElementsDropFeedback:
    stageInteractionEngine.hideAddElementsDropFeedback,
  hideInsertion: canvasOverlays.hideInsertion,
  hideHover: canvasOverlays.hideHover,
});

const { convertNodeToComponent } = useBlockData();
const { components, fetchBuilderData } = useBuilderData();
const existingComponents = computed(() =>
  components.value.map((component) => ({
    slug: slugify(component.name || component.id),
    name: component.name,
    title: component.name,
  })),
);
const {
  ensureSlotStyles,
  toggleSlotVisibilityClass,
  computeSlotBuckets,
  buildSlotContainer,
} = useSlotRendering();
const { expandComponentReferencesClient } = useComponentFetcher();

async function expandBlocksForCanvas(
  blocks: readonly BuilderNode[],
): Promise<BuilderNode[]> {
  const expandedBlocks = await expandComponentReferencesClient(blocks);
  const cmsOptions = cmsPreviewEntryContext?.cmsRenderOptions.value;

  const basePath =
    props.currentItemSlug && props.currentItemSlug.length > 0
      ? `/${props.currentItemSlug.replace(/^\//, "")}`
      : "/";

  return resolveCmsCanvasBlocks(expandedBlocks, {
    basePath,
    cms: cmsOptions ?? { preview: true },
  });
}

const cmsRenderKey = computed(() =>
  JSON.stringify({
    currentItemSlug: props.currentItemSlug ?? "",
    listCollectionId: cmsPreviewEntryContext?.listCollection.value?.id ?? "",
    templateCollectionId:
      cmsPreviewEntryContext?.templateCollection.value?.id ?? "",
    previewEntryId: cmsPreviewEntryContext?.previewEntryId.value ?? "",
    previewEntrySlug: cmsPreviewEntryContext?.previewEntrySlug.value ?? "",
    entryContext: cmsPreviewEntryContext?.entryContext.value ?? null,
  }),
);

const { generatedCSS, loadClasses } = useClassEditor();
const { safeParse } = usePropertySchema();
const { saveProperties } = usePropertySave();
const { primarySelectedNodeId, selectedNodeIds } = useBeacon();
const { viewport } = useViewport();
const { settings: siteSettings } = useSiteSettings();
const { activeBreakpoints } = useCanonicalBreakpoints({ autoLoad: true });
const renderStyles = ref<IframeRenderStyles>({ ...EMPTY_RENDER_STYLES });
const componentGroups = ref<Array<{ id: string; name: string }>>([]);
const loadedStyleRevision = ref("");

const { unoRuntimeConfig, configJSON, cssVariables } = useUnoConfig();

const { iframeHtml, customFontsCSS } = useIframeSetup({
  siteSettings,
  renderStyles,
  configJSON,
  cssVariables,
});

const conversion = useComponentConversion({
  convertNodeToComponent,
  resolveNode: (nodeId) => findNode(getBlocks(), nodeId),
  fetchBuilderData,
  onComponentCreated: () => emit("componentCreated"),
  hideSelection: () => canvasOverlays.hideSelection(),
  replaceNodeWithComponentInstance: (nodeId, componentSlug) =>
    emit("replaceBlockWithComponent", nodeId, componentSlug),
  resolveGroupName: (groupId) =>
    componentGroups.value.find((group) => group.id === groupId)?.name,
});

const utils = useCanvasUtils(iframeRef);
const {
  getWindow,
  getDoc,
  getBody,
  getHead,
  findNodeLocation,
  findNodeWithParent,
  findNode,
  isTextContent,
} = utils;

const getBlocks = (): BuilderNode[] => [...props.blocks];

useAgentCanvasBuildPresentation({
  iframeRef,
  getBlocks,
  primarySelectedNodeId,
});

function syncSelectionToolbar(_nodeId: string): void {
  // Reordering is handled in the Layers panel; canvas toolbar has no drag handle.
}

const { handleToolbarAction } = useToolbarActions({
  getDoc,
  getBlocks,
  findNode,
  syncSelectionToolbar,
  canvasOverlays,
  conversion,
  emit,
});

async function handleToolbarStyleChange(
  property: string,
  value: string,
  _nodeId: string,
): Promise<void> {
  await saveProperties(
    { [property]: value },
    props.currentItemType,
    props.currentItemSlug,
  );
}

async function handleToolbarPropsChange(
  updates: Record<string, unknown>,
  _nodeId: string,
): Promise<void> {
  await saveProperties(updates, props.currentItemType, props.currentItemSlug);
}

const setCanvasContentSize = inject<
  ((size: { width: number | null; height: number | null }) => void) | null
>("setCanvasContentSize", null);

useStageSignals({
  emit,
  iframeRef,
  getBlocks,
  findNodeWithParent,
  findNodeLocation,
  conversion,
  canvasReorder,
  canvasOverlays,
  syncSelectionToolbar,
  scrollBehavior: SCROLL_BEHAVIOR,
  scrollBlock: SCROLL_BLOCK,
});

const { setupOverlayListeners } = useOverlayListeners({
  iframeRef,
  getDoc,
  isDragging,
  canvasOverlays,
  syncSelectionToolbar,
  emit,
  findNodeLocation,
  findNode,
  getBlocks,
  conversion,
  isTextContent,
  semanticPriority: SEMANTIC_PRIORITY,
});

const { handleAddComponentToSlot, handleClearSlot } = useSlotActions({
  getBlocks,
  getCurrentLayout: () => props.currentLayout,
  emit,
});

const { setupInlineTextEditing } = useStageInlineEditing({
  getDoc,
  getBlocks,
  findNode,
  getCurrentItemType: () => props.currentItemType,
  getCurrentItemSlug: () => props.currentItemSlug,
  safeParse,
  saveProperties,
});

const { clearLiveResponsiveStyleOverrides, syncLiveResponsiveStyleOverrides } =
  useStageLiveCanvasUpdates({
    iframeRef,
    getBlocks,
    getRenderedBlocks: () => renderedBlocksForStyleSync,
    findNode,
    getNodeClassName,
    getStageBreakpoints: resolveStageBreakpoints,
    toCssPropertyName: toStylePropertyName,
    collectResponsiveStyleCSS: (blocks, liveOverrides) =>
      collectResponsiveStyleCSS(
        blocks,
        resolveStageBreakpoints(),
        liveOverrides,
      ),
    canvasOverlays,
    defaultHeadingLevel: DEFAULT_HEADING_LEVEL,
  });

useStageGlobalCanvasEvents({
  iframeRef,
  insertionIndicatorEl,
  emit,
});

const { setupDropListener } = useDropReorder({
  iframeRef,
  getBlocks,
  canvasReorder,
  emit,
});

function resolveStageBreakpoints(): BreakpointDefinition[] {
  return activeBreakpoints.value.length > 0
    ? activeBreakpoints.value
    : createDesktopFirstFallbackBreakpoints();
}

function resolveCanvasMediaOrigin(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.location.origin;
}

function resolveCanvasImageSrc(value: unknown): string {
  return resolveStageMediaSrc(value, { origin: resolveCanvasMediaOrigin() });
}

function toDomString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }

  if (value == null) {
    return fallback;
  }

  return String(value);
}

function toContentDomString(value: unknown, fallback = ""): string {
  return resolveRenderableContentValue(value, fallback);
}

async function loadRenderStyles(): Promise<void> {
  try {
    const result = await actions.styles.getRenderStyles();

    if (result?.error?.message) {
      throw new Error(result.error.message);
    }

    const parsed = StageRenderStylesResultSchema.safeParse(result?.data);
    if (!parsed.success) {
      log("warn", "[StageFrame] Invalid render styles response", {
        issues: parsed.error.issues,
      });
      return;
    }

    if (!parsed.data.success) {
      log("warn", "[StageFrame] Render styles request failed", {
        message: parsed.data.error?.message ?? "Unknown render styles error",
      });
      return;
    }

    renderStyles.value = parsed.data.data;
    loadedStyleRevision.value = parsed.data.data.styleRevision;
  } catch (error) {
    log("warn", "[StageFrame] Failed to load render styles", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function loadComponentGroups(): Promise<void> {
  try {
    const result = await actions.settings.getComponentGrouping();

    if (result?.error?.message) {
      throw new Error(result.error.message);
    }

    const parsed = ComponentGroupingResultSchema.safeParse(result?.data);
    if (!parsed.success) {
      log("warn", "[StageFrame] Invalid component grouping response", {
        issues: parsed.error.issues,
      });
      return;
    }

    if (!parsed.data.success) {
      log("warn", "[StageFrame] Component grouping request failed", {
        message: parsed.data.error?.message ?? "Unknown grouping error",
      });
      return;
    }

    componentGroups.value = [...parsed.data.data.groups].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  } catch (error) {
    log("warn", "[StageFrame] Failed to load component grouping", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function syncBaseCss(head: HTMLHeadElement, css: string): void {
  let baseCssStyleEl = head.querySelector("style[data-aria-base-css]");

  if (!baseCssStyleEl) {
    baseCssStyleEl = head.ownerDocument.createElement("style");
    baseCssStyleEl.setAttribute("data-aria-base-css", "true");
    head.prepend(baseCssStyleEl);
  }

  baseCssStyleEl.textContent = css;
}

function syncGlobalCssLink(
  head: HTMLHeadElement,
  styles: IframeRenderStyles,
): void {
  if (styles.globalCSS?.trim()) {
    head.querySelector('link[data-aria-global-css="true"]')?.remove();
    return;
  }

  const cacheKey =
    styles.globalCSSHash || styles.baseCSSHash || styles.styleRevision;
  const href = cacheKey
    ? `/styles/global.css?preview=1&v=${encodeURIComponent(cacheKey)}`
    : "";
  let globalCssLinkEl = head.querySelector<HTMLLinkElement>(
    'link[data-aria-global-css="true"]',
  );

  if (!href) {
    globalCssLinkEl?.remove();
    return;
  }

  if (!globalCssLinkEl) {
    globalCssLinkEl = head.ownerDocument.createElement("link");
    globalCssLinkEl.rel = "stylesheet";
    globalCssLinkEl.setAttribute("data-aria-global-css", "true");
    head.prepend(globalCssLinkEl);
  }

  if (globalCssLinkEl.href !== href) {
    globalCssLinkEl.href = href;
  }
}

function resolveStageDocumentCss(styles: IframeRenderStyles): string {
  return styles.globalCSS || styles.baseCSS;
}

function syncUtilityCss(head: HTMLHeadElement, css: string): void {
  let utilityCssStyleEl = head.querySelector("style[data-aria-utility-css]");

  if (!utilityCssStyleEl) {
    utilityCssStyleEl = head.ownerDocument.createElement("style");
    utilityCssStyleEl.setAttribute("data-aria-utility-css", "true");
    head.appendChild(utilityCssStyleEl);
  }

  utilityCssStyleEl.textContent = css;
}

function syncMotionCss(head: HTMLHeadElement, enabled: boolean): void {
  let motionCssStyleEl = head.querySelector("style[data-aria-motion-css]");

  if (!enabled) {
    motionCssStyleEl?.remove();
    return;
  }

  if (!motionCssStyleEl) {
    motionCssStyleEl = head.ownerDocument.createElement("style");
    motionCssStyleEl.setAttribute("data-aria-motion-css", "true");
    head.appendChild(motionCssStyleEl);
  }

  motionCssStyleEl.textContent = readAriaMotionCss();
}

function syncThemeVars(head: HTMLHeadElement, css: string): void {
  let themeVarsStyleEl = head.querySelector("style[data-aria-theme-vars]");

  if (!themeVarsStyleEl) {
    themeVarsStyleEl = head.ownerDocument.createElement("style");
    themeVarsStyleEl.setAttribute("data-aria-theme-vars", "true");
  }

  themeVarsStyleEl.textContent = css;

  const firstAuthoredStyle = head.querySelector(
    "link[data-aria-global-css], style[data-aria-base-css], style[data-aria-utility-css]",
  );

  if (
    firstAuthoredStyle &&
    themeVarsStyleEl.nextSibling !== firstAuthoredStyle
  ) {
    head.insertBefore(themeVarsStyleEl, firstAuthoredStyle);
    return;
  }

  if (!themeVarsStyleEl.parentNode) {
    head.appendChild(themeVarsStyleEl);
  }
}

function syncCanvasBodyBackground(win: Window, body: HTMLBodyElement): void {
  if (body.getAttribute(STAGE_BODY_BACKGROUND_FALLBACK_ATTR) === "true") {
    body.style.removeProperty("background");
    body.removeAttribute(STAGE_BODY_BACKGROUND_FALLBACK_ATTR);
  }

  const computedStyle = win.getComputedStyle(body);
  const root = body.ownerDocument.documentElement;
  const rootComputedStyle = root ? win.getComputedStyle(root) : null;
  const authoredCssText = resolveStageDocumentCss(renderStyles.value);
  const resolvedBackground = resolveCanvasBodyBackground({
    computedStyle: {
      backgroundColor: computedStyle.backgroundColor,
      backgroundImage: computedStyle.backgroundImage,
    },
    rootComputedStyle: rootComputedStyle
      ? {
          backgroundColor: rootComputedStyle.backgroundColor,
          backgroundImage: rootComputedStyle.backgroundImage,
        }
      : undefined,
    authoredCssText,
    fallbackValue: CANVAS_BODY_BACKGROUND_FALLBACK,
  });

  if (!resolvedBackground.usedFallback || !resolvedBackground.background) {
    return;
  }

  body.style.background = resolvedBackground.background;
  body.setAttribute(STAGE_BODY_BACKGROUND_FALLBACK_ATTR, "true");
}

function upsertHeadStyle(
  head: HTMLHeadElement,
  attributeName: string,
  css: string,
): void {
  let styleElement = head.querySelector(
    `style[${attributeName}]`,
  ) as HTMLStyleElement | null;

  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.setAttribute(attributeName, "true");
    head.appendChild(styleElement);
  }

  styleElement.textContent = css;
}

function syncResponsiveNodeStyles(
  head: HTMLHeadElement,
  blocks: readonly BuilderNode[],
): void {
  upsertHeadStyle(
    head,
    "data-aria-node-styles",
    collectResponsiveStyleCSS(blocks, resolveStageBreakpoints()),
  );
}

function getNodeClassName(
  node: Pick<BuilderNode, "classNames" | "customClasses" | "motion">,
): string {
  const collected = new Set<string>();

  const add = (value: unknown): void => {
    if (!value) return;
    if (typeof value === "string") {
      value
        .split(/\s+/)
        .filter(Boolean)
        .forEach((c) => collected.add(c));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => add(item));
    }
  };

  add(
    classNamesToString(
      node.classNames ?? createEmptyClassNames(),
      resolveStageBreakpoints(),
    ),
  );
  add(node.customClasses ?? []);
  add(compileMotionClassString(node.motion));
  add(compileParallaxClassString(node.motion?.parallax));

  return Array.from(collected).join(" ");
}

watch(
  () => viewport.value,
  () => {
    clearLiveResponsiveStyleOverrides();
    const doc = iframeRef.value?.contentDocument;
    if (doc?.head) {
      syncLiveResponsiveStyleOverrides(doc.head);
    }

    // When viewport changes, recalculate the selection overlay position
    // This ensures the selection box follows the element as the canvas scales
    if (canvasOverlays.selection.visible) {
      canvasOverlays.schedulePositionUpdate("measure");
    }
  },
);

/**
 * Updates display option styles (outlines, wireframe) in the iframe
 * without re-rendering the entire frame. Called when display toggles change.
 */
function syncDisplayModeState(doc: Document): void {
  const html = doc.documentElement;
  if (props.wireframeMode) {
    html.setAttribute("data-aria-wireframe", "true");
  } else {
    html.removeAttribute("data-aria-wireframe");
  }

  const head = doc.head;
  if (!head) return;

  let wireframeStyleEl = head.querySelector(
    "style[data-aria-wireframe]",
  ) as HTMLStyleElement | null;
  if (!wireframeStyleEl) {
    wireframeStyleEl = doc.createElement("style");
    wireframeStyleEl.setAttribute("data-aria-wireframe", "true");
    head.appendChild(wireframeStyleEl);
  }

  wireframeStyleEl.textContent = props.wireframeMode ? wireframeStyles : "";
}

function updateDisplayStyles(): void {
  if (!isCanvasReady.value || !iframeRef.value?.contentDocument) return;

  const doc = iframeRef.value.contentDocument;
  syncDisplayModeState(doc);

  const head = doc.head;
  if (!head) return;

  let styleEl = head.querySelector(
    "style[data-aria-display]",
  ) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.setAttribute("data-aria-display", "true");
    head.appendChild(styleEl);
  }

  let styles = "";

  if (props.showOutlines) {
    const outlineColor = resolveAdminPrimaryColor();
    styles += `
      [data-aria-id] {
        outline: 1.5px dashed color-mix(in srgb, ${outlineColor} 50%, transparent) !important;
        outline-offset: -1px !important;
      }
    `;
  }

  styleEl.textContent = styles;
  log("debug", "[StageFrame] Display styles updated", {
    showOutlines: props.showOutlines,
    wireframeMode: props.wireframeMode,
  });
}

// Watch for display option changes and update styles dynamically
watch(
  () => [props.showOutlines, props.wireframeMode],
  () => {
    updateDisplayStyles();
  },
);

watch(
  () => siteSettings.value?.unocssConfig,
  (newConfig) => {
    if (!iframeRef.value?.contentWindow || !isCanvasReady.value) return;

    try {
      const win = iframeRef.value.contentWindow as UnoRuntimeWindow;
      if (win.__unocss) {
        const updatedConfig = newConfig as Partial<UnoRuntimeConfig> | null;
        const currentConfig = win.__unocss ?? { theme: { colors: {} } };
        const mergedTheme = {
          ...currentConfig.theme,
          ...(updatedConfig?.theme ?? {}),
          colors:
            updatedConfig?.theme?.colors ?? currentConfig.theme.colors ?? {},
        };

        win.__unocss = {
          ...currentConfig,
          ...(updatedConfig ?? {}),
          theme: mergedTheme,
        };

        if (win.__unocss_runtime?.update) {
          win.__unocss_runtime.update();
        }

        log("debug", "[StageFrame] UnoCSS config updated", {
          config: newConfig ?? null,
        });
      }
    } catch (error) {
      log("error", "[StageFrame] Failed to update UnoCSS config", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
  { deep: true },
);

/**
 * Renders the entire block tree to the iframe DOM.
 * Clears existing content, injects styles, and recursively creates elements.
 */
const renderFrame = (): void => {
  const body = getBody();
  const head = getHead();

  // DOM should always be ready now due to gating in handleIframeLoad
  if (!body || !head) {
    log("error", "[renderFrame] No body/head despite isCanvasReady=true", {
      iframeRef: Boolean(iframeRef.value),
      contentDocument: Boolean(iframeRef.value?.contentDocument),
    });
    return;
  }

  renderFrameInternal(body, head);
};

const renderFrameInternalWithBlocks = (
  body: HTMLBodyElement,
  head: HTMLHeadElement,
  blocksToRender: readonly BuilderNode[],
): void => {
  const startTotal = performance.now();
  // Live style updates must use the same expanded tree as the DOM. Component
  // instances intentionally have no styles of their own; their styles live on
  // the expanded component nodes.
  renderedBlocksForStyleSync = blocksToRender;

  const startClear = performance.now();
  let contentRoot = body.querySelector<HTMLElement>(
    `[${STAGE_CONTENT_ROOT_ATTR}]`,
  );
  if (!contentRoot) {
    contentRoot = body.ownerDocument.createElement("div");
    contentRoot.setAttribute(STAGE_CONTENT_ROOT_ATTR, "true");
    body.prepend(contentRoot);
  }
  contentRoot.innerHTML = "";
  const clearTime = performance.now() - startClear;

  const renderRoot: HTMLElement = contentRoot;

  // Inject styles (outlines / wireframe + slot chrome)
  const startStyles = performance.now();
  let styleEl = head.querySelector("style[data-aria]");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.setAttribute("data-aria", "true");
    head.appendChild(styleEl);
  }

  // Inject Theme Styles for shadcn components
  let themeStyleEl = head.querySelector("style[data-aria-theme]");
  if (!themeStyleEl) {
    themeStyleEl = document.createElement("style");
    themeStyleEl.setAttribute("data-aria-theme", "true");
    themeStyleEl.textContent = THEME_STYLES;
    head.appendChild(themeStyleEl);
  }

  let customClassesStyleEl = head.querySelector(
    "style[data-aria-custom-classes]",
  );
  if (!customClassesStyleEl) {
    customClassesStyleEl = document.createElement("style");
    customClassesStyleEl.setAttribute("data-aria-custom-classes", "true");
    head.appendChild(customClassesStyleEl);
  }
  customClassesStyleEl.textContent = generatedCSS.value;

  // Keep base CSS in sync during every render pass so global styles are
  // applied even when renderStyles resolves before isCanvasReady flips true.
  syncThemeVars(head, cssVariables.value);
  syncGlobalCssLink(head, renderStyles.value);
  syncBaseCss(head, resolveStageDocumentCss(renderStyles.value));
  syncUtilityCss(head, renderStyles.value.utilityCSS);
  syncMotionCss(head, nodeTreeRequiresMotionStyles(blocksToRender));

  syncResponsiveNodeStyles(head, blocksToRender);
  clearLiveResponsiveStyleOverrides();
  syncLiveResponsiveStyleOverrides(head);

  // Inject Custom Fonts CSS (@font-face rules)
  let customFontsStyleEl = head.querySelector("style[data-aria-custom-fonts]");
  if (!customFontsStyleEl) {
    customFontsStyleEl = document.createElement("style");
    customFontsStyleEl.setAttribute("data-aria-custom-fonts", "true");
    head.appendChild(customFontsStyleEl);
  }
  customFontsStyleEl.textContent = customFontsCSS.value;
  syncDisplayModeState(head.ownerDocument);

  let styles = getStageDropFeedbackCss();

  if (props.showOutlines) {
    styles += `
      [data-aria-id] {
        outline: 2px solid rgba(59, 130, 246, 0.5);
        outline-offset: -1px;
      }
    `;
  }
  (styleEl as HTMLStyleElement).textContent = styles;

  ensureSlotStyles(head);

  const stylesTime = performance.now() - startStyles;

  // Render blocks (already expanded), sorted by slot order
  const startRender = performance.now();

  const sortedBlocks = sortRootBlocksByLayoutSlot(
    blocksToRender,
    props.currentLayout,
  );

  sortedBlocks.forEach((block) => {
    const el = createElementFromBlock(block);
    renderRoot.appendChild(el);
  });

  const renderTime = performance.now() - startRender;

  // Ensure CSS recalculation after DOM updates
  const iframeWindow =
    (iframeRef.value?.contentWindow as UnoRuntimeWindow | null) ?? null;
  if (iframeWindow) {
    // Give browser time to process style changes
    iframeWindow.requestAnimationFrame(() => {
      if (getSiteSettingsUtilityEngine(siteSettings.value) === "unocss") {
        scheduleUnoExtract("render-frame");
      }

      syncCanvasBodyBackground(iframeWindow, body);

      // Force a style recalculation by reading offsetHeight
      body.offsetHeight;

      // Recalculate overlay positions after layout-affecting DOM updates.
      canvasOverlays.schedulePositionUpdate("measure");
      syncExternalSelectionOverlays({ force: true });
    });
  }

  const totalTime = performance.now() - startTotal;
  log("debug", "[StageFrame] renderFrame breakdown", {
    clearTimeMs: Number(clearTime.toFixed(1)),
    stylesTimeMs: Number(stylesTime.toFixed(1)),
    renderTimeMs: Number(renderTime.toFixed(1)),
    totalTimeMs: Number(totalTime.toFixed(1)),
    blockCount: blocksToRender.length,
  });

  if (setCanvasContentSize) {
    requestAnimationFrame(() => {
      const doc = iframeRef.value?.contentDocument;
      const docElement = doc?.documentElement;
      const docBody = doc?.body;

      if (!docElement || !docBody) return;

      const width = Math.max(
        docElement.scrollWidth,
        docElement.clientWidth,
        docBody.scrollWidth,
        docBody.clientWidth,
      );
      const height = Math.max(
        docElement.scrollHeight,
        docElement.clientHeight,
        docBody.scrollHeight,
        docBody.clientHeight,
      );

      setCanvasContentSize({
        width: width || null,
        height: height || null,
      });
    });
  }
};

const renderFrameInternal = (
  body: HTMLBodyElement,
  head: HTMLHeadElement,
): void => {
  // Use the props.blocks (original unexpanded) for rendering
  renderFrameInternalWithBlocks(body, head, props.blocks);
};

async function renderExpandedBlocksIfCurrent(
  blocks: readonly BuilderNode[],
  reason: string,
): Promise<boolean> {
  const snapshot = stageRenderFreshness.begin(cmsRenderKey.value);
  const expandStart = performance.now();
  const expandedBlocks = await expandBlocksForCanvas(blocks);
  const expandTime = performance.now() - expandStart;

  log("debug", "[StageFrame] component expansion complete", {
    instanceId: stageFrameInstanceId,
    reason,
    expandTimeMs: Number(expandTime.toFixed(1)),
  });

  if (
    !stageRenderFreshness.isCurrent(snapshot, {
      cmsRenderKey: cmsRenderKey.value,
      isCanvasReady: isCanvasReady.value,
      isUnmounted,
    })
  ) {
    log("debug", "[StageFrame] skipped stale expanded render", {
      instanceId: stageFrameInstanceId,
      reason,
      snapshotGeneration: snapshot.generation,
    });
    return false;
  }

  const body = getBody();
  const head = getHead();
  if (!body || !head) {
    log("error", `[${reason}] No body/head despite isCanvasReady=true`);
    return false;
  }

  renderFrameInternalWithBlocks(body, head, expandedBlocks);
  hasRenderedOnce.value = true;
  refreshMotionPreview();
  return true;
}

const TEXT_LINK_OUTER_PROP_NAMES = [
  "href",
  "target",
  "rel",
  "title",
  "download",
] as const;

function shouldStripOuterLinkWrapperProps(block: BuilderNode): boolean {
  const normalizedType = normalizeContainerNodeType(
    block.type ?? "",
  ).toLowerCase();

  return (
    isTextLinkWrapperNodeType(block.type ?? "") ||
    normalizedType === "image" ||
    shouldStripContainerLinkWrapperProps(block)
  );
}

function stripTextLinkWrapperProps(
  block: BuilderNode,
): Record<string, unknown> {
  const nextProps = stripConsumedRenderPropsForNode(block, block.props ?? {});

  if (!shouldStripOuterLinkWrapperProps(block)) {
    return nextProps;
  }

  for (const propName of TEXT_LINK_OUTER_PROP_NAMES) {
    delete nextProps[propName];
  }

  return nextProps;
}

function getTextLinkHref(props: BuilderNode["props"] | undefined): string {
  const href = props?.href;
  return typeof href === "string" ? toDomString(href, "").trim() : "";
}

function buildTextLinkAnchor(
  props: BuilderNode["props"] | undefined,
): HTMLAnchorElement | null {
  const href = getTextLinkHref(props);
  if (!href) {
    return null;
  }

  const anchor = document.createElement("a");
  anchor.href = href;

  if (typeof props?.target === "string" && props.target.trim().length > 0) {
    anchor.target = props.target.trim();
  }

  if (typeof props?.rel === "string" && props.rel.trim().length > 0) {
    anchor.rel = props.rel.trim();
  }

  if (typeof props?.title === "string" && props.title.trim().length > 0) {
    anchor.title = props.title.trim();
  }

  if (props?.download === true) {
    anchor.setAttribute("download", "");
  }

  return anchor;
}

/**
 * Creates a DOM element from a BuilderNode.
 * Recursively builds the element tree with props, children, and data attributes.
 *
 * @param block - The BuilderNode to convert to DOM
 * @returns HTMLElement representing the block
 */
const createElementFromBlock = (
  block: BuilderNode,
  renderContext: RenderableNodeTagContext = {},
): HTMLElement => {
  const normalizedType = normalizeContainerNodeType(
    block.type ?? "",
  ).toLowerCase();
  const rootTag = resolveStageBlockRootTag(block, renderContext);
  const isSvgTag = rootTag === "svg";
  const el = isSvgTag
    ? document.createElementNS("http://www.w3.org/2000/svg", "svg")
    : document.createElement(rootTag);
  el.setAttribute("data-aria-id", block.id);
  const templateNodeId = resolveCmsTemplateNodeId(block.id);
  if (templateNodeId !== block.id) {
    el.setAttribute("data-aria-template-id", templateNodeId);
  }
  el.setAttribute("data-aria-type", block.type);
  el.setAttribute("data-drop-zone", "true");
  el.setAttribute("data-zone-id", block.id);

  // Debug: log Container nodes with data-component-ref props
  if (block.type === "Container" && block.props?.["data-component-ref"]) {
    log("debug", "[StageFrame] Creating component wrapper container", {
      id: block.id,
      componentRefId: block.props["data-component-ref"],
    });
  }

  // Mark component instances with special attribute for locked selection
  if (block.type?.toLowerCase() === "component" && block.reference?.masterId) {
    el.setAttribute("data-component-ref", block.reference.masterId);
    // Ensure component wrappers render as block elements for proper bounding box
    el.style.display = "block";
    el.style.width = "100%";
    el.style.minHeight = "10px"; // Ensure at least some height if empty content
  }

  if (props.showOutlines) {
    log("debug", "[StageFrame] Created droppable element", {
      blockId: block.id,
    });
  }

  // Apply outline class if enabled
  if (props.showOutlines) {
    el.classList.add("aria-outline");
  }

  // Apply wireframe class if enabled
  if (props.wireframeMode) {
    el.classList.add("aria-wireframe");
  }

  const attributeProps = normalizeCanvasAttributeProps(
    block,
    stripTextLinkWrapperProps(block),
  );
  Object.entries(attributeProps).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    if (typeof value === "boolean") {
      if (value) {
        el.setAttribute(key, "");
      }
      return;
    }

    if (key === "data-component-ref") {
      // This is a component wrapper - set the attribute and styling
      el.setAttribute("data-component-ref", String(value));
      el.style.display = "block";
      el.style.width = "100%";
    } else {
      el.setAttribute(key, String(value));
    }
  });

  const buttonVariant = resolveRenderedButtonVariant(block, block.props ?? {});
  if (buttonVariant) {
    el.setAttribute(BUTTON_VARIANT_ATTRIBUTE, buttonVariant);
  }

  if (block.a11y) {
    const attributeMap = {
      role: "role",
      ariaLabel: "aria-label",
      ariaDescribedBy: "aria-describedby",
      ariaLabelledBy: "aria-labelledby",
      ariaHidden: "aria-hidden",
      ariaExpanded: "aria-expanded",
      ariaControls: "aria-controls",
      tabIndex: "tabindex",
    } as const;

    for (const [key, attributeName] of Object.entries(attributeMap)) {
      const value = block.a11y[key as keyof NonNullable<BuilderNode["a11y"]>];
      if (value === undefined || value === null || value === "") {
        continue;
      }

      el.setAttribute(attributeName, String(value));
    }
  }

  const motionAttrs = compileMotionDataAttributes(block.motion);
  for (const [key, value] of Object.entries(motionAttrs)) {
    el.setAttribute(key, value);
  }

  const parallaxAttrs = compileParallaxDataAttributes(block.motion?.parallax);
  for (const [key, value] of Object.entries(parallaxAttrs)) {
    el.setAttribute(key, value);
  }

  const allClasses = getNodeClassName(block);

  // Debug logging - log every block to see what data we have
  log("debug", "[StageFrame] Block data", {
    blockId: block.id,
    blockType: block.type,
    hasClassNames: !!block.classNames,
    classNames: block.classNames,
    hasCustomClasses: !!block.customClasses,
    allClasses,
  });

  if (allClasses.length > 0) {
    if (isSvgTag) {
      el.setAttribute("class", allClasses.trim());
    } else {
      el.className += ` ${allClasses}`;
    }
  }

  // Render content based on type
  const content = renderBlockContent(block);
  if (content instanceof HTMLElement) {
    if (content.tagName.toLowerCase() === el.tagName.toLowerCase()) {
      for (const { name, value } of Array.from(content.attributes)) {
        el.setAttribute(name, value);
      }

      while (content.firstChild) {
        el.appendChild(content.firstChild);
      }

      if (!el.textContent && content.textContent) {
        el.textContent = content.textContent;
      }
    } else {
      el.appendChild(content);
    }

    if ((block.type ?? "").toLowerCase() === "image") {
      const imageElement = getContentStyleTargetElement(el, block.type ?? "");
      if (imageElement instanceof HTMLImageElement) {
        syncImageEmptyStateAttribute(
          imageElement,
          resolveCanvasImageSrc(block.props?.src),
        );
        applyImagePresentationToElement(imageElement, {
          objectFit: resolveImageObjectFit(block),
          objectPosition: resolveImageObjectPosition(block),
        });
      }
    }
  } else if (typeof content === "string") {
    el.textContent = content;
  }

  // Node styles are applied via syncResponsiveNodeStyles (CSS only) so that
  // @media breakpoint overrides are not blocked by inline base styles.

  if (shouldWrapContainerChildrenInLink(block)) {
    const containerLinkAnchor = buildTextLinkAnchor(block.props);
    if (containerLinkAnchor) {
      if (block.children && Array.isArray(block.children)) {
        block.children.forEach((child) => {
          containerLinkAnchor.appendChild(
            createElementFromBlock(stripLinkPropsForContainerWrapper(child), {
              insideContainerLinkWrapper: true,
            }),
          );
        });
      }
      el.appendChild(containerLinkAnchor);
    }
  } else if (block.children && Array.isArray(block.children)) {
    const listItemLinkScope = resolveListItemLinkScope(block);
    const linkedTextChildIndex =
      listItemLinkScope === "text" ? findListItemTextLinkChildIndex(block) : -1;
    const shouldWrapWholeRow =
      listItemLinkScope === "row" ||
      (listItemLinkScope === "text" && linkedTextChildIndex === -1);
    const listItemLinkAnchor = listItemLinkScope
      ? buildTextLinkAnchor(block.props)
      : null;

    if (listItemLinkAnchor && shouldWrapWholeRow) {
      block.children.forEach((child) => {
        listItemLinkAnchor.appendChild(
          createElementFromBlock(
            stripTextLinkWrapperPropsFromNode(child),
            renderContext,
          ),
        );
      });

      el.appendChild(listItemLinkAnchor);
    } else if (listItemLinkAnchor && listItemLinkScope === "text") {
      block.children.forEach((child, index) => {
        const nextChild =
          index === linkedTextChildIndex
            ? stripTextLinkWrapperPropsFromNode(child)
            : child;
        const childElement = createElementFromBlock(nextChild, renderContext);

        if (index === linkedTextChildIndex) {
          listItemLinkAnchor.appendChild(childElement);
          el.appendChild(listItemLinkAnchor);
          return;
        }

        el.appendChild(childElement);
      });
    } else {
      block.children.forEach((child) => {
        el.appendChild(createElementFromBlock(child, renderContext));
      });
    }
  }

  // Add placeholder height for empty containers/divs
  const isContainer = isStructuralContainerNodeType(block.type || "");
  const isEmpty = !block.children || block.children.length === 0;

  if (isContainer && isEmpty) {
    el.style.minHeight = "1rem";
    el.style.border = "1px dashed rgba(148, 163, 184, 0.3)";

    // Give components a slightly different look to distinguish them
    if (block.type?.toLowerCase() === "component") {
      el.style.backgroundColor =
        "color-mix(in srgb, hsl(var(--primary)) 6%, transparent)";
      el.style.borderColor =
        "color-mix(in srgb, hsl(var(--primary)) 28%, transparent)";
      el.setAttribute("title", "Empty Component");
    }
  }

  return el;
};

/**
 * Renders block-specific content based on type.
 * Creates semantic HTML elements for headings, text, buttons, images, etc.
 *
 * @param block - The BuilderNode containing type and props
 * @returns HTMLElement for complex content, string for text, or null for containers
 */
const renderBlockContent = (
  block: BuilderNode,
): HTMLElement | string | null => {
  const type = block.type;
  const blockProps = block.props ?? {};
  const normalizedType = normalizeContainerNodeType(type ?? "").toLowerCase();

  const appendButtonContent = (container: HTMLElement): void => {
    const label = toDomString(blockProps.label ?? blockProps.text, "Button");
    const hasIcon =
      (typeof blockProps.icon === "string" &&
        blockProps.icon.trim().length > 0) ||
      (typeof blockProps.icon === "object" && blockProps.icon !== null);

    if (!hasIcon) {
      container.textContent = label;
      return;
    }

    const contentRow = document.createElement("span");
    contentRow.style.cssText = buildButtonContentRowStyle(blockProps);

    const labelEl = document.createElement("span");
    labelEl.textContent = label;

    const iconHost = document.createElement("span");
    iconHost.setAttribute("aria-hidden", "true");
    iconHost.style.cssText = buildButtonIconStyle(blockProps);
    const iconHostClassName = getButtonIconHostClassName(blockProps);
    if (iconHostClassName) {
      iconHost.className = iconHostClassName;
    }

    const iconPosition = getButtonIconPosition(blockProps.iconPosition);

    void hydrateIconHost({
      host: iconHost,
      iconValue: blockProps.icon,
      classNameValue: "",
      ariaLabelValue: "",
      fallbackText: "",
    }).finally(() => {
      iconHost.setAttribute("aria-hidden", "true");
      iconHost.removeAttribute("role");
      iconHost.removeAttribute("aria-label");
    });

    if (iconPosition === "right") {
      contentRow.appendChild(labelEl);
      contentRow.appendChild(iconHost);
      container.appendChild(contentRow);
      return;
    }

    contentRow.appendChild(iconHost);
    contentRow.appendChild(labelEl);
    container.appendChild(contentRow);
  };

  switch (normalizedType) {
    case "heading": {
      if (shouldDeferTypographyBlockContent(block)) {
        return null;
      }

      const tagName =
        getNativeTagForRenderableNode(block, blockProps) ??
        `h${blockProps.level || DEFAULT_HEADING_LEVEL}`;
      const h = document.createElement(tagName);
      const htmlContent = toContentDomString(
        blockProps.content ?? blockProps.text,
        "",
      );
      const linkAnchor = buildTextLinkAnchor(blockProps);

      if (linkAnchor) {
        linkAnchor.innerHTML = htmlContent;
        h.appendChild(linkAnchor);
      } else {
        h.innerHTML = htmlContent;
      }

      return h;
    }
    case "text":
    case "span":
    case "paragraph": {
      if (shouldDeferTypographyBlockContent(block)) {
        return null;
      }

      const tagName =
        getNativeTagForRenderableNode(block, blockProps) ??
        (normalizedType === "span" ? "span" : "p");
      const p = document.createElement(tagName);
      const htmlContent = toContentDomString(
        blockProps.content ?? blockProps.text,
        "",
      );
      const linkAnchor = buildTextLinkAnchor(blockProps);
      const looksLikeDocumentMarkup =
        htmlContent.length > 100 &&
        /<!DOCTYPE|<html\b|<section[\s>]/i.test(htmlContent);

      if (linkAnchor) {
        if (looksLikeDocumentMarkup) {
          linkAnchor.textContent = htmlContent;
        } else {
          linkAnchor.innerHTML = htmlContent;
        }
        p.appendChild(linkAnchor);
      } else if (looksLikeDocumentMarkup) {
        p.textContent = htmlContent;
      } else {
        p.innerHTML = htmlContent;
      }

      return p;
    }
    case "button": {
      const linkAnchor = buildTextLinkAnchor(blockProps);
      if (linkAnchor) {
        appendButtonContent(linkAnchor);
        return linkAnchor;
      }

      const btn = document.createElement("button");
      appendButtonContent(btn);
      return btn;
    }
    case "image": {
      const img = document.createElement("img");
      const src = resolveCanvasImageSrc(blockProps.src);
      img.src = src;
      img.alt = toDomString(blockProps.alt, "");
      syncImageEmptyStateAttribute(img, src);
      applyImagePresentationToElement(img, {
        objectFit: resolveImageObjectFit(block),
        objectPosition: resolveImageObjectPosition(block),
      });
      attachBrokenMediaFallback(img);
      const linkAnchor = buildTextLinkAnchor(blockProps);

      if (linkAnchor) {
        linkAnchor.appendChild(img);
        return linkAnchor;
      }

      return img;
    }
    case "video": {
      const video = document.createElement("video");
      video.src = toDomString(blockProps.src, "");
      video.poster = toDomString(blockProps.poster, "");
      if (blockProps.alt)
        video.setAttribute("alt", toDomString(blockProps.alt, ""));
      if (blockProps.autoplay) video.setAttribute("autoplay", "");
      if (blockProps.loop) video.setAttribute("loop", "");
      if (blockProps.muted) video.setAttribute("muted", "");
      if (blockProps.controls !== false) video.setAttribute("controls", "");
      if (blockProps.playsinline) video.setAttribute("playsinline", "");
      video.setAttribute(
        "preload",
        toDomString(blockProps.preload, "metadata"),
      );

      // Default block display and full width for consistent sizing
      video.style.display = "block";
      video.style.width = "100%";

      // Apply aspect-ratio if specified in props
      const aspectRatio = toDomString(blockProps.aspectRatio, "");
      if (aspectRatio) {
        video.style.aspectRatio = aspectRatio.replace(":", "/");
      }

      // Apply object-fit and object-position styles if present in props
      const objectFit = toDomString(blockProps.objectFit, "");
      const objectPosition = toDomString(blockProps.objectPosition, "");
      if (objectFit) {
        video.style.objectFit = objectFit;
      }
      if (objectPosition) {
        video.style.objectPosition = objectPosition;
      }

      attachBrokenMediaFallback(video);

      const linkAnchor = buildTextLinkAnchor(blockProps);
      if (linkAnchor) {
        linkAnchor.appendChild(video);
        return linkAnchor;
      }

      return video;
    }
    case "link": {
      if (shouldDeferLinkBlockContent(block)) {
        return null;
      }

      const a = document.createElement("a");
      a.href = toDomString(blockProps.href, "#");
      const linkContent = toContentDomString(
        blockProps.text ?? blockProps.content ?? blockProps.label,
        "",
      );
      a.innerHTML = linkContent;
      return a;
    }
    case "list": {
      if (block.children && block.children.length > 0) {
        return null;
      }

      const list = document.createElement(
        getNativeTagForRenderableNode(block, blockProps) === "ol" ? "ol" : "ul",
      );

      if (blockProps.items && Array.isArray(blockProps.items)) {
        blockProps.items.forEach((item) => {
          const li = document.createElement("li");
          li.textContent = toDomString(item, "");
          list.appendChild(li);
        });
      }

      return list;
    }
    case "listitem": {
      if (block.children && block.children.length > 0) {
        return null;
      }

      const li = document.createElement("li");
      const itemContent = toContentDomString(
        blockProps.content ?? blockProps.text ?? blockProps.label,
        "",
      );
      const linkAnchor = buildTextLinkAnchor(blockProps);

      if (itemContent.length > 0) {
        if (linkAnchor) {
          linkAnchor.innerHTML = itemContent;
          li.appendChild(linkAnchor);
        } else {
          li.innerHTML = itemContent;
        }
      }

      return li;
    }
    case "code": {
      const rawCode = toDomString(
        blockProps.content ?? blockProps.code ?? blockProps.text,
        "",
      );
      if (getCodeBlockRenderMode(blockProps.renderMode) === "render") {
        const wrapper = document.createElement("div");
        const template = document.createElement("template");
        template.innerHTML = buildRenderedCodeMarkup(rawCode);

        const fragment = template.content.cloneNode(true) as DocumentFragment;
        for (const staleScript of Array.from(
          fragment.querySelectorAll("script"),
        )) {
          const liveScript = document.createElement("script");

          for (const { name, value } of Array.from(staleScript.attributes)) {
            liveScript.setAttribute(name, value);
          }

          liveScript.textContent = staleScript.textContent;
          staleScript.replaceWith(liveScript);
        }

        wrapper.appendChild(fragment);
        return wrapper;
      }

      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = rawCode;
      const resolvedLanguage =
        typeof blockProps.language === "string" && blockProps.language.trim()
          ? blockProps.language.trim()
          : inferCodeLanguage(rawCode);
      if (resolvedLanguage) {
        code.setAttribute("data-language", resolvedLanguage);
      }
      pre.appendChild(code);
      return pre;
    }
    case "svg": {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

      const assignAttr = (name: string, value: unknown): void => {
        if (value === undefined || value === null) return;
        svg.setAttribute(name, String(value));
      };

      assignAttr("viewBox", blockProps.viewBox || "0 0 24 24");
      assignAttr("width", blockProps.width || "24");
      assignAttr("height", blockProps.height || "24");
      assignAttr("fill", blockProps.fill || "none");
      assignAttr("stroke", blockProps.stroke || "currentColor");
      assignAttr("stroke-width", blockProps["stroke-width"] || "1.5");
      assignAttr("stroke-linecap", blockProps["stroke-linecap"] || "round");
      assignAttr("stroke-linejoin", blockProps["stroke-linejoin"] || "round");

      const rawContent = blockProps.content;
      if (typeof rawContent === "string" && rawContent.trim().length > 0) {
        svg.innerHTML = rawContent;
      }

      return svg as unknown as HTMLElement;
    }
    case "icon": {
      const iconHost = document.createElement("span");
      void hydrateIconHost({
        host: iconHost,
        iconValue: blockProps.icon,
        classNameValue: blockProps.className,
        ariaLabelValue: blockProps.ariaLabel,
        fallbackText: blockProps.content,
      });

      return iconHost as unknown as HTMLElement;
    }
    case "pagination": {
      const nav = document.createElement("nav");
      nav.setAttribute("aria-label", "Pagination");
      nav.className = "aria-pagination-wireframe";
      nav.textContent = "‹ 1 2 3 ›";
      if (!block.dataSource?.targetNodeId) {
        nav.setAttribute("data-cms-warning", "Connect to a list");
      }
      return nav;
    }
    case "container":
    case "section":
    default:
      return null; // Let container rendering handle it
  }
};

/**
 * Iframe load event. Initializes the canvas, sets
 * up event listeners, and performs initial render.
 */
const handleIframeLoad = async (): Promise<void> => {
  traceStartup("stage-frame:iframe-load:start", {
    instanceId: stageFrameInstanceId,
    hasRenderedOnce: hasRenderedOnce.value,
    blocksCount: props.blocks?.length ?? 0,
    currentItemType: props.currentItemType,
    currentItemSlug: props.currentItemSlug,
  });

  // Stop if component was unmounted (prevents infinite loop during HMR)
  if (isUnmounted) {
    traceStartup("stage-frame:iframe-load:aborted-unmounted", {
      instanceId: stageFrameInstanceId,
    });
    return;
  }

  const loadStart = performance.now();

  // Don't mark as ready until DOM is actually available
  const body = getBody();
  const head = getHead();

  if (!body || !head) {
    // Only retry if still mounted
    if (!isUnmounted) {
      traceStartup("stage-frame:iframe-load:retry-dom-not-ready", {
        instanceId: stageFrameInstanceId,
      });
      log(
        "debug",
        "[StageFrame] handleIframeLoad retrying until DOM is ready",
        {
          instanceId: stageFrameInstanceId,
        },
      );
      setTimeout(() => handleIframeLoad(), 10);
    }
    return;
  }

  isCanvasReady.value = true;
  traceStartup("stage-frame:iframe-load:dom-ready", {
    instanceId: stageFrameInstanceId,
    blocksCount: props.blocks?.length ?? 0,
    hasRenderedOnce: hasRenderedOnce.value,
  });

  log("debug", "[StageFrame] handleIframeLoad DOM ready", {
    instanceId: stageFrameInstanceId,
    isCanvasReady: isCanvasReady.value,
    blocksCount: props.blocks?.length ?? 0,
    hasRenderedOnce: hasRenderedOnce.value,
  });

  // Render blocks directly. If blocks have component refs, expand them
  // first so we only render once with the full expanded tree.
  // Skip if we already rendered (e.g. spurious second onload on same instance).
  if (!hasRenderedOnce.value) {
    if (props.blocks && props.blocks.length > 0) {
      // Blocks already loaded — expand and render in one pass (no double render)
      const renderStart = performance.now();
      await renderExpandedBlocksIfCurrent(
        props.blocks,
        "stage-frame:initial-render",
      );
      traceStartup("stage-frame:initial-render:expanded-blocks", {
        instanceId: stageFrameInstanceId,
        blocksCount: props.blocks.length,
      });
      const renderTime = performance.now() - renderStart;
      log("debug", "[StageFrame] handleIframeLoad expanded render complete", {
        instanceId: stageFrameInstanceId,
        renderTimeMs: Number(renderTime.toFixed(1)),
      });
      updateDisplayStyles();
    } else {
      // No blocks yet — render blank canvas, watcher handles future blocks
      const renderStart = performance.now();
      renderFrame();
      const renderTime = performance.now() - renderStart;
      log("debug", "[StageFrame] blank render complete", {
        instanceId: stageFrameInstanceId,
        renderTimeMs: Number(renderTime.toFixed(1)),
      });
      hasRenderedOnce.value = true;
      traceStartup("stage-frame:initial-render:blank", {
        instanceId: stageFrameInstanceId,
      });
      updateDisplayStyles();
    }
  } else {
    traceStartup("stage-frame:iframe-load:skip-rerender", {
      instanceId: stageFrameInstanceId,
    });
    log("debug", "[StageFrame] handleIframeLoad skipped rerender", {
      instanceId: stageFrameInstanceId,
    });
  }

  const setupStart = performance.now();
  setupOverlayListeners();
  setupInlineTextEditing();
  const setupTime = performance.now() - setupStart;
  log("debug", "[StageFrame] overlay listeners initialized", {
    instanceId: stageFrameInstanceId,
    setupTimeMs: Number(setupTime.toFixed(1)),
  });

  // Setup drop listener for block reordering
  setupDropListener();

  // Log with requestAnimationFrame to see when next frame is ready
  requestAnimationFrame(() => {
    const rafTime = performance.now() - loadStart;
    log("debug", "[StageFrame] next paint ready after iframe load", {
      instanceId: stageFrameInstanceId,
      totalTimeMs: Number(rafTime.toFixed(1)),
    });
  });

  if (setCanvasContentSize) {
    requestAnimationFrame(() => {
      const doc = iframeRef.value?.contentDocument;
      const docElement = doc?.documentElement;
      const docBody = doc?.body;

      if (!docElement || !docBody) return;

      const width = Math.max(
        docElement.scrollWidth,
        docElement.clientWidth,
        docBody.scrollWidth,
        docBody.clientWidth,
      );
      const height = Math.max(
        docElement.scrollHeight,
        docElement.clientHeight,
        docBody.scrollHeight,
        docBody.clientHeight,
      );

      setCanvasContentSize({
        width: width || null,
        height: height || null,
      });
    });
  }

  void revealCanvasWhenStylesReady();
  refreshMotionPreview();
  traceStartup("stage-frame:iframe-load:end", {
    instanceId: stageFrameInstanceId,
    totalTimeMs: Number((performance.now() - loadStart).toFixed(1)),
  });

  const totalTime = performance.now() - loadStart;
  log("debug", "[StageFrame] handleIframeLoad complete", {
    instanceId: stageFrameInstanceId,
    totalTimeMs: Number(totalTime.toFixed(1)),
  });
};

const waitForStylesheetLoad = (
  link: HTMLLinkElement,
  timeoutMs = 2000,
): Promise<void> => {
  try {
    if (link.sheet) {
      return Promise.resolve();
    }
  } catch {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      link.removeEventListener("load", handleLoad);
      link.removeEventListener("error", handleLoad);
    };
    const handleLoad = () => {
      cleanup();
      resolve();
    };
    link.addEventListener("load", handleLoad, { once: true });
    link.addEventListener("error", handleLoad, { once: true });
  });
};

const waitForUnoReady = async (
  win: UnoRuntimeWindow,
  maxWaitMs = 3000,
): Promise<void> => {
  const start = performance.now();

  while (performance.now() - start < maxWaitMs) {
    if (win.__unocss_runtime?.uno || win.__unocss_runtime?.update) {
      try {
        if (win.__unocss_runtime?.uno?.extractAll) {
          await win.__unocss_runtime.uno.extractAll();
        } else if (win.__unocss_runtime?.update) {
          win.__unocss_runtime.update();
        }
      } catch (error) {
        log("warn", "[StageFrame] UnoCSS extractAll failed", { error });
      }
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 16));
  }
};

const scheduleUnoExtract = (reason: string): void => {
  if (unoExtractTimeoutId != null) {
    window.clearTimeout(unoExtractTimeoutId);
  }

  unoExtractTimeoutId = window.setTimeout(() => {
    unoExtractTimeoutId = null;

    void (async () => {
      const win = iframeRef.value?.contentWindow ?? null;
      await requestStageUnoExtractDebounced(win, UNO_EXTRACT_DEBOUNCE_MS);

      if (!win || isUnmounted) return;

      win.requestAnimationFrame(() => {
        syncCanvasBodyBackground(win, getBody() ?? win.document.body);
        canvasOverlays.schedulePositionUpdate("measure");
        log("debug", "[StageFrame] UnoCSS extraction complete", { reason });
      });
    })();
  }, UNO_EXTRACT_DEBOUNCE_MS);
};

const revealCanvasWhenStylesReady = async (): Promise<void> => {
  if (hasEmittedReady.value) return;

  const iframe = iframeRef.value;
  const win = iframe?.contentWindow as UnoRuntimeWindow | null;
  const doc = iframe?.contentDocument;
  const body = getBody();

  if (!win || !doc || !body) {
    traceStartup("stage-frame:ready:skipped-missing-dom", {
      instanceId: stageFrameInstanceId,
    });
    return;
  }

  const stylesReadyPromise = (async (): Promise<"styles-ready"> => {
    const framework = getSiteSettingsUtilityEngine(siteSettings.value);
    const stylesheetLinks = Array.from(
      doc.querySelectorAll('link[rel="stylesheet"]'),
    ) as HTMLLinkElement[];

    if (stylesheetLinks.length > 0) {
      await Promise.all(
        stylesheetLinks.map((link) => waitForStylesheetLoad(link)),
      );
    }

    if (framework === "unocss") {
      await waitForUnoReady(win);
    }

    return "styles-ready";
  })();

  let timeoutId: number | null = null;

  try {
    const revealReason = await Promise.race<"styles-ready" | "timeout">([
      stylesReadyPromise,
      new Promise((resolve) => {
        timeoutId = window.setTimeout(
          () => resolve("timeout"),
          STYLE_READY_REVEAL_BUDGET_MS,
        );
      }),
    ]);

    requestAnimationFrame(() => {
      syncCanvasBodyBackground(win, body);
      body.style.opacity = "1";

      if (!hasEmittedReady.value) {
        hasEmittedReady.value = true;
        traceStartup("stage-frame:ready-emit", {
          instanceId: stageFrameInstanceId,
          currentItemType: props.currentItemType,
          currentItemSlug: props.currentItemSlug,
          reason: revealReason,
        });
        emit("ready");
      }
    });
  } finally {
    if (timeoutId != null) {
      window.clearTimeout(timeoutId);
    }
  }
};

// LIFECYCLE & WATCHERS

/**
 * Initializes iframe on component mount.
 * Sets srcdoc HTML and primes the Stage runtime listeners.
 */
const handleHtmlPasteComplete = (): void => {
  scheduleUnoExtract("html-paste");
};

onMounted(async () => {
  traceStartup("stage-frame:mounted", {
    instanceId: stageFrameInstanceId,
    currentItemType: props.currentItemType,
    currentItemSlug: props.currentItemSlug,
    blocksCount: props.blocks?.length ?? 0,
  });

  window.addEventListener(HTML_PASTE_COMPLETE_EVENT, handleHtmlPasteComplete);

  // Reset unmount flag on mount
  isUnmounted = false;

  // Start loadClasses in parallel — don't block iframe creation
  const classesPromise = loadClasses();
  const renderStylesPromise = loadRenderStyles();
  void loadComponentGroups();

  await renderStylesPromise;

  // Attach load listener only after the initial render styles resolve so the
  // iframe boots with the same canonical stylesheet path as the live page.
  if (iframeRef.value) {
    // Pause any existing videos before reloading the iframe to prevent
    // audio from continuing during navigation
    const existingDoc = iframeRef.value.contentDocument;
    if (existingDoc) {
      const existingVideos = existingDoc.querySelectorAll("video");
      existingVideos.forEach((v) => {
        try {
          v.pause();
          v.removeAttribute("autoplay");
        } catch {
          // ignore
        }
      });
    }

    iframeRef.value.addEventListener("load", () => handleIframeLoad(), {
      once: true,
    });
    iframeRef.value.srcdoc = iframeHtml.value;
    traceStartup("stage-frame:srcdoc-set", {
      instanceId: stageFrameInstanceId,
      htmlLength: iframeHtml.value.length,
    });
  }

  // Ensure classes finish loading (they'll be injected via the watcher)
  await classesPromise;
  traceStartup("stage-frame:classes-ready", {
    instanceId: stageFrameInstanceId,
  });
});

/**
 * Cleanup on component unmount.
 * Prevents infinite retry loops during HMR.
 */
onUnmounted(() => {
  isUnmounted = true;
  if (unoExtractTimeoutId != null) {
    window.clearTimeout(unoExtractTimeoutId);
    unoExtractTimeoutId = null;
  }
  window.removeEventListener(
    HTML_PASTE_COMPLETE_EVENT,
    handleHtmlPasteComplete,
  );

  // Pause all videos in the iframe to prevent audio from continuing
  // when navigating away from the editor
  const doc = iframeRef.value?.contentDocument;
  if (doc) {
    const videos = doc.querySelectorAll("video");
    videos.forEach((video) => {
      try {
        video.pause();
      } catch {
        // iframe may be cross-origin or already destroyed
      }
    });
  }

  traceStartup("stage-frame:unmounted", {
    instanceId: stageFrameInstanceId,
    currentItemType: props.currentItemType,
    currentItemSlug: props.currentItemSlug,
  });
});

/**
 * Watches for block changes and re-renders the iframe.
 * Expands component references on-demand before rendering.
 * Only renders if iframe is ready to avoid unnecessary work.
 */
watch(
  () => [props.blocks, cmsRenderKey.value] as const,
  async ([newBlocks]) => {
    traceStartup("stage-frame:blocks-watch", {
      instanceId: stageFrameInstanceId,
      blocksCount: newBlocks?.length ?? 0,
      isCanvasReady: isCanvasReady.value,
    });
    const watchStart = performance.now();
    log("debug", "[StageFrame] blocks watch fired", {
      instanceId: stageFrameInstanceId,
      blocksCount: newBlocks?.length ?? 0,
      isCanvasReady: isCanvasReady.value,
    });
    // Deep check for component children
    const componentCount = newBlocks.filter(
      (b) => b.type?.toLowerCase() === "component",
    ).length;
    const expandedCount = newBlocks.filter(
      (b) => b.type?.toLowerCase() === "component" && b.children?.length > 0,
    ).length;

    log("debug", "[StageFrame] component expansion state", {
      instanceId: stageFrameInstanceId,
      componentCount,
      expandedCount,
    });

    // If iframe is ready, expand components and render immediately
    if (isCanvasReady.value) {
      const renderStart = performance.now();

      await renderExpandedBlocksIfCurrent(
        newBlocks,
        "stage-frame:blocks-watch",
      );
      const renderWatchTime = performance.now() - renderStart;
      log("debug", "[StageFrame] blocks watch render complete", {
        instanceId: stageFrameInstanceId,
        renderTimeMs: Number(renderWatchTime.toFixed(1)),
      });
    } else {
      log(
        "debug",
        "[StageFrame] blocks watch skipped render because iframe is not ready",
        {
          instanceId: stageFrameInstanceId,
        },
      );
    }

    const totalWatchTime = performance.now() - watchStart;
    log("debug", "[StageFrame] blocks watch complete", {
      instanceId: stageFrameInstanceId,
      totalTimeMs: Number(totalWatchTime.toFixed(1)),
    });
  },
  { deep: true },
);

function syncExternalSelectionOverlays(options?: { force?: boolean }): void {
  if (!isCanvasReady.value || !iframeRef.value?.contentDocument) {
    return;
  }

  const primaryNodeId =
    primarySelectedNodeId.value ?? props.selectedBlockId ?? null;
  const selectedIds =
    selectedNodeIds.value.length > 0
      ? [...selectedNodeIds.value]
      : primaryNodeId
        ? [primaryNodeId]
        : [];

  const selectionKey = JSON.stringify({
    primaryNodeId,
    selectedIds,
    ready: isCanvasReady.value,
  });
  if (!options?.force && selectionKey === lastExternalSelectionKey.value) {
    return;
  }
  lastExternalSelectionKey.value = selectionKey;

  if (selectedIds.length === 0) {
    canvasOverlays.hideSelection();
    canvasOverlays.hideSecondarySelections();
    return;
  }

  const iframeDoc = iframeRef.value.contentDocument;
  const resolvedTargets = selectedIds
    .map((nodeId) => {
      const element = findStageNodeElement(iframeDoc, getBlocks(), nodeId, {
        preferredElement:
          canvasOverlays.selection.nodeId === nodeId
            ? canvasOverlays.selection.element
            : null,
      });
      if (!element) {
        return null;
      }

      let nodeType = element.getAttribute("data-aria-type") || "div";
      if (element.hasAttribute("data-component-ref")) {
        nodeType = "Component";
      }

      return {
        element,
        nodeId,
        nodeType,
      };
    })
    .filter(
      (
        target,
      ): target is {
        element: Element;
        nodeId: string;
        nodeType: string;
      } => target !== null,
    );

  if (resolvedTargets.length === 0) {
    lastExternalSelectionKey.value = "";

    if (primaryNodeId && !pendingSelectionOverlayResync.value) {
      pendingSelectionOverlayResync.value = true;
      requestAnimationFrame(() => {
        pendingSelectionOverlayResync.value = false;
        syncExternalSelectionOverlays({ force: true });
      });
      return;
    }

    canvasOverlays.hideSelection();
    canvasOverlays.hideSecondarySelections();
    return;
  }

  const primaryTarget =
    resolvedTargets.find((target) => target.nodeId === primaryNodeId) ??
    resolvedTargets[resolvedTargets.length - 1];

  canvasOverlays.showSelection(
    primaryTarget.element,
    primaryTarget.nodeId,
    primaryTarget.nodeType,
    {
      emitSignal: false,
    },
  );
  canvasOverlays.showSecondarySelections(
    resolvedTargets.filter((target) => target.nodeId !== primaryTarget.nodeId),
  );
  syncSelectionToolbar(primaryTarget.nodeId);
}

watch(
  () => [
    isCanvasReady.value,
    primarySelectedNodeId.value,
    props.selectedBlockId,
    ...selectedNodeIds.value,
  ],
  () => {
    syncExternalSelectionOverlays();
  },
  { immediate: true },
);

/**
 * Watch for custom classes CSS changes and update iframe styles
 */
watch(generatedCSS, (newCSS) => {
  if (!isCanvasReady.value || !iframeRef.value?.contentDocument) return;

  const head = iframeRef.value.contentDocument.head;
  let customClassesStyleEl = head.querySelector(
    "style[data-aria-custom-classes]",
  );

  if (!customClassesStyleEl) {
    customClassesStyleEl =
      iframeRef.value.contentDocument.createElement("style");
    customClassesStyleEl.setAttribute("data-aria-custom-classes", "true");
    head.appendChild(customClassesStyleEl);
  }

  customClassesStyleEl.textContent = newCSS;
});

/**
 * Watch for custom fonts CSS changes and update iframe styles
 */
watch(customFontsCSS, (newCSS) => {
  if (!isCanvasReady.value || !iframeRef.value?.contentDocument) return;

  const head = iframeRef.value.contentDocument.head;
  let customFontsStyleEl = head.querySelector("style[data-aria-custom-fonts]");

  if (!customFontsStyleEl) {
    customFontsStyleEl = iframeRef.value.contentDocument.createElement("style");
    customFontsStyleEl.setAttribute("data-aria-custom-fonts", "true");
    head.appendChild(customFontsStyleEl);
  }

  customFontsStyleEl.textContent = newCSS;
});

watch(cssVariables, (newCSS) => {
  if (!isCanvasReady.value || !iframeRef.value?.contentDocument) return;
  syncThemeVars(iframeRef.value.contentDocument.head, newCSS);

  const body = getBody();
  const win = iframeRef.value.contentWindow;
  if (!body || !win) return;

  win.requestAnimationFrame(() => {
    const nextBody = getBody();
    if (!nextBody) return;
    syncCanvasBodyBackground(win, nextBody);
  });
});

watch(
  () => [renderStyles.value.baseCSS, renderStyles.value.globalCSS],
  () => {
    if (!isCanvasReady.value || !iframeRef.value?.contentDocument) return;
    syncGlobalCssLink(iframeRef.value.contentDocument.head, renderStyles.value);
    syncBaseCss(
      iframeRef.value.contentDocument.head,
      resolveStageDocumentCss(renderStyles.value),
    );

    if (
      hasAuthoredCanvasBackgroundCss(
        resolveStageDocumentCss(renderStyles.value),
      )
    ) {
      const currentBody = getBody();
      if (
        currentBody?.getAttribute(STAGE_BODY_BACKGROUND_FALLBACK_ATTR) ===
        "true"
      ) {
        currentBody.style.removeProperty("background");
        currentBody.removeAttribute(STAGE_BODY_BACKGROUND_FALLBACK_ATTR);
      }
    }

    const body = getBody();
    const win = iframeRef.value.contentWindow;
    if (!body || !win) return;

    win.requestAnimationFrame(() => {
      const nextBody = getBody();
      if (!nextBody) return;
      syncCanvasBodyBackground(win, nextBody);
    });
  },
);

watch(
  () => renderStyles.value.utilityCSS,
  (newCSS) => {
    if (!isCanvasReady.value || !iframeRef.value?.contentDocument) return;
    syncUtilityCss(iframeRef.value.contentDocument.head, newCSS);

    const body = getBody();
    const win = iframeRef.value.contentWindow;
    if (!body || !win) return;

    win.requestAnimationFrame(() => {
      const nextBody = getBody();
      if (!nextBody) return;
      syncCanvasBodyBackground(win, nextBody);
    });
  },
);

watch(
  () => siteSettings.value?.styleRevision,
  async (nextRevision) => {
    if (!nextRevision || nextRevision === loadedStyleRevision.value) return;
    await loadRenderStyles();
  },
);

defineExpose({ iframeRef, getWindow, getDoc, getBody, getHead });
</script>

<template>
  <div class="stage-frame-wrapper">
    <iframe
      ref="iframeRef"
      :style="{ width: width || '100%', height: height || '100%' }"
      sandbox="allow-same-origin allow-scripts"
      title="Aria Stage"
    />

    <!-- New unified overlay layer (positioned over iframe) -->
    <CanvasOverlayLayer
      ref="overlayLayerRef"
      :iframe-ref="iframeRef"
      @toolbar-action="handleToolbarAction"
      @toolbar-style-change="handleToolbarStyleChange"
      @toolbar-props-change="handleToolbarPropsChange"
    />

    <!-- Convert to Component Dialog -->
    <CreateComponentDialog
      :open="conversion.isDialogOpen.value"
      mode="convert"
      :suggested-name="conversion.suggestedName.value"
      :existing-components="existingComponents"
      :groups="componentGroups"
      @update:open="conversion.isDialogOpen.value = $event"
      @confirm="conversion.handleConfirm"
    />
  </div>
</template>

<style scoped>
.stage-frame-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

iframe {
  border: none;
  display: block;
  background: transparent;
}
</style>
