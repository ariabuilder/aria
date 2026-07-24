/**
 * Bundled starter pack catalog for local development.
 */

import type {
  ComponentDSL,
  PackManifest,
  PackPayload,
  RegistryManifest,
} from "../types/nodes";

const HERO_SPLIT_COMPONENT: ComponentDSL = {
  id: "aria.hero.split.v1",
  name: "Split Hero",
  title: "Split Hero",
  description: "Two-column hero with headline, copy, and CTAs.",
  category: "hero",
  source: "aria",
  packId: "aria-sections-core",
  tier: "free",
  isLocked: true,
  version: "1.0.0",
  nodes: [],
  propSchema: [],
  slots: [],
};

const PRICING_TABLE_COMPONENT: ComponentDSL = {
  id: "aria.pricing.table.v1",
  name: "Pricing Table",
  title: "Pricing Table",
  description: "Tiered SaaS pricing table section.",
  category: "pricing",
  source: "aria",
  packId: "aria-saas-pro",
  tier: "pro",
  isLocked: true,
  version: "1.0.0",
  nodes: [],
  propSchema: [],
  slots: [],
};

export const SEEDED_PACK_MANIFESTS: PackManifest[] = [
  {
    id: "aria-sections-core",
    name: "Aria Starter Pack",
    description:
      "Your essential building blocks—foundational components to launch polished pages fast.",
    version: "1.0.0",
    minAppVersion: "1.0.0",
    tier: "free",
    componentIds: [HERO_SPLIT_COMPONENT.id],
    thumbnail:
      "https://library.ariabuilder.io/previews/aria-sections-core.webp",
    tags: ["sections", "hero", "marketing"],
    publishedAt: "2026-02-19T00:00:00.000Z",
    checksum:
      "ed75e21d49a838f1f54a55c15d5e3efcf0e1e19253593b4b8272e1433574c32e",
    signerKeyId: "aria-official-2026-01",
    signatureAlgorithm: "ECDSA_P256_SHA256",
    signature:
      "_Gf-85WUhksGnPAV-dNmCy5hfdxefrv1-kHkCD732a4SaqLBjgGNkIosjfM8uTfR-ZwdZQOvs3R2e3avOyAPZA",
  },
  {
    id: "aria-saas-pro",
    name: "Aria Pro Studio Pack",
    description:
      "Advanced, conversion-focused components to scale your SaaS experience with confidence.",
    version: "1.0.0",
    minAppVersion: "1.0.0",
    tier: "pro",
    componentIds: [PRICING_TABLE_COMPONENT.id],
    thumbnail: "https://library.ariabuilder.io/previews/aria-saas-pro.webp",
    tags: ["saas", "pricing", "conversion"],
    publishedAt: "2026-02-19T00:00:00.000Z",
    checksum:
      "53769e3adac77bd1723c3cc1e2b8e163174fec9479f0d81cf22ab957de5d8d59",
    signerKeyId: "aria-official-2026-01",
    signatureAlgorithm: "ECDSA_P256_SHA256",
    signature:
      "1BJvVV63ENMG0S6dCPT4vJchV6YUMoh5KZREfuf8BFimp-4u4NJRw10O-W1Rx47MJwaVJXStOb6_RX4-XuNZCA",
  },
];

const SEEDED_PAYLOADS: Record<string, PackPayload> = {
  "aria-sections-core@1.0.0": {
    manifest: SEEDED_PACK_MANIFESTS[0],
    components: [HERO_SPLIT_COMPONENT],
  },
  "aria-saas-pro@1.0.0": {
    manifest: SEEDED_PACK_MANIFESTS[1],
    components: [PRICING_TABLE_COMPONENT],
  },
};

export const SEEDED_REGISTRY_MANIFEST: RegistryManifest = {
  schemaVersion: "1.0.0",
  updatedAt: "2026-02-19T00:00:00.000Z",
  packs: SEEDED_PACK_MANIFESTS,
};

export function getSeededPayload(
  packId: string,
  version: string,
): PackPayload | null {
  return SEEDED_PAYLOADS[`${packId}@${version}`] ?? null;
}
