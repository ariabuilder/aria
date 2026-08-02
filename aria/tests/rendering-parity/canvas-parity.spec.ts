import { expect, test, type Frame, type Page } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { z } from "zod";

import {
  BrowserParityRuntimeSchema,
  BrowserParitySurfaceSnapshotSchema,
  BrowserParityViewportSchema,
  PHASE_2_EDITOR_DOM_EXCEPTIONS,
  type BrowserParityRuntime,
  type BrowserParitySurfaceSnapshot,
  type BrowserParityViewport,
} from "../../lib/rendering/canonical";
import { P0_CANVAS_PARITY_NODE_IDS } from "./p0CanvasFixture";
import { Z_INDEX } from "../../admin/lib/zIndex";
import {
  collectBrowserSurfaceSnapshot,
  type BrowserSnapshotCollectorInput,
} from "./browserSnapshotCollector";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844, deviceScaleFactor: 1 },
  {
    name: "breakpoint-minus-one",
    width: 767,
    height: 800,
    deviceScaleFactor: 1,
  },
  { name: "breakpoint", width: 768, height: 800, deviceScaleFactor: 1 },
  {
    name: "breakpoint-plus-one",
    width: 769,
    height: 800,
    deviceScaleFactor: 1,
  },
  { name: "desktop", width: 1280, height: 800, deviceScaleFactor: 1 },
].map((viewport) => BrowserParityViewportSchema.parse(viewport));

const GEOMETRY_TOLERANCE = 0.5;
const SCREENSHOT_PIXEL_THRESHOLD = 0.1;
// Same Chromium build and device scale, with up to 1.5% antialiasing/raster
// variance for equivalent content painted in a top-level document vs iframe.
const SCREENSHOT_MISMATCH_RATIO = 0.015;
const CompilerProbeResponseSchema = z
  .object({
    runtime: BrowserParityRuntimeSchema,
    css: z.string().min(1),
  })
  .strict();
const LifecycleResponseSchema = z
  .object({
    runtime: BrowserParityRuntimeSchema,
    slug: z.string().min(1),
    savedVersion: z.string().min(1),
    publishedVersion: z.string().min(1),
    globalCssHash: z.string().min(1),
    previewManagedImage: z.literal(true),
  })
  .strict();

function runtimeFromProject(projectName: string): BrowserParityRuntime {
  return BrowserParityRuntimeSchema.parse(projectName);
}

async function openSurface(
  page: Page,
  runtime: BrowserParityRuntime,
  surface: "public" | "stage",
): Promise<Frame> {
  await page.goto(`/aria-rendering-parity-${surface}?runtime=${runtime}`, {
    waitUntil: "networkidle",
  });
  if (surface === "public") {
    await expect(page.locator("#parity-public-host")).toHaveAttribute(
      "data-parity-ready",
      "true",
    );
    return page.mainFrame();
  }

  await expect(page.locator("#parity-stage-host")).toHaveAttribute(
    "data-parity-ready",
    "true",
  );
  const frame = page
    .frames()
    .find((candidate) => candidate !== page.mainFrame());
  if (!frame) {
    throw new Error("Stage parity iframe was not available");
  }
  await frame.waitForSelector("[data-aria-stage-content-root]");
  return frame;
}

async function captureSurface(
  frame: Frame,
  runtime: BrowserParityRuntime,
  surface: "public" | "stage",
  viewport: BrowserParityViewport,
): Promise<BrowserParitySurfaceSnapshot> {
  const input: BrowserSnapshotCollectorInput = {
    runtime,
    surface,
    fixtureId: "p0-canvas-parity",
    viewport,
    exceptions: PHASE_2_EDITOR_DOM_EXCEPTIONS,
    parityIds: P0_CANVAS_PARITY_NODE_IDS,
  };
  const raw: unknown = await frame.evaluate(
    collectBrowserSurfaceSnapshot,
    input,
  );
  return BrowserParitySurfaceSnapshotSchema.parse(raw);
}

