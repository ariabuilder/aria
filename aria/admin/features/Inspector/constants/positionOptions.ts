export interface PositionOption {
  label: string;
  value: string;
  row: number;
  column: number;
}

export const DEFAULT_POSITION_VALUE = "center";

export const POSITION_PREVIEW_DOT_COUNT = 9;

export const POSITION_OPTIONS_3X3: PositionOption[] = [
  { label: "Top Left", value: "top left", row: 0, column: 0 },
  { label: "Top", value: "top center", row: 0, column: 1 },
  { label: "Top Right", value: "top right", row: 0, column: 2 },
  { label: "Left", value: "center left", row: 1, column: 0 },
  { label: "Center", value: "center", row: 1, column: 1 },
  { label: "Right", value: "center right", row: 1, column: 2 },
  { label: "Bottom Left", value: "bottom left", row: 2, column: 0 },
  { label: "Bottom", value: "bottom center", row: 2, column: 1 },
  { label: "Bottom Right", value: "bottom right", row: 2, column: 2 },
];

const POSITION_ALIAS_TO_CANONICAL: Record<string, string> = {
  top: "top center",
  bottom: "bottom center",
  left: "center left",
  right: "center right",
  center: "center",
  "top center": "top center",
  "center left": "center left",
  "center right": "center right",
  "bottom center": "bottom center",
  "top left": "top left",
  "top right": "top right",
  "bottom left": "bottom left",
  "bottom right": "bottom right",
};

export function normalizePositionValue(
  value: string | null | undefined,
): string {
  if (typeof value !== "string") {
    return DEFAULT_POSITION_VALUE;
  }

  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) {
    return DEFAULT_POSITION_VALUE;
  }

  return POSITION_ALIAS_TO_CANONICAL[normalized] ?? normalized;
}

export function getPositionOption(
  value: string | null | undefined,
): PositionOption | undefined {
  const normalized = normalizePositionValue(value);

  return POSITION_OPTIONS_3X3.find((option) => option.value === normalized);
}

export function isPositionPreviewDotActive(
  option: PositionOption,
  dotIndex: number,
): boolean {
  return dotIndex === option.row * 3 + option.column + 1;
}
