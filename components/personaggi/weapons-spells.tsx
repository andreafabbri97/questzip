"use client";

import { useEffect, useRef, useState } from "react";
import { IntField } from "@/components/int-field";
import {
  ABILITIES,
  ABILITY_LABELS,
  canonicalClassName,
  formatModifier,
  multiclassCasterLevel,
  primaryCastingAbility,
  spellAttackBonus,
  totalLevel,
  warlockLevel,
  weaponAbilityModifier,
  weaponAttackBonus,
  type Character,
  type KnownFeat,
  type KnownSpell,
  type Weapon,
} from "@/lib/dnd";
import { DiceRollerModal, type DiceRollerPreset } from "@/components/dice-roller-modal";
import { loadInfusions, loadInventoryItems, loadSpells, type RawOptionalFeature, type RawSpell } from "@/lib/fivetools/data";
import { guessDamageDice } from "@/lib/fivetools/entries";
import { findCompendioMatch } from "@/lib/fivetools/mention-search";
import { Autocomplete } from "./autocomplete";
import { CompendioInfoButton } from "./compendio-info-button";
import { LocalInfoButton } from "./local-info-button";
import type { SimpleEntryData } from "./simple-entry-modal";

export function WeaponsSection({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const setArmi = (armi: Weapon[]) => onChange({ ...character, armi });
  const level = totalLevel(character.classi);

  const addWeapon = () =>
    setArmi([
      ...character.armi,
      {
        id: crypto.randomUUID(),
        nome: "",
        caratteristica: "forza",
        competente: true,
        bonusExtra: 0,
        dadoDanno: "1d6",
        tipoDanno: "",
        aDistanza: false,
      },
    ]);

  const updateWeapon = (id: string, patch: Partial<Weapon>) =>
    setArmi(character.armi.map((weapon) => (weapon.id === id ? { ...weapon, ...patch } : weapon)));

  // Apre lo stesso modal dadi (3D fisico incluso) della pagina /dadi, già preimpostato per questo
  // tiro specifico — richiesto dall'utente al posto del tiro istantaneo "invisibile" che c'era
  // prima (nessuna animazione, solo un numero che appariva in un paragrafo di testo).
  const [dicePreset, setDicePreset] = useState<DiceRollerPreset | null>(null);

  const openAttackRoll = (weaponName: string, bonus: number) => {
    setDicePreset({
      label: `${weaponName.trim() || "Arma"} — Attacco`,
      groups: [{ die: 20, quantity: 1 }],
      modifier: bonus,
    });
  };

  // "NdM" (es. "2d6") — stesso formato libero già in uso nel campo Dado danno. Un formato non
  // riconosciuto (raro, es. testo lasciato vuoto) semplicemente non mostra il bottone Danno,
  // invece di aprire il modal su un input che non è quello che l'utente intendeva.
  const openDamageRoll = (weaponName: string, dadoDanno: string, mod: number) => {
    const match = dadoDanno.trim().match(/^(\d+)d(\d+)$/i);
    if (!match) return;
    const quantity = Math.min(20, Math.max(1, Number(match[1])));
    const die = Number(match[2]);
    setDicePreset({
      label: `${weaponName.trim() || "Arma"} — Danno`,
      groups: [{ die, quantity }],
      modifier: mod,
    });
  };

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-muted">Armi e attacchi</h2>
        <button onClick={addWeapon} className="text-xs font-bold text-accent-strong hover:underline">
          + Aggiungi arma
        </button>
      </div>
      <DiceRollerModal preset={dicePreset} onClose={() => setDicePreset(null)} />
      {character.armi.length === 0 && <p className="text-sm text-muted">Nessuna arma aggiunta ancora.</p>}
      <div className="space-y-3">
        {character.armi.map((weapon) => {
          const bonus = weaponAttackBonus(
            weapon.caratteristica,
            character.caratteristiche,
            weapon.competente,
            level,
            weapon.bonusExtra,
          );
          const dmgMod = weaponAbilityModifier(weapon.caratteristica, character.caratteristiche);
          return (
            <div key={weapon.id} className="rounded-lg border border-edge bg-surface-raised p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <Autocomplete
                    value={weapon.nome}
                    onChange={(nome) => updateWeapon(weapon.id, { nome })}
                    loader={loadInventoryItems}
                    placeholder="Spada lunga, Alabarda…"
                    inputClassName="w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
                    kind="oggetti"
                  />
                </div>
                <button
                  onClick={() => setArmi(character.armi.filter((w) => w.id !== weapon.id))}
                  className="text-muted hover:text-danger text-sm shrink-0"
                  aria-label={`Rimuovi ${weapon.nome || "arma"}`}
                >
                  ×
                </button>
              </div>
              <CompendioInfoButton kind="oggetti" nome={weapon.nome} />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest text-muted">Caratteristica</span>
                  <select
                    value={weapon.caratteristica}
                    onChange={(event) =>
                      updateWeapon(weapon.id, {
                        caratteristica: event.target.value as Weapon["caratteristica"],
                      })
                    }
                    className="mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
                  >
                    {ABILITIES.map((ability) => (
                      <option key={ability} value={ability}>
                        {ABILITY_LABELS[ability]}
                      </option>
                    ))}
                    <option value="finezza">Finezza (migliore tra For/Des)</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest text-muted">Dado danno</span>
                  <input
                    value={weapon.dadoDanno}
                    onChange={(event) => updateWeapon(weapon.id, { dadoDanno: event.target.value })}
                    placeholder="1d6"
                    className="mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest text-muted">Tipo danno</span>
                  <input
                    value={weapon.tipoDanno}
                    onChange={(event) => updateWeapon(weapon.id, { tipoDanno: event.target.value })}
                    placeholder="tagliente…"
                    className="mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest text-muted">Bonus extra</span>
                  <IntField
                    value={weapon.bonusExtra}
                    onChange={(value) => updateWeapon(weapon.id, { bonusExtra: value })}
                    className="mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
                  />
                </label>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={weapon.competente}
                    onChange={(event) => updateWeapon(weapon.id, { competente: event.target.checked })}
                  />
                  Competente
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={weapon.aDistanza}
                    onChange={(event) => updateWeapon(weapon.id, { aDistanza: event.target.checked })}
                  />
                  A distanza
                </label>
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm text-accent-strong font-semibold">
                  Bonus attacco: {formatModifier(bonus)} · Danno: {weapon.dadoDanno}
                  {dmgMod !== 0 ? ` ${formatModifier(dmgMod)}` : ""}
                  {weapon.tipoDanno ? ` (${weapon.tipoDanno})` : ""}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <button
                    onClick={() => openAttackRoll(weapon.nome, bonus)}
                    aria-label={`Tira per colpire con ${weapon.nome || "arma"}`}
                    className="shrink-0 rounded-lg border border-edge px-2 py-1 text-xs text-muted hover:text-accent-strong hover:border-accent transition-colors"
                  >
                    🎲 Attacco
                  </button>
                  {/^\d+d\d+$/i.test(weapon.dadoDanno.trim()) && (
                    <button
                      onClick={() => openDamageRoll(weapon.nome, weapon.dadoDanno, dmgMod)}
                      aria-label={`Tira danno con ${weapon.nome || "arma"}`}
                      className="shrink-0 rounded-lg border border-edge px-2 py-1 text-xs text-muted hover:text-accent-strong hover:border-accent transition-colors"
                    >
                      🎲 Danno
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function SpellListSection({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const casterLevel = multiclassCasterLevel(character.classi);
  const wlLevel = warlockLevel(character.classi);

  // Stesso modal dadi delle armi (vedi WeaponsSection sopra): il bonus attacco è quello globale da
  // incantatore (CD/Bonus attacco già mostrati in cima alla sezione Slot incantesimi), il dado
  // danno invece va compilato per singolo incantesimo perché varia troppo (Palla di Fuoco 8d6,
  // Dardo Incantato 1d10, molti incantesimi non infliggono danni diretti) per essere derivato.
  // Dichiarato prima dell'uscita anticipata sotto: gli Hook React non possono essere condizionali.
  const [dicePreset, setDicePreset] = useState<DiceRollerPreset | null>(null);

  // Riferimento sempre aggiornato al personaggio corrente: l'effetto sotto fa ricerche async
  // (una per incantesimo senza dado danno) che possono richiedere più di un render — leggere da
  // qui invece che dalla "character" catturata al momento in cui l'effetto è partito evita di
  // sovrascrivere con dati vecchi eventuali modifiche fatte dal giocatore nel frattempo.
  const characterRef = useRef(character);
  useEffect(() => {
    characterRef.current = character;
  });

  // Precompila il dado danno per gli incantesimi già in elenco che non l'hanno mai avuto — prima
  // succedeva SOLO scegliendo l'incantesimo dal menu di autocompletamento (onSelect qui sotto), non
  // per quelli già presenti (importati, scritti a mano, o aggiunti prima che questa funzione
  // esistesse) — segnalato dall'utente con screenshot ("non viene riconosciuto... dove possibile").
  const targets = character.incantesimi.filter((s) => s.nome.trim() && !s.dadoDanno.trim());
  // Chiave di dipendenza invece dell'array intero: cambia solo quando cambia davvero l'INSIEME
  // degli incantesimi senza dado, non ad ogni modifica di un campo qualsiasi del personaggio.
  const missingDiceKey = targets.map((s) => `${s.id}:${s.nome.trim().toLowerCase()}`).join("|");
  useEffect(() => {
    if (!missingDiceKey) return;
    const targetIds = targets.map((s) => s.id);
    let cancelled = false;
    (async () => {
      const allSpells = await loadSpells();
      const updates = new Map<string, string>();
      for (const id of targetIds) {
        const spell = characterRef.current.incantesimi.find((s) => s.id === id);
        if (!spell || !spell.nome.trim() || spell.dadoDanno.trim()) continue;
        const match = await findCompendioMatch("incantesimi", spell.nome);
        if (!match) continue;
        const full = allSpells.find((sp) => sp.name === match.name && sp.source === match.source);
        if (!full) continue;
        const dice = guessDamageDice(full.entries, full.entriesHigherLevel);
        if (dice) updates.set(id, dice);
      }
      if (cancelled || updates.size === 0) return;
      const current = characterRef.current;
      onChange({
        ...current,
        incantesimi: current.incantesimi.map((s) =>
          updates.has(s.id) && !s.dadoDanno.trim() ? { ...s, dadoDanno: updates.get(s.id)! } : s,
        ),
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingDiceKey]);

  if (casterLevel === 0 && wlLevel === 0) return null;

  const level = totalLevel(character.classi);
  const castingAbility = primaryCastingAbility(character.classi);
  // + attaccoIncantesimiBonus: stesso bonus extra editabile mostrato/impostato in SpellSlotsSection
  // (scheda Incantesimi, in cima) — il tiro deve riflettere lo stesso numero mostrato lì, non solo
  // il calcolo RAW.
  const attackBonus = castingAbility
    ? spellAttackBonus(level, character.caratteristiche[castingAbility]) + character.attaccoIncantesimiBonus
    : 0;

  const setIncantesimi = (incantesimi: KnownSpell[]) => onChange({ ...character, incantesimi });

  const addSpell = () =>
    setIncantesimi([
      ...character.incantesimi,
      { id: crypto.randomUUID(), nome: "", livello: 0, preparato: false, dadoDanno: "" },
    ]);

  const openSpellAttackRoll = (spellName: string) => {
    setDicePreset({
      label: `${spellName.trim() || "Incantesimo"} — Lancia Incantesimo`,
      groups: [{ die: 20, quantity: 1 }],
      modifier: attackBonus,
    });
  };

  const openSpellDamageRoll = (spellName: string, dadoDanno: string) => {
    const match = dadoDanno.trim().match(/^(\d+)d(\d+)$/i);
    if (!match) return;
    const quantity = Math.min(20, Math.max(1, Number(match[1])));
    const die = Number(match[2]);
    setDicePreset({
      label: `${spellName.trim() || "Incantesimo"} — Danno`,
      groups: [{ die, quantity }],
      modifier: 0,
    });
  };

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-muted">Incantesimi conosciuti</h2>
        <button onClick={addSpell} className="text-xs font-bold text-accent-strong hover:underline">
          + Aggiungi incantesimo
        </button>
      </div>
      <DiceRollerModal preset={dicePreset} onClose={() => setDicePreset(null)} />
      {character.incantesimi.length === 0 && (
        <p className="text-sm text-muted">Nessun incantesimo aggiunto ancora.</p>
      )}
      <div className="space-y-2">
        {character.incantesimi.map((spell) => (
          <div key={spell.id} className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <Autocomplete
                  value={spell.nome}
                  onChange={(nome) =>
                    setIncantesimi(
                      character.incantesimi.map((s) => (s.id === spell.id ? { ...s, nome } : s)),
                    )
                  }
                  onSelect={(option: RawSpell, nomeScelto: string) =>
                    // Anche il nome va riscritto qui, non solo il dado danno: Autocomplete chiama
                    // onChange() e poi onSelect() in sequenza sincrona nello stesso click, ma
                    // entrambi partono dalla STESSA istantanea (stantia) di character.incantesimi
                    // — la seconda chiamata (onSelect) sovrascrive per intero il risultato della
                    // prima (onChange), quindi il nome scritto da onChange andava perso, lasciando
                    // il campo bloccato sul testo digitato invece del nome scelto dal menu. Bug
                    // reale, non solo percezione — segnalato dall'utente ("deve effettivamente
                    // autocompletarmi"). "nomeScelto" (non option.name, sempre inglese) è lo
                    // stesso testo italiano-quando-disponibile già passato a onChange.
                    setIncantesimi(
                      character.incantesimi.map((s) =>
                        s.id === spell.id
                          ? {
                              ...s,
                              nome: nomeScelto,
                              // Precompila il dado danno SOLO se ancora vuoto: scegliere di nuovo
                              // lo stesso incantesimo (o un altro) non deve mai sovrascrivere un
                              // valore che il giocatore ha già eventualmente corretto a mano.
                              dadoDanno: s.dadoDanno.trim()
                                ? s.dadoDanno
                                : guessDamageDice(option.entries, option.entriesHigherLevel),
                            }
                          : s,
                      ),
                    )
                  }
                  loader={loadSpells}
                  placeholder="Fireball, Cure Wounds…"
                  inputClassName="w-full rounded-md border border-edge bg-surface-raised px-2 py-1.5 text-sm text-foreground"
                  kind="incantesimi"
                />
              </div>
              <IntField
                min={0}
                max={9}
                value={spell.livello}
                onChange={(value) =>
                  setIncantesimi(
                    character.incantesimi.map((s) =>
                      s.id === spell.id ? { ...s, livello: value } : s,
                    ),
                  )
                }
                aria-label="Livello incantesimo"
                className="w-14 rounded-md border border-edge bg-surface-raised px-2 py-1.5 text-sm text-foreground text-center"
              />
              <label className="flex items-center gap-1 text-xs text-muted shrink-0">
                <input
                  type="checkbox"
                  checked={spell.preparato}
                  onChange={(event) =>
                    setIncantesimi(
                      character.incantesimi.map((s) =>
                        s.id === spell.id ? { ...s, preparato: event.target.checked } : s,
                      ),
                    )
                  }
                />
                Preparato
              </label>
              <button
                onClick={() => setIncantesimi(character.incantesimi.filter((s) => s.id !== spell.id))}
                className="text-muted hover:text-danger text-sm shrink-0"
                aria-label={`Rimuovi ${spell.nome || "incantesimo"}`}
              >
                ×
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CompendioInfoButton kind="incantesimi" nome={spell.nome} />
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <input
                  value={spell.dadoDanno}
                  onChange={(event) =>
                    setIncantesimi(
                      character.incantesimi.map((s) =>
                        s.id === spell.id ? { ...s, dadoDanno: event.target.value } : s,
                      ),
                    )
                  }
                  placeholder="dado danno"
                  aria-label={`Dado danno di ${spell.nome || "incantesimo"}`}
                  className="w-16 shrink-0 rounded-md border border-edge bg-surface px-1.5 py-1 text-xs text-foreground"
                />
                {castingAbility && (
                  <button
                    onClick={() => openSpellAttackRoll(spell.nome)}
                    aria-label={`Lancia ${spell.nome || "incantesimo"} come incantesimo`}
                    className="shrink-0 rounded-lg border border-edge px-2 py-1 text-xs text-muted hover:text-accent-strong hover:border-accent transition-colors"
                  >
                    🎲 Lancia Incantesimo
                  </button>
                )}
                {/^\d+d\d+$/i.test(spell.dadoDanno.trim()) && (
                  <button
                    onClick={() => openSpellDamageRoll(spell.nome, spell.dadoDanno)}
                    aria-label={`Tira danno con ${spell.nome || "incantesimo"}`}
                    className="shrink-0 rounded-lg border border-edge px-2 py-1 text-xs text-muted hover:text-accent-strong hover:border-accent transition-colors"
                  >
                    🎲 Danno
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Infusioni dell'Artefice — assenti finora dalla scheda: mostrate solo se il personaggio ha
 * almeno una classe Artefice, stesso identico pattern nome-libero+autocomplete di TalentiSection
 * (components/personaggi/inventory-equipment.tsx), ma con la propria fonte dati (le infusioni non
 * sono una categoria del Compendio a sé, vedi loadInfusions in lib/fivetools/data.ts) e quindi il
 * proprio bottone di verifica (LocalInfoButton anziché CompendioInfoButton).
 */
export function InfusionsSection({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const isArtificer = character.classi.some(
    (c) => canonicalClassName(c.nome).toLowerCase() === "artificer",
  );
  if (!isArtificer) return null;

  const setInfusioni = (infusioniConosciute: KnownFeat[]) =>
    onChange({ ...character, infusioniConosciute });

  const addInfusione = () =>
    setInfusioni([...character.infusioniConosciute, { id: crypto.randomUUID(), nome: "" }]);

  const loadInfusionCandidates = async (): Promise<SimpleEntryData[]> => {
    const infusions = await loadInfusions();
    return infusions.map((infusion: RawOptionalFeature) => ({
      title: infusion.name,
      meta: formatInfusionPrerequisite(infusion),
      entries: infusion.entries,
    }));
  };

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-muted">Infusioni conosciute</h2>
        <button onClick={addInfusione} className="text-xs font-bold text-accent-strong hover:underline">
          + Aggiungi infusione
        </button>
      </div>
      {character.infusioniConosciute.length === 0 && (
        <p className="text-sm text-muted">Nessuna infusione aggiunta ancora.</p>
      )}
      <div className="space-y-2">
        {character.infusioniConosciute.map((infusione) => (
          <div key={infusione.id} className="rounded-lg border border-edge bg-surface-raised p-2.5 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <Autocomplete
                  value={infusione.nome}
                  onChange={(nome) =>
                    setInfusioni(
                      character.infusioniConosciute.map((i) =>
                        i.id === infusione.id ? { ...i, nome } : i,
                      ),
                    )
                  }
                  loader={loadInfusions}
                  placeholder="Armor of Magical Strength, Enhanced…"
                  inputClassName="w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
                />
              </div>
              <button
                onClick={() =>
                  setInfusioni(character.infusioniConosciute.filter((i) => i.id !== infusione.id))
                }
                className="text-muted hover:text-danger text-sm shrink-0"
                aria-label={`Rimuovi ${infusione.nome || "infusione"}`}
              >
                ×
              </button>
            </div>
            <LocalInfoButton nome={infusione.nome} loadCandidates={loadInfusionCandidates} />
          </div>
        ))}
      </div>
    </section>
  );
}

function formatInfusionPrerequisite(infusion: RawOptionalFeature): string | undefined {
  const parts: string[] = [];
  for (const prereq of infusion.prerequisite ?? []) {
    if (prereq.level) {
      const className = prereq.level.class?.name ?? "Artefice";
      parts.push(`Richiede livello ${prereq.level.level} da ${className}`);
    }
    if (prereq.item) parts.push(...prereq.item);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

