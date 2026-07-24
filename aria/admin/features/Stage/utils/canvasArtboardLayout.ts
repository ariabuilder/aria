export type ArtboardLayoutMode = "fixed" | "fluid";

export interface ArtboardLayout {
  mode: ArtboardLayoutMode;
  artboardWidthPx: number | null;
  slotWidthPx: number | null;
  isScaledFixed: boolean;
  artboardStyle: Record<string, string>;
  slotStyle: Record<string, string>;
}

export function parseArtboardWidthPx(width: string | undefined): number | null {
  if (!width) {
    return null;
  }

  const match = width.match(/^(\d+(?:\.\d+)?)px$/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function isFluidArtboardWidth(width: string | undefined): boolean {
  return !width || width === "100%";
}

export function computeArtboardLayout(
  canvasStyle: Record<string, string>,
  scale: number,
): ArtboardLayout {
  const baseWidth = canvasStyle.width || "100%";
  const artboardWidthPx = parseArtboardWidthPx(baseWidth);
  const clampedScale =
    typeof scale === "number" && Number.isFinite(scale) && scale > 0 ? scale : 1;

  if (artboardWidthPx != null) {
    const slotWidthPx = Math.round(artboardWidthPx * clampedScale);

    const slotStyle: Record<string, string> = {
      width: `${slotWidthPx}px`,
      maxWidth: "none",
      height: "100%",
      flexShrink: "0",
      position: "relative",
      overflow: "visible",
    };

    const artboardStyle: Record<string, string> = {
      ...canvasStyle,
      width: `${artboardWidthPx}px`,
      maxWidth: `${artboardWidthPx}px`,
      height: `${100 / clampedScale}%`,
      transform: `scale(${clampedScale})`,
      transformOrigin: "top left",
      position: "absolute",
      top: "0",
      left: "0",
    };

    return {
      mode: "fixed",
      artboardWidthPx,
      slotWidthPx,
      isScaledFixed: true,
      slotStyle,
      artboardStyle,
    };
  }

  let fluidWidth = baseWidth;
  let fluidMaxWidth = canvasStyle.maxWidth || "none";

  if (clampedScale !== 1 && isFluidArtboardWidth(baseWidth)) {
    fluidWidth = `${clampedScale * 100}%`;
    fluidMaxWidth = `${clampedScale * 100}%`;
  }

  return {
    mode: "fluid",
    artboardWidthPx: null,
    slotWidthPx: null,
    isScaledFixed: false,
    slotStyle: {
      width: "100%",
      maxWidth: "100%",
      height: "100%",
      flexShrink: "1",
    },
    artboardStyle: {
      ...canvasStyle,
      width: fluidWidth,
      maxWidth: fluidMaxWidth,
      height: "100%",
      transform: "none",
      transformOrigin: "top left",
    },
  };
}
