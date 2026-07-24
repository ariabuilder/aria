/**
 * Central export for all Inspector-related types. 100% type safety, no `any` types.
 */

export type {
  BuilderNode,
  StyleMap,
  Responsive,
  LayoutDSL,
  ComponentDSL,
  PageDSL,
} from "../../../../lib/types/nodes";

export type {
  InspectorTab,
  InspectorMode,
  InspectorState,

  SelectedElementContext,
  ElementCapabilities,

  NodePath,
  NodeTarget,

  PropertyUpdate,
  StyleUpdate,
  BatchUpdate,
  UpdateResult,

  InspectorEvent,
  InspectorEventMap,
} from "./inspector";

export type {
  BaseInputProps,
  InputMode,

  SpacingValue,
  SpacingSide,
  SpacingType,

  TypographyValue,
  FontWeightOption,
  TextAlignOption,
  TextTransformOption,
  TextValue,

  BorderValue,
  BorderSide,
  BorderStyleOption,

  BackgroundValue,
  BackgroundType,
  GradientStop,

  SizeValue,
  SizeUnit,

  CornerValue,
  CornerSide,

  ShadowValue,
  ShadowType,

  LinkValue,
  LinkTarget,

  ImageValue,
  ImageFit,

  VisibilityValue,
  VisibilityBreakpoint,

  ClassesValue,
  TailwindClassCategory,
} from "./property";

export type {
  SchemaEntry,
  ValidationResult,
  ValidationError,
  PropertySchemaMap,
} from "./schema";
