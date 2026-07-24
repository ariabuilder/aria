import { ICON_SNAPSHOT_VERSION } from "../../lib/icons/generatedIconSnapshot";

export interface IconSvgData {
  svg: string;
  viewBox: string;
  snapshotVersion: string;
}

type IconDataResponse = {
  icons?: Record<string, IconSvgData>;
  missing?: string[];
  snapshotVersion?: string;
};

const MAX_BATCH_SIZE = 10;
const records = new Map<string, IconSvgData>();
const pending = new Map<string, Promise<IconSvgData | null>>();
let activeSnapshotVersion: string = ICON_SNAPSHOT_VERSION;

async function fetchBatch(ids: string[]): Promise<Map<string, IconSvgData>> {
  const response = await fetch(
    `/api/icons/data?${new URLSearchParams({
      ids: ids.join(","),
      v: ICON_SNAPSHOT_VERSION,
    })}`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) return new Map();
  const payload = (await response.json()) as IconDataResponse;
  if (payload.snapshotVersion && payload.snapshotVersion !== activeSnapshotVersion) {
    records.clear();
    activeSnapshotVersion = payload.snapshotVersion;
  }
  const result = new Map(Object.entries(payload.icons ?? {}));
  for (const [id, value] of result) records.set(id, value);
  return result;
}

export async function resolveIconSvgData(
  requestedIds: readonly string[],
): Promise<Record<string, IconSvgData>> {
  const ids = [...new Set(requestedIds.map((id) => id.trim()).filter(Boolean))];
  const result: Record<string, IconSvgData> = {};
  const unresolved = ids.filter((id) => {
    const cached = records.get(id);
    if (cached) result[id] = cached;
    return !cached;
  });
  const fresh = unresolved.filter((id) => !pending.has(id));

  for (let index = 0; index < fresh.length; index += MAX_BATCH_SIZE) {
    const batch = fresh.slice(index, index + MAX_BATCH_SIZE);
    const work = fetchBatch(batch);
    for (const id of batch) {
      pending.set(
        id,
        work.then((items) => items.get(id) ?? null).finally(() => pending.delete(id)),
      );
    }
  }

  // Keep stable references before the promises settle. Each pending promise
  // removes itself from the shared map in `finally`; looking it up later made
  // callers retain only the first resolved icon from every 10-item batch.
  const pendingForRequest = new Map(
    unresolved.flatMap((id) => {
      const work = pending.get(id);
      return work ? [[id, work] as const] : [];
    }),
  );

  for (const id of unresolved) {
    const value = await pendingForRequest.get(id);
    if (value) result[id] = value;
  }

  return result;
}

export async function resolveOneIconSvgData(id: string): Promise<IconSvgData | null> {
  return (await resolveIconSvgData([id]))[id] ?? null;
}

export function clearIconSvgDataCache(): void {
  records.clear();
  pending.clear();
  activeSnapshotVersion = ICON_SNAPSHOT_VERSION;
}
