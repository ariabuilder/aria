export function buildMediaTransformRevision(input: {
  updatedAt: string;
  sourceVersion: number;
}): string {
  const timestamp = input.updatedAt.replace(/[^0-9]/gu, "");
  return `${input.sourceVersion}-${encodeURIComponent(timestamp)}`;
}

export function buildMediaTransformUrl(input: {
  id: string;
  updatedAt: string;
  sourceVersion: number;
}): string {
  const revision = buildMediaTransformRevision(input);
  return `/media/transform/${encodeURIComponent(input.id)}/${revision}`;
}

export function buildMediaSourceUrl(input: {
  assetPath: string;
  sourceVersion: number;
}): string {
  const path = input.assetPath
    .replace(/^\/+/, "")
    .replace(/^uploads\//, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return `/media/source/${input.sourceVersion}/${path}`;
}

/** Stable pointer for placements that follow an asset's promoted source. */
export function buildCurrentMediaSourceUrl(input: {
  assetPath: string;
}): string {
  const path = input.assetPath
    .replace(/^\/+/, "")
    .replace(/^uploads\//, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return `/media/source/current/${path}`;
}

export function resolveCurrentMediaSourceVersion(input: {
  profile: { currentSourceVersion: number } | null;
  sourceVersions: readonly { version: number }[];
}): number | null {
  if (input.profile) return input.profile.currentSourceVersion;
  return input.sourceVersions.reduce<number | null>(
    (latest, source) =>
      latest === null || source.version > latest ? source.version : latest,
    null,
  );
}
