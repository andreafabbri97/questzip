"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { getPublicProfile, removeFriend, sendFriendRequest } from "@/app/actions/friends";

export default function PublicProfilePage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const router = useRouter();
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getPublicProfile>> | null>(
    null,
  );
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Il proprio profilo ha già una pagina dedicata (con personaggi/campagne/notifiche push) — un
  // click sul proprio avatar (es. da un elenco membri campagna) porta lì invece di duplicarla qui
  // in una versione ridotta.
  useEffect(() => {
    if (session?.user?.id === userId) router.replace("/profilo");
  }, [session, userId, router]);

  // Passare da un profilo all'altro cliccando un Link (es. due membri diversi della stessa
  // campagna) riusa questo stesso componente pagina, non lo rimonta — durante il render, non in
  // un effetto (vietato in questo progetto, causa render a cascata), altrimenti "Utente non
  // trovato" da una ricerca precedente resterebbe bloccato in vista anche dopo aver caricato con
  // successo il profilo successivo.
  const [loadedFor, setLoadedFor] = useState(userId);
  if (userId !== loadedFor) {
    setLoadedFor(userId);
    setProfile(null);
    setNotFound(false);
  }

  useEffect(() => {
    let cancelled = false;
    getPublicProfile(userId).then((data) => {
      if (cancelled) return;
      if (!data) setNotFound(true);
      else setProfile(data);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (status === "loading") return <p className="text-muted">Caricamento…</p>;
  if (!session?.user) return <p className="text-muted">Devi accedere per vedere questo profilo.</p>;
  if (session.user.id === userId) return <p className="text-muted">Caricamento…</p>;
  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Link href="/profilo" className="text-sm text-muted hover:text-foreground">
          ← Il tuo profilo
        </Link>
        <p className="text-sm text-danger">Utente non trovato.</p>
      </div>
    );
  }
  if (!profile) return <p className="text-muted">Caricamento…</p>;

  const act = async (fn: () => Promise<void>) => {
    setError("");
    setBusy(true);
    try {
      await fn();
      const fresh = await getPublicProfile(userId);
      setProfile(fresh);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <Link href="/profilo" className="text-sm text-muted hover:text-foreground">
        ← Il tuo profilo
      </Link>

      <div className="flex items-center gap-4">
        {profile.image ? (
          <Image
            src={profile.image}
            alt=""
            width={56}
            height={56}
            className="rounded-full object-cover"
          />
        ) : (
          <span className="size-14 rounded-full bg-surface-raised shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="heading-ornate text-2xl font-bold text-accent-strong truncate">
            {profile.name ?? "Utente"}
          </h1>
        </div>
        {profile.isFriend ? (
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => router.push(`/chat?thread=dm:${profile.id}`)}
              className="glow-accent rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-sm hover:bg-accent-strong transition-colors active:scale-[0.97]"
            >
              💬 Chatta
            </button>
            <button
              disabled={busy}
              onClick={() => act(() => removeFriend(profile.id))}
              className="text-xs text-muted hover:text-danger disabled:opacity-50"
            >
              Rimuovi amico
            </button>
          </div>
        ) : (
          <button
            disabled={busy}
            onClick={() => act(() => sendFriendRequest(profile.id))}
            className="glow-accent shrink-0 rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-sm hover:bg-accent-strong transition-colors active:scale-[0.97] disabled:opacity-50"
          >
            + Aggiungi amico
          </button>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3">
        <h2 className="text-sm uppercase tracking-widest text-muted">🗺️ Campagne in comune</h2>
        {profile.sharedCampaigns.length === 0 ? (
          <p className="text-sm text-muted">Nessuna campagna in comune al momento.</p>
        ) : (
          <ul className="space-y-1.5">
            {profile.sharedCampaigns.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-edge bg-surface-raised px-3 py-2 text-sm text-foreground"
              >
                {c.nome}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
