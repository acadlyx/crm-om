"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type NotificationItem = {
  id: string; title: string; body: string; href: string | null;
  createdAt: string; readAt: string | null;
};

export function NotificationsList({ initialItems, initialUnreadCount, brandName }: {
  initialItems: NotificationItem[]; initialUnreadCount: number; brandName: string;
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

  function safeHref(value: string | null) {
    if (!value) return null;
    ¶»§q«^