import { DESKTOP_BASE_BREAKPOINT } from "../styles/responsiveBreakpoints";

export type ResponsiveStyleMap = Record<string, string | undefined>;

export function normalizeResponsiveStyleMap(value: unknown): ResponsiveStyleMap {
  if (typeof value === "string") {
    return { [DESKTOP_BASE_BREAKPOINT]: value };
  }

  if (!value || typeof value !== "object") {
    return {};
  }

  const map = { ...(value as ResponsiveStyleMap) };

  if (
    map[DESKTOP_BASE_BREAKPOINT] === undefined &&
    typeof map.desktop === "string"
  ) {
    map[DESKTOP_BASE_BREAKPOINT] = map.desktop;
  }

  if (
    map[DESKTOP_BASE_BREAKPOINT] === undefined &&
    typeof map.default === "string"
  ) {
    map[DESKTOP_BASE_BREAKPOINT] = map.default;
  }

  delete map.desktop;
  delete map.default;

  return map;
}
