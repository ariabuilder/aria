import { inject, type InjectionKey, type Ref, type ShallowRef } from "vue";

import type { DesignHeaderTeleportTarget } from "../types";

export type DesignHeaderTeleportRefs = Record<
  DesignHeaderTeleportTarget,
  Ref<HTMLElement | null> | ShallowRef<HTMLElement | null>
>;

export const DESIGN_HEADER_TELEPORT_KEY: InjectionKey<DesignHeaderTeleportRefs> =
  Symbol("design-header-teleport");

export function useDesignHeaderTeleport(): DesignHeaderTeleportRefs {
  const targets = inject(DESIGN_HEADER_TELEPORT_KEY, null);
  if (targets === null) {
    throw new Error(
      "useDesignHeaderTeleport must be used within DesignView or DesignWorkbenchDialog",
    );
  }

  return targets;
}
