import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPlatformBranding } from "@/lib/branding/service";
import { db } from "@/lib/db";
import { NotificationsList } from "@/components/notifications-list";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const [brand, items, unreadCount] = await Promise.all([
    getPlatformBranding(),
    db.systemNotification.findMany({
      where: { recipientUserId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, title: true, body: true, href: true, createdAt: true, readAt: true },
    }),
    db.systemNotification.count({ where: { recipientUserId: session.user.id, readAt: null } }),
  ]);

  return <>
    <p className="muted" style={{marginTop:0}}>Your workspace</p>
    <h1 style={{fontSize:30,marginTop:4}}>Notifications</h1>
    <NotificationsList brandName={brand.productName} initialItems={items.map(item => ({...item, createdAt:item.createdAt.toISOString(), readAt:item.readAt?.toISOString() ?? null}))} initialUnreadCount={unreadCount}/>
  </>;
}
