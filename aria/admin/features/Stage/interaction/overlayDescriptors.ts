import { z } from "zod";
import {
  FrameViewportRectSchema,
  ParentViewportRectSchema,
  type FrameViewportRect,
  type ParentViewportRect,
} from "./geometry";

export type VisualOverlayDescriptor =
  | {
      kind: "hover";
      id: "hover";
      nodeId: string;
      rect: FrameViewportRect;
      variant: "default" | "component";
    }
  | {
      kind: "selection";
      id: string;
      nodeId: string;
      rect: FrameViewportRect;
      variant: "primary" | "secondary" | "ghost";
    }
  | {
      kind: "insertion";
      id: string;
      rect: FrameViewportRect;
      orientation: "horizontal" | "vertical";
      variant: "library" | "reorder";
    }
  | {
      kind: "target-outline";
      id: string;
      nodeId: string;
      rect: FrameViewportRect;
      variant: "empty-container" | "active-container";
    };

export type ChromeOverlayDescriptor =
  | {
      kind: "selection-toolbar";
      id: "selection-toolbar";
      nodeId: string;
      anchorRect: ParentViewportRect;
      hidden?: boolean;
    };

const BaseDescriptorSchema = z
  .object({
    id: z.string().trim().min(1),
  })
  .strict();

const HoverOverlayDescriptorSchema = BaseDescriptorSchema.extend({
  kind: z.literal("hover"),
  id: z.literal("hover"),
  nodeId: z.string().trim().min(1),
  rect: FrameViewportRectSchema,
  variant: z.enum(["default", "component"]),
}).strict();

const SelectionOverlayDescriptorSchema = BaseDescriptorSchema.extend({
  kind: z.literal("selection"),
  nodeId: z.string().trim().min(1),
  rect: FrameViewportRectSchema,
  variant: z.enum(["primary", "secondary", "ghost"]),
}).strict();

const InsertionOverlayDescriptorSchema = BaseDescriptorSchema.extend({
  kind: z.literal("insertion"),
  rect: FrameViewportRectSchema,
  orientation: z.enum(["horizontal", "vertical"]),
  variant: z.enum(["library", "reorder"]),
}).strict();

const TargetOutlineOverlayDescriptorSchema = BaseDescriptorSchema.extend({
  kind: z.literal("target-outline"),
  nodeId: z.string().trim().min(1),
  rect: FrameViewportRectSchema,
  variant: z.enum(["empty-container", "active-container"]),
}).strict();

export const VisualOverlayDescriptorSchema = z.discriminatedUnion("kind", [
  HoverOverlayDescriptorSchema,
  SelectionOverlayDescriptorSchema,
  InsertionOverlayDescriptorSchema,
  TargetOutlineOverlayDescriptorSchema,
]);

export const ChromeOverlayDescriptorSchema = z.discriminatedUnion("kind", [
  BaseDescriptorSchema.extend({
    kind: z.literal("selection-toolbar"),
    id: z.literal("selection-toolbar"),
    nodeId: z.string().trim().min(1),
    anchorRect: ParentViewportRectSchema,
    hidden: z.boolean().optional(),
  }).strict(),
]);

export const OverlayDescriptorSchema = z.union([
  VisualOverlayDescriptorSchema,
  ChromeOverlayDescriptorSchema,
]);

export type OverlayDescriptor =
  | VisualOverlayDescriptor
  | ChromeOverlayDescriptor;
