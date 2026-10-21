"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type NotificationItem = {
  id: string; title: string; body: string; href: string | null; sourceLabel: string;
  createdAt: string; readAt: string | null;
};

export function NotificationsList({ initialItems, initialUnreadCount }: {
  initialItems: NotificationItem[]; initialUnreadCount: number;
}) {
  const [items, setItems] = useState(initialItems);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  async function markRead(id: string) {
    setBusyId(id); setError("");
    try {
      const response = await fetch("/api/v1/notifications/" + encodeURIComponent(id), {
        method: "PATCH", cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "Could not update notification.");
      setItems(current => current.map(item => item.id === id ? { ...item, readAt: payload.data.readAt } : item));
      setUnreadCount(current => Math.max(0, current - 1));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update notification.");
    } finally {
      setBusyId(null);
    }
  }

  return <section className="card" aria-label="Your notifications">
    <p className="muted" style={{marginTop:0}}>{unreadCount} unread</p>
    {error && <p role="alert" style={{color:"#b42318"}}>{error}</p>}
    {items.length === 0
      ? <div style={{padding:"24px 0"}}><h2 style={{marginTop:0}}>You’re all caught up</h2><p className="muted">New system notifications will appear here.</p></div>
      : <div style={{display:"grid",gap:0}}>
          {items.map(item => <article key={item.id} style={{padding:"18px 0",borderTop:"1px solid #e8ebf0",opacity:item.readAt?0.78:1}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"start",flexWrap:"wrap"}}>
              <div style={{minWidth:0,flex:1}}>
                <h2 style={{fontSize:17,margin:"0 0 5px",fontWeight:item.readAt?600:750}}>{item.title}</h2>
                <p className="muted" style={{fontSize:12,margin:"0 0 10px"}}>{item.sourceLabel} · {new Date(item.createdAt).toLocaleString()}</p>
              </div>
              {!item.readAt && <span aria-label="Unread" style={{width:8,height:8,borderRadius:99,background:"var(--brand-primary)",marginTop:7,flexShrink:0}}/>}
            </div>
            <p style={{whiteSpace:"pre-wrap",lineHeight:1.5,margin:"0 0 12px"}}>{item.body}</p>
            <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
              {item.href && (item.href.startsWith("/")
                ? <Link href={item.href} style={{color:"var(--brand-primary)",fontWeight:650}}>Open</Link>
                : <a href={item.href} target="_blank" rel="noreferrer" style={{color:"var(--brand-primary)",fontWeight:650}}>Open <span aria-hidden="true">↗</span></a>)}
              {item.readAt
                ? <span className="muted" style={{fontSize:13}}>Read</span>
                : <button type="button" className="brand-button" disabled={busyId===item.id} onClick={()=>void markRead(item.id)}>{busyId===item.id?"Updating…":"Mark as read"}</button>}
            </div>
          </article>)}
        </div>}
  </section>;
}
