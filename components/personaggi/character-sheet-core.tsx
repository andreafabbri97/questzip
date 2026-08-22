"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSession, signIn } from "next-auth/react";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { useGuardedNavigation, useUnsavedChangesGuard } from "@/components/unsaved-changes-provider";
import { getMyCampaigns } from "@/app/actions/campaigns";
import { claimXp, getMyCharacterInCampaign, syncCharacterToCampaign } from "@/app/actions/characters";
import { IntField } from "@/components/int-field";
import {
  ALIGNMENTS,
  LIVELLO_FOLLIA_EFFETTI,
  abilityModifier,
  formatModifier,
  passivePerception,
  proficiencyBonus,
  levelForXp,
  totalLevel,
  XP_PER_LEVEL,
  type Ability,
  type Character,
  type ClassEntry,
} from "@/lib/dnd";
import { loadBackgrounds, loadRaces } from "@/lib/fivetools/data";
import { formatClassSummary } from "./helpers";
import { Autocomplete } from "./autocomplete";
import {
  BackgroundTraits,
  ClassFeaturesSection,
  ClassRow,
  LevelUpWizard,
  RaceTraits,
  VisionField,
  XpTracker,
} from "./classes-leveling";
import {
  ActiveConditionsSection,
  InventorySection,
  LanguagesAndResistancesSection,
  PersonalitySection,
  TalentiSection,
} from "./inventory-equipment";
import { ClassChoicesSection, InfusionsSection, SpellListSection, WeaponsSection } from "./weapons-spells";
import {
  AbilityScoreSection,
  AttunedItemsSection,
  DeathSaves,
  HitDiceTracker,
  HitPointCalculator,
  InspirationToggle,
  LimitedFeaturesSection,
  PhysicalDescriptionSection,
  RestSection,
  SavingThrowsAndSkills,
  SpellSlotsSection,
} from "./abilities-and-meta";

type CloudStatus = "syncing" | "synced" | "error";

/** Scarica la scheda come PDF stampabile. Il generatore (lib/pdf-character-export.ts) tira dentro
 * pdf-lib, ~300KB di JS: importato dinamicamente al primo click invece che in cima al file, così
 * non pesa sul caricamento della pagina Personaggi per chi non stampa mai nulla. Esporta la BOZZA
 * corrente, non l'ultima versione salvata: quello che vedi a schermo è quello che finisce nel PDF. */
