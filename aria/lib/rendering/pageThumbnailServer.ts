import { z } from "zod";

import type { AriaCloudflareEnv, RuntimeLocals } from "../cloudflare/env";
import type { StorageAdapter } from "../storage/adapter";
import {
  getPageSnapshotHtml,
  PageSnapshotStageSchema,
  savePageSnapshot,
  type PageSnapshotStage,
} from "./pageSnapshots";
import {
  PageThumbnailPageIdSchema,
} from "./pageThumbnails";
import {
  buildMotionThumbnailCaptureCss,
  revealAriaMotionForCaptureInBrowser,
} from "../motion/capture";

const CAPTURE_WIDTH = 1280;
const CAPTURE_HEIGHT = 720;
const OUTPUT_TYPE = "image/webp";
const LOCAL_OUTPUT_TYPE = "image/png";

type BrowserRunLike = {
  quickAction(action: "screenshot", options: unknown): Promise<Response>;
};

export const PageThumbnailJobMessageSchema = z.object({
  version: z.literal(1),
  pageId: PageThumbnailPageIdSchema,
  pageSlug: z.string().trim().min(1),
  stage: PageSnapshotStageSchema,
  force: z.boolean().optional(),
});

export type PageThumbnailJobMessage = z.infer<
  typeof PageThumbnailJobMessageSchema
>;

export const PageThumbnailJobResultSchema = z.object({
  success: z.boolean(),
  status: z.enum(["queued", "ready", "failed"]),
  pageId: PageThumbnailPageIdSchema,
  stage: PageSnapshotStageSchema,
  thumbnailUrl: z.string().optional(),
  error: z.string().optional(),
});

export type PageThumbnailJobResult = z.infer<
  typeof PageThumbnailJobResultSchema
>;

