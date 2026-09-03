"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getQuestsForCampaign } from "@/app/actions/quests";
import { getNpcsForCampaign } from "@/app/actions/npcs";
import { getHomebrewForCampaign } from "@/app/actions/homebrew";
import { addCombatant, getActiveEncounter, startEncounter } from "@/app/actions/encounters";
import { battuteDaLeggere, paragrafi, vociInScena } from "@/lib/sessione-scene";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { useVisualViewport } from "@/lib/use-visual-viewport";
import { SchedaCondivisa } from "./scheda-condivisa";

type Trama = Awaited<ReturnType<typeof getQuestsForCampaign>>[number];
type Npc = Awaited<ReturnType<typeof getNpcsForCampaign>>[number];
type Mostro = Awaited<ReturnType<typeof getHomebrewForCampaign>>[number];

/** Dove eravamo rimasti, per dispositivo: riaprire non deve far ricominciare dalla prima scena. */
const chiaveScena = (campaignId: string) => `questzip:sessione:${campaignId}`;

/**
 * Iniziativa del mostro, tirata come la tirerebbe il master: senza, entrerebbero tutti con lo
 * stesso numero. Fuori dal componente perché è impura e non deve finire in un render.
 */
function tiraIniziativa(): number {
  return 1 + Math.floor(Math.random() * 20);
}

/**
 * Modalità sessione: una scena per volta, a schermo intero.
 *
 * Nata dalla prima volta da master dell'utente — "in 2 ore abbiamo fatto tutto, era impossibile
 * che mi ricordassi tutto". Il materiale c'era ed era scritto bene, ma era fatto per essere LETTO
 * PRIMA: durante il gioco serve poter guardare, non ricordare. Qui la trama attiva diventa una
 * schermata per scena con le battute da leggere staccate dal resto, gli NPC che compaiono e i
 * mostri di quello scontro pronti da mandare in iniziativa — senza cercarli mentre il tavolo aspetta.
 */
