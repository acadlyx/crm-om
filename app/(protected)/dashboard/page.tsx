import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Building2,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Palette,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { authOptions } from "@/lib/auth";
import { getPlatformBranding } from "@/lib/branding/service";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function humanize(value: string) {
  return value.replace(/[._-]/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTimestamp(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(value);
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) redirect("/login");

  const isPlatformAdmin = session.user.role === "PLATFORM_ADMIN";
  const tenantId = session.user.tenantId;
  const activityWhere = isPlatformAdmin ? {} : { actorUserId: session.user.id };

  const [
    brand,
    workspaceCount,
    userCount,
    unreadCount,
    notificationCount,
    activityCount,
    recentActivity,
    recentNotifications,
    businessProfile,
  ] = await Promise.all([
    getPlatformBranding(),
    isPlatformAdmin
      ? db.tenant.count()
      : tenantId ? db.tenant.count({ where: { id: tenantId } }) : Promise.resolve(0),
    isPlatformAdmin
      ? db.user.count()
      : tenantId ? db.user.count({ where: { tenantId } }) : db.user.count({ where: { id: session.user.id } }),
    db.systemNotification.count({ where: { recipientUserId: session.user.id, readAt: null } }),
    db.systemNotification.count({ where: { recipientUserId: session.user.id } }),
    db.auditLog.count({ where: activityWhere }),
    db.auditLog.findMany({
      where: activityWhere,
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, action: true, entityType: true, createdAt: true },
    }),
    db.systemNotification.findMany({
      where: { recipientUserId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { id: true, title: true, body: true, readAt: true, createdAt: true },
    }),
    tenantId
      ? db.businessSettings.findUnique({
          where: { tenantId },
          select: { businessName: true, logoUrl: true, contactEmail: true },
        })
      : Promise.resolve(null),
  ]);

  const firstName = session.user.name?.trim().split(/\s+/)[0] || session.user.email.split("@")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const roleLabel = isPlatformAdmin
    ? "Platform administrator"
    : session.user.role === "TENANT_ADMIN" ? "Business administrator" : "Team member";

  const metrics = isPlatformAdmin
    ? [
        { label: "Business workspaces", value: workspaceCount, note: "Customer organizations", icon: Building2, tone: "blue" },
        { label: "User accounts", value: userCount, note: "Across the platform", icon: Users, tone: "violet" },
        { label: "Activity events", value: activityCount, note: "Recorded audit events", icon: Activity, tone: "amber" },
        { label: "Unread notifications", value: unreadCount, note: "In your inbox", icon: Bell, tone: "green" },
      ]
    : [
        { label: "Workspace access", value: tenantId ? "Connected" : "Personal", note: tenantId ? "Your assigned business" : "No business workspace assigned", icon: Building2, tone: "blue" },
        { label: "Team members", value: userCount, note: tenantId ? "In your workspace" : "Your account", icon: Users, tone: "violet" },
        { label: "Your activity", value: activityCount, note: "Recorded actions", icon: Activity, tone: "amber" },
        { label: "Unread notifications", value: unreadCount, note: "In your inbox", icon: Bell, tone: "green" },
      ];

  const quickActions = [
    ...(isPlatformAdmin
      ? [{ title: "Platform branding", description: "Update name, logo and support details", href: "/platform-settings/branding", icon: Palette }]
      : session.user.role === "TENANT_ADMIN" && tenantId
        ? [{ title: "Business identity", description: "Manage business and invoice details", href: "/settings/business", icon: Building2 }]
        : []),
    { title: "Notifications", description: notificationCount
        ? notificationCount + " notification" + (notificationCount === 1 ? "" : "s") + " in your inbox"
        : "View system updates and alerts", href: "/notifications", icon: Bell },
  ];

  return (
    <div className="dashboard-page">
      <header className="dashboard-heading">
        <div>
          <p className="dashboard-eyebrow">WORKSPACE OVERVIEW · {new Intl.DateTimeFormat("en-IN", { dateStyle: "full" }).format(new Date())}</p>
          <h1>{greeting}, {firstName}</h1>
          <p className="dashboard-subtitle">Here is the latest picture of {brand.productName}. Counts update from saved platform data.</p>
        </div>
        <span className="dashboard-role"><ShieldCheck size={16} aria-hidden="true" />{roleLabel}</span>
      </header>

      <section className="dashboard-metrics" aria-label="Key metrics">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article className="dashboard-metric" key={metric.label}>
              <div className={"dashboard-metric-icon tone-" + metric.tone}><Icon size={20} aria-hidden="true" /></div>
              <p className="dashboard-metric-label">{metric.label}</p>
              <p className="dashboard-metric-value">{typeof metric.value === "number" ? new Intl.NumberFormat("en-IN").format(metric.value) : metric.value}</p>
              <p className="dashboard-metric-note">{metric.note}</p>
            </article>
          );
        })}
      </section>

      <div className="dashboard-content-grid">
        <section className="card dashboard-panel">
          <div className="dashboard-panel-heading">
            <div><p className="dashboard-eyebrow">AT A GLANCE</p><h2>{isPlatformAdmin ? "Platform overview" : "Your workspace"}</h2></div>
            <span className="dashboard-live"><span />Live data</span>
          </div>

          {isPlatformAdmin ? (
            <div className="dashboard-overview-callout">
              <div className="dashboard-callout-icon"><Sparkles size={22} aria-hidden="true" /></div>
              <div>
                <h3>{workspaceCount === 0 ? "Ready for your first business workspace" : "Your platform is up and running"}</h3>
                <p>
                  {workspaceCount === 0
                    ? "No customer workspaces exist in the database yet. Workspace and account totals will grow as business data is added."
                    : "You have " + workspaceCount + " business workspace" + (workspaceCount === 1 ? "" : "s") + " and " + userCount + " user account" + (userCount === 1 ? "" : "s") + " across the platform."}
                </p>
                <Link className="dashboard-text-link" href="/platform-settings/branding">Review platform branding <ArrowRight size={15} aria-hidden="true" /></Link>
              </div>
            </div>
          ) : (
            <div className="dashboard-overview-callout">
              <div className="dashboard-callout-icon"><Building2 size={22} aria-hidden="true" /></div>
              <div>
                <h3>{businessProfile?.businessName || (tenantId ? "Finish setting up your business identity" : "Your account is active")}</h3>
                <p>
                  {businessProfile?.businessName
                    ? "Your business identity is saved separately from the platform brand."
                    : tenantId
                      ? "Add the business name, contact details and invoice defaults to personalize your workspace."
                      : "Your account is signed in, but no business workspace is assigned to it yet."}
                </p>
                {session.user.role === "TENANT_ADMIN" && tenantId && (
                  <Link className="dashboard-text-link" href="/settings/business">Open business settings <ArrowRight size={15} aria-hidden="true" /></Link>
                )}
              </div>
            </div>
          )}

          <div className="dashboard-summary-list">
            <div className="dashboard-summary-row">
              <span className="dashboard-summary-icon"><CheckCircle2 size={17} aria-hidden="true" /></span>
              <div><strong>Account access</strong><span>Signed in as {roleLabel.toLowerCase()}</span></div>
              <span className="dashboard-status">Active</span>
            </div>
            <div className="dashboard-summary-row">
              <span className="dashboard-summary-icon"><Palette size={17} aria-hidden="true" /></span>
              <div><strong>Product identity</strong><span>{brand.logoUrl ? "Custom logo configured" : "Using the default brand mark"} · {brand.productName}</span></div>
              {isPlatformAdmin
                ? <Link className="dashboard-row-action" href="/platform-settings/branding" aria-label="Manage platform branding"><ArrowUpRight size={17} /></Link>
                : <span className="dashboard-status">Configured</span>}
            </div>
            <div className="dashboard-summary-row">
              <span className="dashboard-summary-icon"><Bell size={17} aria-hidden="true" /></span>
              <div><strong>Notifications</strong><span>{unreadCount === 0 ? "You have no unread notifications" : unreadCount + " unread notification" + (unreadCount === 1 ? "" : "s") + " waiting"}</span></div>
              <Link className="dashboard-row-action" href="/notifications" aria-label="Open notifications"><ArrowUpRight size={17} /></Link>
            </div>
          </div>
        </section>

        <section className="card dashboard-panel dashboard-quick-actions">
          <div className="dashboard-panel-heading">
            <div><p className="dashboard-eyebrow">SHORTCUTS</p><h2>Quick actions</h2></div>
          </div>
          <div className="dashboard-action-list">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link className="dashboard-action" href={action.href} key={action.href}>
                  <span className="dashboard-action-icon"><Icon size={19} aria-hidden="true" /></span>
                  <span className="dashboard-action-copy"><strong>{action.title}</strong><small>{action.description}</small></span>
                  <ArrowUpRight className="dashboard-action-arrow" size={17} aria-hidden="true" />
                </Link>
              );
            })}
          </div>
          <div className="dashboard-help-note">
            <CircleDashed size={17} aria-hidden="true" />
            <p>Only saved records are counted here. New activity appears as your team uses the platform.</p>
          </div>
        </section>
      </div>

      <div className="dashboard-content-grid dashboard-lower-grid">
        <section className="card dashboard-panel">
          <div className="dashboard-panel-heading">
            <div><p className="dashboard-eyebrow">AUDIT TRAIL</p><h2>Recent activity</h2></div>
            <span className="dashboard-panel-count">{activityCount} total</span>
          </div>
          {recentActivity.length ? (
            <div className="dashboard-feed">
              {recentActivity.map((event) => (
                <div className="dashboard-feed-item" key={event.id}>
                  <span className="dashboard-feed-icon"><Activity size={16} aria-hidden="true" /></span>
                  <div className="dashboard-feed-copy"><strong>{humanize(event.action)}</strong><span>{humanize(event.entityType)}</span></div>
                  <time dateTime={event.createdAt.toISOString()}>{formatTimestamp(event.createdAt)}</time>
                </div>
              ))}
            </div>
          ) : (
            <div className="dashboard-empty">
              <span className="dashboard-empty-icon"><Clock3 size={20} aria-hidden="true" /></span>
              <strong>No activity recorded yet</strong>
              <p>Actions written to the audit log will appear here. Nothing has been fabricated to fill this list.</p>
            </div>
          )}
        </section>

        <section className="card dashboard-panel">
          <div className="dashboard-panel-heading">
            <div><p className="dashboard-eyebrow">INBOX</p><h2>Recent notifications</h2></div>
            <Link className="dashboard-panel-link" href="/notifications">View all <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
          {recentNotifications.length ? (
            <div className="dashboard-feed">
              {recentNotifications.map((notification) => (
                <Link className="dashboard-notification" href="/notifications" key={notification.id}>
                  <span className={"dashboard-notification-dot" + (notification.readAt ? " is-read" : "")} />
                  <span className="dashboard-notification-copy">
                    <strong>{notification.title}</strong><span>{notification.body}</span>
                    <time dateTime={notification.createdAt.toISOString()}>{formatTimestamp(notification.createdAt)}</time>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="dashboard-empty">
              <span className="dashboard-empty-icon"><Bell size={20} aria-hidden="true" /></span>
              <strong>You&apos;re all caught up</strong>
              <p>System notifications sent to your account will show up here.</p>
              <Link className="dashboard-text-link" href="/notifications">Open notification center <ArrowRight size={15} aria-hidden="true" /></Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
