import { hash } from "bcryptjs";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/authz";
import { db } from "@/lib/db";

const schema = z.object({
  businessName: z.string().trim().min(2).max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(80),
  useCurrentAccount: z.boolean().optional().default(false),
  ownerName: z.string().trim().min(2).max(160).optional(),
  ownerEmail: z.string().trim().email().max(320).optional(),
  ownerPassword: z.string().max(200).optional(),
  contactPhone: z.string().trim().max(40).optional().transform((value) => value || null),
  address: z.string().trim().max(1000).optional().transform((value) => value || null),
}).superRefine((data, context) => {
  if (!data.useCurrentAccount) {
    if (!data.ownerName) context.addIssue({ code: "custom", path: ["ownerName"], message: "Owner name is required." });
    if (!data.ownerEmail) context.addIssue({ code: "custom", path: ["ownerEmail"], message: "Owner email is required." });
    if (!data.ownerPassword || data.ownerPassword.length < 12) {
      context.addIssue({ code: "custom", path: ["ownerPassword"], message: "Owner password must be at least 12 characters." });
    }
  }
});

export async function POST(request: Request) {
  const access = await requirePlatformAdmin();
  if (!access.ok) {
    return Response.json({ error: { message: "Platform administrator access is required." } }, { status: access.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({
      error: {
        message: parsed.error.issues[0]?.message || "Check the workspace details and try again.",
      },
    }, { status: 400 });
  }

  const data = parsed.data;
  if (data.useCurrentAccount && access.user.tenantId) {
    return Response.json({
      error: { message: "Your Platform Admin login already has a business workspace. Use a separate owner account for another workspace." },
    }, { status: 409 });
  }

  const ownerEmail = data.useCurrentAccount ? access.user.email.toLowerCase() : data.ownerEmail!.toLowerCase();
  const ownerName = data.useCurrentAccount ? access.user.name : data.ownerName!;
  const [existingUser, existingTenant] = await Promise.all([
    data.useCurrentAccount ? Promise.resolve(null) : db.user.findUnique({ where: { email: ownerEmail }, select: { id: true } }),
    db.tenant.findUnique({ where: { slug: data.slug }, select: { id: true } }),
  ]);
  if (existingUser) {
    return Response.json({ error: { message: "That email is already registered. Use a different owner email." } }, { status: 409 });
  }
  if (existingTenant) {
    return Response.json({ error: { message: "That workspace URL is already in use. Choose another workspace slug." } }, { status: 409 });
  }

  try {
    const passwordHash = data.useCurrentAccount ? null : await hash(data.ownerPassword!, 12);
    const tenant = await db.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: {
          slug: data.slug,
          settings: {
            create: {
              businessName: data.businessName,
              contactEmail: ownerEmail,
              contactPhone: data.contactPhone,
              address: data.address,
            },
          },
        },
        select: {
          id: true,
          slug: true,
          createdAt: true,
          settings: { select: { businessName: true } },
        },
      });

      if (data.useCurrentAccount) {
        // Keep platform-wide permissions while assigning this account to its own workspace.
        await tx.user.update({ where: { id: access.user.id }, data: { tenantId: created.id } });
      } else {
        await tx.user.create({
          data: {
            tenantId: created.id,
            name: ownerName,
            email: ownerEmail,
            passwordHash: passwordHash!,
            role: "TENANT_ADMIN",
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: access.user.id,
          action: "CREATE_WORKSPACE",
          entityType: "TENANT",
          entityId: created.id,
          metadata: { slug: created.slug, ownerEmail, ownerAccountSameAsPlatformAdmin: data.useCurrentAccount },
        },
      });
      return created;
    });

    return Response.json({
      data: {
        id: tenant.id,
        slug: tenant.slug,
        businessName: tenant.settings?.businessName || data.businessName,
        owner: { name: ownerName, email: ownerEmail, role: data.useCurrentAccount ? "PLATFORM_ADMIN" : "TENANT_ADMIN" },
        ownerAccountLinked: data.useCurrentAccount,
        createdAt: tenant.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    const known = error as { code?: string };
    if (known?.code === "P2002") {
      return Response.json({ error: { message: "A workspace with that slug or email already exists." } }, { status: 409 });
    }
    console.error("Workspace creation failed:", known?.code || "UNKNOWN");
    return Response.json({ error: { message: "Could not create the workspace. Please try again." } }, { status: 500 });
  }
}
