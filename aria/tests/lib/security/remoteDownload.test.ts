import { describe, expect, it, vi } from "vitest";
import {
  assertSafeRemoteUrl,
  downloadRemoteResource,
  RemoteDownloadError,
} from "../../../lib/security/remoteDownload";

describe("remote downloads", () => {
  it.each([
    "http://localhost/file.png",
    "http://127.0.0.1/file.png",
    "http://127.1/file.png",
    "http://0x7f000001/file.png",
    "http://10.0.0.1/file.png",
    "http://169.254.169.254/latest/meta-data",
    "http://192.168.1.1/file.png",
    "http://[::1]/file.png",
    "http://[fc00::1]/file.png",
    "http://[::ffff:127.0.0.1]/file.png",
  ])("rejects private destination %s", (url) => {
    expect(() => assertSafeRemoteUrl(url)).toThrow(RemoteDownloadError);
  });

  it("accepts a public HTTPS URL", () => {
    expect(assertSafeRemoteUrl("https://cdn.example.com/image.png").href).toBe(
      "https://cdn.example.com/image.png",
    );
  });

  it("rejects a redirect to a private destination", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/private" },
        }),
    );

    await expect(
      downloadRemoteResource("https://example.com/start", {
        maxBytes: 100,
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "PRIVATE_DESTINATION" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversized declared content length before reading", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("small", { headers: { "content-length": "101" } }),
    );

    await expect(
      downloadRemoteResource("https://example.com/file", {
        maxBytes: 100,
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "TOO_LARGE" });
  });

  it("stops a streamed response once it exceeds the limit", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(60));
        controller.enqueue(new Uint8Array(60));
        controller.close();
      },
    });
    const fetchImpl = vi.fn(async () => new Response(stream));

    await expect(
      downloadRemoteResource("https://example.com/file", {
        maxBytes: 100,
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "TOO_LARGE" });
  });
});
