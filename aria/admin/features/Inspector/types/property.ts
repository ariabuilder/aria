/**
 * Type definitions for all property input components. Each property
 * type has its value interface and related types.
 */

import type { Responsive } from "../../../../lib/types/nodes";

export type InputMode = "inspector" | "canvas" | "dialog";

/**
 * Base props shared by all property inputs
 */
export interface BaseInputProps {
  title: string;
  defaultOpen?: boolean;
  open?: boolean;
  /** Disable all inputs */
  disabled?: boolean;
  mode?: InputMode;
}

export type SpacingSide = "top" | "right" | "bottom" | "left";

export type SpacingType = "margin" | "padding";

export interface SpacingValue {
  marginTop: Responsive<string>;
  marginRight: Responsive<string>;
  marginBottom: Responsive<string>;
  marginLeft: Responsive<string>;
  paddingTop: Responsive<string>;
  paddingRight: Responsive<string>;
  paddingBottom: Responsive<string>;
  paddingLeft: Responsive<string>;
}

export type FontWeightOption =
  | "100"
  | "200"
  | "300"
  | "400"
  | "500"
  | "600"
  | "700"
  | "800"
  | "900";

export type TextAlignOption = "left" | "center" | "right" | "justify";

export type TextTransformOption =
  | "none"
  | "uppercase"
  | "lowercase"
  | "capitalize";

export interface TypographyValue {
  fontFamily: Responsive<string>;
  fontSize: Responsive<string>;
  fontWeight: Responsive<FontWeightOption>;
  lineHeight: Responsive<string>;
  letterSpacing: Responsive<string>;
  textAlign: Responsive<TextAlignOption>;
  textTransform: Responsive<TextTransformOption>;
  textDecoration: Responsive<string>;
  color: Responsive<string>;
}

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface TextValue {
  text?: string;
  content?: string;
  label?: string;
  level?: HeadingLevel;
}

export type BorderSide = "all" | "top" | "right" | "bottom" | "left";

export type BorderStyleOption =
  | "none"
  | "solid"
  | "dashed"
  | "dotted"
  | "double"
  | "groove"
  | "ridge"
  | "inset"
  | "outset";

export interface BorderValue {
  borderWidth: Responsive<string>;
  borderStyle: Responsive<BorderStyleOption>;
  borderColor: Responsive<string>;
  borderTopWidth?: Responsive<string>;
  borderRightWidth?: Responsive<string>;
  borderBottomWidth?: Responsive<string>;
  borderLeftWidth?: Responsive<string>;
}

export type BackgroundType = "color" | "gradient" | "image" | "none";

export interface GradientStop {
  color: string;
  position: number; // 0-100
}

export interface BackgroundValue {
  type: BackgroundType;
  color?: Responsive<string>;
  gradient?: {
    type: "linear" | "radial";
    angle?: number;
    stops: GradientStop[];
  };
  image?: {
    url: string;
    size: "cover" | "contain" | "auto" | string;
    position: string;
    repeat: "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
  };
}

export type SizeUnit =
  | "px"
  | "rem"
  | "em"
  | "%"
  | "vw"
  | "vh"
  | "auto"
  | "fit-content"
  | "min-content"
  | "max-content";

/**
 * Figma-like sizing modes
 */
export type SizeMode = "hug" | "fill" | "exact";

export interface SizeValue {
  width: Responsive<string>;
  height: Responsive<string>;
  widthSizing: Responsive<SizeMode>;
  heightSizing: Responsive<SizeMode>;
  minWidth: Responsive<string>;
  minHeight: Responsive<string>;
  maxWidth: Responsive<string>;
  maxHeight: Responsive<string>;
}

// CORNER (BORDER RADIUS)

export type CornerSide =
  | "all"
  | "topLeft"
  | "topRight"
  | "bottomRight"
  | "bottomLeft";

export interface CornerValue {
  borderRadius: Responsive<string>;
  borderTopLeftRadius?: Responsive<string>;
  borderTopRightRadius?: Responsive<string>;
  borderBottomRightRadius?: Responsive<string>;
  borderBottomLeftRadius?: Responsive<string>;
}

export type ShadowType = "box" | "drop" | "text";

export interface ShadowDefinition {
  type: ShadowType;
  offsetX: string;
  offsetY: string;
  blur: string;
  spread?: string;
  color: string;
  inset?: boolean;
}

export interface ShadowValue {
  boxShadow: Responsive<string>;
  shadows?: ShadowDefinition[];
}

export type LinkTarget = "_self" | "_blank" | "_parent" | "_top";

export interface LinkValue {
  href: string;
  target: LinkTarget;
  rel?: string;
  title?: string;
  download?: boolean | string;
}

export type ImageFit = "cover" | "contain" | "fill" | "none" | "scale-down";

export interface ImageValue {
  src: string;
  alt: string;
  width?: string;
  height?: string;
  loading?: "lazy" | "eager";
  objectFit?: ImageFit;
  objectPosition?: string;
}

export interface VisibilityBreakpoint {
  breakpoint: string;
  visible: boolean;
}

export interface VisibilityValue {
  display: Responsive<string>;
  visibility: Responsive<"visible" | "hidden" | "collapse">;
  opacity: Responsive<string>;
  breakpoints?: VisibilityBreakpoint[];
}

/**
 * Tailwind class categories
 */
export type TailwindClassCategory =
  | "layout"
  | "flexbox"
  | "grid"
  | "spacing"
  | "sizing"
  | "typography"
  | "backgrounds"
  | "borders"
  | "effects"
  | "filters"
  | "transitions"
  | "transforms"
  | "interactivity"
  | "custom";

export interface ClassesValue {
  tailwind: string[];
  custom: string[];
  className: string;
  byCategory?: Record<TailwindClassCategory, string[]>;
}
