import type { toCanvas } from "html-to-image";
import { z } from "zod";
import { actions } from "astro:actions";

import { COMPONENT_PREVIEW_ROOT_SELECTOR } from "./componentPreviewConstants";
import { extractComponentSnapshotRenderableHtml } from "@/lib/rendering/componentSnapshots";
import {
  ComponentThumbnailIdSchema,
  ComponentThumbnailSaveResponseSchema,
} from "@/lib/schemas/componentPreview";
import { isThumbnailCaptureSupported } from "@/features/Studio/pages/utils/deviceCapabilities";
import { acquireThumbnailGenerationSlot } from "@/features/Studio/pages/composables/thumbnailGenerationQueue";
import { buildComponentSnapshotPreviewUrl } from "./componentPreviewUrls";
import { DEFAULT_DESKTOP_CANVAS_WIDTH } from "@/lib/styles/responsiveBreakpoints";
import {
  buildMotionThumbnailCaptureCss,
  revealAriaMotionForCapture,
  waitForFiniteAnimations,
  waitForMotionSettle,
} from "@/lib/motion/capture";

let toCanvasModulePromise: Promise<typeof import("html-to-image")> | null = null;

const lazyToCanvas: typeof toCanvas = async (node, options) => {
  if (!toCanvasModulePromise) {
    toCanvasModulePromise = import("html-to-image");
  }
  const mod = await toCanvasModulePromise;
  return mod.toCanvas(node, options);
};

const COMPONENT_THUMBNAIL_CAPTURE_LAYOUT_WIDTH = DEFAULT_DESKTOP_CANVAS_WIDTH;
const COMPONENT_THUMBNAIL_CAPTURE_LAYOUT_HEIGHT = 2500;
const COMPONENT_THUMBNAIL_OUTPUT_WIDTH = 640;
const COMPONENT_THUMBNAIL_OUTPUT_HEIGHT = 360;
const COMPONENT_THUMBNAIL_CAPTURE_HEIGHT = Math.round(
  (COMPONENT_THUMBNAIL_CAPTURE_LAYOUT_WIDTH *
    COMPONENT_THUMBNAIL_OUTPUT_HEIGHT) /
    COMPONENT_THUMBNAIL_OUTPUT_WIDTH,
);
const COMPONENT_THUMBNAIL_TARGET_BYTES = 128 * 1024;
const COMPONENT_THUMBNAIL_WEBP_QUALITIES = [0.72, 0.52] as const;
const COMPONENT_THUMBNAIL_CAPTURE_TIMEOUT_MS = 15_000;
const COMPONENT_THUMBNAIL_IMAGE_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ZkAAAAASUVORK5CYII=";
const COMPONENT_THUMBNAIL_BLANK_SAMPLE_WIDTH = 48;
const COMPONENT_THUMBNAIL_BLANK_SAMPLE_HEIGHT = 27;
const COMPONENT_THUMBNAIL_BLANK_WHITE_MIN_LUMINANCE = 252;
const COMPONENT_THUMBNAIL_BLANK_WHITE_MAX_RANGE = 2;

const ComponentThumbnailGenerationRequestSchema = z.object({
  componentId: ComponentThumbnailIdSchema,
});

export type ComponentThumbnailGenerationRequest = z.infer<
  typeof ComponentThumbnailGenerationRequestSchema
>;

interface ComponentThumbnailGeneratorDeps {
  document: Document;
  fetch: typeof fetch;
  toCanvas: typeof toCanvas;
  getComputedStyle?: typeof getComputedStyle;
}

function resolveFetch(impl?: typeof fetch): typeof fetch {
  return impl ?? globalThis.fetch.bind(globalThis);
}

function formatCaptureError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

class BlankComponentThumbnailError extends Error {
  constructor(message = "Component thumbnail capture was blank") {
    super(message);
    this.name = "BlankComponentThumbnailError";
  }
}

/**
 * Strip cross-origin font assets from snapshot HTML before rasterising.
 * html-to-image embeds fonts during capture; Google Fonts cause SecurityError
 * / tainted canvas failures.
 */
