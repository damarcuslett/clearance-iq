"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Command Center", icon: "◉" },
  { href: "/map", label: "Map View", icon: "◎" },
  { href: "/history", label: "History", icon: "◈" },
  { href: "/watchlist", label: "Watchlist", icon: "★" },
  { href: "/lookup", label: "UPC Lookup", icon: "⌕" },
  { href: "/submit", label: "Submit Deal", icon: "+" },
  { href: "/admin", label: "Automation", icon: "⚙" },
  { href: "/settings", label: "Settings", icon: "◐" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string): boolean =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-[var(--card)] border-b border-[var(--border)]">
        <div className="text-base font-bold">
          Clearance<span className="text-[var(--accent)]">IQ</span>
        </div>
        <button
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
          className="text-[var(--text)] text-xl w-9 h-9 flex items-center justify-center border border-[var(--border)] rounded"
        >
          {open ? "×" : "≡"}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/70"
          onClick={() => setOpen(false)}
        >
          <nav
            className="absolute right-0 top-0 h-full w-64 bg-[var(--card)] border-l border-[var(--border)] p-4 space-y-1"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-bold mb-4">
              Clearance<span className="text-[var(--accent)]">IQ</span>
            </div>
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm",
                  isActive(item.href)
                    ? "bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30"
                    : "hover:bg-[var(--border)]/50"
                )}
              >
                <span className="w-4 text-center">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 border-r border-[var(--border)] bg-[var(--card)] h-screen sticky top-0 flex-col">
        <div className="p-5 border-b border-[var(--border)]">
          <div className="text-lg font-bold tracking-tight">
            Clearance<span className="text-[var(--accent)]">IQ</span>
          </div>
          <div className="text-[10px] text-[var(--muted)] mt-1 uppercase tracking-widest">
            Ohio · 70%+ off
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                isActive(item.href)
                  ? "bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30"
                  : "text-[var(--text)] hover:bg-[var(--border)]/50"
              )}
            >
              <span className="text-base w-4 text-center">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-[var(--border)] text-[10px] text-[var(--muted)]">
          v1.0 · Zero-cost build
        </div>
      </aside>
    </>
  );
}
