import { onUnmounted, type Ref } from "vue";
import { z } from "zod";

import type {
  BreakpointDefinition,
  BuilderNode,
  JsonObject,
  JsonValue,
  NodeAccessibility,
  StyleMap,
} from "../../../../lib/types/nodes";
import {
  getNativeTagForRenderableNode,
  IMAGE_NON_MANAGED_HTML_ATTRS,
  resolveRenderedButtonVariant,
} from "../../../../lib/blocks/renderSemantics";
import { BUTTON_VARIANT_ATTRIBUTE } from "../../../../lib/blocks/buttonVariants";
import {
  buildButtonContentRowStyle,
  buildButtonIconStyle,
  getButtonIconHostClassName,
  getButtonIconPosition,
} from "../../../../lib/blocks/buttonContent";
import {
  buildRenderedCodeMarkup,
  getCodeBlockRenderMode,
  inferCodeLanguage,
} from "../../../../lib/utils/codeLanguage";
import { log } from "@/lib/utils/logger";
import { resolveRenderableContentValue } from "../../../../lib/cms/structuredText";
import { useCanvasInteractionBridge, useCanvasSignalBridge } from "../../Core";
import { isContentEditableType } from "../../Inspector/composables/useContentContract";
import { hydrateIconHost } from "../utils/canvasIconHydration";
import { ICONIFY_ICON_TAG_NAME } from "../../../../lib/icons/customElement";
import { normalizeCanvasAttributeProps } from "../utils/canvasRenderAttributes";
import {
  resolveLiveHeadingUpdate,
  resolveLiveTextValue,
} from "../utils/liveContentUpdates";
import { mergeCanvasStyleUpdateIntoStyleMap } from "../utils/liveResponsiveStyles";
import {
  getContentStyleTargetElement,
  getInlineEditableElement,
  isContentStyleProperty,
  isTypographyStyleProperty,
} from "../utils/nodeStyleRuntime";
import { findStageNodeElement } from "../utils/findStageNodeElement";
import { requestStageUnoExtractDebounced } from "../utils/requestStageUnoExtract";
import { resolveStageMediaSrc } from "../utils/imagePresentation";
import {
  compileMotionClasses,
  compileMotionDataAttributes,
  compileParallaxClasses,
  compileParallaxDataAttributes,
} from "../../../../lib/motion/compile";
import type { NodeMotion } from "../../../../lib/motion/schemas/nodeMotion.schema";

interface LiveResponsiveStyleOverride {
  nodeType: string;
  styles: StyleMap;
}

const VideoPreloadSchema = z.enum(["", "auto", "none", "metadata"]);
type VideoBooleanProperty =
  | "autoplay"
  | "loop"
  | "muted"
  | "controls"
  | "playsInline";

function setVideoBooleanProperty(
  video: HTMLVideoElement,
  property: VideoBooleanProperty,
  value: boolean,
): void {
  switch (property) {
    case "autoplay":
      video.autoplay = value;
      return;
    case "loop":
      video.loop = value;
      return;
    case "muted":
      video.muted = value;
      return;
    case "controls":
      video.controls = value;
      return;
    case "playsInline":
      video.playsInline = value;
      return;
    default: {
      const exhaustive: never = property;
      throw new Error(`Unsupported video property: ${exhaustive}`);
    }
  }
}

interface UseStageLiveCanvasUpdatesOptions {
  iframeRef: Ref<HTMLIFrameElement | null>;
  getBlocks: () => BuilderNode[];
  /** The latest expanded tree rendered in the canvas. */
  getRenderedBlocks: () => readonly BuilderNode[];
  findNode: (blocks: BuilderNode[], id: string) => BuilderNode | null;
  getNodeClassName: (
    node: Pick<BuilderNode, "classNames" | "customClasses" | "motion">,
  ) => string;
  getStageBreakpoints: () => BreakpointDefinition[];
  toCssPropertyName: (property: string) => string;
  collectResponsiveStyleCSS: (
    blocks: readonly BuilderNode[],
    liveOverrides?: ReadonlyMap<string, LiveResponsiveStyleOverride>,
  ) => string;
  canvasOverlays: {
    hideSelection: () => void;
    showSelectionGhost: (element: Element, nodeType?: string) => void;
    hideSelectionGhost: () => void;
    schedulePositionUpdate: (mode?: "measure" | "translate") => void;
    selection: {
      visible: boolean;
      nodeId: string | null;
    };
    secondarySelections: Readonly<Array<{ nodeId: string; nodeType: string }>>;
  };
  defaultHeadingLevel: number;
}

