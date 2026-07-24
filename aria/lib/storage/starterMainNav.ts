/**
 * Starter `main-nav` config collection schema. Fresh installs seed
 * the collection and a usable header entry.
 */

import type { FieldSchema } from "../cms/fieldSchema";
import { cmsSaveCollection } from "../cms/storage/collections";
import type { CmsStorageExecutor } from "../cms/storage/executor";
import {
  buildAriaCollection,
  type StarterCollectionDefinition,
} from "./starterContent";

export const MAIN_NAV_COLLECTION_NAME = "main-nav";

export const navMenuFields: FieldSchema[] = [
  {
    key: "location",
    label: "Location",
    type: "select",
    required: true,
    options: ["header", "footer", "mobile"],
    showInEntryList: true,
  },
  {
    key: "items",
    label: "Menu items",
    type: "repeater",
    required: true,
    fields: [
      {
        key: "label",
        label: "Label",
        type: "string",
        required: true,
      },
      {
        key: "link",
        label: "Link",
        type: "link",
        required: true,
      },
    ],
  },
];

export function buildStarterMainNavCollectionDefinition(): StarterCollectionDefinition {
  return {
    id: MAIN_NAV_COLLECTION_NAME,
    name: MAIN_NAV_COLLECTION_NAME,
    label: "Main Navigation",
    kind: "config",
    icon: "i-lucide:menu",
    fields: navMenuFields,
    supports: ["revisions"],
    urlPattern: null,
    templatePageId: null,
    listPageId: null,
  };
}

export async function seedStarterMainNavCollectionIfMissing(
  executor: CmsStorageExecutor,
  now: string,
): Promise<void> {
  const definition = buildStarterMainNavCollectionDefinition();
  const collection = buildAriaCollection(definition, now);

  const existingCollection = await executor.queryFirst<{ id: string }>(
    `SELECT id FROM aria_collections WHERE name = ? LIMIT 1`,
    [MAIN_NAV_COLLECTION_NAME],
  );
  if (!existingCollection) {
    await cmsSaveCollection(executor, collection);
  }
}
