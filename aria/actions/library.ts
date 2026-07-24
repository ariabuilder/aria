/**
 * Aria Library backend using Astro Actions + storage adapter. Uses seeded registry data
 * now and can be swapped to external registry later without changing Studio contracts.
 */

import { defineAction, type ActionAPIContext } from "astro:actions";
import { z } from "astro/zod";
import type { RuntimeLocals } from "../lib/storage/getStorageAdapter";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";
import type {
  AuthorshipSaveContext,
  StorageAdapter,
} from "../lib/storage/adapter";
import type {
  BuilderNode,
  ComponentDSL,
  PackManifest,
  PackPayload,
} from "../lib/types/nodes";
import {
  ComponentDSLSchema,
  PackManifestSchema,
  PackPayloadSchema,
  RegistryManifestSchema,
} from "../lib/schemas/nodes";
import {
  SEEDED_REGISTRY_MANIFEST,
  getSeededPayload,
} from "../lib/registry/seed";
import {
  checkPackCompatibility,
  isNewerVersion,
} from "../lib/registry/compatibility";
import {
  OFFICIAL_PACK_SIGNERS,
  verifyPackSignature,
  verifyPayloadChecksum,
} from "../lib/registry/verification";
import { ARIA_FREE_BUTTON_COMPONENT } from "../lib/registry/components/button";
import { touchContentRevisionForAction } from "../lib/content-sync/mutations";
import { parseAuthorshipSaveContext } from "../lib/authorship/stamping";
import {
  requireAuth,
  requireOperation,
  resolveAuthorizedMutation,
} from "./_shared";

const TierSchema = z.enum(["free", "pro"]);

const CatalogInputSchema = z
  .object({
    query: z.string().trim().min(1).optional(),
    tier: TierSchema.optional(),
  })
  .optional();

const PackRefSchema = z.object({
  packId: z.string().min(1),
  version: z.string().min(1).optional(),
});

const InstallInputSchema = PackRefSchema.extend({
  force: z.boolean().default(false),
});

const InstallComponentInputSchema = PackRefSchema.extend({
  componentId: z.string().min(1),
  force: z.boolean().default(false),
});

const UninstallInputSchema = z.object({
  packId: z.string().min(1),
  force: z.boolean().default(false),
});

const InstallStarterButtonInputSchema = z.object({
  force: z.boolean().default(false),
});

interface InstalledPackSummary {
  packId: string;
  name: string;
  tier: "free" | "pro";
  version: string;
  componentCount: number;
  installedAt: string;
}

interface CatalogPackResult extends PackManifest {
  installState: "not_installed" | "partial" | "installed";
  installedComponentCount: number;
  installed: boolean;
  installedVersion?: string;
  updateAvailable: boolean;
}

interface ComponentReference {
  componentId: string;
  locations: Array<{
    type: "page" | "layout";
    id: string;
  }>;
}

async function getAdapter(context?: {
  locals?: RuntimeLocals;
}): Promise<StorageAdapter> {
  return getStorageAdapterAsync(context?.locals);
}

async function persistLibraryComponent(
  adapter: StorageAdapter,
  context: ActionAPIContext,
  component: ComponentDSL,
  authorship: AuthorshipSaveContext,
): Promise<void> {
  await adapter.saveComponentDSL(
    component.id,
    component,
    undefined,
    parseAuthorshipSaveContext(authorship),
  );
  await touchContentRevisionForAction(
    adapter,
    {
      mutationKind: "save-component",
      mutationTarget: component.id,
    },
    context,
  );
}

function normalizeAriaComponent(
  component: ComponentDSL,
  pack: PackManifest,
): ComponentDSL {
  return {
    ...component,
    source: "aria",
    packId: pack.id,
    tier: pack.tier,
    isLocked: true,
    version: component.version ?? pack.version,
    updatedAt: new Date().toISOString(),
  };
}

function isAriaComponent(component: ComponentDSL): boolean {
  return component.source === "aria";
}

