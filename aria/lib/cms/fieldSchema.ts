import type { FieldType } from "./constants";

export interface RepeaterDisplaySettings {
  titleFieldKey?: string;
  addButtonLabel?: string;
}

export interface FieldSchema {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  default?: unknown;
  options?: string[];
  targetCollection?: string;
  fields?: FieldSchema[];
  searchable?: boolean;
  showInEntryList?: boolean;
  inlineEditable?: boolean;
  repeaterDisplay?: RepeaterDisplaySettings;
}
