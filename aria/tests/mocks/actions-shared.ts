import type { ActionAPIContext } from "astro:actions";
import { vi, type Mock } from "vitest";
import type { OperationId } from "../../lib/auth/capabilityOperations";
import type { SessionUser } from "../../lib/auth/types";
import {
  buildAuthorshipSaveContext,
  buildMediaAuthorshipContextFromSession,
  type MediaAuthorshipMutationKind,
} from "../../lib/authorship/stamping";
import type {
  AuthorshipSaveContext,
  ContentMutationKind,
} from "../../lib/storage/adapter";

export const DEFAULT_TEST_SESSION_USER: SessionUser = {
  id: "f1b18110-3ef0-4f86-9a8d-9ca4fe3064d8",
  username: "test-user",
  email: "test@example.com",
  role: "administrator",
  totpEnabled: false,
  preferences: {},
};

export type ActionsSharedAuthMocks = {
  requireAuth: Mock<
    (context: ActionAPIContext) => Promise<SessionUser>
  >;
  requireRole: Mock<
    (
      context: ActionAPIContext,
      role: SessionUser["role"],
    ) => Promise<SessionUser>
  >;
  requireCapability: Mock<
    (context: ActionAPIContext, capability: string) => Promise<SessionUser>
  >;
  requireAdmin: Mock<
    (context: ActionAPIContext) => Promise<SessionUser>
  >;
  requireOperation: Mock<
    (
      context: ActionAPIContext,
      operationId: OperationId,
    ) => Promise<SessionUser>
  >;
  getAuthUser: Mock<
    (context: ActionAPIContext) => Promise<SessionUser | null>
  >;
  resolveAuthorizedMutation: Mock<
    (
      context: ActionAPIContext,
      operationId: OperationId,
      mutationKind: ContentMutationKind,
    ) => Promise<{ user: SessionUser; authorship: AuthorshipSaveContext }>
  >;
  resolveAuthorizedMediaMutation: Mock<
    (
      context: ActionAPIContext,
      operationId: OperationId,
      mutationKind: MediaAuthorshipMutationKind,
    ) => Promise<{
      user: SessionUser;
      authorship: ReturnType<typeof buildMediaAuthorshipContextFromSession>;
    }>
  >;
};

export function createActionsSharedAuthMocks(): ActionsSharedAuthMocks {
  return {
    requireAuth: vi.fn<ActionsSharedAuthMocks["requireAuth"]>(),
    requireRole: vi.fn<ActionsSharedAuthMocks["requireRole"]>(),
    requireCapability: vi.fn<ActionsSharedAuthMocks["requireCapability"]>(),
    requireAdmin: vi.fn<ActionsSharedAuthMocks["requireAdmin"]>(),
    requireOperation: vi.fn<ActionsSharedAuthMocks["requireOperation"]>(),
    getAuthUser: vi.fn<ActionsSharedAuthMocks["getAuthUser"]>(),
    resolveAuthorizedMutation:
      vi.fn<ActionsSharedAuthMocks["resolveAuthorizedMutation"]>(),
    resolveAuthorizedMediaMutation:
      vi.fn<ActionsSharedAuthMocks["resolveAuthorizedMediaMutation"]>(),
  };
}

export function createTestSessionUser(
  overrides: Partial<SessionUser> = {},
): SessionUser {
  return { ...DEFAULT_TEST_SESSION_USER, ...overrides };
}

export function wireAuthorizedSessionUser(
  mocks: ActionsSharedAuthMocks,
  user: SessionUser = DEFAULT_TEST_SESSION_USER,
): void {
  mocks.requireAuth.mockResolvedValue(user);
  mocks.requireRole.mockResolvedValue(user);
  mocks.requireCapability.mockResolvedValue(user);
  mocks.requireAdmin.mockResolvedValue(user);
  mocks.requireOperation.mockResolvedValue(user);
  mocks.getAuthUser.mockResolvedValue(user);

  mocks.resolveAuthorizedMutation.mockImplementation(
    async (_context, _operationId, mutationKind) => ({
      user,
      authorship: buildAuthorshipSaveContext(user, mutationKind),
    }),
  );

  mocks.resolveAuthorizedMediaMutation.mockImplementation(
    async (_context, _operationId, mutationKind) => ({
      user,
      authorship: buildMediaAuthorshipContextFromSession(user, mutationKind),
    }),
  );
}

export function resetActionsSharedAuthMocks(
  mocks: ActionsSharedAuthMocks,
  options: {
    user?: SessionUser;
    rejectAuth?: unknown;
    rejectOperation?: unknown;
  } = {},
): void {
  mocks.requireAuth.mockReset();
  mocks.requireRole.mockReset();
  mocks.requireCapability.mockReset();
  mocks.requireAdmin.mockReset();
  mocks.requireOperation.mockReset();
  mocks.getAuthUser.mockReset();
  mocks.resolveAuthorizedMutation.mockReset();
  mocks.resolveAuthorizedMediaMutation.mockReset();

  if (options.rejectAuth !== undefined) {
    mocks.requireAuth.mockRejectedValue(options.rejectAuth);
    mocks.requireRole.mockRejectedValue(options.rejectAuth);
    mocks.requireCapability.mockRejectedValue(options.rejectAuth);
    mocks.requireAdmin.mockRejectedValue(options.rejectAuth);
  }

  if (options.rejectOperation !== undefined) {
    mocks.requireOperation.mockRejectedValue(options.rejectOperation);
    mocks.resolveAuthorizedMutation.mockRejectedValue(options.rejectOperation);
    mocks.resolveAuthorizedMediaMutation.mockRejectedValue(
      options.rejectOperation,
    );
    return;
  }

  wireAuthorizedSessionUser(mocks, options.user);
}

export function createActionsSharedAuthMockModule(
  mocks: ActionsSharedAuthMocks,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    requireAuth: mocks.requireAuth,
    requireRole: mocks.requireRole,
    requireCapability: mocks.requireCapability,
    requireAdmin: mocks.requireAdmin,
    requireOperation: mocks.requireOperation,
    getAuthUser: mocks.getAuthUser,
    resolveAuthorizedMutation: mocks.resolveAuthorizedMutation,
    resolveAuthorizedMediaMutation: mocks.resolveAuthorizedMediaMutation,
    ...extras,
  };
}
