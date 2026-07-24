import { z } from "zod";

const ApiResponseSchema = z.object({
  success: z.boolean(),
  result: z
    .object({
      sitekey: z.string().trim().min(1).max(32),
      secret: z.string().trim().min(1).max(4096),
    })
    .optional(),
});
const AccountsResponseSchema = z.object({
  success: z.boolean(),
  result: z.array(z.object({ id: z.string().trim().min(1).max(32) })).optional(),
});

export type CreateManagedTurnstileWidgetInput = {
  apiToken: string;
  accountId: string;
  name: string;
  domains: string[];
  fetcher?: typeof fetch;
};

function endpoint(accountId: string, suffix = ""): string {
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/challenges/widgets${suffix}`;
}

/**
 * A token scoped to one Cloudflare account can identify
 * that account itself, avoiding a redundant per-deployment account-ID setting.
 */
export async function resolveTurnstileAccountId(input: {
  apiToken: string;
  accountId?: string;
  fetcher?: typeof fetch;
}): Promise<string> {
  if (input.accountId) return input.accountId;
  const response = await (input.fetcher ?? fetch)(
    "https://api.cloudflare.com/client/v4/accounts",
    { headers: { Authorization: `Bearer ${input.apiToken}` } },
  );
  const payload = AccountsResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  const accounts = payload.success && payload.data.success ? payload.data.result ?? [] : [];
  if (accounts.length !== 1) throw new Error("CLOUDFLARE_ACCOUNT_UNRESOLVED");
  return accounts[0]!.id;
}

/** Create a managed Turnstile widget. The returned secret must never be sent to a client. */
export async function createManagedTurnstileWidget(
  input: CreateManagedTurnstileWidgetInput,
): Promise<{ siteKey: string; secretKey: string }> {
  const response = await (input.fetcher ?? fetch)(endpoint(input.accountId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ domains: input.domains, mode: "managed", name: input.name }),
  });
  const payload = ApiResponseSchema.safeParse(await response.json().catch(() => null));
  if (!response.ok || !payload.success || !payload.data.success || !payload.data.result) {
    throw new Error("CLOUDFLARE_TURNSTILE_CREATE_FAILED");
  }
  return { siteKey: payload.data.result.sitekey, secretKey: payload.data.result.secret };
}

/** Best-effort rollback used only when encrypted credential persistence fails. */
export async function deleteTurnstileWidget(input: {
  apiToken: string;
  accountId: string;
  siteKey: string;
  fetcher?: typeof fetch;
}): Promise<void> {
  await (input.fetcher ?? fetch)(endpoint(input.accountId, `/${encodeURIComponent(input.siteKey)}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${input.apiToken}` },
  });
}
