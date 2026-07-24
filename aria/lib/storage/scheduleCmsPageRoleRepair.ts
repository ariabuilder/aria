import { repairCmsPageRoleAssignmentsOnAdapter } from "../cms/services/collections";
import { log } from "../utils/logger";
import type { StorageAdapter } from "./adapter";

export function scheduleCmsPageRoleRepair(adapter: StorageAdapter): void {
  void (async () => {
    try {
      const collections = await adapter.listCollections();
      if (collections.length === 0) {
        return;
      }
      await repairCmsPageRoleAssignmentsOnAdapter(adapter);
    } catch (error) {
      log("warn", "[storage] CMS page role repair failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
}
