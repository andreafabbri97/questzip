"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Image from "next/image";
import {
  cancelFriendRequest,
  getFriendsAndRequests,
  removeFriend,
  respondToFriendRequest,
  searchUsers,
  sendFriendRequest,
} from "@/app/actions/friends";
import { getMyCampaigns } from "@/app/actions/campaigns";
import { CampaignChat } from "@/components/chat/campaign-chat";
import { DirectChat } from "@/components/chat/direct-chat";
import { useRealtime } from "@/components/realtime-provider";

type Tab = "messaggi" | "amici";
type SelectedThread = { kind: "campaign"; id: string } | { kind: "dm"; id: string } | null;

export default function ChatPage() {
  return (
    <Suspense fallback={<p className="text-muted">Caricamento…</p>}>
      <ChatPageInner />
    </Suspense>
  );
}

function ChatPageInner() {
  const [tab, setTab] = useState<Tab>("messaggi");
  // Sollevato qui (non dentro MessagesTab) così il bottone "Chatta" nella tab Amici può aprire
  // una DM specifica cambiando anche tab, non solo selezione.
  const [forceOpenDmUserId, setForceOpenDmUserId] = useState<string | null>(null);

  return (
    <div className="space-y-6 max-w-2xl lg:max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-accent-strong">Chat</h1>

      <div className="flex gap-1.5">
        {(["messaggi", "amici"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors ${
              tab === t
                ? "border-accent bg-accent/15 text-accent-strong"
                : "border-edge text-muted hover:text-foreground"
            }`}
          >
            {t === "messaggi" ? "Messaggi" : "Amici"}
          </button>
        ))}
      </div>

      {tab === "messaggi" ? (
        <MessagesTab
          forceOpenDmUserId={forceOpenDmUserId}
          onConsumeForceOpen={() => setForceOpenDmUserId(null)}
        />
      ) : (
        <FriendsTab
          onChat={(friendId) => {
            setForceOpenDmUserId(friendId);
            setTab("messaggi");
          }}
        />
      )}
    </div>
  );
}

function MessagesTab({
  forceOpenDmUserId,
  onConsumeForceOpen,
}: {
  forceOpenDmUserId: string | null;
  onConsumeForceOpen: () => void;
}) {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const myUserId = session?.user?.id ?? null;
  const { unreadRoomKeys } = useRealtime();
  const [campaigns, setCampaigns] = useState<Awaited<ReturnType<typeof getMyCampaigns>> | null>(
    null,
  );
  const [friends, setFriends] = useState<
    Awaited<ReturnType<typeof getFriendsAndRequests>>["friends"] | null
  >(null);
  const [selected, setSelected] = useState<SelectedThread>(null);

  useEffect(() => {
    getMyCampaigns().then(setCampaigns);
    getFriendsAndRequests().then((data) => setFriends(data.friends));
  }, []);

  // Preseleziona da ?thread=campaign:<id>|dm:<id> (link "Apri chat" da Campagne) o dal bottone
  // "Chatta" nella tab Amici — sempre durante il render, mai in un effetto, per non chiamare
  // setState in modo sincrono nel suo corpo (stesso pattern già consolidato in questo progetto).
  const threadParam = searchParams.get("thread");
  const [appliedThreadParam, setAppliedThreadParam] = useState<string | null>(null);
  if (threadParam && threadParam !== appliedThreadParam) {
    setAppliedThreadParam(threadParam);
    const [kind, id] = threadParam.split(":");
    if ((kind === "campaign" || kind === "dm") && id) setSelected({ kind, id });
  }
  if (forceOpenDmUserId && (!selected || selected.kind !== "dm" || selected.id !== forceOpenDmUserId)) {
    setSelected({ kind: "dm", id: forceOpenDmUserId });
    onConsumeForceOpen();
  }

  if (!campaigns || !friends) return <p className="text-muted">Caricamento…</p>;

  const selectedFriend = selected?.kind === "dm" ? friends.find((f) => f.id === selected.id) : null;

  const threadButtonClass = (active: boolean) =>
    `w-full flex items-center justify-between gap-2 text-left rounded-lg border px-3 py-2.5 text-sm transition-colors ${
      active
        ? "border-accent bg-accent/15 text-accent-strong"
        : "border-edge bg-surface text-foreground hover:border-accent/50"
    }`;
  const UnreadDot = () => <span className="size-2 rounded-full bg-danger shrink-0" />;

  return (
    <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-4 lg:items-start">
      <div className={selected ? "hidden lg:block space-y-4" : "space-y-4"}>
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-widest text-muted px-1">Campagne</p>
          {campaigns.length === 0 && (
            <p className="text-xs text-muted px-1">Nessuna campagna ancora.</p>
          )}
          {campaigns.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected({ kind: "campaign", id: c.id })}
              className={threadButtonClass(selected?.kind === "campaign" && selected.id === c.id)}
            >
              <span className="truncate">🗺️ {c.nome}</span>
              {unreadRoomKeys.has(`campaign-${c.id}`) && <UnreadDot />}
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-widest text-muted px-1">Amici</p>
          {friends.length === 0 && (
            <p className="text-xs text-muted px-1">
              Nessun amico ancora — cercalo dalla tab &quot;Amici&quot;.
            </p>
          )}
          {friends.map((f) => {
            const dmRoomKey = myUserId ? `dm-${[myUserId, f.id].sort().join("-")}` : null;
            return (
              <button
                key={f.id}
                onClick={() => setSelected({ kind: "dm", id: f.id })}
                className={threadButtonClass(selected?.kind === "dm" && selected.id === f.id)}
              >
                <span className="truncate">💬 {f.name ?? "Utente"}</span>
                {dmRoomKey && unreadRoomKeys.has(dmRoomKey) && <UnreadDot />}
              </button>
            );
          })}
        </div>
      </div>

      <div className={selected ? "min-w-0" : "hidden lg:block min-w-0"}>
        {selected ? (
          <div className="rounded-xl border border-edge bg-surface overflow-hidden h-[70vh] flex flex-col">
            <button
              onClick={() => setSelected(null)}
              className="lg:hidden text-sm text-muted hover:text-foreground px-3 pt-2 text-left shrink-0"
            >
              ← Conversazioni
            </button>
            {selected.kind === "campaign" ? (
              <CampaignChat campaignId={selected.id} />
            ) : selectedFriend ? (
              <DirectChat
                otherUserId={selectedFriend.id}
                otherName={selectedFriend.name}
                otherImage={selectedFriend.image}
              />
            ) : (
              <p className="text-muted p-4">Amico non trovato.</p>
            )}
          </div>
        ) : (
          <div className="hidden lg:flex items-center justify-center rounded-xl border border-dashed border-edge bg-surface/30 p-12 text-center text-muted min-h-[300px]">
            <p>Seleziona una conversazione.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Avatar({ src, alt }: { src: string | null; alt: string }) {
  if (!src) return <span className="size-6 rounded-full bg-surface-raised shrink-0" />;
  return <Image src={src} alt={alt} width={24} height={24} className="rounded-full shrink-0" />;
}

function FriendsTab({ onChat }: { onChat: (friendId: string) => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getFriendsAndRequests>> | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchUsers>>>([]);
  const [error, setError] = useState("");

  const refresh = () => {
    getFriendsAndRequests().then(setData);
  };
  useEffect(refresh, []);

  useEffect(() => {
    const q = query.trim();
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      if (q.length < 2) {
        setResults([]);
        return;
      }
      searchUsers(q).then((r) => {
        if (!cancelled) setResults(r);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  if (!data) return <p className="text-muted">Caricamento…</p>;

  const friendIds = new Set(data.friends.map((f) => f.id));
  const outgoingIds = new Set(data.outgoing.map((o) => o.toUserId));
  const incomingIds = new Set(data.incoming.map((i) => i.fromUserId));

  const act = async (fn: () => Promise<void>) => {
    setError("");
    try {
      await fn();
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-edge bg-surface p-5 space-y-3">
        <h2 className="text-sm uppercase tracking-widest text-muted">Cerca amici</h2>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nome o email…"
          className="w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-foreground"
        />
        {results.length > 0 && (
          <ul className="space-y-1.5">
            {results.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-edge bg-surface-raised px-3 py-2"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Avatar src={u.image} alt="" />
                  <span className="truncate text-sm text-foreground">{u.name ?? u.email}</span>
                </span>
                {friendIds.has(u.id) ? (
                  <span className="text-xs text-muted shrink-0">Già amici</span>
                ) : outgoingIds.has(u.id) ? (
                  <span className="text-xs text-muted shrink-0">Richiesta inviata</span>
                ) : incomingIds.has(u.id) ? (
                  <span className="text-xs text-muted shrink-0">Ti ha scritto</span>
                ) : (
                  <button
                    onClick={() => act(() => sendFriendRequest(u.id))}
                    className="text-xs font-bold text-accent-strong hover:underline shrink-0"
                  >
                    + Aggiungi
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.incoming.length > 0 && (
        <section className="rounded-xl border border-edge bg-surface p-5 space-y-2">
          <h2 className="text-sm uppercase tracking-widest text-muted">Richieste ricevute</h2>
          <ul className="space-y-1.5">
            {data.incoming.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-edge bg-surface-raised px-3 py-2"
              >
                <span className="flex items-center gap-2 min-w-0 text-sm text-foreground">
                  <Avatar src={r.fromImage} alt="" />
                  <span className="truncate">{r.fromName ?? "Utente"}</span>
                </span>
                <span className="flex gap-2 shrink-0">
                  <button
                    onClick={() => act(() => respondToFriendRequest(r.id, true))}
                    className="text-xs font-bold text-accent-strong hover:underline"
                  >
                    Accetta
                  </button>
                  <button
                    onClick={() => act(() => respondToFriendRequest(r.id, false))}
                    className="text-xs text-muted hover:text-danger"
                  >
                    Rifiuta
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.outgoing.length > 0 && (
        <section className="rounded-xl border border-edge bg-surface p-5 space-y-2">
          <h2 className="text-sm uppercase tracking-widest text-muted">Richieste inviate</h2>
          <ul className="space-y-1.5">
            {data.outgoing.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-edge bg-surface-raised px-3 py-2"
              >
                <span className="flex items-center gap-2 min-w-0 text-sm text-foreground">
                  <Avatar src={r.toImage} alt="" />
                  <span className="truncate">{r.toName ?? "Utente"}</span>
                </span>
                <button
                  onClick={() => act(() => cancelFriendRequest(r.id))}
                  className="text-xs text-muted hover:text-danger shrink-0"
                >
                  Annulla
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-edge bg-surface p-5 space-y-2">
        <h2 className="text-sm uppercase tracking-widest text-muted">I tuoi amici</h2>
        {data.friends.length === 0 ? (
          <p className="text-sm text-muted">Nessun amico ancora — cercalo qui sopra.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.friends.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-edge bg-surface-raised px-3 py-2"
              >
                <span className="flex items-center gap-2 min-w-0 text-sm text-foreground">
                  <Avatar src={f.image} alt="" />
                  <span className="truncate">{f.name ?? "Utente"}</span>
                </span>
                <span className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => onChat(f.id)}
                    className="text-xs font-bold text-accent-strong hover:underline"
                  >
                    💬 Chatta
                  </button>
                  <button
                    onClick={() => act(() => removeFriend(f.id))}
                    className="text-xs text-muted hover:text-danger"
                  >
                    Rimuovi
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
