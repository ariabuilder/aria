import { describe, expect, it } from "vitest";

import {
  assertLocalizedSnapshot,
  buildTranslationManifest,
  getLocalizedFieldValue,
} from "../../../lib/localization/translationManifest";

const source = {
  id: "about",
  nodes: [
    {
      id: "heading",
      type: "Heading",
      props: { text: "About Aria", id: "heading-id" },
      styles: {},
      children: [],
    },
    {
      id: "image",
      type: "Image",
      props: { src: "/team.webp", alt: "The Aria team" },
      styles: {},
      children: [],
    },
  ],
};

describe("translation manifest", () => {
  it("exposes stable text and media-alt fields without exposing implementation props", () => {
    const manifest = buildTranslationManifest(source);
    expect(manifest.entries.map((entry) => entry.path)).toEqual([
      "node:heading:prop:text",
      "node:image:prop:alt",
    ]);
    expect(getLocalizedFieldValue(source, "node:heading:prop:text")).toBe(
      "About Aria",
    );
  });

  it("permits only declared localized changes and requires an exact path inventory", () => {
    const manifest = buildTranslationManifest(source);
    const translated = JSON.parse(JSON.stringify(source));
    translated.nodes[0].props.text = "À propos d’Aria";

    expect(() =>
      assertLocalizedSnapshot({
        source,
        candidate: translated,
        translatedPaths: ["node:heading:prop:text"],
        sourceManifestHash: manifest.hash,
        sourceStructureHash: manifest.structureHash,
      }),
    ).not.toThrow();

    translated.nodes[0].props.id = "changed";
    expect(() =>
      assertLocalizedSnapshot({
        source,
        candidate: translated,
        translatedPaths: ["node:heading:prop:text"],
        sourceManifestHash: manifest.hash,
        sourceStructureHash: manifest.structureHash,
      }),
    ).toThrow(/structure/i);
  });
});
