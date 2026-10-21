import "next-auth";
declare module "next-auth" {
  interface Session {
    user: { id: string; role: "PLATFORM_ADMIN" | "TENANT_ADMIN" | "STAFF"; tenantId: string | null; name?: string | null; email?: string | null; image?: string | null };
  }
}
