import { z } from "zod";
import { buildCurrentMediaSourceUrl } from "./transforms/urls";
import {
  DEFAULT_RESPONSIVE_IMAGE_SIZES,
  ResponsiveImageSizesSchema,
} from "./transforms/responsive";

/** Stable media ownership stored by composer-authored image surfaces. */
export const ComposerMediaReferenceSchema = z
  .object({
    mediaId: z.string().trim().min(1),
    variantId: z.string().trim().min(1).nullable(),
  })
  .strict();

export type ComposerMediaReference = z.infer<
  typeof ComposerMediaReferenceSchema
>;

export const ComposerResponsiveImageSourceSchema = z
  .object({
    url: z.string().trim().min(1),
    reference: ComposerMediaReferenceSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive().nullable().optional(),
    allowDerivatives: z.boolean().default(true),
  })
  .strict();

export type ComposerResponsiveImageSource = z.infer<
  typeof ComposerResponsiveImageSourceSchema
>;

export const ComposerResponsiveImageSchema = z
  .object({
    sizes: ResponsiveImageSizesSchema.default(DEFAULT_RESPONSIVE_IMAGE_SIZES),
    default: ComposerResponsiveImageSourceSchema,
    sources: z
      .record(z.string().trim().min(1), ComposerResponsiveImageSourceSchema)
      .default({}),
  })
  .strict();

export type ComposerResponsiveImage = z.infer<
  typeof ComposerResponsiveImageSchema
>;

export const ComposerNodeMediaReferencesSchema = z
  .object({
    image: ComposerMediaReferenceSchema.optional(),
    background: z
      .record(z.string().trim().min(1), ComposerMediaReferenceSchema)
      .optional(),
  })
  .strict();

export type ComposerNodeMediaReferences = z.infer<
  typeof ComposerNodeMediaReferencesSchema
>;

export type ComposerVariantReferenceLocation = {
  mediaId: string;
  variantId: string;
  refPath: string;
};

export function readComposerNodeMediaReferences(
  metadata: Record<string, unknown> | undefined,
): ComposerNodeMediaReferences {
  const parsed = ComposerNodeMediaReferencesSchema.safeParse(
    metadata?.mediaReferences,
  );
  return parsed.success ? parsed.data : {};
}

export function readComposerResponsiveImage(
  metadata: Record<string, unknown> | undefined,
): ComposerResponsiveImage | undefined {
  const parsed = ComposerResponsiveImageSchema.safeParse(
    metadata?.responsiveImage,
  );
  return parsed.success ? parsed.data : undefined;
}

export function withComposerResponsiveImage(
  metadata: Record<string, unknown> | undefined,
  responsiveImage: ComposerResponsiveImage | null,
): Record<string, unknown> {
  const next = { ...(metadata ?? {}) };
  if (responsiveImage) {
    next.responsiveImage = ComposerResponsiveImageSchema.parse(responsiveImage);
  } else {
    delete next.responsiveImage;
  }
  return next;
}

export function withComposerImageReference(
  metadata: Record<string, unknown> | undefined,
  reference: ComposerMediaReference | null,
): Record<string, unknown> | undefined {
  return withComposerMediaReference(metadata, "image", reference);
}

export function withComposerBackgroundReference(
  metadata: Record<string, unknown> | undefined,
  breakpoint: string,
  reference: ComposerMediaReference | null,
): Record<string, unknown> | undefined {
  const current = readComposerNodeMediaReferences(metadata);
  const background = { ...(current.background ?? {}) };
  if (reference) background[breakpoint] = reference;
  else delete background[breakpoint];
  const otherReferences = { ...current };
  delete otherReferences.background;

  return normalizeMetadata(metadata, {
    ...otherReferences,
    ...(Object.keys(background).length > 0 ? { background } : {}),
  });
}

function withComposerMediaReference(
  metadata: Record<string, unknown> | undefined,
  key: "image",
  reference: ComposerMediaReference | null,
): Record<string, unknown> | undefined {
  const current = readComposerNodeMediaReferences(metadata);
  const next = { ...current };
  if (reference) next[key] = reference;
  else delete next[key];
  return normalizeMetadata(metadata, next);
}

function normalizeMetadata(
  metadata: Record<string, unknown> | undefined,
  mediaReferences: ComposerNodeMediaReferences,
): Record<string, unknown> {
  const next = { ...(metadata ?? {}) };
  if (
    mediaReferences.image ||
    Object.keys(mediaReferences.background ?? {}).length > 0
  ) {
    next.mediaReferences =
      ComposerNodeMediaReferencesSchema.parse(mediaReferences);
  } else {
    delete next.mediaReferences;
  }
  return next;
}

