/**
 * R2 bucket access via wrangler CLI (local or remote persistence).
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CloudflareR2Bucket } from "./cloudflare-r2";
import {
  parseR2BindingFromWrangler,
  readWranglerToml,
  resolveWranglerConfigPath,
} from "../../storage/wrangler-config";
import { runWranglerSync } from "../../../scripts/lib/wrangler-command";

/** Creates an R2 bucket adapter backed by shell-independent Wrangler commands. */
export function createWranglerCliR2Bucket(input: {
  local: boolean;
  bucketName?: string;
}): CloudflareR2Bucket {
  const toml = readWranglerToml();
  const binding = parseR2BindingFromWrangler(toml);
  const bucketName = input.bucketName ?? binding.bucketName;
  const locationFlag = input.local ? "--local" : "--remote";
  const objectPrefix = `${bucketName}/`;
  const configPath = resolveWranglerConfigPath();
  const configArgs = configPath ? ["--config", configPath] : [];

  /** Builds the Wrangler object path for a bucket key. */
  function objectPath(key: string): string {
    return `${objectPrefix}${key}`;
  }

  /** Runs a Wrangler R2 command with the configured location and config. */
  function runWrangler(args: string[]): Buffer {
    const result = runWranglerSync(
      ["r2", "object", ...args, locationFlag, ...configArgs],
      {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, CI: "true" },
      },
    );
    return Buffer.from(result.stdout);
  }

  return {
    /** Reads object metadata through a temporary Wrangler download. */
    async head(key) {
      const tempDir = mkdtempSync(join(tmpdir(), "aria-r2-head-"));
      const outfile = join(tempDir, "object.bin");

      try {
        runWrangler(["get", objectPath(key), "--file", outfile]);
        const data = readFileSync(outfile);
        return {
          key,
          size: data.byteLength,
        };
      } catch {
        return null;
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },

    /** Returns the empty listing supported by this command adapter. */
    async list() {
      return {
        objects: [],
        truncated: false,
      };
    },

    /** Uploads an object through a protected temporary file. */
    async put(key, value, options) {
      const tempDir = mkdtempSync(join(tmpdir(), "aria-r2-put-"));
      const infile = join(tempDir, "upload.bin");

      try {
        const buffer =
          value instanceof ArrayBuffer
            ? Buffer.from(value)
            : value instanceof Uint8Array
              ? Buffer.from(value)
              : Buffer.from(String(value));

        writeFileSync(infile, buffer);

        const args = ["put", objectPath(key), "--file", infile];
        if (options?.httpMetadata?.contentType) {
          args.push("--content-type", options.httpMetadata.contentType);
        }

        runWrangler(args);

        return {
          key,
          size: buffer.byteLength,
          httpMetadata: options?.httpMetadata,
        };
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },

    /** Downloads an object through Wrangler into temporary storage. */
    async get(key) {
      const tempDir = mkdtempSync(join(tmpdir(), "aria-r2-get-"));
      const outfile = join(tempDir, "object.bin");

      try {
        runWrangler(["get", objectPath(key), "--file", outfile]);
        const data = readFileSync(outfile);

        return {
          /** Returns the downloaded object data as an ArrayBuffer. */
          async arrayBuffer() {
            return data.buffer.slice(
              data.byteOffset,
              data.byteOffset + data.byteLength,
            );
          },
        };
      } catch {
        return null;
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },

    /** Deletes an object through Wrangler and tolerates missing keys. */
    async delete(key) {
      try {
        runWrangler(["delete", objectPath(key)]);
      } catch {
        // ignore missing objects
      }
    },
  };
}