function sanitizeSnapshotHtmlForCapture(html: string): string {
  return extractComponentSnapshotRenderableHtml(html)
    .replace(
      /@import\s+url\(["']?https:\/\/fonts\.(?:googleapis|gstatic)\.com[^)]+\)["']?\s*;?/gi,
      "",
    )
    .replace(
      /\s*<link[^>]+href=["']https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"']*["'][^>]*>/gi,
      "",
    )
    .replace(
      /\s*<link[^>]+rel=["']preconnect["'][^>]+href=["']https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"']*["'][^>]*>/gi,
      "",
    );
}

function resolveFrameGetComputedStyle(
  frame: HTMLIFrameElement,
  getComputedStyleImpl?: typeof getComputedStyle,
): typeof getComputedStyle {
  const frameWindow = frame.contentWindow;
  if (!frameWindow) {
    return getComputedStyleImpl ?? getComputedStyle;
  }

  return frameWindow.getComputedStyle.bind(frameWindow);
}

function createCaptureOptions(
  backgroundColor = "#ffffff",
): NonNullable<Parameters<typeof toCanvas>[1]> {
  const captureViewportHeight = COMPONENT_THUMBNAIL_CAPTURE_HEIGHT;

  return {
    backgroundColor,
    width: COMPONENT_THUMBNAIL_CAPTURE_LAYOUT_WIDTH,
    height: captureViewportHeight,
    canvasWidth: COMPONENT_THUMBNAIL_OUTPUT_WIDTH,
    canvasHeight: COMPONENT_THUMBNAIL_OUTPUT_HEIGHT,
    pixelRatio: 1,
    cacheBust: true,
    skipFonts: true,
    imagePlaceholder: COMPONENT_THUMBNAIL_IMAGE_PLACEHOLDER,
    onImageErrorHandler: () => undefined,
    fetchRequestInit: {
      credentials: "same-origin",
    },
  };
}

function buildComponentSnapshotCaptureUrl(
  componentId: string,
  options: { forceRefresh?: boolean } = {},
): string {
  const snapshotUrl = new URL(
    buildComponentSnapshotPreviewUrl({
      componentId,
      inert: true,
    }),
    typeof window !== "undefined" ? window.location.origin : "http://localhost",
  );

  if (options.forceRefresh) {
    snapshotUrl.searchParams.set("refresh", "1");
  }

  return `${snapshotUrl.pathname}${snapshotUrl.search}`;
}

async function readSnapshotHtml(
  fetchImpl: typeof fetch,
  componentId: string,
  options: { forceRefresh?: boolean } = {},
): Promise<string> {
  const response = await fetchImpl(buildComponentSnapshotCaptureUrl(componentId, options), {
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "text/html",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch snapshot HTML (${response.status})`);
  }

  return await response.text();
}

function waitForFrameLoad(frame: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for thumbnail capture frame"));
    }, COMPONENT_THUMBNAIL_CAPTURE_TIMEOUT_MS);

    const handleLoad = (): void => {
      cleanup();
      resolve();
    };

    const handleError = (): void => {
      cleanup();
      reject(new Error("Failed to load thumbnail capture frame"));
    };

    const cleanup = (): void => {
      window.clearTimeout(timeoutId);
      frame.removeEventListener("load", handleLoad);
      frame.removeEventListener("error", handleError);
    };

    frame.addEventListener("load", handleLoad, { once: true });
    frame.addEventListener("error", handleError, { once: true });
  });
}

function isFrameHTMLElement(
  value: Element | null | undefined,
  frameDocument: Document,
): value is HTMLElement {
  const frameWindow = frameDocument.defaultView;
  if (frameWindow?.HTMLElement) {
    return value instanceof frameWindow.HTMLElement;
  }

  return value instanceof HTMLElement;
}

async function waitForImages(
  root: Pick<ParentNode, "querySelectorAll">,
): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));

  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }

          const finalize = (): void => {
            image.removeEventListener("load", finalize);
            image.removeEventListener("error", finalize);
            resolve();
          };

          image.addEventListener("load", finalize, { once: true });
          image.addEventListener("error", finalize, { once: true });
        }),
    ),
  );
}

async function waitForComponentPreviewRoot(
  frame: HTMLIFrameElement,
  timeoutMs = COMPONENT_THUMBNAIL_CAPTURE_TIMEOUT_MS,
): Promise<HTMLElement> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const frameDocument = frame.contentDocument;
    const previewRoot = frameDocument?.querySelector(COMPONENT_PREVIEW_ROOT_SELECTOR);

    if (frameDocument && isFrameHTMLElement(previewRoot, frameDocument)) {
      return previewRoot;
    }

    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 16);
    });
  }

  throw new Error("Component preview root is unavailable");
}

async function waitForFramePaint(frame: HTMLIFrameElement): Promise<void> {
  const frameWindow = frame.contentWindow;
  const frameDocument = frame.contentDocument;

  if (!frameWindow || !frameDocument || !frameDocument.body) {
    throw new Error("Thumbnail capture frame is unavailable");
  }

  if (frameDocument.fonts?.ready) {
    try {
      await frameDocument.fonts.ready;
    } catch {
      // Ignore font readiness failures and continue with capture.
    }
  }

  await waitForImages(frameDocument.body);

  revealAriaMotionForCapture(frameDocument.body);
  await waitForMotionSettle(frameDocument.body);
  await waitForFiniteAnimations(frameDocument, frameDocument.body);

  await new Promise<void>((resolve) => {
    frameWindow.requestAnimationFrame(() => {
      frameWindow.requestAnimationFrame(() => resolve());
    });
  });
}

function createCaptureFrame(documentRef: Document): HTMLIFrameElement {
  const frame = documentRef.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.style.position = "fixed";
  frame.style.left = "-20000px";
  frame.style.top = "0";
  frame.style.width = `${COMPONENT_THUMBNAIL_CAPTURE_LAYOUT_WIDTH}px`;
  frame.style.height = `${COMPONENT_THUMBNAIL_CAPTURE_LAYOUT_HEIGHT}px`;
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  frame.style.border = "0";
  return frame;
}

function isTransparentColor(value: string | null | undefined): boolean {
  if (typeof value !== "string") {
    return true;
  }

  const normalized = value.trim().toLowerCase().replace(/\s+/g, "");
  return (
    normalized.length === 0 ||
    normalized === "transparent" ||
    normalized === "rgba(0,0,0,0)" ||
    normalized === "rgb(0,0,0,0)" ||
    normalized === "rgb(0 0 0/0)"
  );
}

function readCaptureBackgroundStyles(
  node: HTMLElement,
  getComputedStyleImpl: typeof getComputedStyle,
): {
  background: string;
  backgroundColor: string;
  backgroundImage: string;
} {
  try {
    const computedStyle = getComputedStyleImpl(node);
    return {
      background: computedStyle.background,
      backgroundColor: computedStyle.backgroundColor,
      backgroundImage: computedStyle.backgroundImage,
    };
  } catch {
    return {
      background: "",
      backgroundColor: "",
      backgroundImage: "none",
    };
  }
}

function resolveCaptureBackgroundColor(
  root: HTMLElement,
  body: HTMLElement,
  getComputedStyleImpl: typeof getComputedStyle,
): string {
  const rootComputedStyle = readCaptureBackgroundStyles(
    root,
    getComputedStyleImpl,
  );
  const bodyComputedStyle = readCaptureBackgroundStyles(
    body,
    getComputedStyleImpl,
  );
  const rootBackgroundColor = rootComputedStyle.backgroundColor;
  const bodyBackgroundColor = bodyComputedStyle.backgroundColor;
  const rootHasBackgroundImage = rootComputedStyle.backgroundImage !== "none";
  const bodyHasBackgroundImage = bodyComputedStyle.backgroundImage !== "none";

  if (
    !rootHasBackgroundImage &&
    isTransparentColor(rootBackgroundColor) &&
    (bodyHasBackgroundImage || !isTransparentColor(bodyBackgroundColor))
  ) {
    root.style.background = bodyComputedStyle.background;
  }

  if (!isTransparentColor(rootBackgroundColor)) {
    return rootBackgroundColor;
  }

  if (!isTransparentColor(bodyBackgroundColor)) {
    return bodyBackgroundColor;
  }

  return "#ffffff";
}

function sanitizeVideosForCapture(
  frameDocument: Document,
  getComputedStyleImpl: typeof getComputedStyle,
): void {
  const videos = Array.from(frameDocument.querySelectorAll("video"));

  for (const video of videos) {
    let computed: CSSStyleDeclaration;

    try {
      computed = getComputedStyleImpl(video);
    } catch {
      continue;
    }

    const placeholder = frameDocument.createElement("div");

    placeholder.style.display =
      computed.display === "inline"
        ? "inline-block"
        : computed.display || "block";
    placeholder.style.width = computed.width;
    placeholder.style.height = computed.height;
    placeholder.style.aspectRatio = computed.aspectRatio;
    placeholder.style.objectFit = computed.objectFit;
    placeholder.style.objectPosition = computed.objectPosition;
    placeholder.style.minWidth = computed.minWidth;
    placeholder.style.minHeight = computed.minHeight;
    placeholder.style.maxWidth = computed.maxWidth;
    placeholder.style.maxHeight = computed.maxHeight;
    placeholder.style.borderRadius = computed.borderRadius;
    placeholder.style.backgroundColor = "rgba(128, 128, 128, 0.15)";

    const poster = video.getAttribute("poster");
    if (poster) {
      placeholder.style.backgroundImage = `url("${poster}")`;
      placeholder.style.backgroundSize = computed.objectFit || "cover";
      placeholder.style.backgroundPosition =
        computed.objectPosition || "center";
      placeholder.style.backgroundRepeat = "no-repeat";
    }

    video.replaceWith(placeholder);
  }
}

function sanitizeBrokenImagesForCapture(frameDocument: Document): void {
  const images = Array.from(frameDocument.querySelectorAll("img"));

  for (const image of images) {
    if (image.complete && image.naturalWidth === 0) {
      image.removeAttribute("src");
      image.removeAttribute("srcset");
    }
  }
}

function isPreviewRootEmpty(previewRoot: HTMLElement): boolean {
  if (previewRoot.children.length > 0) {
    return false;
  }

  return (previewRoot.textContent ?? "").trim().length === 0;
}

function prepareCaptureDocument(
  frame: HTMLIFrameElement,
  getComputedStyleImpl: typeof getComputedStyle,
): {
  captureNode: HTMLElement;
  backgroundColor: string;
} {
  const frameDocument = frame.contentDocument;

  if (!frameDocument?.body) {
    throw new Error("Thumbnail capture document is unavailable");
  }

  const root = frameDocument.documentElement;
  const body = frameDocument.body;
  const previewRoot = frameDocument.querySelector(
    COMPONENT_PREVIEW_ROOT_SELECTOR,
  );

  if (!isFrameHTMLElement(previewRoot, frameDocument)) {
    throw new Error("Component preview root is unavailable");
  }

  if (isPreviewRootEmpty(previewRoot)) {
    throw new BlankComponentThumbnailError(
      "Component preview root has no rendered content",
    );
  }

  const freezeStyle = frameDocument.createElement("style");
  freezeStyle.setAttribute("data-capture-freeze", "");
  freezeStyle.textContent = `
    *, *::before, *::after {
      animation: none !important;
      transition: none !important;
    }
    [style*="opacity: 0"],
    [style*="opacity:0"] {
      opacity: 1 !important;
    }
    ${buildMotionThumbnailCaptureCss()}
  `;
  frameDocument.head.appendChild(freezeStyle);

  root.style.width = `${COMPONENT_THUMBNAIL_CAPTURE_LAYOUT_WIDTH}px`;
  root.style.minWidth = `${COMPONENT_THUMBNAIL_CAPTURE_LAYOUT_WIDTH}px`;
  root.style.minHeight = "auto";
  root.style.height = "auto";
  root.style.overflow = "hidden";

  body.style.width = `${COMPONENT_THUMBNAIL_CAPTURE_LAYOUT_WIDTH}px`;
  body.style.minWidth = `${COMPONENT_THUMBNAIL_CAPTURE_LAYOUT_WIDTH}px`;
  body.style.minHeight = "auto";
  body.style.height = "auto";
  body.style.margin = "0";
  body.style.overflow = "visible";

  sanitizeVideosForCapture(frameDocument, getComputedStyleImpl);
  sanitizeBrokenImagesForCapture(frameDocument);

  const contentHeight = Math.min(
    Math.max(
      previewRoot.scrollHeight,
      previewRoot.offsetHeight,
      body.scrollHeight,
      root.scrollHeight,
      1,
    ),
    COMPONENT_THUMBNAIL_CAPTURE_HEIGHT,
  );
  const captureHeight = Math.max(contentHeight, COMPONENT_THUMBNAIL_CAPTURE_HEIGHT);

  root.style.height = `${captureHeight}px`;
  root.style.maxHeight = `${COMPONENT_THUMBNAIL_CAPTURE_HEIGHT}px`;
  root.style.overflow = "hidden";
  body.style.minHeight = `${captureHeight}px`;

  return {
    captureNode: root,
    backgroundColor: resolveCaptureBackgroundColor(
      root,
      body,
      getComputedStyleImpl,
    ),
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to encode thumbnail canvas"));
          return;
        }

        resolve(blob);
      },
      type,
      quality,
    );
  });
}

function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
  if (typeof globalThis.CanvasRenderingContext2D === "undefined") {
    return false;
  }

  const sourceWidth = canvas.width;
  const sourceHeight = canvas.height;

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return true;
  }

  const sampleCanvas = document.createElement("canvas");
  const sampleWidth = Math.min(
    COMPONENT_THUMBNAIL_BLANK_SAMPLE_WIDTH,
    sourceWidth,
  );
  const sampleHeight = Math.min(
    COMPONENT_THUMBNAIL_BLANK_SAMPLE_HEIGHT,
    sourceHeight,
  );
  sampleCanvas.width = sampleWidth;
  sampleCanvas.height = sampleHeight;

  const sampleContext = sampleCanvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!sampleContext) {
    return false;
  }

  sampleContext.drawImage(
    canvas,
    0,
    0,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sampleWidth,
    sampleHeight,
  );

  const { data } = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight);
  let opaquePixels = 0;
  let minLuminance = 255;
  let maxLuminance = 0;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] ?? 0;
    if (alpha < 8) {
      continue;
    }

    const luminance =
      ((data[index] ?? 0) + (data[index + 1] ?? 0) + (data[index + 2] ?? 0)) /
      3;
    minLuminance = Math.min(minLuminance, luminance);
    maxLuminance = Math.max(maxLuminance, luminance);
    opaquePixels += 1;
  }

  return (
    opaquePixels === 0 ||
    (minLuminance >= COMPONENT_THUMBNAIL_BLANK_WHITE_MIN_LUMINANCE &&
      maxLuminance - minLuminance <= COMPONENT_THUMBNAIL_BLANK_WHITE_MAX_RANGE)
  );
}

async function renderThumbnailBlob(
  deps: Pick<ComponentThumbnailGeneratorDeps, "toCanvas">,
  node: HTMLElement,
  backgroundColor?: string,
): Promise<Blob> {
  const options = createCaptureOptions(backgroundColor);
  const canvas = await deps.toCanvas(node, options);

  if (isCanvasBlank(canvas)) {
    throw new BlankComponentThumbnailError();
  }

  try {
    for (const quality of COMPONENT_THUMBNAIL_WEBP_QUALITIES) {
      const webpBlob = await canvasToBlob(canvas, "image/webp", quality);

      if (
        webpBlob.size <= COMPONENT_THUMBNAIL_TARGET_BYTES ||
        quality ===
          COMPONENT_THUMBNAIL_WEBP_QUALITIES[
            COMPONENT_THUMBNAIL_WEBP_QUALITIES.length - 1
          ]
      ) {
        return webpBlob;
      }
    }
  } catch {
    return await canvasToBlob(canvas, "image/png");
  }

  return await canvasToBlob(canvas, "image/png");
}

async function uploadThumbnail(
  request: ComponentThumbnailGenerationRequest,
  blob: Blob,
): Promise<string> {
  const mimeType = blob.type === "image/png" ? "image/png" : "image/webp";
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  const result = await actions.components.saveThumbnail({
    componentId: request.componentId,
    mimeType,
    fileBase64: btoa(binary),
  });

  const payload =
    result &&
    typeof result === "object" &&
    "data" in result &&
    !("success" in result)
      ? result.data
      : result;
  const parsed = ComponentThumbnailSaveResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new Error("Failed to parse thumbnail save response");
  }

  const thumbnailUrl = parsed.data.data.thumbnailUrl;
  const normalizedUrl = new URL(
    thumbnailUrl,
    typeof window !== "undefined" ? window.location.origin : "http://localhost",
  );
  normalizedUrl.searchParams.set("cv", String(Date.now()));
  return `${normalizedUrl.pathname}${normalizedUrl.search}`;
}

async function captureComponentThumbnail(
  request: ComponentThumbnailGenerationRequest,
  deps: ComponentThumbnailGeneratorDeps,
  options: { forceRefresh?: boolean } = {},
): Promise<string | null> {
  const frame = createCaptureFrame(deps.document);

  try {
    const snapshotHtml = sanitizeSnapshotHtmlForCapture(
      await readSnapshotHtml(deps.fetch, request.componentId, options),
    );
    const loadPromise = waitForFrameLoad(frame);
    frame.srcdoc = snapshotHtml;
    deps.document.body.appendChild(frame);
    await loadPromise;
    await waitForComponentPreviewRoot(frame);
    await waitForFramePaint(frame);

    const getComputedStyleImpl = resolveFrameGetComputedStyle(
      frame,
      deps.getComputedStyle,
    );
    const { captureNode, backgroundColor } =
      prepareCaptureDocument(frame, getComputedStyleImpl);
    const blob = await renderThumbnailBlob(
      deps,
      captureNode,
      backgroundColor,
    );

    return await uploadThumbnail(request, blob);
  } catch (error) {
    const logMethod =
      error instanceof BlankComponentThumbnailError ? console.info : console.error;
    logMethod("[componentThumbnailGenerator] Failed to generate thumbnail", {
      componentId: request.componentId,
      error: formatCaptureError(error),
    });
    return null;
  } finally {
    frame.remove();
  }
}

export function createComponentThumbnailGenerator(
  deps: ComponentThumbnailGeneratorDeps = {
    document,
    fetch,
    toCanvas: lazyToCanvas,
    getComputedStyle,
  },
): {
  ensureComponentThumbnail: (
    input: ComponentThumbnailGenerationRequest,
    options?: { forceRefresh?: boolean },
  ) => Promise<string | null>;
  regenerateComponentThumbnail: (
    input: ComponentThumbnailGenerationRequest,
  ) => Promise<string | null>;
} {
  const inFlightGenerations = new Map<string, Promise<string | null>>();

  const ensureComponentThumbnail = async (
    rawInput: ComponentThumbnailGenerationRequest,
    options: { forceRefresh?: boolean } = {},
  ): Promise<string | null> => {
    const input = ComponentThumbnailGenerationRequestSchema.parse(rawInput);
    const generationKey = `${input.componentId}:${options.forceRefresh ? "refresh" : "cache"}`;
    const existingGeneration = inFlightGenerations.get(generationKey);

    if (existingGeneration) {
      return await existingGeneration;
    }

    const generationPromise = acquireThumbnailGenerationSlot(() =>
      captureComponentThumbnail(input, deps, options),
    );

    inFlightGenerations.set(generationKey, generationPromise);

    try {
      return await generationPromise;
    } finally {
      inFlightGenerations.delete(generationKey);
    }
  };

  const regenerateComponentThumbnail = async (
    rawInput: ComponentThumbnailGenerationRequest,
  ): Promise<string | null> => {
    return await ensureComponentThumbnail(rawInput, { forceRefresh: true });
  };

  return {
    ensureComponentThumbnail,
    regenerateComponentThumbnail,
  };
}

const defaultComponentThumbnailGenerator = isThumbnailCaptureSupported()
  ? createComponentThumbnailGenerator()
  : null;

export async function ensureComponentThumbnail(
  request: ComponentThumbnailGenerationRequest,
  deps: Partial<ComponentThumbnailGeneratorDeps> = {},
  options: { forceRefresh?: boolean } = {},
): Promise<string | null> {
  const parsed = ComponentThumbnailGenerationRequestSchema.safeParse(request);
  if (!parsed.success || !isThumbnailCaptureSupported()) {
    return null;
  }

  if (Object.keys(deps).length > 0) {
    return await createComponentThumbnailGenerator({
      document: deps.document ?? document,
      fetch: resolveFetch(deps.fetch),
      toCanvas: deps.toCanvas ?? lazyToCanvas,
      getComputedStyle: deps.getComputedStyle ?? getComputedStyle,
    }).ensureComponentThumbnail(parsed.data, options);
  }

  if (!defaultComponentThumbnailGenerator) {
    return null;
  }

  return await defaultComponentThumbnailGenerator.ensureComponentThumbnail(
    parsed.data,
    options,
  );
}

export async function regenerateComponentThumbnail(
  request: ComponentThumbnailGenerationRequest,
  deps: Partial<ComponentThumbnailGeneratorDeps> = {},
): Promise<string | null> {
  const parsed = ComponentThumbnailGenerationRequestSchema.safeParse(request);
  if (!parsed.success || !isThumbnailCaptureSupported()) {
    return null;
  }

  if (Object.keys(deps).length > 0) {
    return await createComponentThumbnailGenerator({
      document: deps.document ?? document,
      fetch: resolveFetch(deps.fetch),
      toCanvas: deps.toCanvas ?? lazyToCanvas,
      getComputedStyle: deps.getComputedStyle ?? getComputedStyle,
    }).regenerateComponentThumbnail(parsed.data);
  }

  if (!defaultComponentThumbnailGenerator) {
    return null;
  }

  return await defaultComponentThumbnailGenerator.regenerateComponentThumbnail(
    parsed.data,
  );
}
