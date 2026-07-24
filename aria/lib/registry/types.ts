/**
 * Registry Types
 *
 * Additional types for registry operations beyond core data models.
 */

import type {
  PackManifest,
  RegistryManifest,
  InstalledPackMetadata,
  PackPayload,
  ComponentTier,
} from "../types/nodes";

/**
 * Re-export core types for convenience
 */
export type {
  PackManifest,
  RegistryManifest,
  InstalledPackMetadata,
  PackPayload,
  ComponentTier,
};

export interface RegistryConfig {
  url: string;
  name: string;
  isOfficial: boolean;
  apiKey?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

export const OFFICIAL_REGISTRY: RegistryConfig = {
  url: "https://library.ariabuilder.io",
  name: "Aria Official",
  isOfficial: true,
  timeout: 10000,
};

/**
 * Result type for async operations
 */
export type RegistryResult<T> =
  | { success: true; data: T }
  | { success: false; error: RegistryError };

export interface RegistryError {
  code: RegistryErrorCode;
  message: string;
  details?: unknown;
}

export type RegistryErrorCode =
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "NOT_FOUND"
  | "INVALID_MANIFEST"
  | "INVALID_PAYLOAD"
  | "CHECKSUM_MISMATCH"
  | "SIGNATURE_MISSING"
  | "SIGNATURE_INVALID"
  | "UNTRUSTED_SIGNER"
  | "UNSUPPORTED_SIGNATURE_ALGORITHM"
  | "INCOMPATIBLE_VERSION"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "STORAGE_ERROR"
  | "UNKNOWN_ERROR";

export type PackInstallStatus =
  | "not_installed"
  | "installed"
  | "update_available"
  | "installing"
  | "updating"
  | "error";

export interface PackWithStatus extends PackManifest {
  installStatus: PackInstallStatus;
  installedVersion?: string;
  errorMessage?: string;
}

/**
 * Pack update check result
 */
export interface PackUpdateInfo {
  packId: string;
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  /** Changes since current version */
  changelog?: string;
}

export interface InstallProgressEvent {
  packId: string;
  phase: "downloading" | "verifying" | "installing" | "complete" | "error";
  progress: number; // 0-100
  message?: string;
}

export type InstallProgressCallback = (event: InstallProgressEvent) => void;

export interface InstallOptions {
  /** Force reinstall even if already installed */
  force?: boolean;
  skipVerification?: boolean;
  /** Progress callback */
  onProgress?: InstallProgressCallback;
}

export interface FetchOptions {
  /** Use cached data if available */
  useCache?: boolean;
  /** Maximum cache age in milliseconds */
  maxCacheAge?: number;
  timeout?: number;
}
