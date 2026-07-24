import type { toCanvas } from "html-to-image";
import { actions } from "astro:actions";
import { z } from "zod";

import {
  PageThumbnailPageIdSchema,
  PageThumbnailSaveResponseSchema,
} from "@/lib/rendering/pageThumbnails";
import {
  PageSnapshotStageSchema,
  type PageSnapshotStage,
} from "@/lib/rendering/pageSnapshots";
import {
  buildMotionThumbnailCaptureCss,
  revealAriaMotionForCapture,
  waitForFiniteAnimations,
  waitForMotionSettle,
} from "@/lib/motion/capture";
import { isThumbnailCaptureSupported } from "../utils/deviceCapabilities";
import { acquireThumbnailGenerationSlot } from "./thumbnailGenerationQueue";

// Lazy-load html-to-image so PagesView (grid) does not hard-depend on the
// pre-bundled dep at route navigation time — avoids Vite "Outdated Optimize
// Dep" taking down the whole /pages route when the dep hash changes.
let toCanvasModulePromise: Promise<typeof import("html-to-image")> | null =
  null;

const lazyToCanvas: typeof toCanvas = async (node, options) => {
  if (!toCanvasModulePromise) {
    toCanvasModulePromise = import("html-to-image");
  }
  const mod = await toCanvasModulePromise;
  return mod.toCanvas(node, options);
};

/** Desktop layout width used when rasterising snapshot HTML. */
const PAGE_THUMBNAIL_CAPTURE_LAYOUT_WIDTH = 1280;
/** Stored thumbnail width (height derived to preserve capture aspect ratio). */
const PAGE_THUMBNAIL_OUTPUT_WIDTH = 640;
/** 16:9 output height — matches grid card `aspect-video`. */
const PAGE_THUMBNAIL_OUTPUT_HEIGHT = 360;
/** Max vertical slice at layout width (16:9 of 1280px). */
const PAGE_THUMBNAIL_CAPTURE_HEIGHT = Math.round(
  (PAGE_THUMBNAIL_CAPTURE_LAYOUT_WIDTH * PAGE_THUMBNAIL_OUTPUT_HEIGHT) /
    PAGE_THUMBNAIL_OUTPUT_WIDTH,
);
const PAGE_THUMBNAIL_CAPTURE_LAYOUT_HEIGHT = 2500;
const PAGE_THUMBNAIL_TARGET_BYTES = 128 * 1024;
const PAGE_THUMBNAIL_WEBP_QUALITIES = [0.72, 0.52] as const;
const PAGE_THUMBNAIL_CAPTURE_TIMEOUT_MS = 15_000;
/** 1×1 transparent PNG — used when snapshot images fail to load during capture. */
const PAGE_THUMBNAIL_IMAGE_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ZkAAAAASUVORK5CYII=";

const PageThumbnailGenerationRequestSchema = z.object({
  pageId: PageThumbnailPageIdSchema,
  pageSlug: z.string().trim().min(1),
  stage: PageSnapshotStageSchema,
});

export type PageThumbnailGenerationRequest = z.infer<
  typeof PageThumbnailGenerationRequestSchema
>;

interface PageThumbnailGeneratorDeps {
  document: Document;
  fetch: typeof fetch;
  toCanvas: typeof toCanvas;
  getComputedStyle?: typeof getComputedStyle;
}

function buildSnapshotCaptureUrl(
  pageSlug: string,
  stage: PageSnapshotStage,
  options: { forceRefresh?: boolean } = {},
): string {
  const searchParams = new URLSearchParams({
    stage,
    thumb: "1",
  });

  if (options.forceRefresh) {
    searchParams.set("refresh", "1");
  }

  return `/admin/api/page-snapshots/${encodeURIComponent(pageSlug)}?${searchParams.toString()}`;
}

function appendCacheBust(url: string): string {
  const normalizedUrl = new URL(
    url,
    typeof window !== "undefined" ? window.location.origin : "http://localhost",
  );

  normalizedUrl.searchParams.set("cv", String(Date.now()));
  return `${normalizedUrl.pathname}${normalizedUrl.search}`;
}

function isEventLikeError(
  error: unknown,
): error is { type?: unknown; target?: unknown; isTrusted?: unknown } {
  return (
    typeof error === "object" &&
    error !== null &&
    ("isTrusted" in error || "type" in error || "target" in error)
  );
}

