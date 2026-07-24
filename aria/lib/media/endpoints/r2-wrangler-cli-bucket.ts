/**
 * R2 bucket access via wrangler CLI (local or remote persistence).
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CloudflareR2Bucket } from "./cloudflare-r2";
import {
  parseR2BindingFromWrangler,
  readWranglerToml,
  resolveWranglerConfigPath,
} from "../../storage/wrangler-config";

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

  function objectPath(key: string): string {
    return `${objectPrefix}${key}`;
  }

  function runWrangler(args: string[]): Buffer {
    return execFileSync(
      "npx",
      ["wrangler", "r2", "object", ...args, locationFlag, ...configArgs],
      {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, CI: "true" },
      },
    );
  }

  return {
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

    async list() {
      return {
        objects: [],
        truncated: false,
      };
    },

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

    async get(key) {
      const tempDir = mkdtempSync(join(tmpdir(), "aria-r2-get-"));
      const outfile = join(tempDir, "object.bin");

      try {
        runWrangler(["get", objectPath(key), "--file", outfile]);
        const data = readFileSync(outfile);

        return {
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

    async delete(key) {
      try {
        runWrangler(["delete", objectPath(key)]);
      } catch {
        // ignore missing objects
      }
    },
  };
}