function ExportPdfButton({ character }: { character: Character }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const scarica = async () => {
    setBusy(true);
    setError(false);
    try {
      const { exportCharacterToPdf, pdfFileName } = await import("@/lib/pdf-character-export");
      const bytes = await exportCharacterToPdf(character);
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = pdfFileName(character);
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={scarica}
      disabled={busy}
      title="Scarica la scheda come PDF stampabile (usa i valori attuali, anche non salvati)"
      className="card-elevated-hover rounded-lg border border-edge px-3 py-1.5 text-xs font-bold text-muted transition-colors hover:border-accent hover:text-foreground disabled:opacity-50"
    >
      {busy ? "Genero…" : error ? "Errore, riprova" : "📄 PDF"}
    </button>
  );
}

export function CharacterSheet({
  character: persistedCharacter,
  onSave,
  onDelete,
  onBack,
  cloudStatus,
}: {
  character: Character;
  onSave: (character: Character) => void;
  onDelete: () => void;
  onBack: () => void;
  cloudStatus?: CloudStatus;
}) {
  // Bozza locale, non ancora scritta in localStorage/account finché non si preme "Salva" —
  // stile documento (Word/Excel): si può modificare liberamente e poi scegliere se tenere o
  // buttare le modifiche, invece del vecchio comportamento "ogni tasto salva subito".
  // "character"/"onChange" qui sotto oscurano di proposito i nomi della prop/funzione originali:
  // tutto il resto del componente (set/setAbility/setClassi/applyDamage/applyHeal e ogni sezione
  // figlia che riceve character+onChange) resta invariato, perché continua a risolvere questi
  // stessi due nomi — solo ora puntano allo stato locale invece che al salvataggio immediato.
  const [character, setCharacterState] = useState(persistedCharacter);
  const [dirty, setDirty] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const guardNavigate = useGuardedNavigation();
  // Tab ispirati a Roll20 (la piattaforma più diffusa) e alla scheda cartacea di riferimento
  // dell'utente: "Combattimento" di default, tutto il resto un click di distanza invece che più
  // in basso nello stesso scroll — durante il gioco vero serve solo la prima, il resto si legge
  // una volta sola in fase di creazione/level up.
  const [tab, setTab] = useState<"combattimento" | "incantesimi" | "inventario" | "tratti" | "info">(
    "combattimento",
  );

  const onChange = (next: Character) => {
    setCharacterState(next);
    setDirty(true);
  };

  // Il modal sotto copre l'uscita "in app" (bottone Indietro); questo copre chiusura
  // tab/refresh/ricarica, che il modal non può intercettare (l'evento del browser sì).
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const handleSave = () => {
    onSave(character);
    setDirty(false);
  };

  // Registra questa scheda presso il provider condiviso (components/unsaved-changes-provider.tsx)
  // finché ci sono modifiche non salvate — stesso identico modal a prescindere che l'utente provi
  // a uscire dal bottone "← Personaggi" qui sotto o da un link della barra di navigazione in alto
  // (prima erano due percorsi scollegati, il secondo non avvisava affatto).
  useUnsavedChangesGuard(dirty, { onSaveAndExit: handleSave, onDiscard: () => {} });

  // Solo per il reclamo XP (vedi CampaignSync più sotto): a differenza di ogni altra modifica
  // qui, che resta bozza scartabile finché non si preme "Salva", claimXp azzera SUBITO lo XP in
  // sospeso lato server, un effetto reale e irreversibile — lasciarlo come bozza locale vorrebbe
  // dire che chiudere la scheda senza salvare perde quello XP per sempre, già consumato sul
  // server ma mai arrivato sulla scheda. Salva quindi subito l'intero stato corrente (comprese
  // eventuali altre modifiche non ancora salvate), non solo il delta di XP.
  const saveNow = (next: Character) => {
    setCharacterState(next);
    onSave(next);
    setDirty(false);
  };

  const handleBack = () => guardNavigate(onBack);

  const set = <K extends keyof Character>(key: K, value: Character[K]) =>
    onChange({ ...character, [key]: value });

  const setAbility = (ability: Ability, value: number) =>
    onChange({
      ...character,
      caratteristiche: { ...character.caratteristiche, [ability]: value },
    });

  // Se il livello di una classe viene alzato a mano (es. creando direttamente un personaggio
  // di livello 5, non arrivandoci giocando), gli XP restano indietro e il personaggio mostra
  // un mismatch permanente finché qualcuno non li corregge a mano. Li allinea da solo al minimo
  // richiesto per quel livello — mai verso il basso: se il giocatore rimuove una classe o
  // abbassa un livello, gli XP già accumulati restano quelli, non li perde per uno sbaglio di
  // battitura. Le altre statistiche derivate (PF suggeriti, slot incantesimo, bonus competenza)
  // seguono già il livello di classe direttamente, non gli XP — non serve altro.
  const setClassi = (classi: ClassEntry[]) => {
    const newLevel = totalLevel(classi);
    const minXp = newLevel > 1 ? XP_PER_LEVEL[Math.min(20, newLevel) - 1] : 0;
    const esperienza = character.esperienza < minXp ? minXp : character.esperienza;
    onChange({ ...character, classi, esperienza });
  };

  const [hpAmount, setHpAmount] = useState(1);

  // Il danno consuma prima i PF temporanei e solo l'eccedenza intacca i PF veri (regola RAW) —
  // la cura invece non li ripristina mai (i temporanei non si "curano", si riassegnano da capo).
  const applyDamage = () => {
    const fromTemp = Math.min(character.hpTemporanei, hpAmount);
    const remaining = hpAmount - fromTemp;
    onChange({
      ...character,
      hpTemporanei: character.hpTemporanei - fromTemp,
      hpAttuali: Math.max(0, character.hpAttuali - remaining),
    });
  };

  const applyHeal = () => {
    const hpAttuali = Math.min(character.hpMax, character.hpAttuali + hpAmount);
    // recuperare anche un solo punto ferita azzera i tiri salvezza contro la morte (regola RAW)
    const resetDeathSaves =
      character.hpAttuali <= 0 && hpAttuali > 0
        ? { tiriMorteSuccessi: 0, tiriMorteFallimenti: 0 }
        : {};
    onChange({ ...character, hpAttuali, ...resetDeathSaves });
  };

  const inputClass =
    "input-focus mt-1 w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-foreground";
  const labelClass = "text-xs uppercase tracking-widest text-muted";

  return (
    <div className="space-y-6 max-w-2xl lg:max-w-5xl 2xl:max-w-6xl [@media(min-width:2200px)]:max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button onClick={handleBack} className="text-sm text-muted hover:text-foreground shrink-0">
          ← Personaggi
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <CloudStatusBadge status={cloudStatus} />
          <ExportPdfButton character={character} />
          <button
            onClick={handleSave}
            disabled={!dirty}
            title={dirty ? "Salva le modifiche" : "Nessuna modifica da salvare"}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
              dirty
                ? "bg-accent text-background hover:bg-accent-strong"
                : "border border-edge text-muted opacity-60 cursor-default"
            }`}
          >
            💾 Salva
          </button>
        </div>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="card-elevated-hover flex items-center gap-1.5 rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-bold text-danger transition-colors hover:border-danger hover:bg-danger/10 shrink-0"
        >
          🗑️ Elimina
        </button>
      </div>

      {showDeleteModal && (
        <DeleteCharacterModal
          characterName={character.nome}
          onConfirm={() => {
            setShowDeleteModal(false);
            onDelete();
          }}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      {/* Identità sempre visibile a prescindere dal tab aperto — stesso principio della banda
          col nome ripetuta su ogni pagina della scheda cartacea di riferimento: durante il gioco
          non deve mai servire cambiare tab solo per ricordarsi di chi è questa scheda. */}
      <div className="card-elevated flex items-center gap-3 rounded-xl border border-edge bg-surface px-4 py-3">
        {character.ritrattoUrl ? (
          // URL arbitrario fornito dal giocatore, non un asset locale ottimizzabile da next/image
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={character.ritrattoUrl}
            alt=""
            className="size-12 shrink-0 rounded-full border border-edge object-cover"
          />
        ) : (
          <span className="size-12 shrink-0 rounded-full bg-surface-raised" />
        )}
        <div className="min-w-0">
          <p className="heading-ornate truncate text-lg font-bold text-foreground">
            {character.nome || "Senza nome"}
          </p>
          <p className="truncate text-xs text-muted">
            {[character.razza, formatClassSummary(character.classi)].filter(Boolean).join(" · ") ||
              "—"}{" "}
            · Livello {totalLevel(character.classi)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["combattimento", "⚔️ Combattimento"],
            ["incantesimi", "✨ Incantesimi"],
            ["inventario", "🎒 Inventario"],
            ["tratti", "📖 Tratti & Talenti"],
            ["info", "📜 Info & Personalità"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`card-elevated-hover rounded-lg border px-3 py-2 text-sm font-bold transition-colors ${
              tab === value
                ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                : "border-edge bg-surface-raised text-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "combattimento" && (
        <div className="space-y-6">
          <RestSection character={character} onChange={onChange} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <InspirationToggle character={character} onChange={onChange} />
            <HitDiceTracker character={character} onChange={onChange} />
            <div className="rounded-lg border border-edge bg-surface-raised p-2 text-center">
              <span className={labelClass}>Affaticamento</span>
              <IntField
                min={0}
                max={6}
                value={character.affaticamento}
                onChange={(value) => set("affaticamento", value)}
                aria-label="Livello di affaticamento (0-6)"
                className="mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1 text-sm text-foreground text-center"
              />
            </div>
            <div className="rounded-lg border border-edge bg-surface-raised p-2 text-center">
              <span className={labelClass}>Livello di Follia</span>
              <IntField
                min={0}
                max={6}
                value={character.livelloFollia}
                onChange={(value) => set("livelloFollia", value)}
                aria-label="Livello di follia (0-6)"
                className="mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1 text-sm text-foreground text-center"
              />
            </div>
          </div>
          {character.livelloFollia > 0 && (
            <p className="text-xs text-danger -mt-3">
              Follia {character.livelloFollia}: {LIVELLO_FOLLIA_EFFETTI[character.livelloFollia]}
            </p>
          )}

          <div className="md:grid md:grid-cols-2 md:gap-6 md:items-start">
            <section className="card-elevated rounded-xl border border-edge bg-surface p-5">
              <h2 className="text-sm uppercase tracking-widest text-muted mb-4">
                Punti ferita e difesa
              </h2>
              <div className="flex flex-col items-center gap-3 mb-5">
                <div className="text-center min-w-28">
                  <div
                    className={`text-4xl font-display font-bold ${
                      character.hpAttuali <= 0
                        ? "text-danger"
                        : character.hpAttuali <= character.hpMax / 2
                          ? "text-accent"
                          : "text-foreground"
                    }`}
                  >
                    {character.hpAttuali}
                    <span className="text-lg text-muted"> / {character.hpMax}</span>
                    {character.hpTemporanei > 0 && (
                      <span className="text-lg text-accent-strong"> +{character.hpTemporanei}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted">punti ferita</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={applyDamage}
                    className="rounded-lg border border-edge bg-surface-raised px-3 py-1.5 text-sm font-bold text-danger hover:border-danger transition-colors"
                    aria-label="Applica danno"
                  >
                    − Danno
                  </button>
                  <IntField
                    min={1}
                    value={hpAmount}
                    onChange={setHpAmount}
                    aria-label="Quantità danno o cura"
                    className="w-14 rounded-md border border-edge bg-surface-raised px-1.5 py-1.5 text-sm text-foreground text-center"
                  />
                  <button
                    onClick={applyHeal}
                    className="rounded-lg border border-edge bg-surface-raised px-3 py-1.5 text-sm font-bold text-accent-strong hover:border-accent transition-colors"
                    aria-label="Applica cura"
                  >
                    + Cura
                  </button>
                </div>
              </div>
              {character.hpAttuali <= 0 && <DeathSaves character={character} onChange={onChange} />}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <label className="block">
                  <span className={labelClass}>PF max</span>
                  <IntField
                    min={1}
                    max={999}
                    value={character.hpMax}
                    onChange={(hpMax) => {
                      onChange({
                        ...character,
                        hpMax,
                        hpAttuali: Math.min(character.hpAttuali, hpMax),
                      });
                    }}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className={labelClass}>PF temporanei</span>
                  <IntField
                    min={0}
                    max={999}
                    value={character.hpTemporanei}
                    onChange={(value) => set("hpTemporanei", value)}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className={labelClass}>CA</span>
                  <IntField
                    min={1}
                    max={40}
                    value={character.classeArmatura}
                    onChange={(value) => set("classeArmatura", value)}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className={labelClass}>Velocità (m)</span>
                  <IntField
                    min={0}
                    max={60}
                    value={character.velocita}
                    onChange={(value) => set("velocita", value)}
                    className={inputClass}
                  />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-4 mt-4">
                <div className="rounded-lg border border-edge bg-surface-raised px-2 sm:px-3 py-2 text-center">
                  <span className={labelClass}>Bonus competenza</span>
                  <p className="text-lg font-bold text-foreground">
                    {formatModifier(proficiencyBonus(totalLevel(character.classi)))}
                  </p>
                </div>
                <div className="rounded-lg border border-edge bg-surface-raised px-2 sm:px-3 py-2 text-center">
                  <span className={labelClass}>Iniziativa</span>
                  <p className="text-lg font-bold text-foreground">
                    {formatModifier(
                      abilityModifier(character.caratteristiche.destrezza) + character.iniziativaBonus,
                    )}
                  </p>
                  <IntField
                    value={character.iniziativaBonus}
                    onChange={(value) => set("iniziativaBonus", value)}
                    className="mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1 text-center text-xs text-foreground"
                    placeholder="bonus"
                    aria-label="Bonus extra all'iniziativa"
                  />
                </div>
                <div className="rounded-lg border border-edge bg-surface-raised px-2 sm:px-3 py-2 text-center">
                  <span className={labelClass}>Percezione passiva</span>
                  <p className="text-lg font-bold text-foreground">
                    {passivePerception(
                      character.caratteristiche.saggezza,
                      character.abilitaCompetenti.includes("Percezione"),
                      character.abilitaEsperte.includes("Percezione"),
                      totalLevel(character.classi),
                    ) + character.percezionePassivaBonus}
                  </p>
                  <IntField
                    value={character.percezionePassivaBonus}
                    onChange={(value) => set("percezionePassivaBonus", value)}
                    className="mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1 text-center text-xs text-foreground"
                    placeholder="bonus"
                    aria-label="Bonus extra alla percezione passiva"
                  />
                </div>
              </div>
              <VisionField character={character} onChange={onChange} />
              <HitPointCalculator
                character={character}
                onApply={(hpMax) =>
                  onChange({
                    ...character,
                    hpMax,
                    hpAttuali: hpMax,
                    tiriMorteSuccessi: 0,
                    tiriMorteFallimenti: 0,
                  })
                }
              />
            </section>

            <div className="mt-6 md:mt-0">
              <AbilityScoreSection character={character} onChange={onChange} setAbility={setAbility} />
            </div>
          </div>

          <SavingThrowsAndSkills character={character} onChange={onChange} />

          <WeaponsSection character={character} onChange={onChange} />

          <div className="md:grid md:grid-cols-2 md:gap-6 md:items-start">
            <ActiveConditionsSection character={character} onChange={onChange} />
            <div className="mt-6 md:mt-0">
              <LimitedFeaturesSection character={character} onChange={onChange} />
            </div>
          </div>
        </div>
      )}

      {tab === "incantesimi" && (
        <div className="space-y-6">
          <SpellSlotsSection character={character} onChange={onChange} />
          <SpellListSection character={character} onChange={onChange} onAutofill={setCharacterState} />
          <InfusionsSection character={character} onChange={onChange} />
          <ClassChoicesSection character={character} onChange={onChange} />
        </div>
      )}

      {tab === "inventario" && (
        <div className="space-y-6">
          <InventorySection character={character} onChange={onChange} />
          <AttunedItemsSection character={character} onChange={onChange} />
        </div>
      )}

      {tab === "tratti" && (
        <div className="space-y-6">
          <RaceTraits razza={character.razza} />
          <ClassFeaturesSection character={character} />
          <TalentiSection character={character} onChange={onChange} />
          <LanguagesAndResistancesSection character={character} onChange={onChange} />
        </div>
      )}

      {tab === "info" && (
        <div className="space-y-6">
          <div className="md:grid md:grid-cols-2 md:gap-6 md:items-start">
            <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-4">
              <label className="block">
                <span className={labelClass}>Nome</span>
                <input
                  value={character.nome}
                  onChange={(event) => set("nome", event.target.value)}
                  placeholder="Es. Thorin Scudodiquercia"
                  className={`${inputClass} text-lg font-bold`}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Razza</span>
                <Autocomplete
                  value={character.razza}
                  onChange={(value) => set("razza", value)}
                  loader={loadRaces}
                  placeholder="Elf, Dwarf, Halfling…"
                  inputClassName={inputClass}
                  kind="razze"
                />
              </label>
              <label className="block">
                <span className={labelClass}>Allineamento</span>
                <select
                  value={character.allineamento}
                  onChange={(event) => set("allineamento", event.target.value)}
                  className={inputClass}
                >
                  <option value="">— non scelto —</option>
                  {ALIGNMENTS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelClass}>Background</span>
                <Autocomplete
                  value={character.background}
                  onChange={(value) => set("background", value)}
                  loader={loadBackgrounds}
                  placeholder="Acolyte, Soldier, Sage…"
                  inputClassName={inputClass}
                  kind="background"
                />
              </label>
              <BackgroundTraits background={character.background} />
            </section>

            <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3 mt-6 md:mt-0">
              <div className="flex items-center justify-between">
                <h2 className="text-sm uppercase tracking-widest text-muted">
                  Classi {character.classi.length > 1 && "(multiclasse)"}
                </h2>
                <button
                  onClick={() =>
                    setClassi([...character.classi, { nome: "", livello: 1 }])
                  }
                  className="text-xs font-bold text-accent-strong hover:underline"
                >
                  + Aggiungi classe
                </button>
              </div>
              {character.classi.map((entry, index) => (
                <ClassRow
                  key={index}
                  entry={entry}
                  isPrimary={index === 0}
                  onChange={(next) =>
                    setClassi(
                      character.classi.map((c, i) => (i === index ? next : c)),
                    )
                  }
                  onRemove={() =>
                    setClassi(
                      character.classi.filter((_, i) => i !== index),
                    )
                  }
                  canRemove={character.classi.length > 1}
                />
              ))}
              <p className="text-sm text-muted">
                Livello totale {totalLevel(character.classi)} · Bonus di competenza:{" "}
                <span className="font-bold text-accent-strong">
                  {formatModifier(proficiencyBonus(totalLevel(character.classi)))}
                </span>
              </p>
              <XpTracker character={character} onChange={onChange} />
              <LevelUpWizard character={character} onChange={onChange} />
            </section>
          </div>

          <CampaignSync character={character} onSaveNow={saveNow} />

          <PersonalitySection character={character} onChange={onChange} />

          <PhysicalDescriptionSection character={character} onChange={onChange} />

          <section className="card-elevated rounded-xl border border-edge bg-surface p-5">
            <label className="block">
              <span className={labelClass}>Note</span>
              <textarea
                value={character.note}
                onChange={(event) => set("note", event.target.value)}
                placeholder="Retroscena, alleati, altri dettagli…"
                rows={5}
                className={inputClass}
              />
            </label>
          </section>
        </div>
      )}
    </div>
  );
}

export function CampaignSync({
  character,
  onSaveNow,
}: {
  character: Character;
  onSaveNow: (character: Character) => void;
}) {
  const { status } = useSession();
  const [campaigns, setCampaigns] = useState<Awaited<ReturnType<typeof getMyCampaigns>> | null>(
    null,
  );
  const [selected, setSelected] = useState("");
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingXp, setPendingXp] = useState(0);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    getMyCampaigns().then((list) => {
      setCampaigns(list);
      setSelected((prev) => prev || list[0]?.id || "");
    });
  }, [status]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    getMyCharacterInCampaign(selected).then((row) => {
      if (!cancelled) setPendingXp(row?.xpInSospeso ?? 0);
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const claim = async () => {
    if (!selected || pendingXp <= 0) return;
    setClaiming(true);
    try {
      const { amount, autoLevelUp } = await claimXp(selected);
      if (amount > 0) {
        const newXp = character.esperienza + amount;
        let classi = character.classi;
        // stesso identico effetto di confermare il wizard di level-up già esistente: aggiorna
        // solo il numero di livello, i PF restano un passo manuale successivo — per multiclasse
        // non tocca nulla, serve comunque scegliere quale classe sale
        if (autoLevelUp && classi.length === 1) {
          const newLevel = Math.min(20, levelForXp(newXp));
          if (newLevel > classi[0].livello) classi = [{ ...classi[0], livello: newLevel }];
        }
        onSaveNow({ ...character, esperienza: newXp, classi });
      }
      setPendingXp(0);
    } finally {
      setClaiming(false);
    }
  };

  if (status !== "authenticated") {
    return (
      <section className="rounded-xl border border-dashed border-edge bg-surface/50 p-4 text-sm text-muted flex items-center justify-between gap-3 flex-wrap">
        <span>Accedi per portare questo personaggio in una campagna condivisa.</span>
        <button
          onClick={() => signIn("google")}
          className="shrink-0 rounded-lg border border-edge px-3 py-1.5 text-xs font-bold text-foreground hover:border-accent transition-colors"
        >
          Accedi con Google
        </button>
      </section>
    );
  }

  if (campaigns === null) return null;

  if (campaigns.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-edge bg-surface/50 p-4 text-sm text-muted">
        Non fai parte di nessuna campagna condivisa ancora — creane una o unisciti da{" "}
        <span className="text-accent-strong">Campagne</span>.
      </section>
    );
  }

  const sync = async () => {
    if (!selected) return;
    setSyncing(true);
    setError(null);
    try {
      await syncCharacterToCampaign(selected, character);
      setSyncedAt(new Date());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-4 space-y-2">
      {pendingXp > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border border-accent-strong bg-accent/10 px-3 py-2">
          <span className="text-sm text-foreground">
            🎉 Il master ti ha assegnato <span className="font-bold">{pendingXp} XP</span> in
            questa campagna.
          </span>
          <button
            onClick={claim}
            disabled={claiming}
            className="rounded-lg bg-accent-strong text-background font-bold px-3 py-1.5 text-xs hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {claiming ? "…" : "Applica alla scheda"}
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs uppercase tracking-widest text-muted shrink-0">
          Porta in campagna
        </span>
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          className="rounded-md border border-edge bg-surface-raised px-2 py-1.5 text-sm text-foreground"
        >
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <button
          onClick={sync}
          disabled={syncing}
          className="glow-accent rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-sm hover:bg-accent-strong transition-colors active:scale-[0.97] disabled:opacity-50"
        >
          {syncing ? "…" : "Sincronizza"}
        </button>
        {syncedAt && (
          <span className="text-xs text-accent-strong">
            ✓ Inviato alle {syncedAt.toLocaleTimeString("it-IT")}
          </span>
        )}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
      <p className="rounded-lg border border-edge bg-surface-raised px-3 py-2 text-xs text-muted">
        ⚠️ Non è automatico: il gruppo vede uno scatto del personaggio al momento della
        sincronizzazione. Se lo modifichi dopo, premi di nuovo &ldquo;Sincronizza&rdquo; per aggiornarlo.
      </p>
    </section>
  );
}

// Riguarda solo il backup in background sull'account (vedi character-sync.ts), non il
// salvataggio locale — quello ha il suo bottone "Salva" esplicito, testo diverso apposta per non
// confondere le due cose.
function CloudStatusBadge({ status }: { status?: CloudStatus }) {
  if (!status) return null;
  const label =
    status === "syncing" ? "☁ Backup…" : status === "synced" ? "☁ Backup ok" : "⚠ Backup non riuscito";
  const color = status === "error" ? "text-danger" : "text-muted";
  return <span className={`text-[11px] ${color} shrink-0`}>{label}</span>;
}

function DeleteCharacterModal({
  characterName,
  onConfirm,
  onCancel,
}: {
  characterName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useBodyScrollLock(true);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-overlay-in"
      onClick={onCancel}
    >
      <div
        className="card-elevated w-full max-w-sm rounded-xl border border-edge bg-background p-5 space-y-4 animate-modal-in"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-display font-bold text-danger">Eliminare il personaggio?</h2>
        <p className="text-sm text-muted">
          <span className="font-bold text-foreground">{characterName || "Questo personaggio"}</span>{" "}
          verrà eliminato definitivamente, incluso il backup sul tuo account. Non si può annullare.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onConfirm}
            className="rounded-lg bg-danger text-background font-bold px-4 py-2 text-sm hover:opacity-90 transition-opacity"
          >
            Elimina definitivamente
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg border border-edge px-4 py-2 text-sm text-foreground hover:border-accent/50 transition-colors"
          >
            Annulla
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