function groupInstalledPacks(
  components: readonly ComponentDSL[],
): InstalledPackSummary[] {
  const grouped = new Map<string, ComponentDSL[]>();

  for (const component of components) {
    if (!isAriaComponent(component) || !component.packId) continue;

    const existing = grouped.get(component.packId) ?? [];
    existing.push(component);
    grouped.set(component.packId, existing);
  }

  const manifestById = new Map(
    SEEDED_REGISTRY_MANIFEST.packs.map((pack) => [pack.id, pack] as const),
  );

  return Array.from(grouped.entries()).map(([packId, packComponents]) => {
    const manifest = manifestById.get(packId);
    const version =
      packComponents
        .map((component) => component.version)
        .find(
          (candidate): candidate is string => typeof candidate === "string",
        ) ??
      manifest?.version ??
      "unknown";

    const installedAt =
      packComponents
        .map((component) => component.updatedAt)
        .find(
          (candidate): candidate is string => typeof candidate === "string",
        ) ?? new Date().toISOString();

    return {
      packId,
      name: manifest?.name ?? packId,
      tier: manifest?.tier ?? "free",
      version,
      componentCount: packComponents.length,
      installedAt,
    };
  });
}

function collectComponentReferences(
  nodes: readonly BuilderNode[],
  componentIds: ReadonlySet<string>,
): Set<string> {
  const referenced = new Set<string>();

  const visit = (currentNodes: readonly BuilderNode[]): void => {
    for (const node of currentNodes) {
      if (node.componentRef && componentIds.has(node.componentRef)) {
        referenced.add(node.componentRef);
      }
      if (node.children?.length) {
        visit(node.children);
      }
    }
  };

  visit(nodes);
  return referenced;
}

async function findComponentReferences(
  adapter: StorageAdapter,
  componentIds: readonly string[],
): Promise<ComponentReference[]> {
  const targetIds = new Set(componentIds);
  const referencesMap = new Map<string, ComponentReference>();

  const [pages, layouts] = await Promise.all([
    adapter.listPagesDSL(),
    adapter.listLayoutsDSL(),
  ]);

  // Load full PageDSL for each page to scan component references
  for (const page of pages) {
    const pageDSL = await adapter.getPageDSL(page.id);
    const referenced = collectComponentReferences(
      pageDSL?.nodes ?? [],
      targetIds,
    );
    for (const componentId of referenced) {
      const current = referencesMap.get(componentId) ?? {
        componentId,
        locations: [],
      };
      current.locations.push({ type: "page", id: page.id });
      referencesMap.set(componentId, current);
    }
  }

  for (const layout of layouts) {
    const referenced = collectComponentReferences(
      layout.nodes ?? [],
      targetIds,
    );
    for (const componentId of referenced) {
      const current = referencesMap.get(componentId) ?? {
        componentId,
        locations: [],
      };
      current.locations.push({ type: "layout", id: layout.id });
      referencesMap.set(componentId, current);
    }
  }

  return Array.from(referencesMap.values());
}

function resolveManifest(
  packId: string,
  version?: string,
): PackManifest | null {
  const pack = SEEDED_REGISTRY_MANIFEST.packs.find(
    (candidate) => candidate.id === packId,
  );
  if (!pack) return null;

  if (version && pack.version !== version) return null;
  return pack;
}

function resolvePayload(packId: string, version?: string): PackPayload | null {
  const manifest = resolveManifest(packId, version);
  if (!manifest) return null;

  return getSeededPayload(packId, manifest.version);
}

