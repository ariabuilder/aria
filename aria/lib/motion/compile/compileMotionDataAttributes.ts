/**
 * Compile Aria Motion data attributes for runtime features
 */

import {
  DEFAULT_NODE_MOTION,
  NodeMotionSchema,
  type NodeMotion,
} from "../schemas/nodeMotion.schema";

export type MotionDataAttributes = Record<string, string>;

export function compileMotionDataAttributes(
  motion: NodeMotion | null | undefined,
): MotionDataAttributes {
  const parsed = NodeMotionSchema.safeParse(motion ?? DEFAULT_NODE_MOTION);
  if (!parsed.success || !parsed.data.enabled) {
    return {};
  }

  const attrs: MotionDataAttributes = {};
  const value = parsed.data;

  if (value.stagger?.interval) {
    attrs["data-aria-motion-stagger"] = String(value.stagger.interval);
  }

  if (value.text?.effects?.length) {
    attrs["data-aria-motion-effect"] = value.text.effects
      .map((effect) => `aria-motion-${effect}`)
      .join(" ");
  }

  if (value.text?.stagger !== undefined) {
    attrs["data-aria-motion-text-stagger"] = String(value.text.stagger);
  }

  if (value.scrub?.travel !== undefined) {
    attrs["data-aria-motion-scrub"] = String(value.scrub.travel);
  }

  if (value.magnetic?.strength !== undefined) {
    attrs["data-aria-motion-strength"] = String(value.magnetic.strength);
  }

  if (value.durationVar) {
    attrs["data-aria-motion-duration-var"] = value.durationVar;
  }

  if (value.delayVar) {
    attrs["data-aria-motion-delay-var"] = value.delayVar;
  }

  return attrs;
}

export function compileMotionDataAttributeString(
  motion: NodeMotion | null | undefined,
): string {
  return Object.entries(compileMotionDataAttributes(motion))
    .map(([key, value]) => `${key}="${value.replace(/"/g, "&quot;")}"`)
    .join(" ");
}
