"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRealtime } from "@/components/realtime-provider";
import { NotificationItem } from "@/components/notification-item";

const CLOSE_ANIMATION_MS = 120;

export function NotificationBell() {
  const { status } = useSession();
  const { notifications, unreadCount, markRead, markAllRead, deleteNotification } = useRealtime();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // "rendered" resta true un istante dopo che "open" passa a false, per lasciar giocare
  // l'animazione di chiusura della tendina invece di farla sparire di scatto.
  const [rendered, setRendered] = useState(false);
  if (open && !rendered) setRendered(true);
  useEffect(() => {
    if (open) return;
    const timeout = setTimeout(() => setRendered(false), CLOSE_ANIMATION_MS);
    return () => clearTimeout(timeout);
  }, [open]);

  // Click-fuori-per-chiudere via listener globale invece di un overlay "fixed inset-0": un
  // overlay fixed annidato dentro l'header (che ha backdrop-blur) resterebbe confinato al suo
  // "containing block" — un elemento con backdrop-filter ne crea uno nuovo per i discendenti
  // fixed — quindi coprirebbe solo la striscia dell'header, non il resto della pagina.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (status !== "authenticated") return null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="relative text-lg text-muted hover:text-foreground transition-colors"
        aria-label="Notifiche"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {rendered && (
        <div
          className={`absolute right-0 top-full mt-2 z-30 w-72 max-h-96 overflow-y-auto rounded-lg border border-edge bg-surface-raised shadow-lg origin-top-right ${
            open ? "animate-dropdown-in" : "animate-dropdown-out"
          }`}
        >
          <div className="flex items-center justify-between border-b border-edge px-3 py-2">
            <span className="text-xs font-bold uppercase tracking-widest text-muted">Notifiche</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-accent-strong hover:underline">
                Segna tutte come lette
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted">
              <span className="block text-2xl mb-1">🔔</span>
              Nessuna notifica.
            </p>
          ) : (
            <ul className="divide-y divide-edge">
              {notifications.map((n) => (
                <li key={n.id}>
                  <NotificationItem
                    notification={n}
                    onRead={() => markRead(n.id)}
                    onDelete={() => deleteNotification(n.id)}
                  />
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/notifiche"
            onClick={() => setOpen(false)}
            className="block border-t border-edge px-3 py-2 text-center text-xs font-bold text-accent-strong hover:underline"
          >
            Vedi tutte →
          </Link>
        </div>
      )}
    </div>
  );
}
