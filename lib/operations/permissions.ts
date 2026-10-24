import "server-only";
import type { requireWorkspaceAccess } from "@/lib/crm/access";
import { db } from "@/lib/db";

type WorkspaceAccess = Extract<Awaited<ReturnType<typeof requireWorkspaceAccess>>, { ok: true }>;
type Action = "read" | "create" | "update" | "delete" | "manage";

/**
 * Owner roles always have full access. Other roles are deny-by-default when
 * an explicit tenant override exists; otherwise only conservative role defaults apply.
 */
const roleDefaults: Record<string, Record<string, string[]>> = {
  SALES: {
    customers: ["read", "create", "update"],
    leads: ["read", "create", "update"],
    deals: ["read", "create", "update"],
    "sales-orders": ["read", "create", "update"],
    products: ["read"],
    invoices: ["read"],
    tasks: ["read", "create", "update"],
    "customer-follow-ups": ["read", "create", "update"],
    reports: ["read"],
  },
  DELIVERY: {
    deliveries: ["read", "create", "update"],
    "sales-orders": ["read"],
    products: ["read"],
    customers: ["read"],
  },
  COLLECTIONS: {
    customers: ["read"],
    invoices: ["read"],
    payments: ["read", "create"],
    "customer-receipts": ["read", "create"],
    reports: ["read"],
    "customer-follow-ups": ["read", "create", "update"],
  },
  INVENTORY_MANAGER: {
    products: ["read", "create", "update"],
    inventory: ["read", "create", "update"],
    suppliers: ["read", "create", "update"],
    "purchase-orders": ["read", "create", "update"],
    "goods-receipts": ["read", "create"],
    reports: ["read"],
  },
  ACCOUNTANT: {
    customers: ["read"],
    suppliers: ["read"],
    invoices: ["read"],
    payments: ["read", "create"],
    "customer-receipts": ["read", "create"],
    "supplier-bills": ["read", "create", "update"],
    "supplier-payments": ["read", "create"],
    ledger: ["read"],
    reports: ["read"],
    expenses: ["read", "create", "update"],
  },
  STAFF: {
    customers: ["read"],
    leads: ["read"],
    tasks: ["read", "create", "update"],
  },
};

export async function hasWorkspacePermission(
  access: WorkspaceAccess,
  moduleKey: string,
  action: Action,
): Promise<boolean> {
  if (access.user.role === "TENANT_ADMIN" || access.user.role === "PLATFORM_ADMIN") return true;

  const override = await db.rolePermission.findUnique({
    where: {
      tenantId_role_moduleKey_actionKey: {
        tenantId: access.tenantId,
        role: access.user.role,
        moduleKey,
        actionKey: action,
      },
    },
    select: { granted: true },
  });
  if (override) return override.granted;

  return roleDefaults[access.user.role]?.[moduleKey]?.includes(action) ?? false;
}

export async function requireWorkspacePermission(
  access: WorkspaceAccess,
  moduleKey: string,
  action: Action,
): Promise<{ ok: true } | { ok: false; status: 403; message: string }> {
  if (await hasWorkspacePermission(access, moduleKey, action)) return { ok: true };
  return { ok: false, status: 403, message: "Your workspace role does not have permission to perform this action." };
}

export const WORKSPACE_ROLES = [
  "STAFF",
  "SALES",
  "DELIVERY",
  "COLLECTIONS",
  "INVENTORY_MANAGER",
  "ACCOUNTANT",
] as const;
