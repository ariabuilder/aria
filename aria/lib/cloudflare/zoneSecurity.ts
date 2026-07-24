/**
 * Fetch Cloudflare zone security settings (SSL, WAF, Bot) via
 * REST API. Server-only — invoked from storage adapter getAdapterMetrics().
 */

import { z } from "zod";
import { resolveCloudflareAnalyticsCredentials } from "./analytics/credentials";
import type { RuntimeLocals } from "./env";
import { log as baseLog } from "../utils/logger";

const CACHE_TTL_MS = 5 * 60 * 1000;

const CloudflareApiEnvelopeSchema = z.object({
  success: z.boolean().optional(),
  result: z.unknown().optional(),
  errors: z
    .array(z.object({ message: z.string().optional(), code: z.number().optional() }))
    .optional(),
});

const ZoneSettingResultSchema = z.object({
  value: z.unknown().optional(),
});

const BotManagementResultSchema = z.object({
  fight_mode: z.boolean().optional(),
  enable_js: z.boolean().optional(),
  ai_bots_protection: z.string().optional(),
});

export const ZoneSecurityStatusSchema = z.object({
  sslEnabled: z.boolean().optional(),
  wafEnabled: z.boolean().optional(),
  botProtection: z.boolean().optional(),
  fetched: z.boolean(),
});

export type ZoneSecurityStatus = z.infer<typeof ZoneSecurityStatusSchema>;

const zoneSecurityCache = new Map<
  string,
  { at: number; status: ZoneSecurityStatus }
>();

function cacheKey(apiToken: string, zoneId: string): string {
  return `${zoneId}:${apiToken.slice(0, 8)}`;
}

function parseSslEnabled(value: unknown): boolean | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "off") {
    return false;
  }
  if (
    normalized === "flexible" ||
    normalized === "full" ||
    normalized === "strict" ||
    normalized === "origin_pull"
  ) {
    return true;
  }
  return undefined;
}

function parseWafEnabled(value: unknown): boolean | undefined {
  if (value === "on" || value === true) {
    return true;
  }
  if (value === "off" || value === false) {
    return false;
  }
  return undefined;
}

function parseBotProtection(result: unknown): boolean | undefined {
  const parsed = BotManagementResultSchema.safeParse(result);
  if (!parsed.success) {
    return undefined;
  }
  if (parsed.data.fight_mode === true || parsed.data.enable_js === true) {
    return true;
  }
  if (parsed.data.fight_mode === false && parsed.data.enable_js === false) {
    return false;
  }
  return undefined;
}

async function fetchZoneSetting(
  apiToken: string,
  zoneId: string,
  settingId: string,
): Promise<unknown> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/settings/${settingId}`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json",
      },
    },
  );

  if (response.status === 401 || response.status === 403) {
    return undefined;
  }

  if (!response.ok) {
    baseLog("warn", "[Zone security] setting lookup failed", {
      settingId,
      status: response.status,
    });
    return undefined;
  }

  const json: unknown = await response.json();
  const envelope = CloudflareApiEnvelopeSchema.safeParse(json);
  if (!envelope.success || envelope.data.success === false) {
    return undefined;
  }

  return envelope.data.result;
}

async function fetchBotManagement(
  apiToken: string,
  zoneId: string,
): Promise<unknown> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/bot_management`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json",
      },
    },
  );

  if (response.status === 401 || response.status === 403) {
    return undefined;
  }

  if (response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    baseLog("warn", "[Zone security] bot management lookup failed", {
      status: response.status,
    });
    return undefined;
  }

  const json: unknown = await response.json();
  const envelope = CloudflareApiEnvelopeSchema.safeParse(json);
  if (!envelope.success || envelope.data.success === false) {
    return undefined;
  }

  return envelope.data.result;
}

export async function fetchZoneSecurityStatus(
  locals?: RuntimeLocals,
): Promise<ZoneSecurityStatus> {
  const { apiToken, zoneId } = resolveCloudflareAnalyticsCredentials(locals);

  if (!apiToken || !zoneId) {
    return ZoneSecurityStatusSchema.parse({
      fetched: false,
    });
  }

  const key = cacheKey(apiToken, zoneId);
  const cached = zoneSecurityCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.status;
  }

  const [sslResult, wafResult, botResult] = await Promise.all([
    fetchZoneSetting(apiToken, zoneId, "ssl"),
    fetchZoneSetting(apiToken, zoneId, "waf"),
    fetchBotManagement(apiToken, zoneId),
  ]);

  const sslSetting = ZoneSettingResultSchema.safeParse(sslResult);
  const wafSetting = ZoneSettingResultSchema.safeParse(wafResult);

  const status = ZoneSecurityStatusSchema.parse({
    sslEnabled: sslSetting.success
      ? parseSslEnabled(sslSetting.data.value)
      : undefined,
    wafEnabled: wafSetting.success
      ? parseWafEnabled(wafSetting.data.value)
      : undefined,
    botProtection: parseBotProtection(botResult),
    fetched: true,
  });

  zoneSecurityCache.set(key, { at: Date.now(), status });
  return status;
}
