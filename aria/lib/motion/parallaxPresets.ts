/**
 * Aria Parallax UI presets — shared between Inspector
 * and Agent. Validated at module load via ParallaxPresetDefinitionSchema.
 */

import { z } from "zod";
import {
  MotionParallaxDirectionIdSchema,
  MotionParallaxEasingIdSchema,
  MotionParallaxEffectIdSchema,
  MotionParallaxSpeedIdSchema,
} from "./schemas/parallaxTokens.schema";

export const ParallaxPresetDefinitionSchema = z
  .object({
    id: z.string().trim().min(1),
    label: z.string().trim().min(1),
    description: z.string().trim().optional(),
    direction: MotionParallaxDirectionIdSchema.default("up"),
    speed: MotionParallaxSpeedIdSchema.default("1"),
    effects: z.array(MotionParallaxEffectIdSchema).default([]),
    travel: z.int().nonnegative().default(200),
    easing: MotionParallaxEasingIdSchema.optional(),
    pin: z
      .object({
        enabled: z.boolean(),
        duration: z.string().optional(),
        offset: z.string().optional(),
      })
      .optional(),
    velocity: z.boolean().default(false),
  })
  .strict();

export type ParallaxPresetDefinition = z.infer<
  typeof ParallaxPresetDefinitionSchema
>;

export const PARALLAX_PRESETS: ParallaxPresetDefinition[] = [
  {
    id: "gentle-float",
    label: "Gentle Float",
    description: "Slow upward drift as you scroll",
    direction: "up",
    speed: "0.5",
    effects: ["translate"],
    travel: 120,
    easing: "ease-out",
  },
  {
    id: "hero-depth",
    label: "Hero Depth",
    description: "Dramatic background parallax with subtle scale",
    direction: "up",
    speed: "0.25",
    effects: ["translate", "scale"],
    travel: 300,
    easing: "linear",
  },
  {
    id: "fade-through",
    label: "Fade Through",
    description: "Fades from transparent to opaque on scroll",
    direction: "up",
    speed: "1",
    effects: ["opacity", "translate"],
    travel: 150,
    easing: "ease-in-out",
  },
  {
    id: "zoom-reveal",
    label: "Zoom Reveal",
    description: "Scales up smoothly as it enters view",
    direction: "up",
    speed: "1",
    effects: ["scale", "opacity"],
    travel: 200,
    easing: "ease-out",
  },
  {
    id: "blur-in",
    label: "Blur In",
    description: "Sharpens from blurred as you scroll",
    direction: "up",
    speed: "1",
    effects: ["blur", "opacity"],
    travel: 150,
    easing: "ease-out",
  },
  {
    id: "subtle-rotate",
    label: "Subtle Rotate",
    description: "Gentle rotation that straightens on scroll",
    direction: "up",
    speed: "0.75",
    effects: ["rotate", "opacity"],
    travel: 160,
    easing: "ease-out",
  },
  {
    id: "dramatic-rise",
    label: "Dramatic Rise",
    description: "Fast upward movement with fade for hero elements",
    direction: "up",
    speed: "1.5",
    effects: ["translate", "opacity"],
    travel: 250,
    easing: "spring",
  },
  {
    id: "slide-left",
    label: "Slide Left",
    description: "Slides in from the right as you scroll",
    direction: "left",
    speed: "1",
    effects: ["translate", "opacity"],
    travel: 200,
    easing: "ease-out",
  },
  {
    id: "slide-right",
    label: "Slide Right",
    description: "Slides in from the left as you scroll",
    direction: "right",
    speed: "1",
    effects: ["translate", "opacity"],
    travel: 200,
    easing: "ease-out",
  },
  {
    id: "sticky-pin",
    label: "Sticky Pin",
    description: "Pins in place while content scrolls past",
    direction: "up",
    speed: "0",
    effects: [],
    travel: 0,
    pin: {
      enabled: true,
      duration: "400px",
      offset: "top 0px",
    },
  },
].map((p) => ParallaxPresetDefinitionSchema.parse(p));
