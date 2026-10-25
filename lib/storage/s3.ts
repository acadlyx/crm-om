import "server-only";
import { del, list, put } from "@vercel/blob";

/**
 * Logo assets use the public Vercel Blob store connected to this project.
 * Vercel injects BLOB_READ_WRITE_TOKEN for production, preview, and development.
 */
function getToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN || undefined;
}

export function isObjectStorageConfigured(): boolean {
  return Boolean(getToken());
}

export async function uploadPublicAsset(input: {
  key: string;
  bytes: Uint8Array;
  contentType: string;
  cacheControl?: string;
}): Promise<string> {
  const token = getToken();
  if (!token) {
    throw new Error("Vercel Blob is not configured: BLOB_READ_WRITE_TOKEN is missing.");
  }

  const result = await put(input.key, Buffer.from(input.bytes), {
    access: "public",
    addRandomSuffix: false,
    contentType: input.contentType,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
    token,
  });
  return result.url;
}

export async function deletePublicAsset(key: string): Promise<void> {
  const token = getToken();
  if (!token) {
    throw new Error("Vercel Blob is not configured: BLOB_READ_WRITE_TOKEN is missing.");
  }

  // Blob deletion takes a URL, so resolve the exact pathname first.
  const result = await list({ prefix: key, limit: 1000, token });
  const blob = result.blobs.find((item) => item.pathname === key);
  if (blob) await del(blob.url, { token });
}
