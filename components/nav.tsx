"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";

const links = [
  { href: "/", label: "Home", icon: "🏰" },
  { href: "/campagne", label: "Campagne", icon: "🗺️" },
  { href: "/personaggi", label: "Personaggi", icon: "🛡️" },
  { href: "/dadi", label: "Dadi", icon: "🎲" },
  { href: "/compendio", label: "Compendio", icon: "📖" },
];

export function Nav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-edge bg-background/85 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/icon.svg" alt="" width={28} height={28} />
            <span className="font-display text-lg font-bold tracking-wide text-accent-strong">
              QuestZip
            </span>
          </Link>
          <nav className="hidden sm:flex items-center gap-1 text-sm">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  isActive(link.href)
                    ? "bg-surface-raised text-accent-strong"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto">
            <AccountButton />
          </div>
        </div>
      </header>

      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-20 border-t border-edge bg-background/95 backdrop-blur">
        <div className="grid grid-cols-5">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${
                isActive(link.href) ? "text-accent-strong" : "text-muted"
              }`}
            >
              <span className="text-lg leading-none">{link.icon}</span>
              {link.label}
            </Link>
          ))}
        </div>
      </nav>
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
