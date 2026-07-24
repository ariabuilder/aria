import {
  MediaCropRectSchema,
  MediaFocalPointSchema,
  type MediaCropRect,
  type MediaFocalPoint,
} from "./schemas";

type Dimensions = { width: number; height: number };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function stable(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Creates the largest normalized crop matching an aspect ratio and positions
 * it around the editorial focal point. The returned rectangle is.
 */
export function createFocalAspectRatioCrop(input: {
  source: Dimensions;
  aspectRatio: Dimensions;
  focalPoint?: MediaFocalPoint | null;
}): MediaCropRect {
  const sourceWidth = Math.max(1, input.source.width);
  const sourceHeight = Math.max(1, input.source.height);
  const ratioWidth = Math.max(Number.EPSILON, input.aspectRatio.width);
  const ratioHeight = Math.max(Number.EPSILON, input.aspectRatio.height);
  const focalPoint = MediaFocalPointSchema.parse(
    input.focalPoint ?? { x: 0.5, y: 0.5 },
  );
  const sourceRatio = sourceWidth / sourceHeight;
  const desiredRatio = ratioWidth / ratioHeight;
  let width = 1;
  let height = 1;

  if (sourceRatio > desiredRatio) {
    width = desiredRatio / sourceRatio;
  } else {
    height = sourceRatio / desiredRatio;
  }

  const x = clamp(focalPoint.x - width / 2, 0, 1 - width);
  const y = clamp(focalPoint.y - height / 2, 0, 1 - height);

  return MediaCropRectSchema.parse({
    x: stable(x),
    y: stable(y),
    width: stable(width),
    height: stable(height),
  });
}
