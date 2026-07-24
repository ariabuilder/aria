import { vi } from "vitest";
import type { ActionsSharedAuthMocks } from "./actions-shared";

function createAuthMocks(): ActionsSharedAuthMocks {
  return {
    requireAuth: vi.fn(),
    requireRole: vi.fn(),
    requireCapability: vi.fn(),
    requireAdmin: vi.fn(),
    requireOperation: vi.fn(),
    getAuthUser: vi.fn(),
    resolveAuthorizedMutation: vi.fn(),
    resolveAuthorizedMediaMutation: vi.fn(),
  };
}

export const actionsSharedMocks = createAuthMocks();

export function resetActionsSharedMockInstances(): ActionsSharedAuthMocks {
  const next = createAuthMocks();
  Object.assign(actionsSharedMocks, next);
  return actionsSharedMocks;
}
