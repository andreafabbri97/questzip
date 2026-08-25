"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { getPartyForCampaign } from "@/app/actions/characters";
import { PartySpellSlots } from "@/components/campagne/combat-tracker";
import {
  ABILITIES,
  SKILLS,
  abilityModifier,
  formatModifier,
  passivePerception,
  proficiencyBonus,
  skillModifier,
  weaponAttackBonus,
  weaponDamageModifier,
  totalLevel,
  type Ability,
} from "@/lib/dnd";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { useVisualViewport } from "@/lib/use-visual-viewport";

export type VoceParty = Awaited<ReturnType<typeof getPartyForCampaign>>[number];

/**
 * Scheda di un personaggio del party, in SOLA LETTURA, aperta dalla pagina Campagna.
 *
 * Prima il party mostrava solo un riassunto (PF, CA, modificatori, slot) e per vedere altro
 * bisognava per forza andare in Personaggi — dove però si vede la PROPRIA scheda, non quella dei
 * compagni: del personaggio di un altro giocatore il master non poteva vedere nulla di più.
 * Qui c'è tutto ciò che il giocatore condivide premendo "Porta in campagna", compresi tiri
 * salvezza, abilità (con la Percezione passiva, il numero che il master usa di continuo), armi e
 * incantesimi. Sola lettura per costruzione: nessuna azione di questo modulo scrive, il
 * personaggio resta di chi lo gioca.
 */