function describeEventTarget(target: unknown): string {
  if (typeof Element !== "undefined" && target instanceof Element) {
    return target.tagName.toLowerCase();
  }

  if (typeof Window !== "undefined" && target instanceof Window) {
    return "window";
  }

  if (
    typeof target === "object" &&
    target !== null &&
    "tagName" in target &&
    typeof target.tagName === "string"
  ) {
    return target.tagName.toLowerCase();
  }

  return "unknown";
}

function formatCaptureError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    (typeof Event !== "undefined" && error instanceof Event) ||
    isEventLikeError(error)
  ) {
    const eventType =
      isEventLikeError(error) && typeof error.type === "string"
        ? error.type
        : "error";
    const eventTarget = isEventLikeError(error)
      ? describeEventTarget(error.target)
      : "unknown";
    return `Browser ${eventType} event during thumbnail capture (target: ${eventTarget})`;
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

/**
 * Strip cross-origin font @imports from snapshot HTML before rasterising.
 * html-to-image embeds fonts during capture; Google Fonts @imports in.
 */
function sanitizeSnapshotHtmlForCapture(html: string): string {
  return html
    .replace(/\s*<script\b[\s\S]*?<\/script>/gi, "")
    .replace(
      /\s*<link\b(?=[^>]*\brel=["'](?:icon|modulepreload)["'])[^>]*>/gi,
      "",
    )
    .replace(
      /@import\s+url\(["']?https:\/\/fonts\.(?:googleapis|gstatic)\.com[^)]+\)["']?\s*;?/gi,
      "",
    )
    .replace(
      /\s*<link[^>]+href=["']https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"']*["'][^>]*>/gi,
      "",
    );
}

function resolveFrameGetComputedStyle(
  frame: HTMLIFrameElement,
): typeof getComputedStyle {
  const frameWindow = frame.contentWindow;
  if (!frameWindow) {
    return getComputedStyle;
  }

  return frameWindow.getComputedStyle.bind(frameWindow);
}

function createCaptureOptions(
  backgroundColor = "#ffffff",
  captureHeight?: number,
): NonNullable<Parameters<typeof toCanvas>[1]> {
  const layoutWidth = PAGE_THUMBNAIL_CAPTURE_LAYOUT_WIDTH;
  const layoutHeight =
    typeof captureHeight === "number" && captureHeight > 0
      ? Math.min(captureHeight, PAGE_THUMBNAIL_CAPTURE_HEIGHT)
      : PAGE_THUMBNAIL_CAPTURE_HEIGHT;
  const outputScale = PAGE_THUMBNAIL_OUTPUT_WIDTH / layoutWidth;

  return {
    backgroundColor,
    width: layoutWidth,
    height: layoutHeight,
    canvasWidth: PAGE_THUMBNAIL_OUTPUT_WIDTH,
    canvasHeight: Math.max(1, Math.round(layoutHeight * outputScale)),
    pixelRatio: 1,
    cacheBust: true,
    skipFonts: true,
    imagePlaceholder: PAGE_THUMBNAIL_IMAGE_PLACEHOLDER,
    onImageErrorHandler: () => undefined,
    fetchRequestInit: {
      credentials: "same-origin",
    },
  };
}

async function readSnapshotHtml(
  fetchImpl: typeof fetch,
  input: PageThumbnailGenerationRequest,
  options: { forceRefresh?: boolean } = {},
): Promise<string> {
  const response = await fetchImpl(
    buildSnapshotCaptureUrl(input.pageSlug, input.stage, options),
    {
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "text/html",
      },
    },
  );

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
    }, PAGE_THUMBNAIL_CAPTURE_TIMEOUT_MS);

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
  frame.style.width = `${PAGE_THUMBNAIL_CAPTURE_LAYOUT_WIDTH}px`;
  frame.style.height = `${PAGE_THUMBNAIL_CAPTURE_LAYOUT_HEIGHT}px`;
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

/**
 * Replace video elements with layout-preserving placeholders. Video elements
 * with external src URLs taint the canvas, making.
 */
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

    // Try to preserve a poster preview if available
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

function prepareCaptureDocument(frame: HTMLIFrameElement): {
  captureNode: HTMLElement;
  backgroundColor: string;
  captureHeight: number;
} {
  const frameDocument = frame.contentDocument;

  if (!frameDocument?.body) {
    throw new Error("Thumbnail capture document is unavailable");
  }

  // Inject a style tag that disables animations/transitions and forces
  // elements that are hidden via opacity: 0 to become visible. This acts
  // as a safety net for any animations that didn't complete or elements
  // set to opacity: 0 via inline styles rather than CSS animations.
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

  const getComputedStyleImpl = resolveFrameGetComputedStyle(frame);
  const root = frameDocument.documentElement;
  const body = frameDocument.body;

  // Fix width to desktop viewport but let height flow naturally
  root.style.width = `${PAGE_THUMBNAIL_CAPTURE_LAYOUT_WIDTH}px`;
  root.style.minWidth = `${PAGE_THUMBNAIL_CAPTURE_LAYOUT_WIDTH}px`;
  root.style.minHeight = "auto";
  root.style.height = "auto";
  root.style.overflow = "hidden";

  body.style.width = `${PAGE_THUMBNAIL_CAPTURE_LAYOUT_WIDTH}px`;
  body.style.minWidth = `${PAGE_THUMBNAIL_CAPTURE_LAYOUT_WIDTH}px`;
  body.style.minHeight = "auto";
  body.style.height = "auto";
  body.style.margin = "0";
  body.style.overflow = "visible";

  // Force any remaining opacity: 0 inline styles to become visible.
  // getAnimations() may not catch elements whose opacity is set via
  // inline style rather than CSS keyframes.
  const allElements = frameDocument.querySelectorAll<HTMLElement>("*");
  for (const el of allElements) {
    if (el.style.opacity === "0") {
      el.style.opacity = "1";
    }
  }

  sanitizeVideosForCapture(frameDocument, getComputedStyleImpl);
  sanitizeBrokenImagesForCapture(frameDocument);

  // Measure natural content height and expand root to fit (capped for capture).
  const contentHeight = Math.min(
    Math.max(body.scrollHeight, root.scrollHeight),
    PAGE_THUMBNAIL_CAPTURE_HEIGHT,
  );
  root.style.height = `${contentHeight}px`;
  root.style.maxHeight = `${PAGE_THUMBNAIL_CAPTURE_HEIGHT}px`;
  root.style.overflow = "hidden";
  body.style.height = `${contentHeight}px`;
  body.style.maxHeight = `${PAGE_THUMBNAIL_CAPTURE_HEIGHT}px`;
  body.style.overflow = "hidden";

  return {
    captureNode: body,
    captureHeight: contentHeight,
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

async function renderThumbnailBlob(
  deps: Pick<PageThumbnailGeneratorDeps, "toCanvas">,
  node: HTMLElement,
  backgroundColor?: string,
  captureHeight?: number,
): Promise<Blob> {
  const options = createCaptureOptions(backgroundColor, captureHeight);
  const canvas = await deps.toCanvas(node, options);

  try {
    for (const quality of PAGE_THUMBNAIL_WEBP_QUALITIES) {
      const webpBlob = await canvasToBlob(canvas, "image/webp", quality);

      if (
        webpBlob.size <= PAGE_THUMBNAIL_TARGET_BYTES ||
        quality ===
          PAGE_THUMBNAIL_WEBP_QUALITIES[
            PAGE_THUMBNAIL_WEBP_QUALITIES.length - 1
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

function createUploadFile(blob: Blob): File {
  const mimeType = blob.type === "image/png" ? "image/png" : "image/webp";
  const extension = mimeType === "image/png" ? "png" : "webp";

  return new File([blob], `page-thumbnail.${extension}`, {
    type: mimeType,
  });
}

async function uploadThumbnail(
  input: PageThumbnailGenerationRequest,
  file: File,
): Promise<string> {
  const formData = new FormData();
  formData.set("pageId", input.pageId);
  formData.set("stage", input.stage);
  formData.set("file", file);

  const result = await actions.pages.saveThumbnail(formData);
  if (result.error) {
    throw new Error(result.error.message);
  }
  const payload = PageThumbnailSaveResponseSchema.parse(result.data);
  return appendCacheBust(payload.data.thumbnailUrl);
}

async function deleteThumbnail(
  input: PageThumbnailGenerationRequest,
): Promise<void> {
  const result = await actions.pages.deleteThumbnail({
    pageId: input.pageId,
    stage: input.stage,
  });
  if (result.error) {
    throw new Error(result.error.message);
  }
}

export function createPageThumbnailGenerator(
  deps: PageThumbnailGeneratorDeps = {
    document,
    fetch,
    toCanvas: lazyToCanvas,
    getComputedStyle,
  },
): {
  deletePageThumbnail: (input: PageThumbnailGenerationRequest) => Promise<void>;
  ensurePageThumbnail: (
    input: PageThumbnailGenerationRequest,
  ) => Promise<string | null>;
  regeneratePageThumbnail: (
    input: PageThumbnailGenerationRequest,
  ) => Promise<string | null>;
} {
  const inFlightGenerations = new Map<string, Promise<string | null>>();

  const deletePageThumbnail = async (
    rawInput: PageThumbnailGenerationRequest,
  ): Promise<void> => {
    const input = PageThumbnailGenerationRequestSchema.parse(rawInput);
    await deleteThumbnail(input);
  };

  const ensurePageThumbnail = async (
    rawInput: PageThumbnailGenerationRequest,
    options: { forceRefresh?: boolean } = {},
  ): Promise<string | null> => {
    const input = PageThumbnailGenerationRequestSchema.parse(rawInput);
    const generationKey = `${input.pageId}:${input.stage}:${options.forceRefresh ? "refresh" : "cache"}`;
    const existingGeneration = inFlightGenerations.get(generationKey);

    if (existingGeneration) {
      return await existingGeneration;
    }

    const generationPromise = acquireThumbnailGenerationSlot(async () => {
      const frame = createCaptureFrame(deps.document);

      try {
        const snapshotHtml = sanitizeSnapshotHtmlForCapture(
          await readSnapshotHtml(deps.fetch, input, options),
        );
        const loadPromise = waitForFrameLoad(frame);
        frame.srcdoc = snapshotHtml;
        deps.document.body.appendChild(frame);
        await loadPromise;
        await waitForFramePaint(frame);

        const { captureNode, backgroundColor, captureHeight } =
          prepareCaptureDocument(frame);
        const blob = await renderThumbnailBlob(
          deps,
          captureNode,
          backgroundColor,
          captureHeight,
        );
        const file = createUploadFile(blob);
        return await uploadThumbnail(input, file);
      } catch (error) {
        console.error("[pageThumbnailGenerator] Failed to generate thumbnail", {
          pageId: input.pageId,
          pageSlug: input.pageSlug,
          stage: input.stage,
          error: formatCaptureError(error),
        });
        return null;
      } finally {
        frame.remove();
      }
    });

    inFlightGenerations.set(generationKey, generationPromise);

    try {
      return await generationPromise;
    } finally {
      inFlightGenerations.delete(generationKey);
    }
  };

  const regeneratePageThumbnail = async (
    rawInput: PageThumbnailGenerationRequest,
  ): Promise<string | null> => {
    const input = PageThumbnailGenerationRequestSchema.parse(rawInput);
    return await ensurePageThumbnail(input, { forceRefresh: true });
  };

  return {
    deletePageThumbnail,
    ensurePageThumbnail,
    regeneratePageThumbnail,
  };
}

const defaultPageThumbnailGenerator = isThumbnailCaptureSupported()
  ? createPageThumbnailGenerator()
  : null;

export async function ensurePageThumbnail(
  input: PageThumbnailGenerationRequest,
): Promise<string | null> {
  if (!defaultPageThumbnailGenerator) {
    return null;
  }

  return await defaultPageThumbnailGenerator.ensurePageThumbnail(input);
}

export async function deletePageThumbnail(
  input: PageThumbnailGenerationRequest,
): Promise<void> {
  if (!defaultPageThumbnailGenerator) {
    return;
  }

  await defaultPageThumbnailGenerator.deletePageThumbnail(input);
}

export async function regeneratePageThumbnail(
  input: PageThumbnailGenerationRequest,
): Promise<string | null> {
  if (!defaultPageThumbnailGenerator) {
    return null;
  }

  return await defaultPageThumbnailGenerator.regeneratePageThumbnail(input);
}
