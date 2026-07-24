/**
 * Inspector Schemas - Central Export
 *
 * All Zod schemas for property validation.
 */

export {
  ResponsiveStringSchema,
  createResponsiveSchema,
} from "./responsive.schema";

export {
  SpacingValueSchema,
  SpacingSideSchema,
  SpacingTypeSchema,
  DEFAULT_SPACING,
} from "./spacing.schema";

export {
  TypographyValueSchema,
  FontWeightSchema,
  TextAlignSchema,
  TextTransformSchema,
  TextWrapSchema,
  DEFAULT_TYPOGRAPHY,
} from "./typography.schema";

export {
  BorderValueSchema,
  BorderSideSchema,
  BorderStyleSchema,
  DEFAULT_BORDER,
} from "./border.schema";

export {
  BackgroundValueSchema,
  BackgroundTypeSchema,
  GradientStopSchema,
  DEFAULT_BACKGROUND,
} from "./background.schema";

export { SizeValueSchema, SizeUnitSchema, DEFAULT_SIZE } from "./size.schema";

export {
  PositionValueSchema,
  PositionModeSchema,
  DEFAULT_POSITION,
} from "./position.schema";

export {
  TransformValueSchema,
  DEFAULT_TRANSFORM,
  TRANSFORM_DEFAULTS,
  defaultTransformState,
  transformStateToCSS,
  transformOriginStateToCSS,
  cssToTransformState,
  hasUnsupportedTransformFunctions,
  type TransformValue,
  type TransformState,
} from "./transform.schema";

export {
  CornerValueSchema,
  CornerSideSchema,
  DEFAULT_CORNER,
} from "./corner.schema";

export {
  ShadowValueSchema,
  ShadowDefinitionSchema,
  ShadowTypeSchema,
  DEFAULT_SHADOW,
} from "./shadow.schema";

export { LinkValueSchema, LinkTargetSchema, DEFAULT_LINK } from "./link.schema";

export { ImageValueSchema, DEFAULT_IMAGE } from "./image.schema";

export {
  VideoValueSchema,
  VideoPreloadSchema,
  DEFAULT_VIDEO,
} from "./video.schema";

export {
  VisibilityValueSchema,
  VisibilityBreakpointSchema,
  DEFAULT_VISIBILITY,
} from "./visibility.schema";

export {
  ClassesValueSchema,
  TailwindClassCategorySchema,
  DEFAULT_CLASSES,
} from "./classes.schema";

export {
  FilterValueSchema,
  FilterDropShadowSchema,
  DEFAULT_FILTER,
  filterStateToCSS,
  cssToFilterState,
  defaultFilterState,
  FILTER_DEFAULTS,
  type FilterValue,
  type FilterState,
  type FilterDropShadow,
} from "./filter.schema";

export {
  TextValueSchema,
  HeadingLevelSchema,
  DEFAULT_TEXT,
} from "./text.schema";

export {
  ListValueSchema,
  ListStyleTypeSchema,
  ListStylePositionSchema,
  DEFAULT_LIST,
} from "./list.schema";

export { createSchemaRegistry, type SchemaRegistry } from "./registry";
