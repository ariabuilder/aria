function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getComponentReferenceId(
  record: Record<string, unknown>,
): string | null {
  const reference = isRecord(record.reference) ? record.reference : null;
  const props = isRecord(record.props) ? record.props : null;

  if (typeof record.componentRef === "string") return record.componentRef;
  if (typeof reference?.masterId === "string") return reference.masterId;
  if (typeof reference?.id === "string") return reference.id;
  if (typeof props?.componentId === "string") return props.componentId;
  return null;
}

/** Count every component reference, including page header/footer regions. */
export function countComponentReferences(
  value: unknown,
  componentId: string,
): number {
  if (Array.isArray(value)) {
    return value.reduce(
      (total, entry) => total + countComponentReferences(entry, componentId),
      0,
    );
  }

  if (!isRecord(value)) return 0;

  let count = getComponentReferenceId(value) === componentId ? 1 : 0;
  const metadata = isRecord(value.metadata) ? value.metadata : null;
  const regions = metadata && isRecord(metadata.regions) ? metadata.regions : null;

  if (regions?.headerComponent === componentId) count += 1;
  if (regions?.footerComponent === componentId) count += 1;

  for (const nested of Object.values(value)) {
    if (nested && typeof nested === "object") {
      count += countComponentReferences(nested, componentId);
    }
  }

  return count;
}
