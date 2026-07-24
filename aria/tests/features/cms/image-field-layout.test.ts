import { describe, expect, it } from "vitest";
import { cmsImageFieldLayout } from "../../../admin/features/CMS/lib/imageFieldLayout";
import type { FieldSchema } from "../../../lib/cms/fieldSchema";

function imageField(key: string, label = key): FieldSchema {
  return { key, label, type: "image" };
}

describe("cmsImageFieldLayout", () => {
  it("uses cover layout for cover-like field keys", () => {
    expect(cmsImageFieldLayout(imageField("cover", "Cover"))).toBe("cover");
    expect(cmsImageFieldLayout(imageField("hero_image", "Hero"))).toBe("cover");
    expect(cmsImageFieldLayout(imageField("featuredImage", "Featured"))).toBe(
      "cover",
    );
  });

  it("uses compact layout for avatar and other image fields", () => {
    expect(cmsImageFieldLayout(imageField("avatar", "Avatar"))).toBe("compact");
    expect(cmsImageFieldLayout(imageField("photo", "Photo"))).toBe("compact");
    expect(cmsImageFieldLayout(imageField("image", "Image"))).toBe("compact");
  });
});
