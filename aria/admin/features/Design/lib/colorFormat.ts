import { colord, type Colord } from "colord";

export type ColorInputFormat =
  | "hex"
  | "rgb"
  | "hsl"
  | "hsv"
  | "oklch"
  | "raw";

export const COLOR_INPUT_FORMATS: ReadonlyArray<{
  key: ColorInputFormat;
  label: string;
}> = [
  { key: "hex", label: "HEX" },
  { key: "rgb", label: "RGB" },
  { key: "hsl", label: "HSL" },
  { key: "hsv", label: "HSV" },
  { key: "oklch", label: "OKLCH" },
  { key: "raw", label: "RAW" },
] as const;

function toHexAlphaChannel(alpha: number): string {
  const normalized = Math.max(0, Math.min(1, alpha));
  return Math.round(normalized * 255)
    .toString(16)
    .padStart(2, "0");
}

function toOpaqueHex(color: Colord): string {
  const { r, g, b } = color.toRgb();
  return `#${[r, g, b]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function toSerializedHex(color: Colord, showAlpha: boolean): string {
  const alpha = color.alpha();
  if (showAlpha && alpha < 1) {
    return `${toOpaqueHex(color)}${toHexAlphaChannel(alpha)}`;
  }
  return toOpaqueHex(color);
}

export function parseOklch(str: string): string | null {
  const matched = str
    .trim()
    .match(/^oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)\s*\)$/i);
  if (!matched) return null;

  let L = parseFloat(matched[1]);
  const C = parseFloat(matched[2]);
  const H = parseFloat(matched[3]);
  if (L > 1) L /= 100;

  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  const lr = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const lg = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const lb = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  const toSrgb = (c: number) => {
    const clamped = Math.max(0, Math.min(1, c));
    return clamped <= 0.0031308
      ? Math.round(clamped * 12.92 * 255)
      : Math.round((1.055 * Math.pow(clamped, 1 / 2.4) - 0.055) * 255);
  };

  const r = toSrgb(lr);
  const g = toSrgb(lg);
  const bv = toSrgb(lb);
  return `#${r.toString(16).padStart(2, "0")}${g
    .toString(16)
    .padStart(2, "0")}${bv.toString(16).padStart(2, "0")}`;
}

function parseHsvInput(value: string): Colord | null {
  const matched = value
    .trim()
    .match(/^([\d.]+)\s*°?\s+([\d.]+)\s*%?\s+([\d.]+)\s*%?$/);
  if (!matched) {
    return null;
  }

  const parsed = colord({
    h: Number(matched[1]),
    s: Number(matched[2]),
    v: Number(matched[3]),
  });
  return parsed.isValid() ? parsed : null;
}

function srgbToLinear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

export function colordToOklchString(color: Colord): string {
  const { r, g, b } = color.toRgb();

  const lr = srgbToLinear(r / 255);
  const lg = srgbToLinear(g / 255);
  const lb = srgbToLinear(b / 255);

  const l_ = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
  );
  const m_ = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
  );
  const s_ = Math.cbrt(
    0.0883024619 * lr + 0.2024326966 * lg + 0.7092648415 * lb,
  );

  const lightness = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bOk = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const chroma = Math.sqrt(a * a + bOk * bOk);
  let hue = (Math.atan2(bOk, a) * 180) / Math.PI;
  if (hue < 0) {
    hue += 360;
  }

  return `oklch(${(lightness * 100).toFixed(1)}% ${chroma.toFixed(3)} ${hue.toFixed(1)})`;
}

export function formatColorInput(
  color: Colord,
  format: ColorInputFormat,
  options: { showAlpha?: boolean } = {},
): string {
  const { showAlpha = false } = options;

  switch (format) {
    case "hex":
      return toSerializedHex(color, showAlpha);
    case "rgb": {
      const { r, g, b, a } = color.toRgb();
      if (showAlpha && a < 1) {
        return `rgba(${r}, ${g}, ${b}, ${a})`;
      }
      return `rgb(${r}, ${g}, ${b})`;
    }
    case "hsl": {
      const { h, s, l, a } = color.toHsl();
      if (showAlpha && a < 1) {
        return `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${a})`;
      }
      return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
    }
    case "hsv": {
      const { h, s, v } = color.toHsv();
      return `${Math.round(h)}° ${Math.round(s)}% ${Math.round(v)}%`;
    }
    case "oklch":
      return colordToOklchString(color);
    case "raw":
      return toSerializedHex(color, showAlpha);
    default:
      return toSerializedHex(color, showAlpha);
  }
}

export function parseColorInput(
  value: string,
  format: ColorInputFormat,
  options: { showAlpha?: boolean } = {},
): Colord | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (format === "raw") {
    return null;
  }

  if (format === "oklch") {
    const fromOklch = parseOklch(trimmed);
    if (!fromOklch) {
      return null;
    }
    const parsed = colord(fromOklch);
    return parsed.isValid() ? parsed : null;
  }

  if (format === "hsv") {
    return parseHsvInput(trimmed);
  }

  if (format === "hex" && !trimmed.startsWith("#")) {
    const fromOklch = parseOklch(trimmed);
    if (fromOklch) {
      const parsed = colord(fromOklch);
      return parsed.isValid() ? parsed : null;
    }
  }

  const parsed = colord(trimmed);
  if (!parsed.isValid()) {
    return null;
  }

  if (!options.showAlpha) {
    return parsed.alpha(1);
  }

  return parsed;
}

export function resolveColorPickerPopoverWidthClass(options: {
  layout?: "compact" | "unified";
  showDesignColors?: boolean;
  showVariables?: boolean;
  contentClass?: string;
}): string {
  if (options.contentClass) {
    return options.contentClass;
  }

  if (options.layout === "unified") {
    if (options.showDesignColors || options.showVariables) {
      return "w-[288px]";
    }
    return "w-[272px]";
  }

  if (options.showDesignColors) {
    return "w-[288px]";
  }

  return "w-[272px]";
}

export function colorInputPlaceholder(format: ColorInputFormat): string {
  switch (format) {
    case "hex":
      return "#000000";
    case "rgb":
      return "rgb(0, 0, 0)";
    case "hsl":
      return "hsl(0, 0%, 0%)";
    case "hsv":
      return "0° 0% 0%";
    case "oklch":
      return "oklch(0% 0 0)";
    case "raw":
      return "var(--accent-300)";
    default:
      return "#000000";
  }
}