export function collectComposerVariantReferences(
  resource: unknown,
): ComposerVariantReferenceLocation[] {
  const found: ComposerVariantReferenceLocation[] = [];

  function visit(value: unknown, refPath: string): void {
    const parsed = ComposerMediaReferenceSchema.safeParse(value);
    if (parsed.success && parsed.data.variantId) {
      found.push({
        mediaId: parsed.data.mediaId,
        variantId: parsed.data.variantId,
        refPath: refPath || "$root",
      });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${refPath}[${index}]`));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      visit(child, refPath ? `${refPath}.${key}` : key);
    }
  }

  visit(resource, "");
  return found;
}

export function transformComposerMediaReferencesForAsset(
  resource: unknown,
  input: {
    mediaId: string;
    mode: "scrub" | "migrate";
    newLogicalPath?: string;
  },
): { resource: unknown; updatedCount: number } {
  const cloned = structuredClone(resource);
  let updatedCount = 0;

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;

    const object = value as Record<string, unknown>;
    const metadata =
      object.metadata && typeof object.metadata === "object"
        ? (object.metadata as Record<string, unknown>)
        : undefined;
    const references = readComposerNodeMediaReferences(metadata);
    const props =
      object.props && typeof object.props === "object"
        ? (object.props as Record<string, unknown>)
        : undefined;
    const styles =
      object.styles && typeof object.styles === "object"
        ? (object.styles as Record<string, unknown>)
        : undefined;

    let nextMetadata = metadata;
    if (references.image?.mediaId === input.mediaId) {
      if (input.mode === "scrub") {
        if (props) props.src = "";
        nextMetadata = withComposerImageReference(nextMetadata, null);
        updatedCount += 1;
      } else if (!references.image.variantId && input.newLogicalPath) {
        if (props) {
          props.src = buildCurrentMediaSourceUrl({
            assetPath: input.newLogicalPath,
          });
        }
        updatedCount += 1;
      }
    }

    for (const [breakpoint, reference] of Object.entries(
      references.background ?? {},
    )) {
      if (reference.mediaId !== input.mediaId) continue;
      if (input.mode === "scrub") {
        clearResponsiveStyleValue(styles, "backgroundImage", breakpoint);
        nextMetadata = withComposerBackgroundReference(
          nextMetadata,
          breakpoint,
          null,
        );
        updatedCount += 1;
      } else if (!reference.variantId && input.newLogicalPath) {
        setResponsiveStyleValue(
          styles,
          "backgroundImage",
          breakpoint,
          `url("${buildCurrentMediaSourceUrl({ assetPath: input.newLogicalPath })}")`,
        );
        updatedCount += 1;
      }
    }

    const responsiveImage = readComposerResponsiveImage(nextMetadata);
    if (responsiveImage) {
      let nextResponsiveImage = structuredClone(responsiveImage);
      let changed = false;
      const transformSource = (
        source: ComposerResponsiveImageSource,
      ): ComposerResponsiveImageSource | null => {
        if (source.reference.mediaId !== input.mediaId) return source;
        if (input.mode === "scrub") {
          updatedCount += 1;
          changed = true;
          return null;
        }
        if (!source.reference.variantId && input.newLogicalPath) {
          updatedCount += 1;
          changed = true;
          return {
            ...source,
            url: buildCurrentMediaSourceUrl({
              assetPath: input.newLogicalPath,
            }),
          };
        }
        return source;
      };

      const defaultSource = transformSource(nextResponsiveImage.default);
      if (!defaultSource) {
        nextMetadata = withComposerResponsiveImage(nextMetadata, null);
      } else {
        nextResponsiveImage.default = defaultSource;
        for (const [breakpoint, source] of Object.entries(
          nextResponsiveImage.sources,
        )) {
          const nextSource = transformSource(source);
          if (nextSource) nextResponsiveImage.sources[breakpoint] = nextSource;
          else delete nextResponsiveImage.sources[breakpoint];
        }
        if (changed) {
          nextMetadata = withComposerResponsiveImage(
            nextMetadata,
            nextResponsiveImage,
          );
        }
      }
    }

    if (nextMetadata !== metadata) object.metadata = nextMetadata;
    for (const child of Object.values(object)) visit(child);
  }

  visit(cloned);
  return { resource: cloned, updatedCount };
}

function setResponsiveStyleValue(
  styles: Record<string, unknown> | undefined,
  property: string,
  breakpoint: string,
  value: string,
): void {
  if (!styles) return;
  const current =
    styles[property] && typeof styles[property] === "object"
      ? (styles[property] as Record<string, unknown>)
      : {};
  styles[property] = { ...current, [breakpoint]: value };
}

function clearResponsiveStyleValue(
  styles: Record<string, unknown> | undefined,
  property: string,
  breakpoint: string,
): void {
  if (!styles) return;
  const current =
    styles[property] && typeof styles[property] === "object"
      ? { ...(styles[property] as Record<string, unknown>) }
      : {};
  delete current[breakpoint];
  if (Object.keys(current).length > 0) styles[property] = current;
  else delete styles[property];
}
