import { computeSHA256 } from "../utils/checksum";
import { normalizeLogicalMediaPath } from "../utils/path";

export type InspectedImageSource = {
  mimeType:
    | "image/jpeg"
    | "image/png"
    | "image/gif"
    | "image/webp"
    | "image/avif";
  width: number;
  height: number;
};

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function u16be(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function u16le(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function u24le(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)
  );
}

function u32be(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 0x1000000 +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  );
}

function positiveDimensions(
  width: number,
  height: number,
): { width: number; height: number } | null {
  return Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0
    ? { width, height }
    : null;
}

function inspectJpeg(bytes: Uint8Array): InspectedImageSource | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  const sofMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker == null || marker === 0xd9 || marker === 0xda) break;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 1 >= bytes.length) break;
    const length = u16be(bytes, offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (sofMarkers.has(marker) && length >= 7) {
      const dimensions = positiveDimensions(
        u16be(bytes, offset + 5),
        u16be(bytes, offset + 3),
      );
      return dimensions ? { mimeType: "image/jpeg", ...dimensions } : null;
    }
    offset += length;
  }
  return null;
}

function inspectWebp(bytes: Uint8Array): InspectedImageSource | null {
  if (
    bytes.length < 30 ||
    ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 4) !== "WEBP"
  )
    return null;
  const chunk = ascii(bytes, 12, 4);
  let dimensions: { width: number; height: number } | null = null;
  if (chunk === "VP8X") {
    dimensions = positiveDimensions(u24le(bytes, 24) + 1, u24le(bytes, 27) + 1);
  } else if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const bits =
      bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24);
    dimensions = positiveDimensions(
      (bits & 0x3fff) + 1,
      ((bits >>> 14) & 0x3fff) + 1,
    );
  } else if (
    chunk === "VP8 " &&
    bytes.length >= 30 &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    dimensions = positiveDimensions(
      u16le(bytes, 26) & 0x3fff,
      u16le(bytes, 28) & 0x3fff,
    );
  }
  return dimensions ? { mimeType: "image/webp", ...dimensions } : null;
}

function inspectAvif(bytes: Uint8Array): InspectedImageSource | null {
  if (bytes.length < 24 || ascii(bytes, 4, 4) !== "ftyp") return null;
  const brands = ascii(bytes, 8, Math.min(bytes.length - 8, 32));
  if (!brands.includes("avif") && !brands.includes("avis")) return null;
  for (let offset = 4; offset + 12 <= bytes.length; offset += 1) {
    if (ascii(bytes, offset, 4) !== "ispe") continue;
    const dimensions = positiveDimensions(
      u32be(bytes, offset + 4),
      u32be(bytes, offset + 8),
    );
    if (dimensions) return { mimeType: "image/avif", ...dimensions };
  }
  return null;
}

export function inspectImageSource(input: Uint8Array): InspectedImageSource {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length >= 24 && ascii(bytes, 0, 8) === "\u0089PNG\r\n\u001a\n") {
    const dimensions = positiveDimensions(u32be(bytes, 16), u32be(bytes, 20));
    if (dimensions) return { mimeType: "image/png", ...dimensions };
  }
  if (
    bytes.length >= 10 &&
    (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")
  ) {
    const dimensions = positiveDimensions(u16le(bytes, 6), u16le(bytes, 8));
    if (dimensions) return { mimeType: "image/gif", ...dimensions };
  }
  const inspected =
    inspectJpeg(bytes) ?? inspectWebp(bytes) ?? inspectAvif(bytes);
  if (inspected) return inspected;
  throw new Error(
    "The file is not a supported JPEG, PNG, GIF, WebP, or AVIF image.",
  );
}

const MIME_EXTENSIONS: Record<InspectedImageSource["mimeType"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

export function buildMediaSourceVersionObjectKey(input: {
  assetPath: string;
  version: number;
  checksumSha256: string;
  mimeType: InspectedImageSource["mimeType"];
}): string {
  const assetKey = computeSHA256(
    Buffer.from(normalizeLogicalMediaPath(input.assetPath)),
  ).slice(0, 24);
  const checksum = input.checksumSha256.toLowerCase().slice(0, 16);
  return `_aria-media/source-versions/${assetKey}/v${input.version}-${checksum}.${MIME_EXTENSIONS[input.mimeType]}`;
}
