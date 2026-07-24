/**
 * Normalize external media URLs for preview and type inference.
 */

const VIDEO_IN_URL_PATTERN = /\.(mp4|webm|mov|avi)(\?|#|$)/i;

const IMAGE_HOST_PATTERNS = [
  /(^|\.)images\.unsplash\.com$/i,
  /(^|\.)unsplash\.com$/i,
  /(^|\.)images\.pexels\.com$/i,
  /(^|\.)i\.imgur\.com$/i,
  /(^|\.)cdn\.shopify\.com$/i,
  /(^|\.)cloudinary\.com$/i,
  /(^|\.)imgix\.net$/i,
  /(^|\.)googleusercontent\.com$/i,
];

const IMAGE_QUERY_HINT_PATTERN = /(^|[?&])(auto=format|fit=crop|fm=|q=\d|w=\d+)/i;

const IMAGE_REF_PATH_PATTERN =
  /\.props\.(src|poster|ogImage|image|thumbnail|url)$|\.(src|poster|ogImage|image|thumbnail|url)$/i;

const UNSPLASH_PHOTO_ID_PATTERN = /^photo-\d+/i;

const HTTP_URL_IN_TEXT_PATTERN =
  /https?:\/\/[^\s'"<>)\]]+|(?:^|[\s'"[(])(photo-\d+[-\w]*(?:\?[^\s'"<>)\]]*)?)/gi;

const SCHEMELESS_IMAGE_HOST_PATTERN =
  /^(?:images\.)?unsplash\.com\/photo-\d+/i;

export function matchesUnsplashPhotoPath(value: string): boolean {
  return UNSPLASH_PHOTO_ID_PATTERN.test(value.replace(/^\//, ""));
}

/**
 * Pull absolute (or bare Unsplash photo) URLs out of longer strings such as
 * Tailwind `bg-[url('https://…')]` class names.
 */
export function extractHttpUrlsFromText(text: string): string[] {
  const found = new Set<string>();
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  for (const match of trimmed.matchAll(HTTP_URL_IN_TEXT_PATTERN)) {
    const candidate = (match[0] ?? "").replace(/^[\s'"[(]+/, "").trim();
    if (!candidate) {
      continue;
    }
    found.add(normalizeExternalMediaUrl(candidate));
  }

  if (matchesUnsplashPhotoPath(trimmed)) {
    found.add(normalizeExternalMediaUrl(trimmed));
  }

  return [...found];
}

export function normalizeExternalMediaUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  if (SCHEMELESS_IMAGE_HOST_PATTERN.test(trimmed)) {
    return `https://${trimmed.replace(/^\//, "")}`;
  }

  if (matchesUnsplashPhotoPath(trimmed)) {
    return `https://images.unsplash.com/${trimmed.replace(/^\//, "")}`;
  }

  return trimmed;
}

function hostnameLooksLikeImageCdn(hostname: string): boolean {
  return IMAGE_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

function urlLooksLikeImageDelivery(url: URL): boolean {
  if (hostnameLooksLikeImageCdn(url.hostname)) {
    return !VIDEO_IN_URL_PATTERN.test(url.pathname + url.search);
  }

  if (IMAGE_QUERY_HINT_PATTERN.test(url.search)) {
    return true;
  }

  if (/\/photo-\d+/i.test(url.pathname)) {
    return true;
  }

  return false;
}

export function isLikelyExternalImageReference(input: {
  rawUrl: string;
  refPath: string;
}): boolean {
  const normalized = normalizeExternalMediaUrl(input.rawUrl);

  if (VIDEO_IN_URL_PATTERN.test(normalized)) {
    return false;
  }

  if (matchesUnsplashPhotoPath(normalized)) {
    return true;
  }

  try {
    const url = new URL(normalized);
    if (urlLooksLikeImageDelivery(url)) {
      return true;
    }
  } catch {
    // fall through to ref-path heuristic
  }

  if (IMAGE_REF_PATH_PATTERN.test(input.refPath)) {
    return !VIDEO_IN_URL_PATTERN.test(normalized);
  }

  return false;
}

export function isLikelyExternalVideoReference(input: {
  rawUrl: string;
  refPath: string;
}): boolean {
  const normalized = normalizeExternalMediaUrl(input.rawUrl);
  if (VIDEO_IN_URL_PATTERN.test(normalized)) {
    return true;
  }

  try {
    const url = new URL(normalized);
    return /\/videos?\//i.test(url.pathname) || /\.video\b/i.test(url.hostname);
  } catch {
    return /\.props\.(src|poster)$/i.test(input.refPath) && VIDEO_IN_URL_PATTERN.test(normalized);
  }
}

export function displayNameForExternalUrl(rawUrl: string): string {
  const normalized = normalizeExternalMediaUrl(rawUrl);

  try {
    const url = new URL(normalized);
    const segment = url.pathname.split("/").filter(Boolean).pop();
    if (segment) {
      return segment;
    }
    return url.hostname;
  } catch {
    const segments = normalized.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? normalized;
  }
}
