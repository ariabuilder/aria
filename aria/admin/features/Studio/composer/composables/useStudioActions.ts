import type { StudioActionsReturn } from "./studioCrudShared";

export type {
  CreatePageOptions,
  CreateComponentOptions,
  StudioActionsReturn,
} from "./studioCrudShared";

import { createStudioCrudContext } from "./studioCrudShared";
import { useStudioPageCrud } from "./useStudioPageCrud";
import { useStudioLayoutCrud } from "./useStudioLayoutCrud";
import { useStudioComponentCrud } from "./useStudioComponentCrud";

export function useStudioActions(): StudioActionsReturn {
  const ctx = createStudioCrudContext();
  return {
    ...useStudioPageCrud(ctx),
    ...useStudioLayoutCrud(ctx),
    ...useStudioComponentCrud(ctx),
  };
}
