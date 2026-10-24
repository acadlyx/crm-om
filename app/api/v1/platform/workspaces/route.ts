import { hash } from "bcryptjs";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/authz";
import { db } from "@/lib/db";

const schema = z.object({
  businessName: z.string().trim().min(2).max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(80),
  ownerName: z.string().trim().min(2).max(160),
  ownerEmail: z.string().trim().email().max(320),
  ownerPassword: z.string().min(12).max(200),
  contactPhone: z.string().trim().max(40).optional().transform((value) => value || null),
  address: z.string().trim().max(1000).optional().transform((value) => value || null),
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
  const ownerEmail = data.ownerEmail.toLowerCase();
  const [existingUser, existingTenant] = await Promise.all([
    db.user.findUnique({ where: { email: ownerEmail }, select: { id: true } }),
    db.tenant.findUnique({ where: { slug: data.slug }, select: { id: true } }),
  ]);
  if (existingUser) {
    return Response.json({ error: { message: "That email is already registered. Use a different owner email." } }, { status: 409 });
  }
  if (existingTenant) {
    return Response.json({ error: { message: "That workspace URL is already in use. Choose another workspace slug." } }, { status: 409 });
  }

  try {
    const passwordHash = await hash(data.ownerPassword, 12);
    const tenant = await db.tenant.create({
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
        users: {
          create: {
            name: data.ownerName,
            email: ownerEmail,
            passwordHash,
            role: "TENANT_ADMIN",
          },
        },
      },
      select: {
        id: true,
        slug: true,
        createdAt: true,
        settings: { select: { businessName: true } },
        users: { select: { name: true, email: true, role: true } },
      },
    });

    await db.auditLog.create({
      data: {
        actorUserId: access.user.id,
        action: "CREATE_WORKSPACE",
        entityType: "TENANT",
        entityId: tenant.id,
        metadata: { slug: tenant.slug, ownerEmail },
      },
    });

    return Response.json({
      data: {
        id: tenant.id,
        slug: tenant.slug,
        businessName: tenant.settings?.businessName || data.businessName,
        owner: tenant.users[0],
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