function sanitizeSnapshotHtmlForServerCapture(html: string): string {
  return html
    .replace(/\s*<script\b[\s\S]*?<\/script>/gi, "")
    .replace(
      /\s*<link\b(?=[^>]*\brel=["'](?:icon|modulepreload|preconnect)["'])[^>]*>/gi,
      "",
    )
    .replace(
      /@import\s+url\(["']?https:\/\/fonts\.(?:googleapis|gstatic)\.com[^)]+\)["']?\s*;?/gi,
      "",
    )
    .replace(
      /\s*<link[^>]+href=["']https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"']*["'][^>]*>/gi,
      "",
    )
    .replace(
      /<\/head>/i,
      `<style data-thumbnail-capture>
        *, *::before, *::after { animation: none !important; transition: none !important; }
        html, body { width: ${CAPTURE_WIDTH}px !important; min-width: ${CAPTURE_WIDTH}px !important; margin: 0 !important; overflow: hidden !important; }
        body { height: ${CAPTURE_HEIGHT}px !important; min-height: ${CAPTURE_HEIGHT}px !important; }
        img, video { max-width: 100%; }
        ${buildMotionThumbnailCaptureCss()}
      </style></head>`,
    );
}

async function loadSnapshotHtml(input: {
  adapter: StorageAdapter;
  locals?: RuntimeLocals;
  pageSlug: string;
  pageId: string;
  stage: PageSnapshotStage;
}): Promise<string> {
  const page =
    input.stage === "published"
      ? await input.adapter.getPublishedPageDSL(input.pageSlug)
      : await input.adapter.getPageDSL(input.pageSlug);

  if (!page) {
    throw new Error("Page not found for thumbnail generation");
  }

  await savePageSnapshot(
    {
      page,
      stage: input.stage,
    },
    input.adapter,
    { locals: input.locals },
  );

  const html = await getPageSnapshotHtml(
    page.slug ?? input.pageSlug,
    input.stage,
    input.adapter,
  );

  if (!html) {
    throw new Error("Snapshot HTML not found for thumbnail generation");
  }

  return sanitizeSnapshotHtmlForServerCapture(html);
}

function resolveBrowserRun(env?: AriaCloudflareEnv): BrowserRunLike | null {
  const candidate = env?.BROWSER;
  if (
    candidate &&
    typeof candidate === "object" &&
    "quickAction" in candidate &&
    typeof (candidate as BrowserRunLike).quickAction === "function"
  ) {
    return candidate as BrowserRunLike;
  }

  return null;
}

async function renderWithBrowserRun(
  browser: BrowserRunLike,
  html: string,
): Promise<Blob> {
  const response = await browser.quickAction("screenshot", {
    html,
    viewport: {
      width: CAPTURE_WIDTH,
      height: CAPTURE_HEIGHT,
      deviceScaleFactor: 1,
    },
    screenshotOptions: {
      type: "webp",
      quality: 72,
      clip: {
        x: 0,
        y: 0,
        width: CAPTURE_WIDTH,
        height: CAPTURE_HEIGHT,
      },
    },
  });

  if (!response.ok) {
    throw new Error(`Browser Run screenshot failed (${response.status})`);
  }

  return new Blob([await response.arrayBuffer()], {
    type: response.headers.get("content-type") || OUTPUT_TYPE,
  });
}

async function renderWithLocalPlaywright(html: string): Promise<Blob> {
  const dynamicImport = new Function(
    "specifier",
    "return import(specifier)",
  ) as (specifier: string) => Promise<unknown>;

  let chromium: {
    launch(options?: unknown): Promise<{
      newPage(options?: unknown): Promise<{
        setContent(html: string, options?: unknown): Promise<void>;
        evaluate(pageFunction: () => void): Promise<unknown>;
        screenshot(options?: unknown): Promise<Uint8Array>;
      }>;
      close(): Promise<void>;
    }>;
  };

  try {
    const mod = (await dynamicImport("playwright")) as {
      chromium?: typeof chromium;
    };
    if (!mod.chromium) {
      throw new Error("Playwright chromium export missing");
    }
    chromium = mod.chromium;
  } catch (error) {
    throw new Error(
      `Local thumbnail renderer requires Playwright (${error instanceof Error ? error.message : "module unavailable"})`,
    );
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT },
      deviceScaleFactor: 1,
    });
    await page.setContent(html, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    await page.evaluate(revealAriaMotionForCaptureInBrowser);
    const bytes = await page.screenshot({
      type: "png",
      clip: {
        x: 0,
        y: 0,
        width: CAPTURE_WIDTH,
        height: CAPTURE_HEIGHT,
      },
    });
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return new Blob([buffer], { type: LOCAL_OUTPUT_TYPE });
  } finally {
    await browser.close();
  }
}

export async function generatePageThumbnailOnServer(input: {
  adapter: StorageAdapter;
  env?: AriaCloudflareEnv;
  pageId: string;
  pageSlug: string;
  stage: PageSnapshotStage;
}): Promise<PageThumbnailJobResult> {
  const parsed = PageThumbnailJobMessageSchema.parse({
    version: 1,
    pageId: input.pageId,
    pageSlug: input.pageSlug,
    stage: input.stage,
  });

  try {
    const html = await loadSnapshotHtml({
      adapter: input.adapter,
      locals: input.env ? { cfBindings: input.env } : undefined,
      pageId: parsed.pageId,
      pageSlug: parsed.pageSlug,
      stage: parsed.stage,
    });
    const browserRun = resolveBrowserRun(input.env);
    const blob = browserRun
      ? await renderWithBrowserRun(browserRun, html)
      : await renderWithLocalPlaywright(html);
    const thumbnailUrl = await input.adapter.savePageThumbnail(
      parsed.pageId,
      blob,
      parsed.stage,
    );

    return PageThumbnailJobResultSchema.parse({
      success: true,
      status: "ready",
      pageId: parsed.pageId,
      stage: parsed.stage,
      thumbnailUrl,
    });
  } catch (error) {
    return PageThumbnailJobResultSchema.parse({
      success: false,
      status: "failed",
      pageId: parsed.pageId,
      stage: parsed.stage,
      error: error instanceof Error ? error.message : "Thumbnail generation failed",
    });
  }
}

export async function enqueueOrGeneratePageThumbnail(input: {
  adapter: StorageAdapter;
  locals?: RuntimeLocals;
  pageId: string;
  pageSlug: string;
  stage: PageSnapshotStage;
  force?: boolean;
}): Promise<PageThumbnailJobResult> {
  const env = input.locals?.cfBindings;
  const message = PageThumbnailJobMessageSchema.parse({
    version: 1,
    pageId: input.pageId,
    pageSlug: input.pageSlug,
    stage: input.stage,
    force: input.force,
  });

  if (env?.aria_thumbnail_queue) {
    await env.aria_thumbnail_queue.send(message);
    return PageThumbnailJobResultSchema.parse({
      success: true,
      status: "queued",
      pageId: message.pageId,
      stage: message.stage,
    });
  }

  return await generatePageThumbnailOnServer({
    adapter: input.adapter,
    env,
    pageId: message.pageId,
    pageSlug: message.pageSlug,
    stage: message.stage,
  });
}
