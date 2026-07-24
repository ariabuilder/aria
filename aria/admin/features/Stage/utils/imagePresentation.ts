import type { BuilderNode } from "../../../../lib/types/nodes";
import { normalizeDirectCmsMediaReference } from "../../../../lib/cms/directMediaReference";
import { parseCmsImageFieldValue } from "../../../../lib/cms/styleBindings";
import { DEFAULT_IMAGE_OBJECT_FIT } from "../../Inspector/schemas/image.schema";
import { DEFAULT_POSITION_VALUE } from "../../Inspector/constants/positionOptions";

export { DEFAULT_IMAGE_OBJECT_FIT };

function readResponsiveStyleScalar(
  value: unknown,
  fallback?: string,
): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const map = value as Record<string, string | undefined>;
  return map.base ?? Object.values(map).find((entry) => typeof entry === "string");
}

export function resolveImageObjectFit(
  block: Pick<BuilderNode, "props" | "styles">,
): string {
  const fromStyles = readResponsiveStyleScalar(block.styles?.objectFit);
  if (fromStyles) {
    return fromStyles;
  }

  const fromProps = block.props?.objectFit;
  if (typeof fromProps === "string" && fromProps.trim().length > 0) {
    return fromProps;
  }

  return DEFAULT_IMAGE_OBJECT_FIT;
}

export function resolveImageObjectPosition(
  block: Pick<BuilderNode, "props" | "styles">,
): string {
  const fromStyles = readResponsiveStyleScalar(block.styles?.objectPosition);
  if (fromStyles) {
    return fromStyles;
  }

  const fromProps = block.props?.objectPosition;
  if (typeof fromProps === "string" && fromProps.trim().length > 0) {
    return fromProps;
  }

  return DEFAULT_POSITION_VALUE;
}

export function resolveStageMediaSrc(
  value: unknown,
  options: { origin?: string } = {},
): string {
  let candidate = "";

  if (typeof value === "string") {
    candidate = normalizeDirectCmsMediaReference(value) ?? value.trim();
  } else {
    const parsed = parseCmsImageFieldValue(value);
    if (!parsed) {
      return "";
    }
    if (parsed.url?.trim()) {
      candidate =
        normalizeDirectCmsMediaReference(parsed.url) ?? parsed.url.trim();
    } else if (parsed.mediaId?.trim()) {
      candidate = normalizeDirectCmsMediaReference(parsed.mediaId) ?? "";
    }
  }

  if (!candidate) {
    return "";
  }

  if (/^https?:\/\//i.test(candidate) || candidate.startsWith("//")) {
    return candidate;
  }

  const origin = options.origin?.trim();
  if (candidate.startsWith("/") && origin) {
    try {
      return new URL(candidate, origin).href;
    } catch {
      return candidate;
    }
  }

  return candidate;
}

export function applyImagePresentationToElement(
  img: HTMLImageElement,
  options: {
    objectFit?: string;
    objectPosition?: string;
  } = {},
): void {
  img.style.display = "block";
  img.style.objectFit = options.objectFit ?? DEFAULT_IMAGE_OBJECT_FIT;
  img.style.objectPosition = options.objectPosition ?? DEFAULT_POSITION_VALUE;
}

export function syncImageEmptyStateAttribute(
  img: HTMLImageElement,
  src: string,
): void {
  if (src.trim().length > 0) {
    img.removeAttribute("data-aria-image-empty");
    return;
  }

  img.setAttribute("data-aria-image-empty", "true");
}

export function handleBrokenMediaElement(
  element: HTMLImageElement | HTMLVideoElement,
): void {
  if (element instanceof HTMLImageElement) {
    element.removeAttribute("src");
    syncImageEmptyStateAttribute(element, "");
    return;
  }

  element.removeAttribute("src");
  element.removeAttribute("poster");
  element.setAttribute("data-aria-image-empty", "true");
}

export function attachBrokenMediaFallback(
  element: HTMLImageElement | HTMLVideoElement,
): void {
  element.addEventListener("error", () => {
    handleBrokenMediaElement(element);
  });
}
