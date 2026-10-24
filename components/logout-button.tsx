"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut, LoaderCircle } from "lucide-react";

export function LogoutButton() {
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut({ callbackUrl: "/logintoprivatecrmbysyzent7456" });
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <button
      type="button"
      className="sidebar-logout"
      onClick={handleLogout}
      disabled={signingOut}
      aria-label="Log out of your account"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
        width: "100%",
        marginTop: 12,
        padding: "11px 12px",
        border: "1px solid #f1d7d4",
        borderRadius: 10,
        background: "#fff7f6",
        color: "#b42318",
        fontSize: 12,
        fontWeight: 700,
        cursor: signingOut ? "wait" : "pointer",
        opacity: signingOut ? 0.7 : 1,
      }}
    >
      {signingOut
        ? <LoaderCircle size={16} className="workspace-spinner" aria-hidden="true" />
        : <LogOut size={16} aria-hidden="true" />}
      {signingOut ? "Logging out…" : "Log out"}
    </button>
  );
}
