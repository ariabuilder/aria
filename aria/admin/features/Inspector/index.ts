/**
 * Inspector feature exports (property editors and design panels).
 */
export {
  InspectorPanel,
  InspectorHeader,
  InspectorTabs,
  InspectorEmpty,
} from "./components";

export { DesignTab, PropsTab, MotionTab } from "./tabs";

export {
  // Main orchestrator
  useInspector,

  // Core composables
  useInspectorState,
  useNodeMutations,
  usePropertySchema,

  // Tab-specific
  useDesignEditor,
  usePropsEditor,
} from "./composables";

export type {
  // Inspector types
  InspectorTab,
  InspectorMode,
  NodePath,
  NodeTarget,
  PropertyUpdate,
  StyleUpdate,
  BatchUpdate,
  UpdateResult,
  SelectedElementContext,

  // Property value types
  SpacingValue,
  TypographyValue,
  BorderValue,
  BackgroundValue,
  SizeValue,
  CornerValue,
  ShadowValue,
  LinkValue,
  ImageValue,
  TextValue,
  VisibilityValue,
  ClassesValue,

  // Schema types
  ValidationResult,
  SchemaEntry,
  PropertySchemaMap,
} from "./types";

export {
  // Registry
  createSchemaRegistry,
  type SchemaRegistry,

  // Responsive
  ResponsiveStringSchema,
  createResponsiveSchema,

  // Individual schemas
  SpacingValueSchema,
  TypographyValueSchema,
  BorderValueSchema,
  BackgroundValueSchema,
  SizeValueSchema,
  CornerValueSchema,
  ShadowValueSchema,
  LinkValueSchema,
  ImageValueSchema,
  TextValueSchema,
  VisibilityValueSchema,
  ClassesValueSchema,

  // Defaults
  DEFAULT_SPACING,
  DEFAULT_TYPOGRAPHY,
  DEFAULT_BORDER,
  DEFAULT_BACKGROUND,
  DEFAULT_SIZE,
  DEFAULT_CORNER,
  DEFAULT_SHADOW,
  DEFAULT_LINK,
  DEFAULT_IMAGE,
  DEFAULT_TEXT,
  DEFAULT_VISIBILITY,
  DEFAULT_CLASSES,
} from "./schemas";

// INPUTS (re-exported from existing location)

export * from "./inputs";
