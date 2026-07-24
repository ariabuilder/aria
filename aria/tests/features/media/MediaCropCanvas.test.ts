import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import MediaCropCanvas from "../../../admin/features/Studio/media/components/MediaCropCanvas.vue";
import type { MediaCropRect } from "../../../lib/media/transforms/schemas";

function prepareCanvas(wrapper: ReturnType<typeof mount>) {
  const frame = wrapper.find("div.relative.inline-flex");
  const image = wrapper.find("img");
  Object.defineProperty(image.element, "naturalWidth", { value: 1600 });
  Object.defineProperty(image.element, "naturalHeight", { value: 800 });
  Object.defineProperty(frame.element, "getBoundingClientRect", {
    value: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 800,
      bottom: 400,
      width: 800,
      height: 400,
      toJSON: () => ({}),
    }),
  });
  return { frame, image };
}

function latestCrop(wrapper: ReturnType<typeof mount>): MediaCropRect {
  const events = wrapper.emitted("update:modelValue") ?? [];
  return events.at(-1)?.[0] as MediaCropRect;
}

describe("MediaCropCanvas", () => {
  it("moves a normalized crop with pointer input", async () => {
    const wrapper = mount(MediaCropCanvas, {
      props: {
        src: "/uploads/hero.jpg",
        alt: "Hero",
        modelValue: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
      },
    });
    const { frame } = prepareCanvas(wrapper);
    const crop = wrapper.find('[role="application"]');

    await crop.trigger("pointerdown", {
      pointerId: 1,
      clientX: 200,
      clientY: 100,
    });
    await frame.trigger("pointermove", {
      pointerId: 1,
      clientX: 280,
      clientY: 140,
    });

    expect(latestCrop(wrapper)).toEqual({
      x: 0.2,
      y: 0.3,
      width: 0.5,
      height: 0.5,
    });
  });

  it("preserves a locked source-aware ratio while resizing", async () => {
    const wrapper = mount(MediaCropCanvas, {
      props: {
        src: "/uploads/hero.jpg",
        alt: "Hero",
        modelValue: { x: 0.25, y: 0, width: 0.5, height: 1 },
        aspectRatio: { width: 1, height: 1 },
      },
    });
    const { frame, image } = prepareCanvas(wrapper);
    await image.trigger("load");
    const handle = wrapper.find(
      'button[aria-label="Resize crop from SE corner"]',
    );

    await handle.trigger("pointerdown", {
      pointerId: 2,
      clientX: 600,
      clientY: 400,
    });
    await frame.trigger("pointermove", {
      pointerId: 2,
      clientX: 520,
      clientY: 360,
    });

    expect(latestCrop(wrapper)).toEqual({
      x: 0.25,
      y: 0,
      width: 0.4,
      height: 0.8,
    });
  });

  it("supports keyboard nudging and focal-point placement", async () => {
    const wrapper = mount(MediaCropCanvas, {
      props: {
        src: "/uploads/hero.jpg",
        alt: "Hero",
        modelValue: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
        focalMode: true,
      },
    });
    const { frame } = prepareCanvas(wrapper);
    const crop = wrapper.find('[role="application"]');

    await crop.trigger("keydown", { key: "ArrowRight" });
    expect(latestCrop(wrapper).x).toBeCloseTo(0.11);

    await frame.trigger("click", { clientX: 400, clientY: 100 });
    expect(wrapper.emitted("update:focalPoint")?.at(-1)?.[0]).toEqual({
      x: 0.5,
      y: 0.25,
    });
  });
});
