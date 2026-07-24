import { normalizeResponsiveStyleMap } from "../../../../lib/blocks/normalizeResponsiveStyleMap";
import type { Responsive, StyleMap } from "../../../../lib/types/nodes";
import type { CanvasStyleUpdate } from "../../Core/composables/useCanvasSignalBridge";

function normalizeResponsiveValue(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }

  return typeof value === "string" ? value : String(value);
}

export function canvasStyleUpdateToStyleMap(
  styles: CanvasStyleUpdate["styles"],
): StyleMap {
  return mergeCanvasStyleUpdateIntoStyleMap({}, styles);
}

export function mergeCanvasStyleUpdateIntoStyleMap(
  existing: StyleMap | undefined,
  styles: CanvasStyleUpdate["styles"],
): StyleMap {
  const styleMap: StyleMap = Object.fromEntries(
    Object.entries(existing ?? {}).map(([property, responsiveValues]) => [
      property,
      responsiveValues && typeof responsiveValues === "object"
        ? { ...responsiveValues }
        : responsiveValues,
    ]),
  );

  for (const [breakpoint, properties] of Object.entries(styles)) {
    for (const [property, value] of Object.entries(properties)) {
      const existingValue = styleMap[property];
      const responsiveValues =
        existingValue && typeof existingValue === "object"
          ? { ...existingValue }
          : {};
      const normalizedValue = normalizeResponsiveValue(value);

      if (normalizedValue === undefined) {
        delete responsiveValues[breakpoint];
      } else {
        responsiveValues[breakpoint] = normalizedValue;
      }

      if (Object.keys(responsiveValues).length === 0) {
        delete styleMap[property];
        continue;
      }

      styleMap[property] = responsiveValues;
    }
  }

  return styleMap;
}

function cloneResponsiveValue(
  value: Responsive<string> | string | undefined,
): Responsive<string> | string | undefined {
  if (!value || typeof value !== "object") {
    return value;
  }

  return { ...value };
}

export function mergeNodeStylesWithLiveOverrides(
  nodeStyles: StyleMap | undefined,
  liveStyles: StyleMap,
): StyleMap {
  const mergedStyles: StyleMap = {};
  const propertyNames = new Set([
    ...Object.keys(nodeStyles ?? {}),
    ...Object.keys(liveStyles),
  ]);

  for (const propertyName of propertyNames) {
    const nodeValue = nodeStyles?.[propertyName];
    const liveValue = liveStyles[propertyName];

    if (liveValue === undefined) {
      const clonedValue = cloneResponsiveValue(
        nodeValue as Responsive<string> | string | undefined,
      );
      if (clonedValue !== undefined) {
        mergedStyles[propertyName] = clonedValue as StyleMap[string];
      }
      continue;
    }

    if (typeof liveValue !== "object") {
      mergedStyles[propertyName] = liveValue;
      continue;
    }

    const mergedResponsiveValues = {
      ...normalizeResponsiveStyleMap(nodeValue),
    };

    for (const [breakpoint, value] of Object.entries(liveValue)) {
      if (value === undefined) {
        delete mergedResponsiveValues[breakpoint];
        continue;
      }

      mergedResponsiveValues[breakpoint] = value;
    }

    if (Object.keys(mergedResponsiveValues).length > 0) {
      mergedStyles[propertyName] = mergedResponsiveValues;
    }
  }

  return mergedStyles;
}
