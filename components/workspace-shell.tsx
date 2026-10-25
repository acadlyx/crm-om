"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import "./workspace-shell.css";
import "./workspace-copy-cleanup.css";
import "./workspace-ux-overhaul.css";

export function WorkspaceShell({
  sidebar,
  productName,
  children,
}: {
  sidebar: ReactNode;
  productName: string;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  function closeAfterNavigation(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("a") || target.closest("form button")) setMenuOpen(false);
  }

  return (
    <div className={"shell workspace-shell" + (menuOpen ? " mobile-nav-open" : "")}>
      <header className="mobile-shell-header">
        <span className="mobile-shell-brand">{productName}</span>
        <button
          type="button"
          className="mobile-shell-toggle"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={menuOpen}
          aria-controls="workspace-sidebar"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
        </button>
      </header>
      {menuOpen && <button type="button" className="mobile-nav-backdrop" aria-label="Close navigation menu" onClick={() => setMenuOpen(false)} />}
      <div id="workspace-sidebar" className="sidebar-slot" onClick={closeAfterNavigation}>{sidebar}</div>
      <main className="main-content">{children}</main>
    </div>
  );
}
