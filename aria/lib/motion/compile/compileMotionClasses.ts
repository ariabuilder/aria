/**
 * Compile Aria Motion configuration to CSS class names
 */

import {
  DEFAULT_NODE_MOTION,
  NodeMotionSchema,
  type NodeMotion,
} from "../schemas/nodeMotion.schema";

const PREFIX = "aria-motion";

function effectToClass(effect: string): string {
  return `${PREFIX}-${effect}`;
}

function triggerToClass(trigger: NodeMotion["trigger"]): string | null {
  switch (trigger) {
    case "reveal":
      return `${PREFIX}-reveal`;
    case "now":
      return `${PREFIX}-now`;
    case "hover":
      return `${PREFIX}-hover`;
    case "click":
      return `${PREFIX}-click`;
    case "scrub":
      return `${PREFIX}-scrub`;
    default:
      return null;
  }
}

function speedToClass(
  speed: NodeMotion["speed"],
): string | null {
  if (speed === undefined) {
    return null;
  }
  if (typeof speed === "number") {
    return `${PREFIX}-${speed}`;
  }
  return `${PREFIX}-${speed}`;
}

function easingToClass(easing: NodeMotion["easing"]): string | null {
  return easing ? `${PREFIX}-ease-${easing}` : null;
}

function distanceToClass(distance: NodeMotion["distance"]): string | null {
  return distance ? `${PREFIX}-dist-${distance}` : null;
}

function delayToClass(delay: NodeMotion["delay"]): string | null {
  if (delay === undefined) {
    return null;
  }
  if (typeof delay === "number") {
    return `${PREFIX}-delay-${delay}`;
  }
  return delay === "0" ? null : `${PREFIX}-delay-${delay}`;
}

function hoverToClasses(hover: NodeMotion["hover"]): string[] {
  if (!hover?.length) {
    return [];
  }
  return hover.map((id) => `${PREFIX}-${id}`);
}

function loopToClass(loop: NodeMotion["loop"]): string | null {
  return loop ? `${PREFIX}-${loop}` : null;
}

function textToClasses(text: NodeMotion["text"]): string[] {
  if (!text) {
    return [];
  }
  const classes =
    text.mode === "words" ? [`${PREFIX}-words`] : [`${PREFIX}-chars`];
  return classes;
}

function staggerToClasses(stagger: NodeMotion["stagger"]): string[] {
  if (!stagger) {
    return [];
  }
  return [`${PREFIX}-stagger`];
}

function magneticToClasses(magnetic: NodeMotion["magnetic"]): string[] {
  if (!magnetic) {
    return [];
  }
  return [`${PREFIX}-magnetic`];
}

export function compileMotionClasses(
  motion: NodeMotion | null | undefined,
): string[] {
  const parsed = NodeMotionSchema.safeParse(motion ?? DEFAULT_NODE_MOTION);
  if (!parsed.success || !parsed.data.enabled) {
    return [];
  }

  const value = parsed.data;
  const classes = new Set<string>([PREFIX]);

  for (const effect of value.effects) {
    classes.add(effectToClass(effect));
  }

  const triggerClass = triggerToClass(value.trigger);
  if (triggerClass) {
    classes.add(triggerClass);
  }

  const speedClass = speedToClass(value.speed);
  if (speedClass) {
    classes.add(speedClass);
  }

  const easingClass = easingToClass(value.easing);
  if (easingClass) {
    classes.add(easingClass);
  }

  const distanceClass = distanceToClass(value.distance);
  if (distanceClass) {
    classes.add(distanceClass);
  }

  const delayClass = delayToClass(value.delay);
  if (delayClass) {
    classes.add(delayClass);
  }

  for (const hoverClass of hoverToClasses(value.hover)) {
    classes.add(hoverClass);
  }

  const loopClass = loopToClass(value.loop);
  if (loopClass) {
    classes.add(loopClass);
  }

  for (const textClass of textToClasses(value.text)) {
    classes.add(textClass);
  }

  for (const staggerClass of staggerToClasses(value.stagger)) {
    classes.add(staggerClass);
  }

  for (const magneticClass of magneticToClasses(value.magnetic)) {
    classes.add(magneticClass);
  }

  return Array.from(classes);
}

export function compileMotionClassString(
  motion: NodeMotion | null | undefined,
): string {
  return compileMotionClasses(motion).join(" ");
}
