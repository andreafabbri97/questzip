"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { getFriendsAndRequests } from "@/app/actions/friends";
import { getMyCampaigns } from "@/app/actions/campaigns";
import type { ThreadActivity } from "@/app/actions/chat";
import { CampaignChat } from "@/components/chat/campaign-chat";
import { DirectChat } from "@/components/chat/direct-chat";
import { FriendsTab } from "@/components/friends-tab";
import { useRealtime } from "@/components/realtime-provider";
import { formatRelativeTime as formatThreadTime } from "@/lib/format-time";

type Tab = "messaggi" | "amici";
type SelectedThread = { kind: "campaign"; id: string } | { kind: "dm"; id: string } | null;

type UnifiedThread =
  | { kind: "campaign"; id: string; roomKey: string; nome: string }
  | { kind: "dm"; id: string; roomKey: string; nome: string; image: string | null };

// Prima era un fisso 70vh, sempre la stessa proporzione a prescindere da quanto spazio ci fosse
// davvero sopra (header, titolo, tab) — su un monitor alto (1080p/4K, la stessa proporzione
// verticale) lasciava una fascia vuota fra il riquadro e il fondo dello schermo. dvh invece di vh
// perché su mobile la barra degli indirizzi che appare/scompare non deve far "saltare" l'altezza.
// Offset diverso da sm in su: sotto quella soglia c'è anche la barra di navigazione fissa in
// fondo (vedi Nav) e main ha pb-24 invece di pb-10 per non finirci sotto.
const CHAT_PANEL_HEIGHT = "h-[calc(100dvh-19rem)] sm:h-[calc(100dvh-15rem)] min-h-[420px]";
// Sotto sm, quando il titolo "Chat"/i tab Messaggi-Amici sono nascosti (conversazione aperta —
// vedi ChatPageInner), lo spazio che occupavano è libero: un budget più piccolo dà quello spazio
// in più al riquadro invece di lasciarlo vuoto sopra "← Conversazioni".
const CHAT_PANEL_HEIGHT_THREAD_OPEN =
  "h-[calc(100dvh-11rem)] sm:h-[calc(100dvh-15rem)] min-h-[420px]";

