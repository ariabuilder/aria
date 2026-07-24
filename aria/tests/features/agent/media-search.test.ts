import { describe, expect, it } from "vitest";
import { filterMediaItems } from "../../../admin/features/Agent/lib/tools/content/mediaTools";

describe("agent media search", () => {
  const items = [
    {
      id: "images/meridian-hero.jpg",
      name: "meridian-hero.jpg",
      type: "image",
      url: "/uploads/images/meridian-hero.jpg",
      mimeType: "image/jpeg",
    },
    {
      id: "video/reel.mp4",
      name: "reel.mp4",
      type: "video",
      url: "/uploads/video/reel.mp4",
      mimeType: "video/mp4",
    },
  ];

  it("matches folder/group names carried by the media URL", () => {
    expect(filterMediaItems(items, "images")).toEqual([items[0]]);
  });

  it("matches names, media types, and MIME types", () => {
    expect(filterMediaItems(items, "meridian")).toEqual([items[0]]);
    expect(filterMediaItems(items, "video/mp4")).toEqual([items[1]]);
  });
});
