import { z } from "zod";

/** Finite derivative widths shared by local Sharp and Cloudflare Images. */
export const MEDIA_RESPONSIVE_WIDTHS = [
  320, 480, 640, 768, 960, 1280, 1600, 1920, 2560,
] as const;

const widthSet = new Set<number>(MEDIA_RESPONSIVE_WIDTHS);

export const ResponsiveImageSizesSchema = z.enum([
  "100vw",
  "(max-width: 767px) 100vw, 50vw",
  "(max-width: 767px) 100vw, 33vw",
]);

export type ResponsiveImageSizes = z.infer<typeof ResponsiveImageSizesSchema>;

export const DEFAULT_RESPONSIVE_IMAGE_SIZES: ResponsiveImageSizes = "100vw";

export function resolveResponsiveDerivativeWidth(
  rawWidth: string | null | undefined,
  maxWidth: number | null | undefined,
): number | null {
  if (!rawWidth) return null;
  if (!/^\d+$/u.test(rawWidth)) return null;
  const width = Number(rawWidth);
  if (!widthSet.has(width)) return null;
  if (!maxWidth || width > maxWidth) return null;
  return width;
}

export function buildResponsiveCandidateWidths(maxWidth: number): number[] {
  if (!Number.isInteger(maxWidth) || maxWidth < 1) return [];
  return MEDIA_RESPONSIVE_WIDTHS.filter((width) => width < maxWidth);
}

export function buildResponsiveDerivativeUrl(
  baseUrl: string,
  width: number,
): string | null {
  if (!widthSet.has(width)) return null;

  let parsed: URL;
  try {
    parsed = new URL(baseUrl, "https://aria.invalid");
  } catch {
    return null;
  }
  if (/^\/media\/transform\/[^/]+\/[^/]+$/u.test(parsed.pathname)) {
    parsed.pathname = `${parsed.pathname}/${width}`;
  } else if (
    /^\/media\/source\/(?:current|[1-9]\d*)\/.+/u.test(parsed.pathname)
  ) {
    parsed.searchParams.set("width", String(width));
  } else {
    return null;
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function isResponsiveMediaDeliveryUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url, "https://aria.invalid");
  } catch {
    return false;
  }
  return (
    /^\/media\/transform\/[^/]+\/[^/]+$/u.test(parsed.pathname) ||
    /^\/media\/source\/(?:current|[1-9]\d*)\/.+/u.test(parsed.pathname)
  );
}

export function buildResponsiveSrcSet(input: {
  url: string;
  maxWidth: number;
  allowDerivatives?: boolean;
}): string | null {
  if (
    !Number.isInteger(input.maxWidth) ||
    input.maxWidth < 1 ||
    !isResponsiveMediaDeliveryUrl(input.url)
  ) {
    return null;
  }

  if (input.allowDerivatives === false) {
    return `${input.url} ${input.maxWidth}w`;
  }

  const candidates = buildResponsiveCandidateWidths(input.maxWidth)
    .map((width) => {
      const url = buildResponsiveDerivativeUrl(input.url, width);
      return url ? `${url} ${width}w` : null;
    })
    .filter((value): value is string => Boolean(value));

  candidates.push(`${input.url} ${input.maxWidth}w`);
  return candidates.join(", ");
}
