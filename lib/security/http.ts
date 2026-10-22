import { NextResponse } from "next/server";

export function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

export function noStoreJson(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Vary", "Cookie");
  return NextResponse.json(data, { ...init, headers });
}

/**
 * Require a same-origin Origin header for browser state changes.
 *
 * Prefer NEXTAUTH_URL as the canonical public origin when configured: behind a
 * reverse proxy, Next.js may expose an internal request URL which differs from
 * the browser-visible scheme/host. Keep request.url as a fallback for local
 * deployments and deployments intentionally serving multiple hostnames.
 * Missing or malformed Origin headers still fail closed.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const suppliedOrigin = new URL(origin).origin;
    const allowedOrigins = new Set<string>();

    const canonicalUrl = process.env.NEXTAUTH_URL;
    if (canonicalUrl) {
      try {
        allowedOrigins.add(new URL(canonicalUrl).origin);
      } catch {
        // Invalid deployment configuration must not throw or bypass origin checks.
      }
    }

    allowedOrigins.add(new URL(request.url).origin);
    return allowedOrigins.has(suppliedOrigin);
  } catch {
    return false;
  }
}
