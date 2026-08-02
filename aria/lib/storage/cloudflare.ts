/** Public storage-adapter façade. Backend implementation lives beside the shared domains. */
export { CloudflareStoragePlatform as CloudflareStorageAdapter } from "./cloudflarePlatform";
export type {
  CloudflareStorageEnv,
  D1DatabaseLike,
  KVNamespaceLike,
  R2BucketLike,
} from "./cloudflarePlatform";
