import { describe, expect, it } from "vitest";
import {
  abilityModifier,
  applyLongRest,
  applyShortRest,
  canonicalClassName,
  calculateHitPoints,
  calculateMulticlassHitPoints,
  carryingCapacityKg,
  characterSchema,
  knownSpellSchema,
  isAsiLevelFor,
  levelForXp,
  limitedFeatureSchema,
  multiclassCasterLevel,
  newCharacter,
  pactMagicForLevel,
  passivePerception,
  primaryCastingAbility,
  proficiencyBonus,
  savingThrowModifier,
  skillModifier,
  spellAttackBonus,
  spellSaveDC,
  spellSlotsForCasterLevel,
  totalLevel,
  warlockLevel,
  weaponAbilityModifier,
  weaponAttackBonus,
  xpForNextLevel,
  type Character,
} from "./dnd";

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return { ...newCharacter(), classi: [{ nome: "Guerriero", livello: 4 }], ...overrides };
}

describe("abilityModifier", () => {
  it("arrotonda per difetto verso il basso per punteggi dispari", () => {
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(11)).toBe(0);
    expect(abilityModifier(12)).toBe(1);
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(1)).toBe(-5);
    expect(abilityModifier(20)).toBe(5);
  });
});

describe("proficiencyBonus", () => {
  it("segue la progressione standard 5e per livello", () => {
    expect(proficiencyBonus(1)).toBe(2);
    expect(proficiencyBonus(4)).toBe(2);
    expect(proficiencyBonus(5)).toBe(3);
    expect(proficiencyBonus(8)).toBe(3);
    expect(proficiencyBonus(9)).toBe(4);
    expect(proficiencyBonus(17)).toBe(6);
    expect(proficiencyBonus(20)).toBe(6);
  });

  it("resta fermo al valore di livello 20 oltre il tetto (multiclasse con somma > 20)", () => {
    expect(proficiencyBonus(25)).toBe(proficiencyBonus(20));
  });
});

describe("savingThrowModifier / skillModifier / passivePerception", () => {
  it("aggiunge il bonus di competenza solo se competente", () => {
    expect(savingThrowModifier(16, false, 5)).toBe(3);
    expect(savingThrowModifier(16, true, 5)).toBe(6);
  });

  it("raddoppia il bonus di competenza per le abilità con esperto (expertise)", () => {
    expect(skillModifier(14, true, false, 5)).toBe(5);
    expect(skillModifier(14, true, true, 5)).toBe(8);
    expect(skillModifier(14, false, false, 5)).toBe(2);
  });

  it("percezione passiva è 10 + il bonus della prova di Percezione", () => {
    expect(passivePerception(14, false, false, 1)).toBe(12);
    expect(passivePerception(14, true, false, 1)).toBe(14);
  });
});

describe("spellSaveDC / spellAttackBonus", () => {
  it("CD = 8 + competenza + mod. caratteristica", () => {
    expect(spellSaveDC(5, 16)).toBe(8 + 3 + 3);
  });

  it("bonus attacco = competenza + mod. caratteristica", () => {
    expect(spellAttackBonus(5, 16)).toBe(3 + 3);
  });
});

describe("totalLevel / multiclasse", () => {
  it("somma i livelli di tutte le classi", () => {
    expect(
      totalLevel([
        { nome: "Guerriero", livello: 3 },
        { nome: "Mago", livello: 2 },
      ]),
    ).toBe(5);
  });

  it("livello incantatore multiclasse: full=intero, mezzo=metà per difetto, artefice=metà per eccesso", () => {
    expect(
      multiclassCasterLevel([
        { nome: "Mago", livello: 3 },
        { nome: "Paladino", livello: 3 },
      ]),
    ).toBe(3 + 1);
    expect(multiclassCasterLevel([{ nome: "Artefice", livello: 3 }])).toBe(2);
  });

  it("il Warlock non entra nel livello incantatore multiclasse, ha il suo pool", () => {
    expect(
      multiclassCasterLevel([
        { nome: "Warlock", livello: 5 },
        { nome: "Mago", livello: 2 },
      ]),
    ).toBe(2);
    expect(warlockLevel([{ nome: "Warlock", livello: 5 }])).toBe(5);
  });

  it("canonicalClassName riconosce i nomi italiani e lascia stare il resto", () => {
    expect(canonicalClassName("mago")).toBe("Wizard");
    expect(canonicalClassName("Stregone")).toBe("Sorcerer");
    expect(canonicalClassName("Wizard")).toBe("Wizard");
  });

  it("primaryCastingAbility sceglie la classe incantatrice di livello più alto", () => {
    expect(
      primaryCastingAbility([
        { nome: "Mago", livello: 2 },
        { nome: "Chierico", livello: 5 },
      ]),
    ).toBe("saggezza");
    expect(primaryCastingAbility([{ nome: "Guerriero", livello: 5 }])).toBeNull();
  });
});

