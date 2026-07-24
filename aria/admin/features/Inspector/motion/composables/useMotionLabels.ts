import { useStudioI18n, type StudioMessageKey } from "@/i18n";

const MOTION_LABEL_KEYS = {
  section: {
    presets: "inspector.motion.section.presets",
    effects: "inspector.motion.section.effects",
    trigger: "inspector.motion.section.trigger",
    timing: "inspector.motion.section.timing",
    text: "inspector.motion.section.text",
    hover: "inspector.motion.section.hover",
    loop: "inspector.motion.section.loop",
    stagger: "inspector.motion.section.stagger",
  },
  speed: {
    instant: "inspector.motion.speed.instant",
    fast: "inspector.motion.speed.fast",
    normal: "inspector.motion.speed.normal",
    slow: "inspector.motion.speed.slow",
    slower: "inspector.motion.speed.slower",
  },
  easing: {
    smooth: "inspector.motion.easing.smooth",
    spring: "inspector.motion.easing.spring",
    linear: "inspector.motion.easing.linear",
    in: "inspector.motion.easing.in",
    out: "inspector.motion.easing.out",
    "in-out": "inspector.motion.easing.inOut",
  },
  distance: {
    sm: "inspector.motion.distance.small",
    md: "inspector.motion.distance.medium",
    lg: "inspector.motion.distance.large",
    xl: "inspector.motion.distance.extraLarge",
  },
  trigger: {
    reveal: "inspector.motion.trigger.reveal",
    now: "inspector.motion.trigger.now",
    hover: "inspector.motion.trigger.hover",
    click: "inspector.motion.trigger.click",
    scrub: "inspector.motion.trigger.scrub",
  },
  effect: {
    fade: "inspector.motion.effect.fade",
    "slide-up": "inspector.motion.effect.slideUp",
    "slide-down": "inspector.motion.effect.slideDown",
    "slide-left": "inspector.motion.effect.slideLeft",
    "slide-right": "inspector.motion.effect.slideRight",
    "zoom-in": "inspector.motion.effect.zoomIn",
    "zoom-out": "inspector.motion.effect.zoomOut",
    blur: "inspector.motion.effect.blur",
    "rotate-in": "inspector.motion.effect.rotateIn",
    "flip-up": "inspector.motion.effect.flipUp",
    "flip-down": "inspector.motion.effect.flipDown",
    "flip-left": "inspector.motion.effect.flipLeft",
    "flip-right": "inspector.motion.effect.flipRight",
    "mask-up": "inspector.motion.effect.maskUp",
    "mask-down": "inspector.motion.effect.maskDown",
    "mask-left": "inspector.motion.effect.maskLeft",
    "mask-right": "inspector.motion.effect.maskRight",
  },
  hover: {
    "hover-lift": "inspector.motion.hover.lift",
    "hover-grow": "inspector.motion.hover.grow",
    "hover-shrink": "inspector.motion.hover.shrink",
    "hover-rotate": "inspector.motion.hover.rotate",
    "hover-tilt": "inspector.motion.hover.tilt",
    "hover-glow": "inspector.motion.hover.glow",
    "hover-float": "inspector.motion.hover.float",
    "hover-pop": "inspector.motion.hover.pop",
    "hover-press": "inspector.motion.hover.press",
    "hover-underline": "inspector.motion.hover.underline",
    "hover-sweep": "inspector.motion.hover.sweep",
    "hover-border": "inspector.motion.hover.border",
  },
  loop: {
    pulse: "inspector.motion.loop.pulse",
    heartbeat: "inspector.motion.loop.heartbeat",
    float: "inspector.motion.loop.float",
    spin: "inspector.motion.loop.spin",
    ping: "inspector.motion.loop.ping",
    flash: "inspector.motion.loop.flash",
    bounce: "inspector.motion.loop.bounce",
    shake: "inspector.motion.loop.shake",
    wobble: "inspector.motion.loop.wobble",
    jello: "inspector.motion.loop.jello",
    vibrate: "inspector.motion.loop.vibrate",
    swing: "inspector.motion.loop.swing",
    rubber: "inspector.motion.loop.rubber",
    tada: "inspector.motion.loop.tada",
  },
  preset: {
    "fade-in": "inspector.motion.preset.fadeIn",
    "fade-up": "inspector.motion.preset.riseUp",
    "gentle-rise": "inspector.motion.preset.gentleRise",
    "slide-left": "inspector.motion.preset.slideLeft",
    "fade-down": "inspector.motion.preset.dropIn",
    "slide-right": "inspector.motion.preset.slideRight",
    "on-load": "inspector.motion.preset.onLoad",
    "zoom-in": "inspector.motion.preset.zoomIn",
    "pop-in": "inspector.motion.preset.popIn",
    "blur-in": "inspector.motion.preset.softReveal",
    "tilt-in": "inspector.motion.preset.tiltIn",
    "mask-up": "inspector.motion.preset.maskUp",
  },
  parallaxPreset: {
    "gentle-float": "inspector.motion.parallax.preset.gentleFloat",
    "hero-depth": "inspector.motion.parallax.preset.heroDepth",
    "fade-through": "inspector.motion.parallax.preset.fadeThrough",
    "zoom-reveal": "inspector.motion.parallax.preset.zoomReveal",
    "blur-in": "inspector.motion.parallax.preset.blurIn",
    "subtle-rotate": "inspector.motion.parallax.preset.subtleRotate",
    "dramatic-rise": "inspector.motion.parallax.preset.dramaticRise",
    "slide-left": "inspector.motion.parallax.preset.slideLeft",
    "slide-right": "inspector.motion.parallax.preset.slideRight",
    "sticky-pin": "inspector.motion.parallax.preset.stickyPin",
  },
} as const satisfies Record<string, Record<string, StudioMessageKey>>;

type MotionLabelGroup = keyof typeof MOTION_LABEL_KEYS;

export function useMotionLabels() {
  const { t } = useStudioI18n();

  function label(group: MotionLabelGroup, id: string, fallback = id): string {
    const key = (MOTION_LABEL_KEYS[group] as Record<string, StudioMessageKey>)[id];
    return key ? t(key) : fallback;
  }

  function options<T extends { id: string; label: string }>(
    group: MotionLabelGroup,
    items: readonly T[],
  ): Array<T> {
    return items.map((item) => ({
      ...item,
      label: label(group, item.id, item.label),
    }));
  }

  return { label, options };
}
