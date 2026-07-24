export function resolveUploadsRedirectTarget(input: {
  requestUrl: string;
  r2PublicUrl?: string;
}): URL | null {
  const uploadsPrefix = "/uploads/";
  const requestUrl = new URL(input.requestUrl);

  if (!requestUrl.pathname.startsWith(uploadsPrefix)) {
    return null;
  }

  const rawBase = input.r2PublicUrl?.trim();
  if (!rawBase) {
    return null;
  }

  const baseUrl = new URL(rawBase.replace(/\/+$/, ""));
  const objectKey = requestUrl.pathname.slice(uploadsPrefix.length);

  if (!objectKey || objectKey.endsWith("/")) {
    return null;
  }

  const targetPath = `${baseUrl.pathname.replace(/\/$/, "")}/${objectKey}`;
  const target = new URL(`${baseUrl.origin}${targetPath}`);
  target.search = requestUrl.search;

  const sameTarget =
    target.origin === requestUrl.origin &&
    target.pathname === requestUrl.pathname &&
    target.search === requestUrl.search;

  if (sameTarget) {
    return null;
  }

  return target;
}
