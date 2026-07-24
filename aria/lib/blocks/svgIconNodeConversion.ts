import { z } from "zod";
import type { BuilderNode, JsonObject, StyleMap } from "../types/nodes";
import {
  getCanonicalIconIdFromValue,
  IconReferenceSchema,
} from "../icons/reference";
import type { IconSvgRecord } from "../icons/iconData";
import {
  buildSvgMarkupFromIconData,
  parseSvgMarkup,
  type SvgNodeProps,
} from "./parseSvgMarkup";
import { StyleMapSchema } from "../schemas/nodes";

const DEFAULT_ICON_REFERENCE = IconReferenceSchema.parse({
  id: "lucide:star",
  pack: "lucide",
  name: "star",
  source: "iconify",
  version: "2026-06-24-local",
});

const DimensionSchema = z.string().trim().min(1).max(120);

export const NormalizedSwapNodeTypeSchema = z.enum(["svg", "icon"]);

export type NormalizedSwapNodeType = z.infer<typeof NormalizedSwapNodeTypeSchema>;
export type IconSvgRecordResolver = (
  canonicalId: string,
) => Promise<IconSvgRecord | null>;

export function normalizeSwapNodeType(type: string): NormalizedSwapNodeType | null {
  const normalized = type.trim().toLowerCase();
  if (normalized === "svg") {
    return "svg";
  }
  if (normalized === "icon" || normalized === "i") {
    return "icon";
  }
  return null;
}

export function isLeafSwapCandidate(node: BuilderNode): boolean {
  return (node.children?.length ?? 0) === 0;
}

function ensureCssPx(value: string): string {
  if (/^\d+(\.\d+)?$/.test(value)) {
    return `${value}px`;
  }
  return value;
}

function readDimension(value: unknown): string | null {
  const parsed = DimensionSchema.safeParse(value);
  return parsed.success ? ensureCssPx(parsed.data) : null;
}

function readStyleDimension(
  styles: StyleMap,
  key: "width" | "height" | "fontSize" | "color",
): string | null {
  const entry = styles[key];
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const base = entry.base;
  return typeof base === "string" ? readDimension(base) : null;
}

function mergeStylesForIcon(source: BuilderNode): StyleMap {
  const parsedStyles = StyleMapSchema.safeParse(source.styles);
  const baseStyles: StyleMap = parsedStyles.success ? { ...parsedStyles.data } : {};

  const width =
    readStyleDimension(baseStyles, "width") ??
    readDimension(source.props?.width) ??
    "40px";
  const height =
    readStyleDimension(baseStyles, "height") ??
    readDimension(source.props?.height) ??
    width;
  const fontSize = readStyleDimension(baseStyles, "fontSize") ?? width;
  const color =
    readStyleDimension(baseStyles, "color") ??
    readDimension(source.props?.stroke) ??
    readDimension(source.props?.fill);

  return {
    ...baseStyles,
    width: { ...baseStyles.width, base: width },
    height: { ...baseStyles.height, base: height },
    fontSize: { ...baseStyles.fontSize, base: fontSize },
    ...(color ? { color: { ...baseStyles.color, base: color } } : {}),
  };
}

function mergeStylesForSvg(source: BuilderNode, svgProps: SvgNodeProps): StyleMap {
  const parsedStyles = StyleMapSchema.safeParse(source.styles);
  const baseStyles: StyleMap = parsedStyles.success ? { ...parsedStyles.data } : {};

  return {
    ...baseStyles,
    width: { ...baseStyles.width, base: svgProps.width },
    height: { ...baseStyles.height, base: svgProps.height },
  };
}

function svgPropsToNodeProps(svgProps: SvgNodeProps): JsonObject {
  return {
    viewBox: svgProps.viewBox,
    width: svgProps.width,
    height: svgProps.height,
    fill: svgProps.fill,
    stroke: svgProps.stroke,
    "stroke-width": svgProps["stroke-width"],
    "stroke-linecap": svgProps["stroke-linecap"],
    "stroke-linejoin": svgProps["stroke-linejoin"],
    content: svgProps.content,
  };
}

export function svgToIconNode(source: BuilderNode): BuilderNode {
  return {
    id: source.id,
    type: "icon",
    props: {
      icon: DEFAULT_ICON_REFERENCE,
      ariaLabel: "Icon",
    },
    styles: mergeStylesForIcon(source),
    children: [],
    ...(source.slot ? { slot: source.slot } : {}),
    ...(source.classNames ? { classNames: source.classNames } : {}),
    ...(source.customClasses?.length
      ? { customClasses: [...source.customClasses] }
      : {}),
  };
}

export function iconSvgRecordToNode(
  source: BuilderNode,
  record: IconSvgRecord,
): BuilderNode | null {
  const markup = buildSvgMarkupFromIconData({
    svg: record.svg,
    viewBox: record.viewBox,
  });
  if (!markup) {
    return null;
  }

  const svgProps = parseSvgMarkup(markup);
  if (!svgProps) {
    return null;
  }

  return {
    id: source.id,
    type: "svg",
    props: svgPropsToNodeProps(svgProps),
    styles: mergeStylesForSvg(source, svgProps),
    children: [],
    ...(source.slot ? { slot: source.slot } : {}),
    ...(source.classNames ? { classNames: source.classNames } : {}),
    ...(source.customClasses?.length
      ? { customClasses: [...source.customClasses] }
      : {}),
  };
}

export async function iconToSvgNode(
  source: BuilderNode,
  resolveIcon: IconSvgRecordResolver,
): Promise<BuilderNode | null> {
  const canonicalId = getCanonicalIconIdFromValue(source.props?.icon);
  if (!canonicalId) {
    return null;
  }

  const record = await resolveIcon(canonicalId);
  if (!record) {
    return null;
  }

  return iconSvgRecordToNode(source, record);
}

export function buildSwappedNode(
  source: BuilderNode,
  strategyId: "svg-to-icon" | "icon-to-svg",
  resolveIcon?: IconSvgRecordResolver,
): Promise<BuilderNode | null> | BuilderNode | null {
  if (strategyId === "svg-to-icon") {
    return svgToIconNode(source);
  }
  return resolveIcon ? iconToSvgNode(source, resolveIcon) : null;
}
