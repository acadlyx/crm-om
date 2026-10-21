import "server-only";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

let client: S3Client | null = null;
function configured() {
  return Boolean(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY && process.env.S3_PUBLIC_BASE_URL);
}
export function isObjectStorageConfigured() { return configured(); }
function getClient() {
  if (!configured()) throw new Error("Object storage is not configured.");
  if (!client) client = new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
  });
  return client;
}
function encodeKey(key: string) { return key.split("/").map(encodeURIComponent).join("/"); }
export async function uploadPublicAsset(input: { key: string; bytes: Uint8Array; contentType: string; cacheControl?: string }): Promise<string> {
  await getClient().send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET!, Key: input.key, Body: input.bytes, ContentType: input.contentType,
    CacheControl: input.cacheControl ?? "public, max-age=31536000, immutable",
  }));
  return process.env.S3_PUBLIC_BASE_URL!.replace(/\\/$/, "") + "/" + encodeKey(input.key);
}
export async function deletePublicAsset(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }));
}
