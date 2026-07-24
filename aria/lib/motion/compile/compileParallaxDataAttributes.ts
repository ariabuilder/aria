/**
 * Compile Aria Parallax data attributes for runtime features
 */

import {
  DEFAULT_NODE_PARALLAX,
  NodeParallaxSchema,
  type NodeParallax,
} from "../schemas/nodeParallax.schema";

export type ParallaxDataAttributes = Record<string, string>;

export function compileParallaxDataAttributes(
  parallax: NodeParallax | null | undefined,
): ParallaxDataAttributes {
  const parsed = NodeParallaxSchema.safeParse(
    parallax ?? DEFAULT_NODE_PARALLAX,
  );
  if (!parsed.success || !parsed.data.enabled) {
    return {};
  }

  const attrs: ParallaxDataAttributes = {};
  const value = parsed.data;

  attrs["data-aria-parallax-speed"] = value.speed;
  attrs["data-aria-parallax-direction"] = value.direction;
  attrs["data-aria-parallax-travel"] = String(value.travel);
  attrs["data-aria-parallax-anchor"] = value.anchor;

  if (value.easing) {
    attrs["data-aria-parallax-easing"] = value.easing;
  }

  if (value.startOffset) {
    attrs["data-aria-parallax-start"] = value.startOffset;
  }

  if (value.endOffset) {
    attrs["data-aria-parallax-end"] = value.endOffset;
  }

  if (value.containerRef) {
    attrs["data-aria-parallax-container"] = value.containerRef;
  }

  if (value.pin?.enabled) {
    attrs["data-aria-parallax-pin"] = "true";
    if (value.pin.duration) {
      attrs["data-aria-parallax-pin-duration"] = value.pin.duration;
    }
    if (value.pin.offset) {
      attrs["data-aria-parallax-pin-offset"] = value.pin.offset;
    }
  }

  if (value.layerGroup) {
    attrs["data-aria-parallax-group"] = value.layerGroup;
  }

  if (value.velocity) {
    attrs["data-aria-parallax-velocity"] = "true";
  }

  if (value.disableOnMobile) {
    attrs["data-aria-parallax-mobile-disable"] = "true";
  }

  return attrs;
}

export function compileParallaxDataAttributeString(
  parallax: NodeParallax | null | undefined,
): string {
  return Object.entries(compileParallaxDataAttributes(parallax))
    .map(([key, value]) => `${key}="${value.replace(/"/g, "&quot;")}"`)
    .join(" ");
}
