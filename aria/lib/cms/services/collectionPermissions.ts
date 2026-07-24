import type { StorageAdapter } from "../../storage/adapter";
import type { AriaCollectionPermission } from "../constants";
import { CollectionPermissionSchema } from "../schemas";
import { CmsServiceError } from "../errors";
import { getCollectionFromAdapter } from "./collections";

export async function listCollectionPermissionsFromAdapter(
  adapter: StorageAdapter,
  collectionId: string,
): Promise<AriaCollectionPermission[]> {
  const collection = await getCollectionFromAdapter(adapter, collectionId);
  if (!collection) {
    throw new CmsServiceError("NOT_FOUND", `Collection not found: ${collectionId}`);
  }

  return adapter.listCollectionPermissions(collection.id);
}

export async function replaceCollectionPermissionsOnAdapter(
  adapter: StorageAdapter,
  collectionId: string,
  permissions: ReadonlyArray<
    Pick<AriaCollectionPermission, "principalId" | "action">
  >,
): Promise<AriaCollectionPermission[]> {
  const collection = await getCollectionFromAdapter(adapter, collectionId);
  if (!collection) {
    throw new CmsServiceError("NOT_FOUND", `Collection not found: ${collectionId}`);
  }

  const normalized = permissions.map((permission) =>
    CollectionPermissionSchema.parse({
      principalId: permission.principalId,
      collectionId: collection.id,
      action: permission.action,
    }),
  );

  await adapter.replaceCollectionPermissions(
    collection.id,
    normalized.map((permission) => ({
      principalId: permission.principalId,
      action: permission.action,
    })),
  );

  return normalized;
}
