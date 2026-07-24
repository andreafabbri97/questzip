"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { NotificationBell } from "@/components/notification-bell";
import { DiceModal } from "@/components/dice-modal";
import { useRealtime } from "@/components/realtime-provider";

type NavLink =
  | { kind: "link"; href: string; label: string; icon: string }
  | { kind: "dice"; label: string; icon: string };

// "Dadi" non è una pagina: apre il tiro dadi in un modal sopra qualunque pagina tu stia
// guardando, senza navigare via da lì — vive nella stessa barra di navigazione degli altri
// (mobile e desktop), solo che il suo click apre un modal invece di seguire un link.
const links: NavLink[] = [
  { kind: "link", href: "/", label: "Home", icon: "🏰" },
  { kind: "link", href: "/campagne", label: "Campagne", icon: "🗺️" },
  { kind: "link", href: "/personaggi", label: "Personaggi", icon: "🛡️" },
  { kind: "link", href: "/chat", label: "Chat", icon: "💬" },
  { kind: "dice", label: "Dadi", icon: "🎲" },
  { kind: "link", href: "/compendio", label: "Compendio", icon: "📖" },
];

export function Nav() {
  const pathname = usePathname();
  const [diceOpen, setDiceOpen] = useState(false);
  const { unreadRoomKeys } = useRealtime();
  const hasUnreadChat = unreadRoomKeys.size > 0;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-edge bg-background/85 backdrop-blur">
        <div className="max-w-5xl 2xl:max-w-[1600px] mx-auto px-4 h-14 flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/icon.svg" alt="" width={28} height={28} />
            <span className="font-display text-lg font-bold tracking-wide text-accent-strong">
              QuestZip
            </span>
          </Link>
          <nav className="hidden sm:flex items-center gap-1 text-sm">
            {links.map((link) =>
              link.kind === "dice" ? (
                <button
                  key="dice"
                  onClick={() => setDiceOpen(true)}
                  className="px-3 py-1.5 rounded-md transition-colors text-muted hover:text-foreground"
                >
                  {link.label}
                </button>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative px-3 py-1.5 rounded-md transition-colors ${
                    isActive(link.href)
                      ? "bg-surface-raised text-accent-strong"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {link.label}
                  {link.href === "/chat" && hasUnreadChat && (
                    <span className="absolute right-1 top-1 size-1.5 rounded-full bg-danger" />
                  )}
                </Link>
              ),
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <NotificationBell />
            <AccountButton />
          </div>
        </div>
      </header>

      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-20 border-t border-edge bg-background/95 backdrop-blur">
        <div className="grid grid-cols-6">
          {links.map((link) =>
            link.kind === "dice" ? (
              <button
                key="dice"
                onClick={() => setDiceOpen(true)}
                className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted"
              >
                <span className="text-lg leading-none">{link.icon}</span>
                {link.label}
              </button>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${
                  isActive(link.href) ? "text-accent-strong" : "text-muted"
                }`}
              >
                <span className="relative text-lg leading-none">
                  {link.icon}
                  {link.href === "/chat" && hasUnreadChat && (
                    <span className="absolute -right-1 -top-0.5 size-1.5 rounded-full bg-danger" />
                  )}
                </span>
                {link.label}
              </Link>
            ),
          )}
        </div>
      </nav>

      <DiceModal open={diceOpen} onClose={() => setDiceOpen(false)} />
    </>
  );
}

function AccountButton() {
  const { data: session, status } = useSession();

  if (status === "loading") return null;

  if (!session?.user) {
    return (
      <button
        onClick={() => signIn("google")}
        className="text-sm rounded-md border border-edge px-3 py-1.5 text-muted hover:text-foreground hover:border-accent/50 transition-colors"
      >
        Accedi con Google
      </button>
    );
  }

  return (
    <button
      onClick={() => signOut()}
      className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors"
      title="Esci"
    >
      {session.user.image && (
        <Image
          src={session.user.image}
          alt=""
          width={24}
          height={24}
          className="rounded-full"
        />
      )}
      <span className="hidden md:inline">{session.user.name}</span>
    </button>
  );
}