// Anteprima stile WhatsApp: nei gruppi (campagna) col nome di chi ha scritto, nelle DM no (è
// ovvio chi sia, essendo una conversazione 1-a-1) — "Tu:" in entrambi i casi se l'ultimo l'ho
// scritto io.
function threadPreviewText(
  thread: UnifiedThread,
  lastMessage: ThreadActivity["lastMessage"],
  myUserId: string | null,
): string {
  if (!lastMessage) return "Nessun messaggio ancora";
  const mine = lastMessage.authorId === myUserId;
  if (thread.kind === "campaign") {
    const who = mine ? "Tu" : (lastMessage.authorName ?? "Qualcuno");
    return `${who}: ${lastMessage.testo}`;
  }
  return mine ? `Tu: ${lastMessage.testo}` : lastMessage.testo;
}

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
  // Su mobile, quando una conversazione è aperta, il titolo "Chat" e i tab Messaggi/Amici qui
  // sopra sono ridondanti (c'è già "← Conversazioni" dentro il riquadro) e rubano spazio verticale
  // prezioso su uno schermo piccolo — nascosti solo lì (da lg: in su restano sempre visibili,
  // c'è spazio) quando MessagesTab segnala che una thread è selezionata. Ottimizzazione mobile
  // richiesta dall'utente.
  const [threadOpen, setThreadOpen] = useState(false);
  const hideHeaderOnMobile = tab === "messaggi" && threadOpen;

  return (
    <div className="space-y-6 max-w-2xl lg:max-w-5xl 2xl:max-w-6xl [@media(min-width:2200px)]:max-w-[1600px] mx-auto">
      <h1
        className={`heading-ornate text-3xl font-bold text-accent-strong ${hideHeaderOnMobile ? "hidden lg:block" : ""}`}
      >
        Chat
      </h1>

      <div className={`flex gap-1.5 ${hideHeaderOnMobile ? "hidden lg:flex" : ""}`}>
        {(["messaggi", "amici"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`card-elevated-hover rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors ${
              tab === t
                ? "glow-accent border-accent bg-accent/15 text-accent-strong"
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
          onThreadOpenChange={setThreadOpen}
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
  onThreadOpenChange,
}: {
  forceOpenDmUserId: string | null;
  onConsumeForceOpen: () => void;
  onThreadOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const myUserId = session?.user?.id ?? null;
  const { threadActivity } = useRealtime();
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

  // Segnala al genitore (ChatPageInner) se una conversazione è aperta, per nascondere il
  // titolo/tab ridondanti su mobile — vedi commento lì.
  useEffect(() => {
    onThreadOpenChange(!!selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

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
  }
  // onConsumeForceOpen aggiorna lo stato del GENITORE: chiamarlo durante il render di questo
  // componente fa loggare a React "Cannot update a component while rendering a different
  // component". setSelected qui sopra è invece stato proprio, che React ammette in fase di render.
  useEffect(() => {
    if (forceOpenDmUserId) onConsumeForceOpen();
  }, [forceOpenDmUserId, onConsumeForceOpen]);

  // Tiene l'URL sincronizzato con la thread aperta — non solo per il deep link in ingresso, ma
  // anche per la SOPPRESSIONE delle notifiche push: il service worker (public/sw.js) decide se
  // una push va mostrata confrontando l'URL della scheda col payload — senza questo, aprire una
  // chat cliccando nella lista lasciava l'URL fermo a "/chat" e la soppressione non scattava mai.
  // In un effetto (non durante il render, a differenza di setSelected sopra): router.replace ha
  // un effetto collaterale vero sulla cronologia del browser, non è un semplice setState.
  useEffect(() => {
    const next = selected ? `/chat?thread=${selected.kind}:${selected.id}` : "/chat";
    if (`${window.location.pathname}${window.location.search}` === next) return;
    router.replace(next, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  if (!campaigns || !friends) return <p className="text-muted">Caricamento…</p>;

  const selectedFriend = selected?.kind === "dm" ? friends.find((f) => f.id === selected.id) : null;

  // Lista unica ordinata per attività più recente, gruppi e DM mescolati — è così che WhatsApp
  // mostra le conversazioni, non in sezioni separate per tipo.
  const threads: UnifiedThread[] = [
    ...campaigns.map((c): UnifiedThread => ({
      kind: "campaign",
      id: c.id,
      roomKey: `campaign-${c.id}`,
      nome: c.nome,
    })),
    ...friends.map((f): UnifiedThread => ({
      kind: "dm",
      id: f.id,
      roomKey: myUserId ? `dm-${[myUserId, f.id].sort().join("-")}` : `dm-${f.id}`,
      nome: f.name ?? "Utente",
      image: f.image,
    })),
  ].sort((a, b) => {
    const aTime = threadActivity.get(a.roomKey)?.lastMessage?.createdAt;
    const bTime = threadActivity.get(b.roomKey)?.lastMessage?.createdAt;
    if (aTime && bTime) return new Date(bTime).getTime() - new Date(aTime).getTime();
    if (aTime) return -1;
    if (bTime) return 1;
    return a.nome.localeCompare(b.nome);
  });

  const threadButtonClass = (active: boolean) =>
    `w-full flex items-center gap-2.5 text-left rounded-lg border px-3 py-2.5 text-sm transition-colors ${
      active
        ? "glow-accent border-accent bg-accent/15 text-accent-strong"
        : "border-edge bg-surface text-foreground hover:border-accent/50"
    }`;

  return (
    <div className="lg:grid lg:grid-cols-[300px_1fr] lg:gap-4 lg:items-start">
      <div className={selected ? "hidden lg:block space-y-1.5" : "space-y-1.5"}>
        {threads.length === 0 && (
          <div className="rounded-xl border border-dashed border-edge bg-surface/50 p-10 text-center text-muted">
            <p className="text-4xl mb-3">💬</p>
            <p>
              Nessuna conversazione ancora — unisciti a una campagna o cerca un amico dalla tab
              &quot;Amici&quot;.
            </p>
          </div>
        )}
        {threads.map((thread) => {
          const activity = threadActivity.get(thread.roomKey);
          const unread = activity?.unreadCount ?? 0;
          const active =
            selected?.kind === thread.kind && selected.id === thread.id;
          return (
            <button
              key={thread.roomKey}
              onClick={() => setSelected({ kind: thread.kind, id: thread.id })}
              className={threadButtonClass(active)}
            >
              {thread.kind === "campaign" ? (
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-base">
                  🗺️
                </span>
              ) : thread.image ? (
                <Image
                  src={thread.image}
                  alt=""
                  width={36}
                  height={36}
                  className="size-9 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="size-9 shrink-0 rounded-full bg-surface-raised" />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-bold">{thread.nome}</span>
                  {activity?.lastMessage && (
                    <span className="shrink-0 text-[10px] text-muted">
                      {formatThreadTime(activity.lastMessage.createdAt)}
                    </span>
                  )}
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted">
                    {threadPreviewText(thread, activity?.lastMessage ?? null, myUserId)}
                  </span>
                  {unread > 0 && (
                    <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-background">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className={selected ? "min-w-0" : "hidden lg:block min-w-0"}>
        {selected ? (
          <div className={`rounded-xl border border-edge bg-surface overflow-hidden flex flex-col ${CHAT_PANEL_HEIGHT_THREAD_OPEN}`}>
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
          <div
            className={`hidden lg:flex items-center justify-center rounded-xl border border-dashed border-edge bg-surface/30 p-12 text-center text-muted ${CHAT_PANEL_HEIGHT}`}
          >
            <p>Seleziona una conversazione.</p>
          </div>
        )}
      </div>
    </div>
  );
}