export const library = {
  catalog: defineAction({
    accept: "json",
    input: CatalogInputSchema,
    handler: async (input, context) => {
      await requireAuth(context);

      const parsedCatalog = RegistryManifestSchema.safeParse(
        SEEDED_REGISTRY_MANIFEST,
      );
      if (!parsedCatalog.success) {
        return {
          success: false as const,
          error: {
            code: "INVALID_MANIFEST",
            message: "Seed registry manifest failed validation",
            details: parsedCatalog.error.issues,
          },
        };
      }

      const adapter = await getAdapter(context);
      const installedComponents = await adapter.listComponentsDSL();
      const installed = groupInstalledPacks(installedComponents);
      const installedMap = new Map(
        installed.map((item) => [item.packId, item] as const),
      );
      const installedComponentIdsByPack = new Map<string, Set<string>>();

      for (const component of installedComponents) {
        if (!isAriaComponent(component) || !component.packId) continue;

        const existing =
          installedComponentIdsByPack.get(component.packId) ??
          new Set<string>();
        existing.add(component.id);
        installedComponentIdsByPack.set(component.packId, existing);
      }

      const query = input?.query?.toLowerCase();
      const filtered = parsedCatalog.data.packs.filter((pack) => {
        if (input?.tier && pack.tier !== input.tier) return false;
        if (!query) return true;

        const searchable =
          `${pack.name} ${pack.description ?? ""} ${(pack.tags ?? []).join(" ")}`.toLowerCase();
        return searchable.includes(query);
      });

      const packs: CatalogPackResult[] = filtered.map((pack) => {
        const installedPack = installedMap.get(pack.id);
        const installedComponentIds = installedComponentIdsByPack.get(pack.id);
        const installedComponentCount = pack.componentIds.reduce(
          (count, componentId) =>
            count + (installedComponentIds?.has(componentId) ? 1 : 0),
          0,
        );
        const installState: CatalogPackResult["installState"] =
          installedComponentCount === 0
            ? "not_installed"
            : installedComponentCount === pack.componentIds.length
              ? "installed"
              : "partial";
        const installedVersion = installedPack?.version;
        const updateAvailable =
          typeof installedVersion === "string"
            ? isNewerVersion(pack.version, installedVersion)
            : false;

        return {
          ...pack,
          installState,
          installedComponentCount,
          installed: installState === "installed",
          installedVersion,
          updateAvailable,
        };
      });

      return {
        success: true as const,
        data: {
          registryVersion: parsedCatalog.data.schemaVersion,
          updatedAt: parsedCatalog.data.updatedAt,
          packs,
        },
      };
    },
  }),

  pack: defineAction({
    accept: "json",
    input: PackRefSchema,
    handler: async ({ packId, version }, context) => {
      await requireAuth(context);

      const payload = resolvePayload(packId, version);
      if (!payload) {
        return {
          success: false as const,
          error: {
            code: "PACK_NOT_FOUND",
            message: `Pack not found: ${packId}${version ? `@${version}` : ""}`,
          },
        };
      }

      const parsedPayload = PackPayloadSchema.safeParse(payload);
      if (!parsedPayload.success) {
        return {
          success: false as const,
          error: {
            code: "INVALID_PAYLOAD",
            message: "Pack payload failed validation",
            details: parsedPayload.error.issues,
          },
        };
      }

      return {
        success: true as const,
        data: parsedPayload.data,
      };
    },
  }),

  listInstalled: defineAction({
    accept: "json",
    handler: async (_, context) => {
      await requireAuth(context);

      const adapter = await getAdapter(context);
      const installed = groupInstalledPacks(await adapter.listComponentsDSL());

      return {
        success: true as const,
        data: installed,
      };
    },
  }),

  installPack: defineAction({
    accept: "json",
    input: InstallInputSchema,
    handler: async ({ packId, version, force }, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "library.installPack",
        "save-component",
      );

      const payload = resolvePayload(packId, version);
      if (!payload) {
        return {
          success: false as const,
          error: {
            code: "PACK_NOT_FOUND",
            message: `Pack not found: ${packId}${version ? `@${version}` : ""}`,
          },
        };
      }

      const parsedManifest = PackManifestSchema.safeParse(payload.manifest);
      if (!parsedManifest.success) {
        return {
          success: false as const,
          error: {
            code: "INVALID_MANIFEST",
            message: "Pack manifest failed validation",
            details: parsedManifest.error.issues,
          },
        };
      }

      const parsedPayload = PackPayloadSchema.safeParse(payload);
      if (!parsedPayload.success) {
        return {
          success: false as const,
          error: {
            code: "INVALID_PAYLOAD",
            message: "Pack payload failed validation",
            details: parsedPayload.error.issues,
          },
        };
      }

      const compatibility = checkPackCompatibility(parsedManifest.data);
      if (!compatibility.compatible) {
        return {
          success: false as const,
          error: {
            code: "INCOMPATIBLE_VERSION",
            message:
              compatibility.reason ??
              "Pack is not compatible with this app version",
            details: {
              requiredVersion: compatibility.requiredVersion,
              currentVersion: compatibility.currentVersion,
            },
          },
        };
      }

      const checksumResult = await verifyPayloadChecksum(parsedPayload.data);
      if (!checksumResult.success) {
        return {
          success: false as const,
          error: checksumResult.error,
        };
      }

      const signatureResult = await verifyPackSignature(
        parsedPayload.data,
        undefined,
        {
          requireSignature: true,
          trustedSigners: OFFICIAL_PACK_SIGNERS,
        },
      );
      if (!signatureResult.success) {
        return {
          success: false as const,
          error: signatureResult.error,
        };
      }

      const adapter = await getAdapter(context);
      const existingComponents = await adapter.listComponentsDSL();

      const existingById = new Map(
        existingComponents.map(
          (component) => [component.id, component] as const,
        ),
      );
      const conflicts = parsedPayload.data.components.filter((component) => {
        const existing = existingById.get(component.id);
        if (!existing) return false;
        if (existing.source === "aria") return false;
        return true;
      });

      if (conflicts.length > 0 && !force) {
        return {
          success: false as const,
          error: {
            code: "COMPONENT_ID_CONFLICT",
            message:
              "One or more component IDs conflict with existing custom components",
            details: {
              componentIds: conflicts.map((component) => component.id),
            },
          },
        };
      }

      const savedIds: string[] = [];
      for (const component of parsedPayload.data.components) {
        const normalized = normalizeAriaComponent(
          component,
          parsedManifest.data,
        );
        const validated = ComponentDSLSchema.safeParse(normalized);
        if (!validated.success) {
          return {
            success: false as const,
            error: {
              code: "INVALID_COMPONENT",
              message: `Component failed schema validation: ${component.id}`,
              details: validated.error.issues,
            },
          };
        }

        await persistLibraryComponent(
          adapter,
          context,
          validated.data,
          authorship,
        );
        savedIds.push(validated.data.id);
      }

      return {
        success: true as const,
        data: {
          packId: parsedManifest.data.id,
          version: parsedManifest.data.version,
          componentCount: savedIds.length,
          componentIds: savedIds,
        },
      };
    },
  }),

  installComponent: defineAction({
    accept: "json",
    input: InstallComponentInputSchema,
    handler: async ({ packId, version, componentId, force }, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "library.installComponent",
        "save-component",
      );

      const payload = resolvePayload(packId, version);
      if (!payload) {
        return {
          success: false as const,
          error: {
            code: "PACK_NOT_FOUND",
            message: `Pack not found: ${packId}${version ? `@${version}` : ""}`,
          },
        };
      }

      const parsedManifest = PackManifestSchema.safeParse(payload.manifest);
      if (!parsedManifest.success) {
        return {
          success: false as const,
          error: {
            code: "INVALID_MANIFEST",
            message: "Pack manifest failed validation",
            details: parsedManifest.error.issues,
          },
        };
      }

      const parsedPayload = PackPayloadSchema.safeParse(payload);
      if (!parsedPayload.success) {
        return {
          success: false as const,
          error: {
            code: "INVALID_PAYLOAD",
            message: "Pack payload failed validation",
            details: parsedPayload.error.issues,
          },
        };
      }

      const compatibility = checkPackCompatibility(parsedManifest.data);
      if (!compatibility.compatible) {
        return {
          success: false as const,
          error: {
            code: "INCOMPATIBLE_VERSION",
            message:
              compatibility.reason ??
              "Pack is not compatible with this app version",
            details: {
              requiredVersion: compatibility.requiredVersion,
              currentVersion: compatibility.currentVersion,
            },
          },
        };
      }

      const checksumResult = await verifyPayloadChecksum(parsedPayload.data);
      if (!checksumResult.success) {
        return {
          success: false as const,
          error: checksumResult.error,
        };
      }

      const signatureResult = await verifyPackSignature(
        parsedPayload.data,
        undefined,
        {
          requireSignature: true,
          trustedSigners: OFFICIAL_PACK_SIGNERS,
        },
      );
      if (!signatureResult.success) {
        return {
          success: false as const,
          error: signatureResult.error,
        };
      }

      const targetComponent = parsedPayload.data.components.find(
        (component) => component.id === componentId,
      );

      if (!targetComponent) {
        return {
          success: false as const,
          error: {
            code: "COMPONENT_NOT_FOUND",
            message: `Component ${componentId} is not part of pack ${packId}`,
          },
        };
      }

      const adapter = await getAdapter(context);
      const existing = await adapter.getComponentDSL(componentId);

      if (existing && existing.source !== "aria") {
        return {
          success: false as const,
          error: {
            code: "COMPONENT_ID_CONFLICT",
            message: "Component ID conflicts with an existing custom component",
            details: { componentId },
          },
        };
      }

      if (
        existing &&
        existing.source === "aria" &&
        existing.packId === packId &&
        !force
      ) {
        return {
          success: true as const,
          data: {
            packId,
            componentId,
            version: existing.version ?? parsedManifest.data.version,
            action: "already_installed" as const,
          },
        };
      }

      const normalized = normalizeAriaComponent(
        targetComponent,
        parsedManifest.data,
      );
      const validated = ComponentDSLSchema.safeParse(normalized);
      if (!validated.success) {
        return {
          success: false as const,
          error: {
            code: "INVALID_COMPONENT",
            message: `Component failed schema validation: ${componentId}`,
            details: validated.error.issues,
          },
        };
      }

      await persistLibraryComponent(
        adapter,
        context,
        validated.data,
        authorship,
      );

      return {
        success: true as const,
        data: {
          packId,
          componentId,
          version: parsedManifest.data.version,
          action: "installed" as const,
        },
      };
    },
  }),

  installStarterButton: defineAction({
    accept: "json",
    input: InstallStarterButtonInputSchema,
    handler: async ({ force }, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "library.installStarterButton",
        "save-component",
      );

      const adapter = await getAdapter(context);
      const existing = await adapter.getComponentDSL(
        ARIA_FREE_BUTTON_COMPONENT.id,
      );

      if (existing && existing.source !== "aria") {
        return {
          success: false as const,
          error: {
            code: "COMPONENT_ID_CONFLICT",
            message: "Component ID conflicts with an existing custom component",
            details: { componentId: ARIA_FREE_BUTTON_COMPONENT.id },
          },
        };
      }

      if (
        existing &&
        existing.source === "aria" &&
        existing.id === ARIA_FREE_BUTTON_COMPONENT.id &&
        !force
      ) {
        return {
          success: true as const,
          data: {
            componentId: existing.id,
            version: existing.version ?? ARIA_FREE_BUTTON_COMPONENT.version,
            action: "already_installed" as const,
          },
        };
      }

      const normalized = {
        ...ARIA_FREE_BUTTON_COMPONENT,
        source: "aria" as const,
        packId: "aria-free-pack",
        tier: "free" as const,
        isLocked: true,
        updatedAt: new Date().toISOString(),
      };

      const validated = ComponentDSLSchema.safeParse(normalized);
      if (!validated.success) {
        return {
          success: false as const,
          error: {
            code: "INVALID_COMPONENT",
            message: "Starter Button failed schema validation",
            details: validated.error.issues,
          },
        };
      }

      await persistLibraryComponent(
        adapter,
        context,
        validated.data,
        authorship,
      );

      return {
        success: true as const,
        data: {
          componentId: validated.data.id,
          version: validated.data.version ?? "1.0.0",
          action: "installed" as const,
        },
      };
    },
  }),

  uninstallPack: defineAction({
    accept: "json",
    input: UninstallInputSchema,
    handler: async ({ packId, force }, context) => {
      await requireOperation(context, "library.uninstallPack");

      const adapter = await getAdapter(context);
      const components = await adapter.listComponentsDSL();

      const packComponents = components.filter(
        (component) =>
          component.source === "aria" && component.packId === packId,
      );

      if (packComponents.length === 0) {
        return {
          success: false as const,
          error: {
            code: "PACK_NOT_INSTALLED",
            message: `Pack is not installed: ${packId}`,
          },
        };
      }

      if (!force) {
        const references = await findComponentReferences(
          adapter,
          packComponents.map((component) => component.id),
        );

        if (references.length > 0) {
          return {
            success: false as const,
            error: {
              code: "PACK_IN_USE",
              message:
                "Pack cannot be uninstalled because components are in use",
              details: {
                references,
              },
            },
          };
        }
      }

      for (const component of packComponents) {
        await adapter.deleteComponentDSL(component.id);
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "delete-component",
            mutationTarget: component.id,
          },
          context,
        );
      }

      return {
        success: true as const,
        data: {
          packId,
          removedCount: packComponents.length,
          removedComponentIds: packComponents.map((component) => component.id),
        },
      };
    },
  }),

  checkUpdates: defineAction({
    accept: "json",
    handler: async (_, context) => {
      await requireAuth(context);

      const adapter = await getAdapter(context);
      const installed = groupInstalledPacks(await adapter.listComponentsDSL());

      const manifestById = new Map(
        SEEDED_REGISTRY_MANIFEST.packs.map((pack) => [pack.id, pack] as const),
      );

      const updates = installed.map((item) => {
        const latest = manifestById.get(item.packId);
        const latestVersion = latest?.version ?? item.version;

        return {
          packId: item.packId,
          currentVersion: item.version,
          latestVersion,
          hasUpdate: isNewerVersion(latestVersion, item.version),
          tier: latest?.tier ?? item.tier,
        };
      });

      return {
        success: true as const,
        data: updates,
      };
    },
  }),
};
