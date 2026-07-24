/**
 * Central registry for all property schemas with validation utilities.
 */

import { z } from "zod";
import type {
  SchemaEntry,
  ValidationResult,
  ValidationError,
  PropertySchemaKey,
} from "../types/schema";

import { SpacingValueSchema, DEFAULT_SPACING } from "./spacing.schema";
import { TypographyValueSchema, DEFAULT_TYPOGRAPHY } from "./typography.schema";
import { BorderValueSchema, DEFAULT_BORDER } from "./border.schema";
import { BackgroundValueSchema, DEFAULT_BACKGROUND } from "./background.schema";
import { SizeValueSchema, DEFAULT_SIZE } from "./size.schema";
import { PositionValueSchema, DEFAULT_POSITION } from "./position.schema";
import { TransformValueSchema, DEFAULT_TRANSFORM } from "./transform.schema";
import { CornerValueSchema, DEFAULT_CORNER } from "./corner.schema";
import { ShadowValueSchema, DEFAULT_SHADOW } from "./shadow.schema";
import { LinkValueSchema, DEFAULT_LINK } from "./link.schema";
import { ImageValueSchema, DEFAULT_IMAGE } from "./image.schema";
import { VideoValueSchema, DEFAULT_VIDEO } from "./video.schema";
import { VisibilityValueSchema, DEFAULT_VISIBILITY } from "./visibility.schema";
import { ClassesValueSchema, DEFAULT_CLASSES } from "./classes.schema";
import { FilterValueSchema, DEFAULT_FILTER } from "./filter.schema";
import { TextValueSchema, DEFAULT_TEXT } from "./text.schema";
import { ListValueSchema, DEFAULT_LIST } from "./list.schema";
import {
  NodeMotionSchema,
  DEFAULT_NODE_MOTION,
} from "./motion.schema";

export interface SchemaRegistry {
  get<K extends PropertySchemaKey>(key: K): SchemaEntry | undefined;
  validate<T>(key: PropertySchemaKey, value: T): ValidationResult<T>;
  getDefault<K extends PropertySchemaKey>(key: K): z.infer<z.ZodType>;
  has(key: string): boolean;
  keys(): PropertySchemaKey[];
}

function createEntry<T extends z.ZodType>(
  schema: T,
  defaultValue: z.infer<T>,
  description?: string,
): SchemaEntry<T> {
  return {
    schema,
    defaultValue,
    description,
    validate: (value: unknown): ValidationResult<z.infer<T>> => {
      const result = schema.safeParse(value);
      if (result.success) {
        return { success: true, data: result.data };
      }
      return {
        success: false,
        errors: result.error.issues.map((e) => ({
          path: e.path.filter(
            (segment): segment is string | number =>
              typeof segment === "string" || typeof segment === "number",
          ),
          message: e.message,
          code: e.code,
        })),
      };
    },
    parse: (value: unknown) => schema.parse(value),
    safeParse: (value: unknown) => schema.safeParse(value),
  };
}

export function createSchemaRegistry(): SchemaRegistry {
  const entries = new Map<PropertySchemaKey, SchemaEntry>([
    ["text", createEntry(TextValueSchema, DEFAULT_TEXT, "Text content")],
    [
      "list",
      createEntry(
        ListValueSchema,
        DEFAULT_LIST,
        "List semantics and marker styling",
      ),
    ],
    [
      "spacing",
      createEntry(SpacingValueSchema, DEFAULT_SPACING, "Margin and padding"),
    ],
    [
      "typography",
      createEntry(
        TypographyValueSchema,
        DEFAULT_TYPOGRAPHY,
        "Font and text styling",
      ),
    ],
    [
      "border",
      createEntry(
        BorderValueSchema,
        DEFAULT_BORDER,
        "Border width, style, and color",
      ),
    ],
    [
      "background",
      createEntry(
        BackgroundValueSchema,
        DEFAULT_BACKGROUND,
        "Background color, gradient, or image",
      ),
    ],
    [
      "size",
      createEntry(SizeValueSchema, DEFAULT_SIZE, "Width and height dimensions"),
    ],
    [
      "position",
      createEntry(
        PositionValueSchema,
        DEFAULT_POSITION,
        "Position, inset offsets, and stacking order",
      ),
    ],
    [
      "transform",
      createEntry(
        TransformValueSchema,
        DEFAULT_TRANSFORM,
        "Transform and transform origin",
      ),
    ],
    ["corner", createEntry(CornerValueSchema, DEFAULT_CORNER, "Border radius")],
    [
      "shadow",
      createEntry(ShadowValueSchema, DEFAULT_SHADOW, "Box shadow effects"),
    ],
    [
      "filter",
      createEntry(
        FilterValueSchema,
        DEFAULT_FILTER,
        "CSS filter and backdrop-filter effects",
      ),
    ],
    ["link", createEntry(LinkValueSchema, DEFAULT_LINK, "Link URL and target")],
    [
      "image",
      createEntry(ImageValueSchema, DEFAULT_IMAGE, "Image source and display"),
    ],
    [
      "video",
      createEntry(VideoValueSchema, DEFAULT_VIDEO, "Video source and playback"),
    ],
    [
      "visibility",
      createEntry(
        VisibilityValueSchema,
        DEFAULT_VISIBILITY,
        "Display and visibility",
      ),
    ],
    [
      "classes",
      createEntry(ClassesValueSchema, DEFAULT_CLASSES, "CSS classes"),
    ],
    [
      "motion",
      createEntry(
        NodeMotionSchema,
        DEFAULT_NODE_MOTION,
        "Motion & entrance animation",
      ),
    ],
  ]);

  return {
    get<K extends PropertySchemaKey>(key: K): SchemaEntry | undefined {
      return entries.get(key);
    },

    validate<T>(key: PropertySchemaKey, value: T): ValidationResult<T> {
      const entry = entries.get(key);
      if (!entry) {
        return { success: true, data: value };
      }
      return entry.validate(value) as ValidationResult<T>;
    },

    getDefault<K extends PropertySchemaKey>(key: K): z.infer<z.ZodType> {
      const entry = entries.get(key);
      return entry?.defaultValue;
    },

    has(key: string): boolean {
      return entries.has(key as PropertySchemaKey);
    },

    keys(): PropertySchemaKey[] {
      return Array.from(entries.keys());
    },
  };
}

let _registry: SchemaRegistry | null = null;

export function getSchemaRegistry(): SchemaRegistry {
  if (!_registry) {
    _registry = createSchemaRegistry();
  }
  return _registry;
}

export function zodErrorsToValidationErrors(
  zodError: z.ZodError,
): ValidationError[] {
  return zodError.issues.map((e) => ({
    path: e.path as (string | number)[],
    message: e.message,
    code: e.code,
  }));
}

export function formatValidationErrors(errors: ValidationError[]): string {
  return errors
    .map((e) => {
      const path = e.path.length > 0 ? `${e.path.join(".")}: ` : "";
      return `${path}${e.message}`;
    })
    .join("\n");
}