async function readCanonicalHostCss(
  page: Page,
  runtime: BrowserParityRuntime,
): Promise<string> {
  const body: unknown = await page.evaluate(async (runtimeTarget) => {
    const response = await fetch(
      `/aria-rendering-parity-compiler?runtime=${runtimeTarget}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(`Unable to load parity CSS: ${response.status}`);
    }
    return response.json();
  }, runtime);
  return CompilerProbeResponseSchema.parse(body).css;
}

async function readCompilerProbe(
  page: Page,
  runtime: BrowserParityRuntime,
): Promise<z.infer<typeof CompilerProbeResponseSchema>> {
  const response = await page.request.get(
    `/aria-rendering-parity-compiler?runtime=${runtime}`,
  );
  expect(response.ok()).toBe(true);
  const raw: unknown = await response.json();
  return CompilerProbeResponseSchema.parse(raw);
}

async function installCanonicalHostCss(
  frame: Frame,
  css: string,
): Promise<void> {
  await frame.evaluate((stylesheet) => {
    const style = document.createElement("style");
    style.setAttribute("data-parity-canonical-host-css", "true");
    style.textContent = stylesheet;
    document.head.appendChild(style);
  }, css);
  await frame.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function expectCollapsedAffordanceAligned(
  page: Page,
  stageFrame: Frame,
): Promise<void> {
  const authoredBox = await stageFrame
    .locator('[data-parity-id="empty-container"]')
    .boundingBox();
  if (!authoredBox) {
    throw new Error("Collapsed authored container was not measurable");
  }

  const affordance = page.locator(
    '[data-overlay="empty-node"][data-node-id="parity-empty"]',
  );
  await expect(affordance).toHaveAttribute(
    "data-presentation",
    "collapsed-rail",
  );
  const affordanceBox = await affordance.boundingBox();
  if (!affordanceBox) {
    throw new Error("Collapsed container affordance was not measurable");
  }

  expect(authoredBox.height).toBeLessThanOrEqual(GEOMETRY_TOLERANCE);
  expect(
    Math.abs(affordanceBox.y + affordanceBox.height / 2 - authoredBox.y),
  ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE);
  expect(Math.abs(affordanceBox.x - (authoredBox.x + 12))).toBeLessThanOrEqual(
    GEOMETRY_TOLERANCE,
  );
  expect(
    Math.abs(affordanceBox.width - (authoredBox.width - 12)),
  ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE);

  const overlayRootContract = await page
    .locator('[data-aria-canvas-overlay-root="true"]')
    .evaluate((element) => ({
      parentTag: element.parentElement?.tagName ?? null,
      zIndex: window.getComputedStyle(element).zIndex,
    }));
  expect(overlayRootContract).toEqual({
    parentTag: "BODY",
    zIndex: String(Z_INDEX.canvas.hover),
  });
}

async function hideCanvasOverlayForSurfaceCapture(page: Page): Promise<void> {
  await page
    .locator('[data-aria-canvas-overlay-root="true"]')
    .evaluate((element) => {
      if (element instanceof HTMLElement) {
        element.style.visibility = "hidden";
      }
    });
}

function expectP0Parity(
  publicSnapshot: BrowserParitySurfaceSnapshot,
  stageSnapshot: BrowserParitySurfaceSnapshot,
): void {
  const propertyContract: Record<string, readonly string[]> = {
    root: [
      "display",
      "position",
      "box-sizing",
      "width",
      "height",
      "padding-top",
      "padding-right",
      "padding-bottom",
      "padding-left",
      "background-color",
      "flex-direction",
      "gap",
    ],
    "disabled-button": [
      "display",
      "position",
      "box-sizing",
      "width",
      "height",
      "margin-top",
      "padding-top",
      "border-top-width",
      "background-color",
      "color",
      "font-family",
      "font-size",
      "font-weight",
      "line-height",
    ],
    "authored-image": [
      "display",
      "position",
      "box-sizing",
      "width",
      "height",
      "object-fit",
      "object-position",
    ],
    "positioning-parent": [
      "display",
      "position",
      "box-sizing",
      "width",
      "height",
      "border-top-width",
    ],
    "absolute-child": [
      "display",
      "position",
      "left",
      "top",
      "box-sizing",
      "width",
      "margin-top",
      "font-family",
      "font-size",
      "font-weight",
      "line-height",
    ],
    "empty-container": [
      "display",
      "position",
      "box-sizing",
      "width",
      "height",
      "min-width",
      "min-height",
    ],
  };

  for (const publicNode of publicSnapshot.nodes) {
    const stageNode = stageSnapshot.nodes.find(
      (candidate) => candidate.parityId === publicNode.parityId,
    );
    expect(
      stageNode,
      `missing Stage node ${publicNode.parityId}`,
    ).toBeDefined();
    if (!stageNode) {
      continue;
    }

    expect(stageNode.tagName).toBe(publicNode.tagName);
    expect(stageNode.nativeState).toEqual(publicNode.nativeState);
    const properties = propertyContract[publicNode.parityId];
    expect(
      properties,
      `missing property contract ${publicNode.parityId}`,
    ).toBeDefined();
    for (const property of properties ?? []) {
      expect(
        stageNode.computedStyles[property],
        `${publicNode.parityId} computed ${property}`,
      ).toBe(publicNode.computedStyles[property]);
    }
    for (const dimension of ["left", "top", "width", "height"] as const) {
      expect(
        Math.abs(stageNode.rect[dimension] - publicNode.rect[dimension]),
        `${publicNode.parityId} geometry ${dimension}`,
      ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE);
    }
  }
}

async function readManagedUtilityImageRect(
  frame: Frame,
): Promise<{ width: number; height: number }> {
  return frame
    .locator('[data-parity-id="managed-utility-image"]')
    .evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height };
    });
}

function expectManagedUtilityImageRect(rect: {
  width: number;
  height: number;
}): void {
  expect(rect.height).toBeCloseTo(32, 1);
  expect(rect.width).toBeCloseTo((727 / 621) * 32, 1);
}

function expectScreenshotsEquivalent(
  publicPng: Buffer,
  stagePng: Buffer,
): void {
  const publicImage = PNG.sync.read(publicPng);
  const stageImage = PNG.sync.read(stagePng);
  expect(stageImage.width).toBe(publicImage.width);
  expect(stageImage.height).toBe(publicImage.height);
  const diff = new PNG({
    width: publicImage.width,
    height: publicImage.height,
  });
  const mismatchedPixels = pixelmatch(
    publicImage.data,
    stageImage.data,
    diff.data,
    publicImage.width,
    publicImage.height,
    { threshold: SCREENSHOT_PIXEL_THRESHOLD },
  );
  const mismatchRatio =
    mismatchedPixels / (publicImage.width * publicImage.height);
  expect(mismatchRatio).toBeLessThanOrEqual(SCREENSHOT_MISMATCH_RATIO);
}

for (const viewport of VIEWPORTS) {
  test(`${viewport.name}: public and Stage retain P0 parity`, async ({
    page,
  }, testInfo) => {
    const runtime = runtimeFromProject(testInfo.project.name);
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });

    const publicFrame = await openSurface(page, runtime, "public");
    const publicSnapshot = await captureSurface(
      publicFrame,
      runtime,
      "public",
      viewport,
    );
    const publicManagedImageRect =
      await readManagedUtilityImageRect(publicFrame);
    const canonicalHostCss = await readCanonicalHostCss(page, runtime);
    const publicPng = await page.locator('[data-parity-id="root"]').screenshot({
      animations: "disabled",
    });

    const stageFrame = await openSurface(page, runtime, "stage");
    await installCanonicalHostCss(stageFrame, canonicalHostCss);
    const stageManagedImageRect = await readManagedUtilityImageRect(stageFrame);
    expectManagedUtilityImageRect(publicManagedImageRect);
    expectManagedUtilityImageRect(stageManagedImageRect);
    await expectCollapsedAffordanceAligned(page, stageFrame);
    await hideCanvasOverlayForSurfaceCapture(page);
    const stageSnapshotBefore = await captureSurface(
      stageFrame,
      runtime,
      "stage",
      viewport,
    );
    const stagePng = await stageFrame
      .locator('[data-parity-id="root"]')
      .screenshot({ animations: "disabled" });

    expectP0Parity(publicSnapshot, stageSnapshotBefore);
    expectScreenshotsEquivalent(publicPng, stagePng);

    await stageFrame
      .locator('[data-parity-id="disabled-button"]')
      .dispatchEvent("pointerdown");
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("canvas:add-elements-insertion", {
          detail: {
            visible: true,
            gapViewport: {
              left: 8,
              top: 8,
              width: 40,
              height: 3,
            },
            targetViewport: null,
            orientation: "horizontal",
          },
        }),
      );
      window.dispatchEvent(new Event("canvas:add-elements-drag-end"));
    });

    const stageSnapshotAfter = await captureSurface(
      stageFrame,
      runtime,
      "stage",
      viewport,
    );
    expect(stageSnapshotAfter.authoredDomHash).toBe(
      stageSnapshotBefore.authoredDomHash,
    );
    expect(stageSnapshotAfter.authoredInlineStyleHash).toBe(
      stageSnapshotBefore.authoredInlineStyleHash,
    );
  });
}

test("collapsed affordances stay aligned in an offset 82% canvas", async ({
  page,
}, testInfo) => {
  const runtime = runtimeFromProject(testInfo.project.name);
  await page.setViewportSize({ width: 1280, height: 800 });
  const stageFrame = await openSurface(page, runtime, "stage");

  await page.evaluate(() => {
    const mount = document.querySelector<HTMLElement>("#parity-stage-mount");
    if (!mount) {
      throw new Error("Missing transformed parity mount");
    }
    mount.style.position = "absolute";
    mount.style.left = "140px";
    mount.style.top = "60px";
    mount.style.width = "1000px";
    mount.style.height = "700px";
    mount.style.transform = "scale(0.82)";
    mount.style.transformOrigin = "top left";
    window.dispatchEvent(new Event("resize"));
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

  await expectCollapsedAffordanceAligned(page, stageFrame);
});

test("empty-node affordances select their authored node", async ({
  page,
}, testInfo) => {
  const runtime = runtimeFromProject(testInfo.project.name);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openSurface(page, runtime, "stage");

  const affordance = page.locator(
    '[data-overlay="empty-node"][data-node-id="parity-empty"]',
  );
  await expect(affordance).toBeAttached();
  await affordance.evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      throw new Error("Empty-node affordance must be an HTML element");
    }

    element.style.setProperty("display", "flex", "important");
    element.style.width = "24px";
    element.style.height = "24px";
    element.style.overflow = "visible";
  });

  const visibleBadge = affordance.locator('span[aria-hidden="true"]').last();
  await expect(visibleBadge).toHaveCSS("pointer-events", "auto");
  await visibleBadge.click();

  const toolbar = page.locator('[data-overlay="toolbar"]');
  await expect(toolbar).toBeAttached();
  await expect(toolbar).toHaveAttribute("data-node-id", "parity-empty");
  await expect(toolbar).toContainText("Container");
});

test("save and publish compiler imports stay stable after Stage startup", async ({
  page,
}, testInfo) => {
  const runtime = runtimeFromProject(testInfo.project.name);
  const beforeStage = await readCompilerProbe(page, runtime);

  await openSurface(page, runtime, "stage");

  const afterStage = await readCompilerProbe(page, runtime);
  expect(afterStage).toEqual(beforeStage);
});

test("guarded save to public stylesheet lifecycle preserves managed-image geometry", async ({
  page,
}, testInfo) => {
  const runtime = runtimeFromProject(testInfo.project.name);
  const response = await page.request.post("/aria-rendering-parity-lifecycle", {
    data: { runtime },
  });
  expect(response.ok()).toBe(true);
  const raw: unknown = await response.json();
  const lifecycle = LifecycleResponseSchema.parse(raw);
  expect(lifecycle.publishedVersion).toBe(lifecycle.savedVersion);
  const stylesheetResponse = await page.request.get(
    `/styles/global.css?v=${lifecycle.globalCssHash}`,
  );
  expect(stylesheetResponse.ok()).toBe(true);
  const stylesheetCss = await stylesheetResponse.text();
  expect(
    stylesheetCss.match(/:where\(img\.aria-managed-image\)/g),
  ).toHaveLength(1);

  await page.goto(`/aria-rendering-parity-lifecycle?runtime=${runtime}`, {
    waitUntil: "networkidle",
  });
  const image = page.locator(
    'img.aria-managed-image[data-rendering-lifecycle="managed-image"]',
  );
  await expect(image).toBeVisible();
  const stylesheet = page.locator(
    `link[rel="stylesheet"][href="/styles/global.css?v=${lifecycle.globalCssHash}"]`,
  );
  await expect(stylesheet).toHaveCount(1);
  const inlineRendererRuleCount = await page
    .locator("style")
    .evaluateAll((styles) =>
      styles.reduce(
        (count, style) =>
          count +
          (style.textContent?.match(/:where\(img\.aria-managed-image\)/g)
            ?.length ?? 0),
        0,
      ),
    );
  expect(inlineRendererRuleCount).toBe(0);
  const rect = await image.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  });
  expect(rect.height).toBeCloseTo(32, 1);
  expect(rect.width).toBeCloseTo((727 / 621) * 32, 1);

  await page.reload({ waitUntil: "networkidle" });
  await expect(image).toBeVisible();
  const reloadedRect = await image.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  });
  expect(reloadedRect).toEqual(rect);
});
