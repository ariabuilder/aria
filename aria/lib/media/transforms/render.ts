import type { MediaCropRect, MediaTransformOutput } from "./schemas";
import { logicalPathToObjectKey } from "../utils/path";

export type RenderedMediaTransform = {
  bytes: Uint8Array | ReadableStream<Uint8Array>;
  contentType: string;
};

export type MediaTransformRenderInput = {
  source: Uint8Array;
  sourceMimeType?: string | null;
  crop: MediaCropRect;
  output: MediaTransformOutput;
  accept?: string | null;
};

export interface RuntimeImagesBinding {
  input(stream: ReadableStream<Uint8Array>): {
    transform(options: {
      trim?: {
        top?: number;
        right?: number;
        bottom?: number;
        left?: number;
      };
      width?: number;
      height?: number;
      fit?: "scale-down" | "contain" | "cover" | "crop";
    }): ReturnType<RuntimeImagesBinding["input"]>;
    output(options: {
      format: "image/jpeg" | "image/png" | "image/webp" | "image/avif";
      quality?: number;
      anim?: boolean;
    }): Promise<{ response(): Response }>;
  };
}

type OutputFormat = "jpeg" | "png" | "webp" | "avif";

export function resolveMediaTransformSourceObjectKey(
  assetPath: string,
  sourceObjectKey?: string | null,
): string {
  return sourceObjectKey ?? logicalPathToObjectKey(assetPath);
}

function stableFraction(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1_000_000) / 1_000_000;
}

export function resolveMediaOutputFormat(
  requested: MediaTransformOutput["format"],
  accept = "",
  sourceMimeType?: string | null,
): OutputFormat {
  if (requested !== "auto") return requested;
  if (accept.includes("image/avif")) return "avif";
  if (accept.includes("image/webp")) return "webp";
  return sourceMimeType === "image/png" ? "png" : "jpeg";
}

export function cropToPixels(
  crop: MediaCropRect,
  sourceWidth: number,
  sourceHeight: number,
): { left: number; top: number; width: number; height: number } {
  const left = Math.max(0, Math.floor(crop.x * sourceWidth));
  const top = Math.max(0, Math.floor(crop.y * sourceHeight));
  const right = Math.min(
    sourceWidth,
    Math.max(left + 1, Math.round((crop.x + crop.width) * sourceWidth)),
  );
  const bottom = Math.min(
    sourceHeight,
    Math.max(top + 1, Math.round((crop.y + crop.height) * sourceHeight)),
  );
  return { left, top, width: right - left, height: bottom - top };
}

export async function renderWithCloudflareImages(
  images: RuntimeImagesBinding,
  input: MediaTransformRenderInput,
): Promise<Response> {
  const format = resolveMediaOutputFormat(
    input.output.format,
    input.accept ?? "",
    input.sourceMimeType,
  );
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(input.source);
      controller.close();
    },
  });
  let transformer = images.input(stream).transform({
    trim: {
      top: stableFraction(input.crop.y),
      left: stableFraction(input.crop.x),
      right: stableFraction(1 - input.crop.x - input.crop.width),
      bottom: stableFraction(1 - input.crop.y - input.crop.height),
    },
  });

  if (input.output.width || input.output.height) {
    transformer = transformer.transform({
      width: input.output.width ?? undefined,
      height: input.output.height ?? undefined,
      fit: "scale-down",
    });
  }

  return (
    await transformer.output({
      format: `image/${format}`,
      quality: input.output.quality,
      anim: false,
    })
  ).response();
}

type SharpMetadata = {
  width?: number;
  height?: number;
  orientation?: number;
};

type SharpPipeline = {
  metadata(): Promise<SharpMetadata>;
  rotate(): SharpPipeline;
  extract(rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  }): SharpPipeline;
  resize(options: {
    width?: number;
    height?: number;
    fit: "inside";
    withoutEnlargement: boolean;
  }): SharpPipeline;
  jpeg(options: { quality: number }): SharpPipeline;
  png(options: { quality: number }): SharpPipeline;
  webp(options: { quality: number }): SharpPipeline;
  avif(options: { quality: number }): SharpPipeline;
  toBuffer(): Promise<Uint8Array>;
};

type SharpFactory = (input: Uint8Array) => SharpPipeline;

async function loadSharp(): Promise<SharpFactory> {
  // Sharp is supplied by Astro's Node image runtime. Keeping the module name
  // dynamic prevents the native binary from entering the Cloudflare bundle.
  const moduleName = "sharp";
  const loaded = (await import(/* @vite-ignore */ moduleName)) as {
    default?: SharpFactory;
  };
  if (!loaded.default) {
    throw new Error("The local image transform runtime is unavailable");
  }
  return loaded.default;
}

export async function renderWithLocalImageRuntime(
  input: MediaTransformRenderInput,
): Promise<RenderedMediaTransform> {
  const sharp = await loadSharp();
  const metadata = await sharp(input.source).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Unable to determine source image dimensions");
  }
  const swapsAxes = [5, 6, 7, 8].includes(metadata.orientation ?? 1);
  const sourceWidth = swapsAxes ? metadata.height : metadata.width;
  const sourceHeight = swapsAxes ? metadata.width : metadata.height;
  const rect = cropToPixels(input.crop, sourceWidth, sourceHeight);
  const format = resolveMediaOutputFormat(
    input.output.format,
    input.accept ?? "",
    input.sourceMimeType,
  );

  let pipeline = sharp(input.source).rotate().extract(rect);
  if (input.output.width || input.output.height) {
    pipeline = pipeline.resize({
      width: input.output.width ?? undefined,
      height: input.output.height ?? undefined,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  pipeline = pipeline[format]({ quality: input.output.quality });

  return {
    bytes: await pipeline.toBuffer(),
    contentType: `image/${format}`,
  };
}

export {
  buildCurrentMediaSourceUrl,
  buildMediaSourceUrl,
  buildMediaTransformRevision,
  buildMediaTransformUrl,
  resolveCurrentMediaSourceVersion,
} from "./urls";
