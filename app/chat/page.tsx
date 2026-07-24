"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { getFriendsAndRequests } from "@/app/actions/friends";
import { getMyCampaigns } from "@/app/actions/campaigns";
import { CampaignChat } from "@/components/chat/campaign-chat";
import { DirectChat } from "@/components/chat/direct-chat";
import { FriendsTab } from "@/components/friends-tab";
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