export function SchedaCondivisa({ pc, onChiudi }: { pc: VoceParty; onChiudi: () => void }) {
  useBodyScrollLock(true);
  // Stesso trattamento del modal assistente: ancorato al riquadro davvero visibile, così su
  // telefono non finisce dietro la tastiera né si lascia trascinare fuori.
  const viewport = useVisualViewport();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onChiudi();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onChiudi]);

  const livello = totalLevel(pc.classi);
  const competenza = proficiencyBonus(livello);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4"
      style={viewport ? { top: viewport.offsetTop, height: viewport.height, bottom: "auto" } : undefined}
      onClick={onChiudi}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Scheda di ${pc.nome}`}
        className="card-elevated flex h-full max-h-[44rem] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-edge bg-surface animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-edge px-4 py-3">
          <div>
            <p className="font-display text-lg font-bold text-accent-strong">{pc.nome}</p>
            <p className="text-xs text-muted">
              {[pc.razza, pc.classi.map((c) => `${c.nome} ${c.livello}`).join(" / ")]
                .filter(Boolean)
                .join(" · ")}{" "}
              · giocato da {pc.playerName}
            </p>
          </div>
          <button
            onClick={onChiudi}
            aria-label="Chiudi"
            className="flex size-7 shrink-0 items-center justify-center rounded-full border border-edge text-lg leading-none text-muted hover:text-foreground"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
          <Riquadri
            voci={[
              { etichetta: "Punti ferita", valore: `${pc.hpAttuali} / ${pc.hpMax}` },
              { etichetta: "Classe armatura", valore: String(pc.classeArmatura) },
              { etichetta: "Velocità", valore: `${pc.velocita} m` },
              { etichetta: "Competenza", valore: formatModifier(competenza) },
              {
                etichetta: "Percezione passiva",
                valore: String(
                  passivePerception(
                    pc.caratteristiche.saggezza,
                    pc.abilitaCompetenti.includes("Percezione"),
                    pc.abilitaEsperte.includes("Percezione"),
                    livello,
                  ),
                ),
              },
              {
                etichetta: "Scurovisione",
                valore: pc.scurovisione && pc.visioneRadius > 0 ? `${pc.visioneRadius} m` : "—",
              },
            ]}
          />

          <Sezione titolo="Caratteristiche">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {ABILITIES.map((ability) => (
                <div
                  key={ability}
                  className="rounded-lg border border-edge bg-surface-raised px-2 py-1.5 text-center"
                >
                  <p className="text-[9px] uppercase tracking-widest text-muted">
                    {ability.slice(0, 3)}
                  </p>
                  <p className="text-base font-bold text-foreground">
                    {formatModifier(abilityModifier(pc.caratteristiche[ability]))}
                  </p>
                  <p className="text-[10px] text-muted">{pc.caratteristiche[ability]}</p>
                </div>
              ))}
            </div>
          </Sezione>

          <Sezione titolo="Tiri salvezza">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {ABILITIES.map((ability) => {
                const competente = pc.trsCompetenti.includes(ability as Ability);
                return (
                  <p
                    key={ability}
                    className={`flex items-center justify-between rounded-md px-2 py-1 text-xs ${
                      competente ? "bg-accent/10 text-foreground" : "text-muted"
                    }`}
                  >
                    <span className="capitalize">
                      {competente && "● "}
                      {ability}
                    </span>
                    <span className="font-bold">
                      {formatModifier(
                        abilityModifier(pc.caratteristiche[ability]) + (competente ? competenza : 0),
                      )}
                    </span>
                  </p>
                );
              })}
            </div>
          </Sezione>

          <Sezione titolo="Abilità">
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {SKILLS.map((skill) => {
                const competente = pc.abilitaCompetenti.includes(skill.nome);
                const esperto = pc.abilitaEsperte.includes(skill.nome);
                return (
                  <p
                    key={skill.nome}
                    className={`flex items-center justify-between rounded-md px-2 py-0.5 text-xs ${
                      competente || esperto ? "bg-accent/10 text-foreground" : "text-muted"
                    }`}
                  >
                    <span>
                      {esperto ? "◆ " : competente ? "● " : ""}
                      {skill.nome}
                    </span>
                    <span className="font-bold">
                      {formatModifier(
                        skillModifier(
                          pc.caratteristiche[skill.abilita],
                          competente,
                          esperto,
                          livello,
                        ),
                      )}
                    </span>
                  </p>
                );
              })}
            </div>
          </Sezione>

          {/* Riuso del componente gia' usato nella card del party: gestisce anche la magia del
              patto del warlock, che ha una progressione di slot tutta sua. */}
          <Sezione titolo="Slot incantesimo">
            <PartySpellSlots
              classi={pc.classi}
              slotUsati={pc.slotUsati}
              slotPattoUsati={pc.slotPattoUsati}
            />
          </Sezione>

          {pc.armi.length > 0 && (
            <Sezione titolo="Armi e attacchi">
              <ul className="space-y-1">
                {pc.armi.map((arma, i) => (
                  <li
                    key={`${arma.nome}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-edge bg-surface-raised px-2 py-1 text-xs"
                  >
                    <span className="font-semibold text-foreground">
                      {arma.nome}
                      {arma.aDistanza && <span className="ml-1 text-muted">(distanza)</span>}
                    </span>
                    <span className="text-muted">
                      {formatModifier(
                        weaponAttackBonus(
                          arma.caratteristica,
                          pc.caratteristiche,
                          arma.competente,
                          livello,
                          arma.bonusExtra,
                        ),
                      )}{" "}
                      al tiro · {arma.dadoDanno}
                      {formatModifier(
                        weaponDamageModifier(arma.caratteristica, pc.caratteristiche, arma.bonusExtra),
                      )}{" "}
                      {arma.tipoDanno}
                    </span>
                  </li>
                ))}
              </ul>
            </Sezione>
          )}

          {pc.incantesimi.length > 0 && (
            <Sezione titolo={`Incantesimi (${pc.incantesimi.length})`}>
              <p className="text-xs leading-relaxed text-muted">
                {pc.incantesimi
                  .map((s) => (s.preparato ? `${s.nome} ✦` : s.nome))
                  .join(", ")}
              </p>
              <p className="mt-1 text-[10px] text-muted">✦ = preparato</p>
            </Sezione>
          )}

          <ElencoNomi titolo="Talenti" voci={pc.talenti} />
          <ElencoNomi titolo="Infusioni" voci={pc.infusioniConosciute} />
          <ElencoNomi titolo="Scelte di classe" voci={pc.scelteClasse} />

          <Sezione titolo="Stato">
            <div className="flex flex-wrap gap-1.5 text-xs">
              <Pillola
                attiva={pc.ispirazione}
                testo={pc.ispirazione ? "★ Ispirazione" : "Nessuna ispirazione"}
              />
              {pc.affaticamento > 0 && (
                <Pillola attiva testo={`Affaticamento ${pc.affaticamento}`} />
              )}
              {pc.dadiVitaUsati > 0 && (
                <Pillola attiva={false} testo={`Dadi vita usati: ${pc.dadiVitaUsati}`} />
              )}
              {pc.condizioniAttive.map((c) => (
                <Pillola key={c} attiva testo={c} />
              ))}
              {pc.condizioniAttive.length === 0 && pc.affaticamento === 0 && (
                <Pillola attiva={false} testo="Nessuna condizione attiva" />
              )}
            </div>
          </Sezione>

          {pc.note.trim() && (
            <Sezione titolo="Note del giocatore">
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                {pc.note}
              </p>
            </Sezione>
          )}

          <p className="pt-1 text-center text-[10px] text-muted">
            Istantanea condivisa da {pc.playerName} — si aggiorna quando preme «Porta in campagna»
            nella sua scheda.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Sezione({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted">{titolo}</h3>
      {children}
    </section>
  );
}

function Riquadri({ voci }: { voci: { etichetta: string; valore: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {voci.map((v) => (
        <div
          key={v.etichetta}
          className="rounded-lg border border-edge bg-surface-raised px-2 py-1.5 text-center"
        >
          <p className="text-[9px] uppercase tracking-widest text-muted">{v.etichetta}</p>
          <p className="text-sm font-bold text-foreground">{v.valore}</p>
        </div>
      ))}
    </div>
  );
}

function ElencoNomi({ titolo, voci }: { titolo: string; voci: { nome: string }[] }) {
  if (voci.length === 0) return null;
  return (
    <Sezione titolo={titolo}>
      <p className="text-xs leading-relaxed text-foreground">
        {voci.map((v) => v.nome).join(", ")}
      </p>
    </Sezione>
  );
}

function Pillola({ attiva, testo }: { attiva: boolean; testo: string }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 ${
        attiva
          ? "border-accent-strong bg-accent/15 text-foreground"
          : "border-edge text-muted"
      }`}
    >
      {testo}
    </span>
  );
}
