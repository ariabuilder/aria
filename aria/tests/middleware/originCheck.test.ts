import { describe, expect, it } from "vitest";

import { isForbiddenCrossOriginFormRequest } from "../../../src/middleware/originCheck";

const origin = "https://site.example";

function request(
  path: string,
  options: { method?: string; contentType?: string; origin?: string } = {},
): Request {
  const headers = new Headers();
  if (options.contentType) headers.set("content-type", options.contentType);
  if (options.origin) headers.set("origin", options.origin);
  return new Request(`${origin}${path}`, {
    method: options.method ?? "POST",
    headers,
  });
}

describe("Aria cross-origin form protection", () => {
  it.each([
    "/oauth/device/authorization",
    "/oauth/token",
    "/oauth/revoke",
  ])("allows public form-encoded OAuth POSTs at %s", (path) => {
    expect(
      isForbiddenCrossOriginFormRequest(
        request(path, {
          contentType: "application/x-www-form-urlencoded; charset=UTF-8",
          origin: "https://plugin.example",
        }),
      ),
    ).toBe(false);
  });

  it("keeps signed-in OAuth decisions same-origin", () => {
    expect(
      isForbiddenCrossOriginFormRequest(
        request("/oauth/device/approve", {
          contentType: "application/x-www-form-urlencoded",
          origin: "https://plugin.example",
        }),
      ),
    ).toBe(true);
  });

  it("rejects cross-origin forms elsewhere", () => {
    expect(
      isForbiddenCrossOriginFormRequest(
        request("/admin/login", {
          contentType: "application/x-www-form-urlencoded",
          origin: "https://attacker.example",
        }),
      ),
    ).toBe(true);
  });

  it("rejects non-protocol form content types on public OAuth routes", () => {
    expect(
      isForbiddenCrossOriginFormRequest(
        request("/oauth/token", {
          contentType: "text/plain",
          origin: "https://plugin.example",
        }),
      ),
    ).toBe(true);
  });

  it("allows same-origin forms", () => {
    expect(
      isForbiddenCrossOriginFormRequest(
        request("/admin/login", {
          contentType: "multipart/form-data; boundary=test",
          origin,
        }),
      ),
    ).toBe(false);
  });

  it("preserves Astro's JSON and safe-method behavior", () => {
    expect(
      isForbiddenCrossOriginFormRequest(
        request("/api/example", {
          contentType: "application/json",
          origin: "https://client.example",
        }),
      ),
    ).toBe(false);
    expect(
      isForbiddenCrossOriginFormRequest(
        request("/admin/login", { method: "GET" }),
      ),
    ).toBe(false);
  });

  it("rejects unsafe requests without an origin or content type", () => {
    expect(
      isForbiddenCrossOriginFormRequest(request("/admin/login")),
    ).toBe(true);
  });
});
