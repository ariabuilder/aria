/**
 * Compile Aria Parallax configuration to CSS class names
 */

import {
  DEFAULT_NODE_PARALLAX,
  NodeParallaxSchema,
  type NodeParallax,
} from "../schemas/nodeParallax.schema";

const PREFIX = "aria-parallax";

function directionToClass(direction: NodeParallax["direction"]): string {
  return `${PREFIX}-${direction}`;
}

function speedToClass(speed: NodeParallax["speed"]): string {
  return `${PREFIX}-speed-${speed.replace(".", "_")}`;
}

function easingToClass(easing: NodeParallax["easing"]): string | null {
  return easing ? `${PREFIX}-ease-${easing}` : null;
}

function effectsToClasses(effects: NodeParallax["effects"]): string[] {
  if (!effects?.length) {
    return [];
  }
  return effects.map((e) => `${PREFIX}-fx-${e.effect}`);
}

function pinToClasses(pin: NodeParallax["pin"]): string[] {
  if (!pin?.enabled) {
    return [];
  }
  return [`${PREFIX}-pin`];
}

function velocityToClass(velocity: NodeParallax["velocity"]): string | null {
  return velocity ? `${PREFIX}-velocity` : null;
}

function mobileToClass(
  disableOnMobile: NodeParallax["disableOnMobile"],
): string | null {
  return disableOnMobile ? `${PREFIX}-mobile-disable` : null;
}

export function compileParallaxClasses(
  parallax: NodeParallax | null | undefined,
): string[] {
  const parsed = NodeParallaxSchema.safeParse(
    parallax ?? DEFAULT_NODE_PARALLAX,
  );
  if (!parsed.success || !parsed.data.enabled) {
    return [];
  }

  const value = parsed.data;
  const classes = new Set<string>([PREFIX]);

  classes.add(directionToClass(value.direction));
  classes.add(speedToClass(value.speed));

  const easingClass = easingToClass(value.easing);
  if (easingClass) {
    classes.add(easingClass);
  }

  for (const fxClass of effectsToClasses(value.effects)) {
    classes.add(fxClass);
  }

  for (const pinClass of pinToClasses(value.pin)) {
    classes.add(pinClass);
  }

  const velocityClass = velocityToClass(value.velocity);
  if (velocityClass) {
    classes.add(velocityClass);
  }

  const mobileClass = mobileToClass(value.disableOnMobile);
  if (mobileClass) {
    classes.add(mobileClass);
  }

  return Array.from(classes);
}

export function compileParallaxClassString(
  parallax: NodeParallax | null | undefined,
): string {
  return compileParallaxClasses(parallax).join(" ");
}
