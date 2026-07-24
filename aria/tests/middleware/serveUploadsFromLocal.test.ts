import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { serveUploadsFromLocalFilesystem } from "../../../src/middleware/serveUploadsFromLocal";

describe("serveUploadsFromLocal", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  async function createUploadFixture(
    objectKey: string,
    content: Buffer | string,
    metadata?: Record<string, unknown>,
  ): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aria-uploads-"));
    tempDirs.push(root);

    const filePath = path.join(root, objectKey);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);

    if (metadata) {
      await fs.writeFile(
        `${filePath}.meta.json`,
        JSON.stringify(metadata, null, 2),
        "utf-8",
      );
    }

    return root;
  }

  it("serves files from the local uploads directory", async () => {
    const uploadRoot = await createUploadFixture(
      "gallery/hero.png",
      Buffer.from("png-bytes"),
      { contentType: "image/png" },
    );

    const response = await serveUploadsFromLocalFilesystem({
      requestUrl: "http://localhost:4321/uploads/gallery/hero.png",
      uploadRoot,
    });

    expect(response?.status).toBe(200);
    expect(response?.headers.get("Content-Type")).toBe("image/png");
    expect(await response?.text()).toBe("png-bytes");
  });

  it("rejects path traversal attempts", async () => {
    const uploadRoot = await createUploadFixture("safe.png", "safe");

    const response = await serveUploadsFromLocalFilesystem({
      requestUrl: "http://localhost:4321/uploads/../safe.png",
      uploadRoot,
    });

    expect(response).toBeNull();
  });

  it("returns null when the file does not exist", async () => {
    const uploadRoot = await createUploadFixture("exists.png", "exists");

    const response = await serveUploadsFromLocalFilesystem({
      requestUrl: "http://localhost:4321/uploads/missing.png",
      uploadRoot,
    });

    expect(response).toBeNull();
    expect(uploadRoot).toBeTruthy();
  });
});
