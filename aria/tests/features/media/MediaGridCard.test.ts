import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import MediaGridCard from "../../../admin/features/Studio/media/components/MediaGridCard.vue";
import type { MediaAsset } from "../../../lib/schemas/mediaAsset";

vi.mock("@/i18n", () => ({
  useStudioI18n: () => ({ t: (key: string) => key }),
}));

const asset: MediaAsset = {
  id: "/uploads/photos/portrait.webp",
  name: "portrait.webp",
  type: "image",
  url: "/uploads/photos/portrait.webp",
  size: 1024,
};

function mountCard(primaryAction?: "preview" | "open") {
  return mount(MediaGridCard, {
    props: {
      asset,
      shouldAnimate: false,
      primaryAction,
    },
    global: {
      stubs: { teleport: true },
    },
  });
}

describe("MediaGridCard primary action", () => {
  it("opens asset details from the media library", async () => {
    const wrapper = mountCard("open");
    const card = wrapper.find('[role="button"]');

    await card.trigger("click");

    expect(wrapper.emitted("open")).toEqual([[asset]]);
    expect(wrapper.emitted("preview")).toBeUndefined();
  });

  it("opens asset details with the keyboard", async () => {
    const wrapper = mountCard("open");
    const card = wrapper.find('[role="button"]');

    await card.trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("open")).toEqual([[asset]]);
  });

  it("keeps preview as the default in embedded media cards", async () => {
    const wrapper = mountCard();
    const card = wrapper.find('[role="button"]');

    await card.trigger("click");

    expect(wrapper.emitted("preview")).toEqual([[asset]]);
    expect(wrapper.emitted("open")).toBeUndefined();
  });
});
