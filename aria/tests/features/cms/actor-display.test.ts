import { describe, expect, it } from "vitest";

import { formatCmsActorDisplay } from "../../../admin/features/CMS/lib/actorDisplay";

describe("CMS actor display", () => {
  it("keeps resolved usernames visible", () => {
    expect(formatCmsActorDisplay("admin")).toBe("admin");
  });

  it("hides unresolved uuid actor ids", () => {
    expect(
      formatCmsActorDisplay("de008119-35c5-42a3-ad66-6e6b620838dc"),
    ).toBe("Unknown user");
  });

  it("hides blank actor values", () => {
    expect(formatCmsActorDisplay(" ")).toBe("Unknown user");
  });
});