export function ModalitaSessione({
  campaignId,
  onChiudi,
}: {
  campaignId: string;
  onChiudi: () => void;
}) {
  const [trame, setTrame] = useState<Trama[] | null>(null);
  const [npcs, setNpcs] = useState<Npc[]>([]);
  const [mostri, setMostri] = useState<Mostro[]>([]);
  const [indice, setIndice] = useState(0);
  const [schedaAperta, setSchedaAperta] = useState<Npc | null>(null);
  const [inviati, setInviati] = useState<Record<string, number>>({});

  useBodyScrollLock(true);
  const viewport = useVisualViewport();

  useEffect(() => {
    Promise.all([
      getQuestsForCampaign(campaignId),
      getNpcsForCampaign(campaignId),
      getHomebrewForCampaign(campaignId),
    ]).then(([q, n, h]) => {
      setTrame(q);
      setNpcs(n);
      setMostri(h.filter((v) => v.tipo === "mostro"));
      const salvato = Number(window.localStorage.getItem(chiaveScena(campaignId)) ?? 0);
      setIndice(Number.isFinite(salvato) ? Math.min(Math.max(0, salvato), Math.max(0, q.length - 1)) : 0);
    });
  }, [campaignId]);

  const vai = useCallback(
    (delta: number) => {
      setIndice((corrente) => {
        const totale = trame?.length ?? 0;
        const nuovo = Math.min(Math.max(0, corrente + delta), Math.max(0, totale - 1));
        window.localStorage.setItem(chiaveScena(campaignId), String(nuovo));
        return nuovo;
      });
    },
    [campaignId, trame?.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onChiudi();
      // Le frecce lasciano le mani ferme: al tavolo si cambia scena senza guardare lo schermo.
      if (e.key === "ArrowRight") vai(1);
      if (e.key === "ArrowLeft") vai(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onChiudi, vai]);

  const scena = trame?.[indice] ?? null;
  const testo = scena?.descrizione ?? "";
  const battute = useMemo(() => battuteDaLeggere(testo), [testo]);
  const corpo = useMemo(() => paragrafi(testo), [testo]);
  const npcInScena = useMemo(() => vociInScena(npcs, testo), [npcs, testo]);
  const mostriInScena = useMemo(() => vociInScena(mostri, testo), [mostri, testo]);

  const mandaInIniziativa = async (mostro: Mostro) => {
    // Se un combattimento è già in corso il mostro si aggiunge a quello, altrimenti se ne apre
    // uno: al tavolo si preme il bottone quando lo scontro comincia, non prima.
    const attivo = await getActiveEncounter(campaignId);
    const encounterId = attivo ? attivo.encounter.id : (await startEncounter(campaignId)).id;
    await addCombatant(encounterId, {
      nome: mostro.nome.replace(/\s*\([^)]*\)/g, "").trim() || mostro.nome,
      iniziativa: tiraIniziativa(),
      hpMax: mostro.hpMax ?? 10,
      xp: mostro.xp ?? 0,
    });
    setInviati((prec) => ({ ...prec, [mostro.id]: (prec[mostro.id] ?? 0) + 1 }));
  };

  const stile = viewport
    ? { height: `${viewport.height}px`, top: `${viewport.offsetTop}px` }
    : undefined;

  return (
    <div
      className="fixed inset-x-0 z-50 flex flex-col bg-background"
      style={stile ?? { top: 0, bottom: 0 }}
      role="dialog"
      aria-label="Modalità sessione"
    >
      {schedaAperta?.scheda && (
        <SchedaCondivisa
          pc={{ ...schedaAperta.scheda, playerName: "NPC" } as never}
          onChiudi={() => setSchedaAperta(null)}
        />
      )}

      <header className="flex items-center justify-between gap-2 border-b border-edge px-3 py-2 shrink-0">
        <span className="text-xs font-bold text-muted tabular-nums">
          {trame && trame.length > 0 ? `${indice + 1} / ${trame.length}` : "—"}
        </span>
        <p className="flex-1 truncate text-center text-sm font-bold text-accent-strong">
          {scena?.titolo ?? "Modalità sessione"}
        </p>
        <button
          onClick={onChiudi}
          className="rounded-lg border border-edge px-2 py-1 text-xs font-bold text-muted hover:text-foreground"
        >
          Chiudi
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {trame === null && <p className="text-sm text-muted">Caricamento…</p>}
        {trame?.length === 0 && (
          <p className="text-sm text-muted">
            Nessuna trama in questa campagna: la modalità sessione mostra le trame, una per scena.
          </p>
        )}

        {battute.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-muted">Da leggere</p>
            {battute.map((battuta, index) => (
              <p
                key={index}
                className="rounded-lg border-l-4 border-accent bg-surface-raised px-3 py-2 text-base leading-relaxed text-foreground"
              >
                «{battuta}»
              </p>
            ))}
          </div>
        )}

        {corpo.map((paragrafo, index) => (
          <p key={index} className="text-sm leading-relaxed text-foreground">
            {paragrafo}
          </p>
        ))}

        {npcInScena.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-muted">In scena</p>
            <div className="flex flex-wrap gap-2">
              {npcInScena.map((npc) => (
                <button
                  key={npc.id}
                  onClick={() => npc.scheda && setSchedaAperta(npc)}
                  disabled={!npc.scheda}
                  className="card-elevated-hover rounded-lg border border-edge bg-surface-raised px-3 py-2 text-left disabled:cursor-default"
                >
                  <p className="text-sm font-bold text-foreground">{npc.nome}</p>
                  <p className="text-[11px] text-muted">
                    {[
                      npc.classeArmatura != null ? `CA ${npc.classeArmatura}` : null,
                      npc.hpMax != null ? `${npc.hpMax} pf` : null,
                      npc.scheda ? "📋 scheda" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "nessun dato"}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {mostriInScena.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-muted">Mostri di questa scena</p>
            {mostriInScena.map((mostro) => (
              <div
                key={mostro.id}
                className="rounded-lg border border-edge bg-surface-raised p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground">{mostro.nome}</p>
                    <p className="text-[11px] text-muted">
                      {[
                        mostro.classeArmatura != null ? `CA ${mostro.classeArmatura}` : null,
                        mostro.hpMax != null ? `${mostro.hpMax} pf` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <button
                    onClick={() => mandaInIniziativa(mostro)}
                    className="glow-accent shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-background transition-colors hover:bg-accent-strong active:scale-[0.97]"
                  >
                    + Iniziativa
                    {inviati[mostro.id] ? ` (${inviati[mostro.id]})` : ""}
                  </button>
                </div>
                {mostro.descrizione && (
                  <details className="text-sm text-foreground">
                    <summary className="cursor-pointer text-xs font-bold text-accent-strong">
                      Scheda
                    </summary>
                    <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{mostro.descrizione}</p>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottoni grandi e in fondo: al tavolo si preme col pollice, spesso senza guardare. */}
      <footer className="flex items-center gap-2 border-t border-edge px-3 py-2 shrink-0">
        <button
          onClick={() => vai(-1)}
          disabled={indice === 0}
          className="flex-1 rounded-lg border border-edge bg-surface-raised py-3 text-sm font-bold text-foreground transition-colors hover:border-accent/40 disabled:opacity-40"
        >
          ← Indietro
        </button>
        <button
          onClick={() => vai(1)}
          disabled={!trame || indice >= trame.length - 1}
          className="glow-accent flex-1 rounded-lg bg-accent py-3 text-sm font-bold text-background transition-colors hover:bg-accent-strong active:scale-[0.98] disabled:opacity-40"
        >
          Avanti →
        </button>
      </footer>
    </div>
  );
}