describe("slot incantesimo / patto magico", () => {
  it("nessuno slot senza livelli da incantatore", () => {
    expect(spellSlotsForCasterLevel(0)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("al livello incantatore 1 ci sono solo 2 slot di 1° livello", () => {
    expect(spellSlotsForCasterLevel(1)[0]).toBe(2);
  });

  it("patto magico: nessuno slot al livello 0", () => {
    expect(pactMagicForLevel(0)).toEqual({ slotLevel: 0, slots: 0 });
  });

  it("patto magico al 1° livello Warlock: 1 slot di 1° livello", () => {
    expect(pactMagicForLevel(1)).toEqual({ slotLevel: 1, slots: 1 });
  });
});

describe("armi", () => {
  it("finezza usa il migliore tra Forza e Destrezza", () => {
    const scores = {
      forza: 8,
      destrezza: 16,
      costituzione: 10,
      intelligenza: 10,
      saggezza: 10,
      carisma: 10,
    };
    expect(weaponAbilityModifier("finezza", scores)).toBe(abilityModifier(16));
    expect(weaponAbilityModifier("forza", scores)).toBe(abilityModifier(8));
  });

  it("bonus attacco combina caratteristica + competenza + bonus extra", () => {
    const scores = {
      forza: 16,
      destrezza: 10,
      costituzione: 10,
      intelligenza: 10,
      saggezza: 10,
      carisma: 10,
    };
    expect(weaponAttackBonus("forza", scores, true, 5, 1)).toBe(3 + 3 + 1);
    expect(weaponAttackBonus("forza", scores, false, 5, 1)).toBe(3 + 0 + 1);
  });
});

describe("punti ferita", () => {
  it("livello 1: dado vita massimizzato + mod. Costituzione", () => {
    expect(calculateHitPoints(10, 1, 2)).toBe(12);
  });

  it("livelli successivi usano la media arrotondata per eccesso", () => {
    expect(calculateHitPoints(10, 2, 2)).toBe(12 + (6 + 2));
  });

  it("mai sotto 1 PF anche con mod. Costituzione molto negativo", () => {
    expect(calculateHitPoints(6, 1, -5)).toBe(1);
  });

  it("multiclasse: solo la prima classe scelta massimizza il livello 1", () => {
    const total = calculateMulticlassHitPoints(
      [
        { hitDieFaces: 10, livello: 2 },
        { hitDieFaces: 8, livello: 1 },
      ],
      2,
    );
    // Guerriero: 10+2 al liv.1, poi (6+2) al liv.2; Mago: (5+2) al liv.1 del multiclasse
    expect(total).toBe(12 + 8 + 7);
  });
});

describe("xp e livello", () => {
  it("levelForXp trova il livello più alto raggiunto", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(299)).toBe(1);
    expect(levelForXp(300)).toBe(2);
    expect(levelForXp(355000)).toBe(20);
  });

  it("xpForNextLevel è null al livello massimo", () => {
    expect(xpForNextLevel(20)).toBeNull();
    expect(xpForNextLevel(1)).toBe(300);
  });
});

describe("carryingCapacityKg", () => {
  it("Forza * 7.5 arrotondato", () => {
    expect(carryingCapacityKg(10)).toBe(75);
    expect(carryingCapacityKg(15)).toBe(113);
  });
});

describe("applyLongRest", () => {
  it("ripristina i PF al massimo", () => {
    const character = makeCharacter({ hpMax: 30, hpAttuali: 5 });
    expect(applyLongRest(character).hpAttuali).toBe(30);
  });

  // RAW: i PF temporanei scadono con un riposo lungo e l'esaurimento scende di UN livello.
  // Mancavano entrambi, e il contatore Affaticamento sta proprio accanto al bottone del riposo.
  it("azzera i PF temporanei e toglie un livello di affaticamento", () => {
    const character = makeCharacter({ hpTemporanei: 7, affaticamento: 3 });
    const dopo = applyLongRest(character);
    expect(dopo.hpTemporanei).toBe(0);
    expect(dopo.affaticamento).toBe(2);
  });

  it("non porta l'affaticamento sotto zero", () => {
    expect(applyLongRest(makeCharacter({ affaticamento: 0 })).affaticamento).toBe(0);
  });

  it("recupera metà dei dadi vita totali arrotondato per eccesso, senza andare sotto 0", () => {
    // livello totale 4 -> ceil(4/2) = 2 dadi vita recuperati
    const character = makeCharacter({ classi: [{ nome: "Guerriero", livello: 4 }], dadiVitaUsati: 3 });
    expect(applyLongRest(character).dadiVitaUsati).toBe(1);

    const fewUsed = makeCharacter({ classi: [{ nome: "Guerriero", livello: 4 }], dadiVitaUsati: 1 });
    expect(applyLongRest(fewUsed).dadiVitaUsati).toBe(0);
  });

  it("azzera tutti gli slot incantesimo e gli slot patto magico", () => {
    const character = makeCharacter({
      slotUsati: [1, 2, 0, 0, 0, 0, 0, 0, 0],
      slotPattoUsati: 2,
    });
    const rested = applyLongRest(character);
    expect(rested.slotUsati).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(rested.slotPattoUsati).toBe(0);
  });

  it("azzera i tiri salvezza contro la morte", () => {
    const character = makeCharacter({ tiriMorteSuccessi: 2, tiriMorteFallimenti: 1 });
    const rested = applyLongRest(character);
    expect(rested.tiriMorteSuccessi).toBe(0);
    expect(rested.tiriMorteFallimenti).toBe(0);
  });

  it("ripristina TUTTI i privilegi a usi limitati, qualunque sia il tipo di recupero", () => {
    const character = makeCharacter({
      privilegiLimitati: [
        { id: "1", nome: "Rabbia", usiMax: 3, usiUsati: 2, recupero: "riposoLungo" },
        { id: "2", nome: "Canalizzare Divinità", usiMax: 1, usiUsati: 1, recupero: "riposoBreve" },
        { id: "3", nome: "Privilegio dell'Alba", usiMax: 1, usiUsati: 1, recupero: "alba" },
      ],
    });
    const rested = applyLongRest(character);
    expect(rested.privilegiLimitati.every((f) => f.usiUsati === 0)).toBe(true);
  });

  it("non muta l'oggetto originale (funzione pura)", () => {
    const character = makeCharacter({ hpMax: 30, hpAttuali: 5 });
    applyLongRest(character);
    expect(character.hpAttuali).toBe(5);
  });
});

describe("applyShortRest", () => {
  it("azzera solo gli slot Patto Magico, non gli slot incantesimo normali", () => {
    const character = makeCharacter({
      slotUsati: [1, 2, 0, 0, 0, 0, 0, 0, 0],
      slotPattoUsati: 2,
    });
    const rested = applyShortRest(character);
    expect(rested.slotPattoUsati).toBe(0);
    expect(rested.slotUsati).toEqual([1, 2, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("NON ripristina i PF (richiedono di spendere Dadi Vita manualmente)", () => {
    const character = makeCharacter({ hpMax: 30, hpAttuali: 5 });
    expect(applyShortRest(character).hpAttuali).toBe(5);
  });

  it("ripristina solo i privilegi con recupero 'riposoBreve', lascia stare gli altri", () => {
    const character = makeCharacter({
      privilegiLimitati: [
        { id: "1", nome: "Rabbia", usiMax: 3, usiUsati: 2, recupero: "riposoLungo" },
        { id: "2", nome: "Canalizzare Divinità", usiMax: 1, usiUsati: 1, recupero: "riposoBreve" },
        { id: "3", nome: "Privilegio dell'Alba", usiMax: 1, usiUsati: 1, recupero: "alba" },
      ],
    });
    const rested = applyShortRest(character);
    expect(rested.privilegiLimitati.find((f) => f.id === "1")?.usiUsati).toBe(2);
    expect(rested.privilegiLimitati.find((f) => f.id === "2")?.usiUsati).toBe(0);
    expect(rested.privilegiLimitati.find((f) => f.id === "3")?.usiUsati).toBe(1);
  });

  it("non muta l'oggetto originale (funzione pura)", () => {
    const character = makeCharacter({ slotPattoUsati: 2 });
    applyShortRest(character);
    expect(character.slotPattoUsati).toBe(2);
  });
});

describe("schema: nuovi campi con default retrocompatibili", () => {
  it("knownSpellSchema: dadoDanno di default è stringa vuota", () => {
    const spell = knownSpellSchema.parse({ id: "1", nome: "Palla di Fuoco" });
    expect(spell.dadoDanno).toBe("");
  });

  it("limitedFeatureSchema: usiUsati e recupero hanno default sensati", () => {
    const feature = limitedFeatureSchema.parse({ id: "1", nome: "Rabbia", usiMax: 3 });
    expect(feature.usiUsati).toBe(0);
    expect(feature.recupero).toBe("riposoLungo");
  });

  it("characterSchema: trsBonus e abilitaBonus di default sono oggetti vuoti", () => {
    const character = characterSchema.parse({ ...newCharacter(), nome: "Test" });
    expect(character.trsBonus).toEqual({});
    expect(character.abilitaBonus).toEqual({});
  });

  it("characterSchema: i bonus per riga vengono letti correttamente quando presenti", () => {
    const raw = {
      ...newCharacter(),
      nome: "Test",
      trsBonus: { costituzione: 1 },
      abilitaBonus: { percezione: 2 },
    };
    const character = characterSchema.parse(raw);
    expect(character.trsBonus.costituzione).toBe(1);
    expect(character.abilitaBonus.percezione).toBe(2);
  });

  it("migra i vecchi personaggi con 'oggettiArmonizzati' (string[]) a 'oggettiMagici'", () => {
    const legacyRaw = { ...newCharacter(), nome: "Test" } as Record<string, unknown>;
    delete legacyRaw.oggettiMagici;
    legacyRaw.oggettiArmonizzati = ["Manto della Protezione", "Anello di Protezione"];
    const character = characterSchema.parse(legacyRaw);
    expect(character.oggettiMagici).toHaveLength(2);
    expect(character.oggettiMagici.map((o) => o.nome)).toEqual([
      "Manto della Protezione",
      "Anello di Protezione",
    ]);
    expect(character.oggettiMagici.every((o) => o.armonizzato)).toBe(true);
  });
});

// Il wizard di level-up usava la sola progressione generica [4,8,12,16,19]: per Guerriero e Ladro
// saltava il riquadro "ottieni un Aumento di Caratteristica" ai loro livelli extra, e il giocatore
// si ritrovava con un aumento (o un talento) mai assegnato.
describe("isAsiLevelFor", () => {
  it("riconosce la progressione standard per una classe qualunque", () => {
    for (const livello of [4, 8, 12, 16, 19]) {
      expect(isAsiLevelFor("Mago", livello)).toBe(true);
    }
  });

  it("non segnala livelli che non danno alcun aumento", () => {
    for (const livello of [1, 2, 3, 5, 6, 7, 9, 10, 11, 20]) {
      expect(isAsiLevelFor("Mago", livello)).toBe(false);
    }
  });

  it("aggiunge il 6° e il 14° al Guerriero, il 10° al Ladro", () => {
    expect(isAsiLevelFor("Guerriero", 6)).toBe(true);
    expect(isAsiLevelFor("Guerriero", 14)).toBe(true);
    expect(isAsiLevelFor("Guerriero", 10)).toBe(false);
    expect(isAsiLevelFor("Ladro", 10)).toBe(true);
    expect(isAsiLevelFor("Ladro", 6)).toBe(false);
  });

  it("funziona anche col nome inglese della classe", () => {
    expect(isAsiLevelFor("Fighter", 6)).toBe(true);
    expect(isAsiLevelFor("rogue", 10)).toBe(true);
  });
});
