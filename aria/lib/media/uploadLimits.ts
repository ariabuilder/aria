import { getMediaTypeFromMimeOrFilename } from "./utils/mediaType";

export const MEDIA_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
export const MEDIA_UPLOAD_ACTION_BODY_OVERHEAD_BYTES = 1024 * 1024;
export const MEDIA_UPLOAD_ACTION_BODY_MAX_BYTES =
  MEDIA_UPLOAD_MAX_BYTES + MEDIA_UPLOAD_ACTION_BODY_OVERHEAD_BYTES;
export const MEDIA_UPLOAD_MAX_BYTES_LABEL = "50 MB";
export const MEDIA_TRANSFORM_INPUT_MAX_BYTES = 20 * 1024 * 1024;
export const MEDIA_TRANSFORM_INPUT_MAX_BYTES_LABEL = "20 MB";

type MediaFileDescriptor = {
  name: string;
  type?: string;
  size: number;
};

export function isTransformableImageFile(
  file: Pick<MediaFileDescriptor, "name" | "type">,
): boolean {
  return getMediaTypeFromMimeOrFilename(file.type, file.name) === "image";
}

export function exceedsMediaTransformInputLimit(
  file: MediaFileDescriptor,
): boolean {
  return (
    isTransformableImageFile(file) &&
    file.size > MEDIA_TRANSFORM_INPUT_MAX_BYTES
  );
}

export function getMediaUploadTooLargeMessage(fileName: string): string {
  return `Upload failed: ${fileName} is too large. Maximum size is ${MEDIA_UPLOAD_MAX_BYTES_LABEL}.`;
}

export function getMediaTransformInputTooLargeMessage(
  fileName: string,
): string {
  return `Upload failed: ${fileName} is too large for image cropping. Images must be ${MEDIA_TRANSFORM_INPUT_MAX_BYTES_LABEL} or smaller; other media can be up to ${MEDIA_UPLOAD_MAX_BYTES_LABEL}.`;
}
