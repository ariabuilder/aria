/**
 * HTTP client for fetching registry manifests and
 * pack payloads. Supports multiple registries with caching.
 */

import type {
  RegistryConfig,
  RegistryManifest,
  PackManifest,
  PackPayload,
  RegistryResult,
  RegistryError,
  FetchOptions,
  PackWithStatus,
  PackUpdateInfo,
  InstalledPackMetadata,
} from "./types";
import { OFFICIAL_REGISTRY } from "./types";
import {
  OFFICIAL_PACK_SIGNERS,
  validateManifestStructure,
  validatePackPayload,
} from "./verification";
import { checkPackCompatibility, isNewerVersion } from "./compatibility";

/**
 * In-memory cache for registry data
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const manifestCache = new Map<string, CacheEntry<RegistryManifest>>();
const packCache = new Map<string, CacheEntry<PackPayload>>();

const DEFAULT_CACHE_AGE = 5 * 60 * 1000; // 5 minutes

/**
 * Clear all caches
 */
export function clearRegistryCache(): void {
  manifestCache.clear();
  packCache.clear();
}

function createError(
  code: RegistryError["code"],
  message: string,
  details?: Record<string, unknown>,
): RegistryError {
  return { code, message, details };
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number },
): Promise<Response> {
  const { timeout = 10000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export class RegistryClient {
  private config: RegistryConfig;

  constructor(config: RegistryConfig = OFFICIAL_REGISTRY) {
    this.config = config;
  }

  /**
   * Get the registry URL
   */
  get url(): string {
    return this.config.url;
  }

  /**
   * Get registry display name
   */
  get name(): string {
    return this.config.name;
  }

  /**
   * Check if this is the official registry
   */
  get isOfficial(): boolean {
    return this.config.isOfficial;
  }

  /**
   * Build headers for requests
   */
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  /**
   * Fetch the registry manifest (list of available packs)
   */
  async fetchManifest(
    options?: FetchOptions,
  ): Promise<RegistryResult<RegistryManifest>> {
    const cacheKey = this.config.url;
    const maxCacheAge = options?.maxCacheAge ?? DEFAULT_CACHE_AGE;

    if (options?.useCache !== false) {
      const cached = manifestCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < maxCacheAge) {
        return { success: true, data: cached.data };
      }
    }

    try {
      const response = await fetchWithTimeout(
        `${this.config.url}/manifest.json`,
        {
          method: "GET",
          headers: this.getHeaders(),
          timeout: options?.timeout ?? this.config.timeout,
        },
      );

      if (!response.ok) {
        if (response.status === 401) {
          return {
            success: false,
            error: createError(
              "UNAUTHORIZED",
              "Authentication required for this registry",
            ),
          };
        }
        if (response.status === 404) {
          return {
            success: false,
            error: createError("NOT_FOUND", "Registry manifest not found"),
          };
        }
        if (response.status === 429) {
          return {
            success: false,
            error: createError("RATE_LIMITED", "Too many requests to registry"),
          };
        }
        return {
          success: false,
          error: createError(
            "NETWORK_ERROR",
            `HTTP ${response.status}: ${response.statusText}`,
          ),
        };
      }

      const data = (await response.json()) as unknown;

      if (!data || typeof data !== "object") {
        return {
          success: false,
          error: createError("INVALID_MANIFEST", "Invalid manifest format"),
        };
      }

      const manifest = data as RegistryManifest;

      if (Array.isArray(manifest.packs)) {
        for (const pack of manifest.packs) {
          const validation = validateManifestStructure(pack);
          if (!validation.success) {
            console.warn(
              `Invalid pack in manifest: ${pack.id}`,
              validation.error,
            );
          }
        }
      }

      // Cache the result
      manifestCache.set(cacheKey, {
        data: manifest,
        timestamp: Date.now(),
      });

      return { success: true, data: manifest };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return {
          success: false,
          error: createError("TIMEOUT", "Request timed out"),
        };
      }
      return {
        success: false,
        error: createError(
          "NETWORK_ERROR",
          `Failed to fetch manifest: ${err instanceof Error ? err.message : "Unknown error"}`,
        ),
      };
    }
  }

  /**
   * Fetch a specific pack's manifest
   */
  async fetchPackManifest(
    packId: string,
  ): Promise<RegistryResult<PackManifest>> {
    const manifestResult = await this.fetchManifest({ useCache: true });
    if (!manifestResult.success) {
      return manifestResult;
    }

    const pack = manifestResult.data.packs.find((p) => p.id === packId);
    if (!pack) {
      return {
        success: false,
        error: createError(
          "NOT_FOUND",
          `Pack "${packId}" not found in registry`,
        ),
      };
    }

    return { success: true, data: pack };
  }

  /**
   * Fetch pack payload (components)
   */
  async fetchPackPayload(
    packId: string,
    version?: string,
    options?: FetchOptions,
  ): Promise<RegistryResult<PackPayload>> {
    const cacheKey = `${this.config.url}/${packId}/${version ?? "latest"}`;
    const maxCacheAge = options?.maxCacheAge ?? DEFAULT_CACHE_AGE;

    if (options?.useCache !== false) {
      const cached = packCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < maxCacheAge) {
        return { success: true, data: cached.data };
      }
    }

    // First get the manifest to find the correct version
    const manifestResult = await this.fetchPackManifest(packId);
    if (!manifestResult.success) {
      return manifestResult;
    }

    const packManifest = manifestResult.data;
    const targetVersion = version ?? packManifest.version;

    try {
      const response = await fetchWithTimeout(
        `${this.config.url}/packs/${packId}/${targetVersion}/payload.json`,
        {
          method: "GET",
          headers: this.getHeaders(),
          timeout: options?.timeout ?? this.config.timeout,
        },
      );

      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: false,
            error: createError(
              "NOT_FOUND",
              `Pack payload not found: ${packId}@${targetVersion}`,
            ),
          };
        }
        return {
          success: false,
          error: createError(
            "NETWORK_ERROR",
            `HTTP ${response.status}: ${response.statusText}`,
          ),
        };
      }

      const data = (await response.json()) as unknown;

      const validation = await validatePackPayload(data, {
        requireSignature: this.config.isOfficial,
        trustedSigners: this.config.isOfficial ? OFFICIAL_PACK_SIGNERS : [],
      });
      if (!validation.success) {
        return validation;
      }

      // Cache the result
      packCache.set(cacheKey, {
        data: validation.data,
        timestamp: Date.now(),
      });

      return { success: true, data: validation.data };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return {
          success: false,
          error: createError("TIMEOUT", "Request timed out"),
        };
      }
      return {
        success: false,
        error: createError(
          "NETWORK_ERROR",
          `Failed to fetch pack: ${err instanceof Error ? err.message : "Unknown error"}`,
        ),
      };
    }
  }

  /**
   * Get packs with their installation status
   */
  async getPacksWithStatus(
    installedPacks: InstalledPackMetadata[],
  ): Promise<RegistryResult<PackWithStatus[]>> {
    const manifestResult = await this.fetchManifest({ useCache: true });
    if (!manifestResult.success) {
      return manifestResult;
    }

    const installedMap = new Map(installedPacks.map((p) => [p.packId, p]));

    const packsWithStatus: PackWithStatus[] = manifestResult.data.packs.map(
      (pack) => {
        const installed = installedMap.get(pack.id);

        if (!installed) {
          return {
            ...pack,
            installStatus: "not_installed" as const,
          };
        }

        const hasUpdate = isNewerVersion(pack.version, installed.version);

        return {
          ...pack,
          installStatus: hasUpdate
            ? ("update_available" as const)
            : ("installed" as const),
          installedVersion: installed.version,
        };
      },
    );

    return { success: true, data: packsWithStatus };
  }

  /**
   * Check for updates to installed packs
   */
  async checkForUpdates(
    installedPacks: InstalledPackMetadata[],
  ): Promise<RegistryResult<PackUpdateInfo[]>> {
    const manifestResult = await this.fetchManifest({ useCache: false });
    if (!manifestResult.success) {
      return manifestResult;
    }

    const updates: PackUpdateInfo[] = [];

    for (const installed of installedPacks) {
      const registryPack = manifestResult.data.packs.find(
        (p) => p.id === installed.packId,
      );

      if (!registryPack) {
        // Pack no longer in registry - could warn user
        continue;
      }

      const hasUpdate = isNewerVersion(registryPack.version, installed.version);

      updates.push({
        packId: installed.packId,
        currentVersion: installed.version,
        latestVersion: registryPack.version,
        hasUpdate,
      });
    }

    return { success: true, data: updates };
  }

  /**
   * Search packs by name, tags, or description
   */
  async searchPacks(query: string): Promise<RegistryResult<PackManifest[]>> {
    const manifestResult = await this.fetchManifest({ useCache: true });
    if (!manifestResult.success) {
      return manifestResult;
    }

    const lowerQuery = query.toLowerCase();

    const matches = manifestResult.data.packs.filter((pack) => {
      const nameMatch = pack.name.toLowerCase().includes(lowerQuery);
      const descMatch = pack.description?.toLowerCase().includes(lowerQuery);
      const tagMatch = pack.tags?.some((tag) =>
        tag.toLowerCase().includes(lowerQuery),
      );

      return nameMatch || descMatch || tagMatch;
    });

    return { success: true, data: matches };
  }

  /**
   * Get packs filtered by tier
   */
  async getPacksByTier(
    tier: "free" | "pro",
  ): Promise<RegistryResult<PackManifest[]>> {
    const manifestResult = await this.fetchManifest({ useCache: true });
    if (!manifestResult.success) {
      return manifestResult;
    }

    const filtered = manifestResult.data.packs.filter(
      (pack) => pack.tier === tier,
    );
    return { success: true, data: filtered };
  }

  /**
   * Get compatible packs only
   */
  async getCompatiblePacks(): Promise<RegistryResult<PackManifest[]>> {
    const manifestResult = await this.fetchManifest({ useCache: true });
    if (!manifestResult.success) {
      return manifestResult;
    }

    const compatible = manifestResult.data.packs.filter(
      (pack) => checkPackCompatibility(pack).compatible,
    );

    return { success: true, data: compatible };
  }
}

export const officialRegistry = new RegistryClient(OFFICIAL_REGISTRY);

export function createRegistryClient(config: RegistryConfig): RegistryClient {
  return new RegistryClient(config);
}
