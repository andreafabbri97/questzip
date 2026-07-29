"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { getMyCharacters } from "@/app/actions/character-sync";
import { getMyCampaigns } from "@/app/actions/campaigns";
import { FriendsTab } from "@/components/friends-tab";
import { PushToggle } from "@/components/push-toggle";
import { type Character, characterSchema } from "@/lib/dnd";
import { useLocalCollection } from "@/lib/storage";

export default function ProfiloPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { items: localCharacters, loaded } = useLocalCollection(
    "questzip:personaggi",
    characterSchema,
  );
  const [remoteCharacters, setRemoteCharacters] = useState<Character[] | null>(null);
  const [campaigns, setCampaigns] = useState<Awaited<ReturnType<typeof getMyCampaigns>> | null>(
    null,
  );

  useEffect(() => {
    getMyCampaigns().then(setCampaigns);
    getMyCharacters().then((rows) => setRemoteCharacters(rows.map((r) => r.dataJson)));
  }, []);

  // Unione locale+cloud per id — un dispositivo nuovo (localStorage vuoto) deve comunque vedere i
  // personaggi già sincronizzati da un altro dispositivo, non solo "nessun personaggio ancora".
  // Sola lettura qui: la riconciliazione vera (chi vince fra le due copie) resta in /personaggi.
  const characters = (() => {
    const byId = new Map(localCharacters.map((c) => [c.id, c]));
    for (const remote of remoteCharacters ?? []) {
      if (!byId.has(remote.id)) byId.set(remote.id, remote);
    }
    return [...byId.values()];
  })();

  if (status === "loading") return <p className="text-muted">Caricamento…</p>;
  if (!session?.user) return <p className="text-muted">Devi accedere per vedere il tuo profilo.</p>;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        {session.user.image ? (
          <Image
            src={session.user.image}
            alt=""
            width={56}
            height={56}
            className="rounded-full object-cover"
          />
        ) : (
          <span className="size-14 rounded-full bg-surface-raised shrink-0" />
        )}
        <div className="min-w-0">
          <h1 className="heading-ornate text-2xl font-bold text-accent-strong truncate">
            {session.user.name}
          </h1>
          <p className="text-sm text-muted truncate">{session.user.email}</p>
        </div>
      </div>

      <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm uppercase tracking-widest text-muted">🛡️ I tuoi personaggi</h2>
          <Link href="/personaggi" className="text-xs font-bold text-accent-strong hover:underline">
            Vai →
          </Link>
        </div>
        {!loaded || !remoteCharacters ? (
          <p className="text-sm text-muted">Caricamento…</p>
        ) : characters.length === 0 ? (
          <p className="text-sm text-muted">Nessun personaggio creato ancora.</p>
        ) : (
          <ul className="space-y-1.5">
            {characters.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-edge bg-surface-raised px-3 py-2 text-sm text-foreground"
              >
                <span className="font-bold">{c.nome}</span>{" "}
                <span className="text-muted">
                  — {c.razza || "senza razza"} ·{" "}
                  {c.classi.map((cl) => `${cl.nome} ${cl.livello}`).join(" / ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm uppercase tracking-widest text-muted">🗺️ Le tue campagne</h2>
          <Link href="/campagne" className="text-xs font-bold text-accent-strong hover:underline">
            Vai →
          </Link>
        </div>
        {!campaigns ? (
          <p className="text-sm text-muted">Caricamento…</p>
        ) : campaigns.length === 0 ? (
          <p className="text-sm text-muted">Non partecipi a nessuna campagna ancora.</p>
        ) : (
          <ul className="space-y-1.5">
            {campaigns.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-edge bg-surface-raised px-3 py-2 text-sm"
              >
                <span className="truncate text-foreground">{c.nome}</span>
                <span className="text-xs text-muted shrink-0">
                  {c.role === "dm" ? "Master" : "Giocatore"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-widest text-muted px-1">🤝 Amici</h2>
        <FriendsTab onChat={(friendId) => router.push(`/chat?thread=dm:${friendId}`)} />
      </section>

      <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3">
        <h2 className="text-sm uppercase tracking-widest text-muted">🔔 Notifiche push</h2>
        <PushToggle />
      </section>

      <button
        onClick={() => signOut()}
        className="w-full rounded-lg border border-edge px-4 py-2.5 text-sm font-bold text-muted hover:text-danger hover:border-danger/50 transition-colors"
      >
        Esci
      </button>
    </div>
  );
}
