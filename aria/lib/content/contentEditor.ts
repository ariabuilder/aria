import type {
  BuilderNode,
  ComponentPropFieldType,
  ComponentPropSchemaDefinition,
  ContentEditorFieldSettings,
  NodeContentEditorSettings,
} from "../types/nodes";

const TEXT_FIELD_NAMES = new Set(["text", "content", "label", "title"]);
const LINK_FIELD_NAMES = new Set(["href", "url"]);
const IMAGE_FIELD_NAMES = new Set(["src", "poster"]);
const BINDABLE_SCHEMA_FIELD_TYPES = new Set<ComponentPropFieldType>([
  "string",
  "text",
  "textarea",
  "url",
]);

export type ContentEditorExposureState = Required<
  Pick<ContentEditorFieldSettings, "enabled" | "locked" | "hidden">
> &
  Pick<ContentEditorFieldSettings, "label" | "order">;

export function emptyContentEditorExposure(): ContentEditorExposureState {
  return {
    enabled: false,
    locked: false,
    hidden: false,
  };
}

export function normalizeContentEditorExposure(
  input: ContentEditorFieldSettings | null | undefined,
): ContentEditorExposureState {
  return {
    enabled: input?.enabled === true,
    locked: input?.locked === true,
    hidden: input?.hidden === true,
    ...(typeof input?.label === "string" && input.label.trim()
      ? { label: input.label.trim() }
      : {}),
    ...(typeof input?.order === "number" ? { order: input.order } : {}),
  };
}

export function isContentEditorNodeHidden(
  node: BuilderNode | null | undefined,
): boolean {
  return node?.metadata?.contentEditor?.hidden === true;
}

export function isContentEditorNodeLocked(
  node: BuilderNode | null | undefined,
): boolean {
  return node?.metadata?.contentEditor?.locked === true;
}

export function contentEditorFieldSettingsForProp(
  node: BuilderNode | null | undefined,
  propName: string,
): ContentEditorExposureState {
  const settings = node?.metadata?.contentEditor?.fields?.[propName];
  return normalizeContentEditorExposure(settings);
}

export function nextNodeContentEditorFieldSettings(input: {
  current: NodeContentEditorSettings | null | undefined;
  propName: string;
  patch: ContentEditorFieldSettings;
}): NodeContentEditorSettings {
  const current = input.current ?? {};
  const fields = { ...(current.fields ?? {}) };
  fields[input.propName] = {
    ...(fields[input.propName] ?? {}),
    ...input.patch,
  };
  return {
    ...current,
    fields,
  };
}

function normalizedName(value: string): string {
  return value.trim().toLowerCase();
}

export function isImageLikeContentEditorProp(propName: string): boolean {
  const name = normalizedName(propName);
  return (
    IMAGE_FIELD_NAMES.has(name) ||
    name.includes("image") ||
    name.includes("cover") ||
    name.includes("avatar") ||
    name.includes("thumbnail")
  );
}

export function isContentEditorEligibleProp(input: {
  propName: string;
  type?: string | null;
}): boolean {
  const name = normalizedName(input.propName);
  if (
    TEXT_FIELD_NAMES.has(name) ||
    LINK_FIELD_NAMES.has(name) ||
    isImageLikeContentEditorProp(name)
  ) {
    return true;
  }
  return (
    input.type === "string" ||
    input.type === "text" ||
    input.type === "textarea" ||
    input.type === "url"
  );
}

export function isContentEditorEligibleSchemaField(
  field: ComponentPropSchemaDefinition,
): boolean {
  return (
    BINDABLE_SCHEMA_FIELD_TYPES.has(field.type) ||
    isContentEditorEligibleProp({
      propName: field.name,
      type: field.type,
    })
  );
}

export function isContentEditorBindableField(input: {
  propName: string;
  type?: string | null;
}): boolean {
  return isContentEditorEligibleProp(input);
}

export function contentEditorDisplayLabel(input: {
  explicitLabel?: string;
  fallbackLabel?: string;
  propName?: string;
  nodeType?: string;
}): string {
  const label =
    input.explicitLabel?.trim() ||
    input.fallbackLabel?.trim() ||
    input.propName?.trim() ||
    input.nodeType?.trim() ||
    "Content";
  return label.replace(/[_-]+/g, " ");
}
