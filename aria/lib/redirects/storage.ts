import type { StorageAdapter } from "../storage/adapter";
import type {
  CreateRedirectInput,
  RedirectRule,
  UpdateRedirectInput,
} from "./schemas";

export async function listRedirectsFromAdapter(
  adapter: StorageAdapter,
  options?: { includeDisabled?: boolean },
): Promise<RedirectRule[]> {
  return adapter.listRedirects(options);
}

export async function createRedirectOnAdapter(
  adapter: StorageAdapter,
  input: CreateRedirectInput,
  actorId?: string,
): Promise<RedirectRule> {
  return adapter.createRedirect(input, actorId);
}

export async function updateRedirectOnAdapter(
  adapter: StorageAdapter,
  input: UpdateRedirectInput,
): Promise<RedirectRule> {
  return adapter.updateRedirect(input);
}

export async function deleteRedirectOnAdapter(
  adapter: StorageAdapter,
  id: string,
): Promise<void> {
  return adapter.deleteRedirect(id);
}

export async function getRedirectByIdFromAdapter(
  adapter: StorageAdapter,
  id: string,
): Promise<RedirectRule | null> {
  return adapter.getRedirectById(id);
}
