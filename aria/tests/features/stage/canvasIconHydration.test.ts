/**
 * canvasIconHydration tests
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { hydrateIconHost } from "../../../admin/features/Stage/utils/canvasIconHydration";

describe("canvasIconHydration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("gives stage icon hosts a layout box so node width and height can apply", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
      }),
    );

    const host = document.createElement("span");

    await hydrateIconHost({
      host,
      iconValue: "i-lucide:star",
      classNameValue: "",
      ariaLabelValue: "",
    });

    expect(host.getAttribute("data-aria-icon-host")).toBe("1");
    expect(host.style.display).toBe("inline-flex");
    expect(host.style.alignItems).toBe("center");
    expect(host.style.justifyContent).toBe("center");
    expect(host.style.lineHeight).toBe("1");
    expect(host.style.flexShrink).toBe("0");
    expect(host.style.fontStyle).toBe("normal");
  });

  it("disables Uno mask rendering when a resolved SVG is hydrated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          icons: {
            "lucide:star": {
              svg: '<svg viewBox="0 0 24 24"><path stroke="currentColor" d="M1 1h22"/></svg>',
              viewBox: "0 0 24 24",
              snapshotVersion: "test",
            },
          },
        }),
      }),
    );

    const host = document.createElement("span");

    await hydrateIconHost({
      host,
      iconValue: "i-lucide:star",
      classNameValue: "",
      ariaLabelValue: "",
    });

    const svg = host.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(host.style.getPropertyValue("mask")).toBe("none");
    expect(host.style.getPropertyPriority("mask")).toBe("important");
    expect(host.style.getPropertyValue("background")).toBe("none");
    expect(host.style.getPropertyPriority("background")).toBe("important");
    expect((svg as SVGElement).style.getPropertyValue("color")).toBe("inherit");
  });

  it("keeps fallback iconify icons inheriting host color", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
      }),
    );

    const host = document.createElement("span");

    await hydrateIconHost({
      host,
      iconValue: "i-lucide:heart",
      classNameValue: "",
      ariaLabelValue: "",
    });

    const fallbackEl = host.querySelector("i");
    expect(fallbackEl).not.toBeNull();
    expect((fallbackEl as HTMLElement).style.getPropertyValue("color")).toBe(
      "inherit",
    );
    expect((fallbackEl as HTMLElement).style.getPropertyPriority("color")).toBe(
      "important",
    );
  });

  it("preserves an existing host color when hydrating a replacement icon", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          icons: {
            "lucide:bookmark": {
              svg: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 3h18v18"/></svg>',
              viewBox: "0 0 24 24",
              snapshotVersion: "test",
            },
          },
        }),
      }),
    );

    const host = document.createElement("span");
    host.style.setProperty("color", "rgb(255, 0, 0)");

    await hydrateIconHost({
      host,
      iconValue: "i-lucide:bookmark",
      classNameValue: "",
      ariaLabelValue: "",
    });

    const svg = host.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(host.style.getPropertyValue("color")).toBe("rgb(255, 0, 0)");
    expect((svg as SVGElement).style.getPropertyValue("color")).toBe("inherit");
  });
});
