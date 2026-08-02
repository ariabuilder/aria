import type { BuilderNode } from "../../../../lib/types/nodes";
import { normalizeDirectCmsMediaReference } from "../../../../lib/cms/directMediaReference";
import { parseCmsImageFieldValue } from "../../../../lib/cms/styleBindings";

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readResponsiveStyleScalar(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (!isUnknownRecord(value)) {
    return undefined;
  }

  const base = value.base;
  if (typeof base === "string" && base.trim().length > 0) {
    return base;
  }

  return Object.values(value).find(
    (entry): entry is string =>
      typeof entry === "string" && entry.trim().length > 0,
  );
}

export function resolveImageObjectFit(
  block: Pick<BuilderNode, "props" | "styles">,
): string | undefined {
  const fromStyles = readResponsiveStyleScalar(block.styles?.objectFit);
  if (fromStyles) {
    return fromStyles;
  }

  const fromProps = block.props?.objectFit;
  if (typeof fromProps === "string" && fromProps.trim().length > 0) {
    return fromProps;
  }

  return undefined;
}

export function resolveImageObjectPosition(
  block: Pick<BuilderNode, "props" | "styles">,
): string | undefined {
  const fromStyles = readResponsiveStyleScalar(block.styles?.objectPosition);
  if (fromStyles) {
    return fromStyles;
  }

  const fromProps = block.props?.objectPosition;
  if (typeof fromProps === "string" && fromProps.trim().length > 0) {
    return fromProps;
  }

  return undefined;
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

export type StageMediaFailure = Readonly<{
  kind: "media-load-failed";
  media: "image" | "video";
  source: string;
}>;

export function attachBrokenMediaFallback(
  element: HTMLImageElement | HTMLVideoElement,
  onFailure: (failure: StageMediaFailure) => void,
): () => void {
  const handleError = (): void => {
    onFailure({
      kind: "media-load-failed",
      media: element.tagName.toLowerCase() === "video" ? "video" : "image",
      source:
        element.currentSrc ||
        element.getAttribute("src") ||
        (element.tagName.toLowerCase() === "video"
          ? element.getAttribute("poster") || ""
          : ""),
    });
  };

  element.addEventListener("error", handleError);
  return () => element.removeEventListener("error", handleError);
}
