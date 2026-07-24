import { describe, expect, it } from "vitest";

import {
  buildStarterMainNavCollectionDefinition,
  MAIN_NAV_COLLECTION_NAME,
} from "../../lib/storage/starterMainNav";
import { STARTER_MAIN_NAV_SLUG } from "../../lib/storage/starterCmsEntries";
import { buildBootstrapSql } from "../../scripts/bootstrap-remote-storage";

describe("starterMainNav", () => {
  it("defines a main-nav config collection schema", () => {
    const definition = buildStarterMainNavCollectionDefinition();
    expect(definition.name).toBe(MAIN_NAV_COLLECTION_NAME);
    expect(definition.kind).toBe("config");
    expect(definition.fields.map((field) => field.key)).toEqual([
      "location",
      "items",
    ]);
  });

  it("includes the main-nav collection and its starter entry in remote bootstrap SQL", async () => {
    const sql = await buildBootstrapSql();
    expect(sql).toContain("'main-nav'");
    expect(sql).toContain(`'${STARTER_MAIN_NAV_SLUG}'`);
    expect(sql).not.toContain("'primary-navigation'");
  });
});