const LIVE_BUTTON_RENDER_ONLY_PROP_NAMES = new Set([
  "content",
  "text",
  "label",
  "variant",
  "size",
  "icon",
  "iconPosition",
  "iconGap",
  "iconSpaceBetween",
  "iconSize",
  "iconColor",
]);

const MOTION_SCRIPT_ID = "aria-motion-runtime-script";

export function useStageLiveCanvasUpdates(
  options: UseStageLiveCanvasUpdatesOptions,
) {
  const {
    onA11yUpdate,
    onMotionUpdate,
    onClassUpdate,
    onStyleUpdate,
    onPropsUpdate,
    onSpacingPreviewStart,
    onSpacingPreviewEnd,
  } = useCanvasSignalBridge();
  const { onSelectNode } = useCanvasInteractionBridge();

  const liveResponsiveStyleOverrides = new Map<
    string,
    LiveResponsiveStyleOverride
  >();

  const upsertHeadStyle = (
    head: HTMLHeadElement,
    attributeName: string,
    css: string,
  ): void => {
    let styleElement = head.querySelector(
      `style[${attributeName}]`,
    ) as HTMLStyleElement | null;

    if (!styleElement) {
      styleElement = head.ownerDocument.createElement("style");
      styleElement.setAttribute(attributeName, "true");
      head.appendChild(styleElement);
    }

    styleElement.textContent = css;
  };

  const syncLiveResponsiveStyleOverrides = (head: HTMLHeadElement): void => {
    const css = options.collectResponsiveStyleCSS(
      options.getRenderedBlocks(),
      liveResponsiveStyleOverrides,
    );

    upsertHeadStyle(head, "data-aria-node-styles", css);
    upsertHeadStyle(head, "data-aria-live-node-styles", "");
  };

  const clearLiveResponsiveStyleOverrides = (): void => {
    liveResponsiveStyleOverrides.clear();
  };

  const applyA11yAttributeUpdates = (
    element: HTMLElement,
    a11y: Partial<NonNullable<NodeAccessibility>>,
  ): void => {
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
      if (!(key in a11y)) {
        continue;
      }

      const value = a11y[key as keyof typeof a11y];
      if (value === undefined || value === null || value === "") {
        element.removeAttribute(attributeName);
        continue;
      }

      element.setAttribute(attributeName, String(value));
    }
  };

  const removeClassesWithPrefix = (
    element: HTMLElement,
    classNamePrefix: string,
  ): void => {
    const matchingClasses = Array.from(element.classList).filter((className) =>
      className.startsWith(classNamePrefix),
    );
    if (matchingClasses.length > 0) {
      element.classList.remove(...matchingClasses);
    }
  };

  const scheduleMotionRuntimeInit = (doc: Document): void => {
    const win = doc.defaultView;
    if (!win) {
      return;
    }

    const initMotion = () => {
      win.AriaMotion?.init(doc);
    };

    const scheduleFrame =
      typeof win.requestAnimationFrame === "function"
        ? win.requestAnimationFrame.bind(win)
        : (callback: FrameRequestCallback) => {
            win.setTimeout(() => callback(win.performance.now()), 0);
            return 0;
          };

    scheduleFrame(() => {
      if (win.AriaMotion) {
        initMotion();
        return;
      }

      const script = doc.getElementById(MOTION_SCRIPT_ID);
      script?.addEventListener("load", initMotion, { once: true });
    });
  };

  const applyMotionClassUpdates = (
    element: HTMLElement,
    motion: NodeMotion,
  ): void => {
    const motionClassPrefix = "aria-motion";
    removeClassesWithPrefix(element, motionClassPrefix);

    for (const className of compileMotionClasses(motion)) {
      element.classList.add(className);
    }

    const motionDataAttributes = compileMotionDataAttributes(motion);
    for (const attr of element.getAttributeNames()) {
      if (attr.startsWith("data-aria-motion")) {
        element.removeAttribute(attr);
      }
    }

    for (const [key, value] of Object.entries(motionDataAttributes)) {
      element.setAttribute(key, value);
    }

    element.classList.remove("aria-motion-in");

    const parallaxClassPrefix = "aria-parallax";
    removeClassesWithPrefix(element, parallaxClassPrefix);

    for (const className of compileParallaxClasses(motion?.parallax)) {
      element.classList.add(className);
    }

    const parallaxDataAttributes = compileParallaxDataAttributes(
      motion?.parallax,
    );
    for (const attr of element.getAttributeNames()) {
      if (attr.startsWith("data-aria-parallax")) {
        element.removeAttribute(attr);
      }
    }

    for (const [key, value] of Object.entries(parallaxDataAttributes)) {
      element.setAttribute(key, value);
    }

    scheduleMotionRuntimeInit(element.ownerDocument);
  };

  const rebuildLiveButtonContent = (
    element: HTMLElement,
    props: Record<string, JsonValue | undefined>,
  ): void => {
    const label =
      typeof props.label === "string"
        ? props.label
        : typeof props.text === "string"
          ? props.text
          : typeof props.content === "string"
            ? props.content
            : "";
    const hasIcon =
      (typeof props.icon === "string" && props.icon.trim().length > 0) ||
      (typeof props.icon === "object" && props.icon !== null);

    element.replaceChildren();

    if (!hasIcon) {
      element.textContent = label;
      return;
    }

    const doc = element.ownerDocument;
    const contentRow = doc.createElement("span");
    const styleProps = Object.fromEntries(
      Object.entries(props).filter(([, value]) => value !== undefined),
    ) as JsonObject;
    contentRow.style.cssText = buildButtonContentRowStyle(styleProps);

    const labelEl = doc.createElement("span");
    labelEl.textContent = label;

    const iconHost = doc.createElement("span");
    iconHost.setAttribute("aria-hidden", "true");
    iconHost.style.cssText = buildButtonIconStyle(props);
    const iconHostClassName = getButtonIconHostClassName(props);
    if (iconHostClassName) {
      iconHost.className = iconHostClassName;
    }

    void hydrateIconHost({
      host: iconHost,
      iconValue: props.icon,
      classNameValue: "",
      ariaLabelValue: "",
      fallbackText: "",
    }).finally(() => {
      iconHost.setAttribute("aria-hidden", "true");
      iconHost.removeAttribute("role");
      iconHost.removeAttribute("aria-label");
    });

    if (getButtonIconPosition(props.iconPosition) === "right") {
      contentRow.appendChild(labelEl);
      contentRow.appendChild(iconHost);
    } else {
      contentRow.appendChild(iconHost);
      contentRow.appendChild(labelEl);
    }

    element.appendChild(contentRow);
  };

  const replaceElementTag = (
    element: HTMLElement,
    nextTag: string,
  ): HTMLElement => {
    if (element.tagName.toLowerCase() === nextTag) {
      return element;
    }

    const doc = element.ownerDocument;
    const replacement = doc.createElement(nextTag);

    for (const attribute of Array.from(element.attributes)) {
      replacement.setAttribute(attribute.name, attribute.value);
    }

    replacement.className = element.className;
    replacement.style.cssText = element.style.cssText;

    while (element.firstChild) {
      replacement.appendChild(element.firstChild);
    }

    element.parentNode?.replaceChild(replacement, element);
    return replacement;
  };

  const updateLiveCodeNode = (
    element: HTMLElement,
    node: BuilderNode,
    nextProps: Record<string, JsonValue | undefined>,
  ): HTMLElement => {
    const mergedNode: BuilderNode = {
      ...node,
      props: {
        ...(node.props ?? {}),
        ...nextProps,
      },
    };

    const nextTag = getNativeTagForRenderableNode(
      mergedNode,
      mergedNode.props ?? {},
    );
    const nextElement = nextTag ? replaceElementTag(element, nextTag) : element;
    const rawCode = String(
      mergedNode.props?.content ??
        mergedNode.props?.code ??
        mergedNode.props?.text ??
        "",
    );

    nextElement.replaceChildren();

    if (getCodeBlockRenderMode(mergedNode.props?.renderMode) === "render") {
      const template = nextElement.ownerDocument.createElement("template");
      template.innerHTML = buildRenderedCodeMarkup(rawCode);
      const fragment = template.content.cloneNode(true) as DocumentFragment;

      for (const staleScript of Array.from(
        fragment.querySelectorAll("script"),
      )) {
        const liveScript = nextElement.ownerDocument.createElement("script");

        for (const { name, value } of Array.from(staleScript.attributes)) {
          liveScript.setAttribute(name, value);
        }

        liveScript.textContent = staleScript.textContent;
        staleScript.replaceWith(liveScript);
      }

      nextElement.appendChild(fragment);
      return nextElement;
    }

    const code = nextElement.ownerDocument.createElement("code");
    code.textContent = rawCode;
    const resolvedLanguage =
      typeof mergedNode.props?.language === "string" &&
      mergedNode.props.language.trim()
        ? mergedNode.props.language.trim()
        : inferCodeLanguage(rawCode);

    if (resolvedLanguage) {
      code.setAttribute("data-language", resolvedLanguage);
    }

    nextElement.appendChild(code);
    return nextElement;
  };

  const disposeClassUpdate = onClassUpdate((payload) => {
    const iframe = options.iframeRef.value;
    const doc = iframe?.contentDocument;
    if (!doc || !payload?.nodeId || !payload?.classNames) {
      return;
    }

    const element = findStageNodeElement(
      doc,
      options.getBlocks(),
      payload.nodeId,
    );
    if (!element) {
      return;
    }

    const existingNode = options.findNode(options.getBlocks(), payload.nodeId);
    const structuralClasses = Array.from(element.classList).filter(
      (className) =>
        className.startsWith("aria-") ||
        className.startsWith("data-") ||
        className === "relative",
    );

    const nextClassName = options.getNodeClassName({
      classNames: payload.classNames,
      customClasses: payload.customClasses ?? existingNode?.customClasses,
    });

    element.className = [...structuralClasses, nextClassName]
      .filter(Boolean)
      .join(" ");

    void requestStageUnoExtractDebounced(iframe.contentWindow);
  });

  const disposeStyleUpdate = onStyleUpdate((payload) => {
    const iframe = options.iframeRef.value;
    const doc = iframe?.contentDocument;
    if (!doc || !payload?.nodeId || !payload?.styles) {
      return;
    }

    const element = findStageNodeElement(
      doc,
      options.getBlocks(),
      payload.nodeId,
    );
    if (!element) {
      log("debug", "[StageFrame] update-styles target not found", {
        nodeId: payload.nodeId,
      });
      return;
    }

    const nodeType = element.getAttribute("data-aria-type") ?? "";
    const typographyTarget = getInlineEditableElement(element, nodeType);
    const contentTarget = getContentStyleTargetElement(element, nodeType);

    // Clear stale inline styles so they do not block CSS @media overrides.
    for (const properties of Object.values(payload.styles)) {
      for (const property of Object.keys(properties)) {
        const cssProperty = options.toCssPropertyName(property);
        const styleTarget =
          isTypographyStyleProperty(property) && typographyTarget
            ? typographyTarget
            : element;

        styleTarget.style.removeProperty(cssProperty);

        if (contentTarget && isContentStyleProperty(property, nodeType)) {
          contentTarget.style.removeProperty(cssProperty);
        }
      }
    }

    const nextLiveStyles = mergeCanvasStyleUpdateIntoStyleMap(
      liveResponsiveStyleOverrides.get(payload.nodeId)?.styles,
      payload.styles,
    );

    if (Object.keys(nextLiveStyles).length === 0) {
      liveResponsiveStyleOverrides.delete(payload.nodeId);
    } else {
      liveResponsiveStyleOverrides.set(payload.nodeId, {
        nodeType,
        styles: nextLiveStyles,
      });
    }

    syncLiveResponsiveStyleOverrides(doc.head);

    if (
      (options.canvasOverlays.selection.visible &&
        options.canvasOverlays.selection.nodeId === payload.nodeId) ||
      options.canvasOverlays.secondarySelections.some(
        (selection) => selection.nodeId === payload.nodeId,
      )
    ) {
      options.canvasOverlays.schedulePositionUpdate("translate");
    }
  });

  const disposeSpacingPreviewStart = onSpacingPreviewStart((payload) => {
    const iframe = options.iframeRef.value;
    const doc = iframe?.contentDocument;
    if (!doc) {
      return;
    }

    const element = findStageNodeElement(
      doc,
      options.getBlocks(),
      payload.nodeId,
    );
    if (!element) {
      return;
    }

    const nodeType = element.getAttribute("data-aria-type") ?? "";
    options.canvasOverlays.showSelectionGhost(element, nodeType);
  });

  const disposeSpacingPreviewEnd = onSpacingPreviewEnd(() => {
    options.canvasOverlays.hideSelectionGhost();
  });

  const disposeA11yUpdate = onA11yUpdate((payload) => {
    const iframe = options.iframeRef.value;
    const doc = iframe?.contentDocument;
    if (!doc || !payload?.nodeId || !payload?.a11y) {
      return;
    }

    const element = findStageNodeElement(
      doc,
      options.getBlocks(),
      payload.nodeId,
    );
    if (!element) {
      return;
    }

    applyA11yAttributeUpdates(element, payload.a11y);
  });

  const disposeMotionUpdate = onMotionUpdate((payload) => {
    const iframe = options.iframeRef.value;
    const doc = iframe?.contentDocument;
    if (!doc || !payload?.nodeId || !payload?.motion) {
      return;
    }

    const element = findStageNodeElement(
      doc,
      options.getBlocks(),
      payload.nodeId,
    );
    if (!element) {
      return;
    }

    applyMotionClassUpdates(element, payload.motion);
  });

  const disposePropsUpdate = onPropsUpdate((payload) => {
    const iframe = options.iframeRef.value;
    const doc = iframe?.contentDocument;
    if (!doc || !payload?.nodeId || !payload?.props) {
      log(
        "debug",
        "[StageFrame] update-props skipped: missing doc or payload",
        {
          hasDoc: !!doc,
          hasNodeId: !!payload?.nodeId,
          hasProps: !!payload?.props,
        },
      );
      return;
    }

    if (payload.source === "stage-inline-live") {
      return;
    }

    let element = findStageNodeElement(
      doc,
      options.getBlocks(),
      payload.nodeId,
    );
    if (!element) {
      log("debug", "[StageFrame] update-props target not found", {
        nodeId: payload.nodeId,
      });
      return;
    }

    log("debug", "[StageFrame] update-props received", {
      nodeId: payload.nodeId,
      props: payload.props,
      elementType: element.tagName,
      elementDataType: element.getAttribute("data-aria-type"),
    });

    const existingNode = options.findNode(options.getBlocks(), payload.nodeId);
    const existingNodeType = existingNode?.type?.toLowerCase() ?? "";
    const elementNodeType =
      element.getAttribute("data-aria-type")?.toLowerCase() ?? "";
    const isLiveButtonNode =
      existingNodeType === "button" || elementNodeType === "button";
    const isLiveListNode =
      existingNodeType === "list" || elementNodeType === "list";
    const shouldRebuildCodeNode =
      existingNodeType === "code" &&
      (payload.props.renderMode !== undefined ||
        payload.props.content !== undefined ||
        payload.props.code !== undefined ||
        payload.props.text !== undefined ||
        payload.props.language !== undefined);
    const shouldRetagHeadingNode =
      (existingNodeType === "heading" || elementNodeType === "heading") &&
      payload.props.level !== undefined;
    const shouldRetagNativeNode =
      payload.props.element !== undefined ||
      shouldRetagHeadingNode ||
      shouldRebuildCodeNode ||
      (isLiveButtonNode && "href" in payload.props) ||
      (isLiveListNode && "ordered" in payload.props);

    if (shouldRetagNativeNode) {
      const baseNode =
        existingNode ??
        (isLiveButtonNode || isLiveListNode
          ? {
              id: payload.nodeId,
              type: element.getAttribute("data-aria-type") ?? "Container",
              props: {},
              styles: {},
              children: [],
            }
          : null);

      if (baseNode) {
        const nextNode: BuilderNode = {
          ...baseNode,
          props: {
            ...(baseNode.props ?? {}),
            ...payload.props,
          },
        };
        const nextTag = getNativeTagForRenderableNode(
          nextNode,
          nextNode.props ?? {},
        );
        if (nextTag) {
          element = replaceElementTag(element, nextTag);
        }

        if (shouldRebuildCodeNode && existingNode) {
          element = updateLiveCodeNode(
            element,
            existingNode,
            payload.props as Record<string, JsonValue | undefined>,
          );
        }
      }
    }

    const canvasProps = normalizeCanvasAttributeProps(
      {
        type:
          existingNode?.type ?? element.getAttribute("data-aria-type") ?? "",
      },
      payload.props,
    );

    Object.entries(canvasProps).forEach(([key, value]) => {
      if (key === "element") {
        return;
      }

      if (
        elementNodeType === "button" &&
        LIVE_BUTTON_RENDER_ONLY_PROP_NAMES.has(key)
      ) {
        return;
      }

      if (typeof value === "boolean") {
        element.toggleAttribute(key, value);
      } else if (value === undefined || value === null || value === "") {
        element.removeAttribute(key);
      } else {
        element.setAttribute(key, String(value));
      }
    });

    const nodeType = element.getAttribute("data-aria-type")?.toLowerCase();

    if (nodeType === "button") {
      const liveButtonNode: BuilderNode = {
        ...(existingNode ?? {
          id: payload.nodeId,
          type: element.getAttribute("data-aria-type") ?? "Button",
          props: {},
          styles: {},
          children: [],
        }),
        props: {
          ...(existingNode?.props ?? {}),
          ...payload.props,
        },
      };

      for (const propName of LIVE_BUTTON_RENDER_ONLY_PROP_NAMES) {
        element.removeAttribute(propName);
      }

      const renderedVariant = resolveRenderedButtonVariant(
        liveButtonNode,
        liveButtonNode.props ?? {},
      );
      if (renderedVariant) {
        element.setAttribute(BUTTON_VARIANT_ATTRIBUTE, renderedVariant);
      } else {
        element.removeAttribute(BUTTON_VARIANT_ATTRIBUTE);
      }

      rebuildLiveButtonContent(
        element,
        liveButtonNode.props as Record<string, JsonValue | undefined>,
      );
      return;
    }

    if (nodeType === "svg") {
      if ("content" in payload.props) {
        const nextContent =
          typeof payload.props.content === "string"
            ? payload.props.content
            : "";

        element.replaceChildren();
        if (nextContent.trim().length > 0) {
          element.innerHTML = nextContent;
        }
      }

      element.removeAttribute("content");
      return;
    }

    if (
      nodeType &&
      isContentEditableType(nodeType) &&
      ("text" in payload.props ||
        "content" in payload.props ||
        "label" in payload.props ||
        "level" in payload.props)
    ) {
      const nextText = resolveLiveTextValue(payload.props);

      if (nodeType === "heading") {
        const editableHeading = getInlineEditableElement(element, nodeType);
        const resolvedHeading = resolveLiveHeadingUpdate(payload.props, {
          existingTagName: editableHeading?.tagName,
          existingText: editableHeading?.textContent ?? element.textContent,
          defaultLevel: options.defaultHeadingLevel,
        });

        if (editableHeading && resolvedHeading.hasExplicitText) {
          if ("content" in payload.props) {
            editableHeading.innerHTML = resolveRenderableContentValue(
              payload.props.content ?? "",
            );
          } else {
            editableHeading.textContent = resolvedHeading.text;
          }
        }

        return;
      }

      if (nextText === null) {
        return;
      }

      if (
        nodeType === "text" ||
        nodeType === "paragraph" ||
        nodeType === "span"
      ) {
        const editableText = getInlineEditableElement(element, nodeType);
        if (editableText) {
          if ("content" in payload.props) {
            editableText.innerHTML = resolveRenderableContentValue(
              payload.props.content ?? "",
            );
          } else {
            editableText.textContent = nextText;
          }
        }
        return;
      }

      if (nodeType === "button") {
        const button = element.querySelector(
          "button",
        ) as HTMLButtonElement | null;
        if (button) {
          button.textContent = nextText;
        }
        return;
      }

      if (nodeType === "link") {
        const link = element.querySelector("a") as HTMLAnchorElement | null;
        if (link) {
          link.textContent = nextText;
        }
        return;
      }
    }

    if (nodeType === "image") {
      const imgEl =
        element.tagName.toLowerCase() === "img"
          ? (element as HTMLImageElement)
          : (element.querySelector("img") as HTMLImageElement | null);

      if (!imgEl) {
        log("warn", "[StageFrame] Image node has no <img> child", {
          nodeId: payload.nodeId,
        });
        return;
      }

      const hasSrc = "src" in payload.props;
      const hasAlt = "alt" in payload.props;
      const hasLoading = "loading" in payload.props;
      const hasObjectFit = "objectFit" in payload.props;
      const hasObjectPosition = "objectPosition" in payload.props;

      if (hasSrc) {
        const newSrc = resolveStageMediaSrc(payload.props.src, {
          origin:
            typeof window !== "undefined" ? window.location.origin : undefined,
        });
        log("debug", "[StageFrame] Updating image src", {
          oldSrc: imgEl.getAttribute("src") || "",
          newSrc,
          tagName: imgEl.tagName,
        });

        if (newSrc) {
          imgEl.src = newSrc;
          imgEl.setAttribute("src", newSrc);
        } else {
          imgEl.removeAttribute("src");
        }

        for (const attrName of IMAGE_NON_MANAGED_HTML_ATTRS) {
          imgEl.removeAttribute(attrName);
        }
      }

      if (hasAlt) {
        const newAlt = String(payload.props.alt || "");
        imgEl.alt = newAlt;
        if (newAlt) {
          imgEl.setAttribute("alt", newAlt);
        } else {
          imgEl.removeAttribute("alt");
        }
      }

      if (hasLoading) {
        const newLoading = String(payload.props.loading || "");
        if (newLoading === "lazy" || newLoading === "eager") {
          imgEl.setAttribute("loading", newLoading);
        } else {
          imgEl.removeAttribute("loading");
        }
      }

      if (hasObjectFit) {
        imgEl.style.objectFit = String(payload.props.objectFit || "");
      }

      if (hasObjectPosition) {
        imgEl.style.objectPosition = String(
          payload.props.objectPosition || "",
        );
      }

      log("debug", "[StageFrame] Image updated successfully", {
        currentSrc: imgEl.getAttribute("src") || "",
        currentAlt: imgEl.getAttribute("alt") || "",
      });
      return;
    }

    if (nodeType === "video") {
      const videoEl =
        element.tagName.toLowerCase() === "video"
          ? (element as HTMLVideoElement)
          : (element.querySelector("video") as HTMLVideoElement | null);

      if (!videoEl) {
        log("warn", "[StageFrame] Video node has no <video> child", {
          nodeId: payload.nodeId,
        });
        return;
      }

      if ("src" in payload.props) {
        const newSrc = String(payload.props.src || "");
        if (newSrc) {
          videoEl.src = newSrc;
          videoEl.setAttribute("src", newSrc);
        } else {
          videoEl.removeAttribute("src");
        }
      }

      if ("poster" in payload.props) {
        const newPoster = String(payload.props.poster || "");
        if (newPoster) {
          videoEl.poster = newPoster;
          videoEl.setAttribute("poster", newPoster);
        } else {
          videoEl.removeAttribute("poster");
        }
      }

      if ("alt" in payload.props) {
        const newAlt = String(payload.props.alt || "");
        if (newAlt) {
          videoEl.setAttribute("alt", newAlt);
        } else {
          videoEl.removeAttribute("alt");
        }
      }

      const booleanAttrs: ReadonlyArray<{
        key: "autoplay" | "loop" | "muted" | "controls" | "playsinline";
        property: VideoBooleanProperty;
        attribute: "autoplay" | "loop" | "muted" | "controls" | "playsinline";
      }> = [
        { key: "autoplay", property: "autoplay", attribute: "autoplay" },
        { key: "loop", property: "loop", attribute: "loop" },
        { key: "muted", property: "muted", attribute: "muted" },
        { key: "controls", property: "controls", attribute: "controls" },
        {
          key: "playsinline",
          property: "playsInline",
          attribute: "playsinline",
        },
      ];

      for (const { key, property, attribute } of booleanAttrs) {
        if (key in payload.props) {
          const value = Boolean(payload.props[key]);
          setVideoBooleanProperty(videoEl, property, value);
          if (value) {
            videoEl.setAttribute(attribute, "");
          } else {
            videoEl.removeAttribute(attribute);
          }
        }
      }

      if ("preload" in payload.props) {
        const newPreload = VideoPreloadSchema.parse(
          String(payload.props.preload || "metadata"),
        );
        videoEl.preload = newPreload;
        videoEl.setAttribute("preload", newPreload);
      }

      if ("objectFit" in payload.props) {
        videoEl.style.objectFit = String(payload.props.objectFit || "");
      }

      if ("objectPosition" in payload.props) {
        videoEl.style.objectPosition = String(
          payload.props.objectPosition || "",
        );
      }

      if ("aspectRatio" in payload.props) {
        const aspectRatio = String(payload.props.aspectRatio || "");
        if (aspectRatio) {
          videoEl.style.aspectRatio = aspectRatio;
        } else {
          videoEl.style.removeProperty("aspect-ratio");
        }
      }

      log("debug", "[StageFrame] Video updated successfully", {
        currentSrc: videoEl.getAttribute("src") || "",
      });
      return;
    }

    if (nodeType === "icon") {
      const iconHost =
        (element.querySelector(
          "[data-aria-icon-host='1']",
        ) as HTMLElement | null) ??
        (element.querySelector(ICONIFY_ICON_TAG_NAME) as HTMLElement | null);

      if (!iconHost) {
        return;
      }

      void hydrateIconHost({
        host: iconHost,
        iconValue:
          payload.props.icon !== undefined
            ? payload.props.icon
            : (element.getAttribute("icon") ?? ""),
        classNameValue: existingNode?.props?.className,
        ariaLabelValue:
          payload.props.ariaLabel !== undefined
            ? payload.props.ariaLabel
            : (element.getAttribute("ariaLabel") ?? ""),
      });
    }
  });

  const disposeSelectNode = onSelectNode((payload) => {
    if (!payload?.nodeId) {
      options.canvasOverlays.hideSelection();
    }
  });

  onUnmounted(() => {
    [
      disposeClassUpdate,
      disposeStyleUpdate,
      disposeSpacingPreviewStart,
      disposeSpacingPreviewEnd,
      disposeA11yUpdate,
      disposeMotionUpdate,
      disposePropsUpdate,
      disposeSelectNode,
    ].forEach((dispose) => {
      if (typeof dispose === "function") {
        dispose();
      }
    });
  });

  return {
    clearLiveResponsiveStyleOverrides,
    syncLiveResponsiveStyleOverrides,
  };
}
