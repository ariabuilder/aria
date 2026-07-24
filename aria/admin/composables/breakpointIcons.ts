import { studioIcons } from "../lib/icons";
import {
  DEFAULT_DESKTOP_CANVAS_WIDTH,
  DEFAULT_MOBILE_CANVAS_WIDTH,
  DEFAULT_TABLET_MIN_WIDTH,
} from "../../lib/styles/responsiveBreakpoints";

export type BreakpointIconToken =
  | "Monitor"
  | "Laptop"
  | "Tablet"
  | "Smartphone";

type BreakpointIconInput = {
  id?: string | null;
  icon?: string | null;
  width?: number | null;
};

const BREAKPOINT_ICON_CLASS_MAP: Record<BreakpointIconToken, string> = {
  Monitor: studioIcons.monitor,
  Laptop: studioIcons.laptop,
  Tablet: studioIcons.tablet,
  Smartphone: studioIcons.smartphone,
};

function normalizeIconToken(
  value: string | null | undefined,
): BreakpointIconToken | null {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case "monitor":
    case "monitorspeaker":
    case "tv":
    case "tv2":
      return "Monitor";
    case "laptop":
      return "Laptop";
    case "tablet":
      return "Tablet";
    case "smartphone":
    case "phone":
    case "mobile":
      return "Smartphone";
    default:
      return null;
  }
}

export function resolveBreakpointIconToken(
  input: BreakpointIconInput,
): BreakpointIconToken {
  const idToken = normalizeIconToken(input.id);
  if (idToken) {
    return idToken;
  }

  const iconToken = normalizeIconToken(input.icon);
  if (iconToken) {
    return iconToken;
  }

  if (typeof input.width === "number" && input.width > 0) {
    if (input.width <= DEFAULT_MOBILE_CANVAS_WIDTH) {
      return "Smartphone";
    }

    if (input.width <= DEFAULT_TABLET_MIN_WIDTH) {
      return "Tablet";
    }

    if (input.width < DEFAULT_DESKTOP_CANVAS_WIDTH) {
      return "Laptop";
    }
  }

  return "Monitor";
}

export function getBreakpointIconClass(input: BreakpointIconInput): string {
  return BREAKPOINT_ICON_CLASS_MAP[resolveBreakpointIconToken(input)];
}
