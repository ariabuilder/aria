import { describe, expect, it } from "vitest";
import {
  getSeededPayload,
  SEEDED_PACK_MANIFESTS,
  SEEDED_REGISTRY_MANIFEST,
} from "../../lib/registry/seed";
import {
  PackPayloadSchema,
  RegistryManifestSchema,
  isAriaComponent,
  isLockedComponent,
  isProComponent,
} from "../../lib/schemas/nodes";

describe("registry seed data", () => {
  it("validates the seeded registry manifest", () => {
    const parsed = RegistryManifestSchema.safeParse(SEEDED_REGISTRY_MANIFEST);
    expect(parsed.success).toBe(true);
  });

  it("returns and validates payloads for all seeded packs", () => {
    for (const manifest of SEEDED_PACK_MANIFESTS) {
      const payload = getSeededPayload(manifest.id, manifest.version);
      expect(payload).not.toBeNull();

      const parsed = PackPayloadSchema.safeParse(payload);
      expect(parsed.success).toBe(true);

      expect(payload?.manifest.id).toBe(manifest.id);
      expect(payload?.manifest.version).toBe(manifest.version);
      expect(payload?.components.length).toBeGreaterThan(0);
    }
  });

  it("marks seeded components as Aria library and locked", () => {
    for (const manifest of SEEDED_PACK_MANIFESTS) {
      const payload = getSeededPayload(manifest.id, manifest.version);
      expect(payload).not.toBeNull();

      for (const component of payload?.components ?? []) {
        expect(isAriaComponent(component)).toBe(true);
        expect(isLockedComponent(component)).toBe(true);
        expect(component.packId).toBe(manifest.id);

        if (manifest.tier === "pro") {
          expect(isProComponent(component)).toBe(true);
        }
      }
    }
  });

  it("returns null for unknown pack/version", () => {
    expect(getSeededPayload("missing-pack", "1.0.0")).toBeNull();
    expect(getSeededPayload("aria-sections-core", "9.9.9")).toBeNull();
  });
});
