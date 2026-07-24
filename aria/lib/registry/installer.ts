/**
 * Service for installing, updating, and uninstalling component
 * packs. Handles persistence and component merging.
 */

import type {
  InstalledPackMetadata,
  RegistryResult,
  InstallOptions,
  InstallProgressEvent,
  InstallProgressCallback,
} from "./types";
import type { ComponentDSL } from "../types/nodes";
import { z } from "zod";
import {
  ComponentDSLSchema,
  InstalledPackMetadataSchema,
} from "../schemas/nodes";
import { RegistryClient, officialRegistry } from "./client";
import {
  OFFICIAL_PACK_SIGNERS,
  verifyPackSignature,
  verifyPayloadChecksum,
} from "./verification";
import { checkPackCompatibility } from "./compatibility";

const InstalledPackMetadataArraySchema = z.array(InstalledPackMetadataSchema);
const ComponentDSLArraySchema = z.array(ComponentDSLSchema);

const INSTALLED_PACKS_KEY = "aria-installed-packs-v1";
const PACK_COMPONENTS_PREFIX = "aria-pack-components-";

export function loadInstalledPacks(): InstalledPackMetadata[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(INSTALLED_PACKS_KEY);
    if (!raw) return [];

    const parsed = InstalledPackMetadataArraySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function saveInstalledPacks(packs: InstalledPackMetadata[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(INSTALLED_PACKS_KEY, JSON.stringify(packs));
}

export function loadPackComponents(packId: string): ComponentDSL[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(`${PACK_COMPONENTS_PREFIX}${packId}`);
    if (!raw) return [];

    const parsed = ComponentDSLArraySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function savePackComponents(packId: string, components: ComponentDSL[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    `${PACK_COMPONENTS_PREFIX}${packId}`,
    JSON.stringify(components),
  );
}

function removePackComponents(packId: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(`${PACK_COMPONENTS_PREFIX}${packId}`);
}

function emitProgress(
  callback: InstallProgressCallback | undefined,
  event: InstallProgressEvent,
): void {
  if (callback) {
    try {
      callback(event);
    } catch {
    }
  }
}

export class PackInstaller {
  private client: RegistryClient;

  constructor(client: RegistryClient = officialRegistry) {
    this.client = client;
  }

  /**
   * Install a pack from the registry
   */
  async install(
    packId: string,
    options?: InstallOptions,
  ): Promise<RegistryResult<InstalledPackMetadata>> {
    const {
      force = false,
      skipVerification = false,
      onProgress,
    } = options ?? {};

    // Check if already installed
    const installedPacks = loadInstalledPacks();
    const existing = installedPacks.find((p) => p.packId === packId);

    if (existing && !force) {
      return {
        success: false,
        error: {
          code: "STORAGE_ERROR",
          message: `Pack "${packId}" is already installed. Use force option to reinstall.`,
        },
      };
    }

    emitProgress(onProgress, {
      packId,
      phase: "downloading",
      progress: 10,
      message: "Downloading pack...",
    });

    // Fetch pack manifest first to check compatibility
    const manifestResult = await this.client.fetchPackManifest(packId);
    if (!manifestResult.success) {
      emitProgress(onProgress, {
        packId,
        phase: "error",
        progress: 0,
        message: manifestResult.error.message,
      });
      return manifestResult;
    }

    const compatibility = checkPackCompatibility(manifestResult.data);
    if (!compatibility.compatible) {
      emitProgress(onProgress, {
        packId,
        phase: "error",
        progress: 0,
        message: compatibility.reason,
      });
      return {
        success: false,
        error: {
          code: "INCOMPATIBLE_VERSION",
          message:
            compatibility.reason ??
            "Pack is incompatible with current app version",
        },
      };
    }

    emitProgress(onProgress, {
      packId,
      phase: "downloading",
      progress: 40,
      message: "Downloading components...",
    });

    const payloadResult = await this.client.fetchPackPayload(packId);
    if (!payloadResult.success) {
      emitProgress(onProgress, {
        packId,
        phase: "error",
        progress: 0,
        message: payloadResult.error.message,
      });
      return payloadResult;
    }

    emitProgress(onProgress, {
      packId,
      phase: "verifying",
      progress: 60,
      message: "Verifying integrity...",
    });

    if (!skipVerification) {
      const checksumResult = await verifyPayloadChecksum(payloadResult.data);
      if (!checksumResult.success) {
        emitProgress(onProgress, {
          packId,
          phase: "error",
          progress: 0,
          message: checksumResult.error.message,
        });
        return checksumResult;
      }

      const signatureResult = await verifyPackSignature(
        payloadResult.data,
        undefined,
        {
          requireSignature: this.client.isOfficial,
          trustedSigners: this.client.isOfficial ? OFFICIAL_PACK_SIGNERS : [],
        },
      );
      if (!signatureResult.success) {
        emitProgress(onProgress, {
          packId,
          phase: "error",
          progress: 0,
          message: signatureResult.error.message,
        });
        return signatureResult;
      }
    }

    emitProgress(onProgress, {
      packId,
      phase: "installing",
      progress: 80,
      message: "Installing components...",
    });

    // Prepare components with source metadata
    const componentsWithSource = payloadResult.data.components.map((c) => ({
      ...c,
      source: "aria" as const,
      packId,
      tier: payloadResult.data.manifest.tier,
      isLocked: true,
    }));

    try {
      savePackComponents(packId, componentsWithSource);
    } catch (err) {
      emitProgress(onProgress, {
        packId,
        phase: "error",
        progress: 0,
        message: "Failed to save components",
      });
      return {
        success: false,
        error: {
          code: "STORAGE_ERROR",
          message: `Failed to save components: ${err instanceof Error ? err.message : "Unknown error"}`,
        },
      };
    }

    const metadata: InstalledPackMetadata = {
      packId,
      version: payloadResult.data.manifest.version,
      installedAt: new Date().toISOString(),
      registryUrl: this.client.url,
    };

    // Remove existing entry if force reinstall
    const updatedPacks = installedPacks.filter((p) => p.packId !== packId);
    updatedPacks.push(metadata);
    saveInstalledPacks(updatedPacks);

    emitProgress(onProgress, {
      packId,
      phase: "complete",
      progress: 100,
      message: "Installation complete",
    });

    return { success: true, data: metadata };
  }

  /**
   * Update an installed pack to the latest version
   */
  async update(
    packId: string,
    options?: InstallOptions,
  ): Promise<RegistryResult<InstalledPackMetadata>> {
    const installedPacks = loadInstalledPacks();
    const existing = installedPacks.find((p) => p.packId === packId);

    if (!existing) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Pack "${packId}" is not installed`,
        },
      };
    }

    // Force reinstall with latest version
    return this.install(packId, { ...options, force: true });
  }

  /**
   * Uninstall a pack
   */
  async uninstall(packId: string): Promise<RegistryResult<void>> {
    const installedPacks = loadInstalledPacks();
    const existing = installedPacks.find((p) => p.packId === packId);

    if (!existing) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Pack "${packId}" is not installed`,
        },
      };
    }

    try {
      removePackComponents(packId);

      const updatedPacks = installedPacks.filter((p) => p.packId !== packId);
      saveInstalledPacks(updatedPacks);

      return { success: true, data: undefined };
    } catch (err) {
      return {
        success: false,
        error: {
          code: "STORAGE_ERROR",
          message: `Failed to uninstall: ${err instanceof Error ? err.message : "Unknown error"}`,
        },
      };
    }
  }

  /**
   * Get all installed packs metadata
   */
  getInstalledPacks(): InstalledPackMetadata[] {
    return loadInstalledPacks();
  }

  /**
   * Get all components from installed packs
   */
  getAllInstalledComponents(): ComponentDSL[] {
    const installedPacks = loadInstalledPacks();
    const allComponents: ComponentDSL[] = [];

    for (const pack of installedPacks) {
      const components = loadPackComponents(pack.packId);
      allComponents.push(...components);
    }

    return allComponents;
  }

  /**
   * Check if a specific pack is installed
   */
  isInstalled(packId: string): boolean {
    const installedPacks = loadInstalledPacks();
    return installedPacks.some((p) => p.packId === packId);
  }

  /**
   * Get installed version of a pack
   */
  getInstalledVersion(packId: string): string | null {
    const installedPacks = loadInstalledPacks();
    const pack = installedPacks.find((p) => p.packId === packId);
    return pack?.version ?? null;
  }
}

/**
 * Default installer instance using official registry
 */
export const packInstaller = new PackInstaller(officialRegistry);

/**
 * Create installer for a custom registry
 */
export function createPackInstaller(client: RegistryClient): PackInstaller {
  return new PackInstaller(client);
}
