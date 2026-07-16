// Generatore di nomi casuali per PNG al volo, per le razze principali del PHB. Combina sillabe
// prefisso+suffisso (elenchi scritti a mano seguendo le convenzioni fonetiche tipiche di ogni
// razza in D&D, non un dataset copiato da nessuna fonte esterna) invece di un elenco fisso di
// nomi: garantisce varietà senza dover mantenere centinaia di nomi pronti.

interface NamePartset {
  prefissi: string[];
  suffissi: string[];
}

interface RaceNames {
  maschili: NamePartset;
  femminili: NamePartset;
  cognomi?: string[];
}

export const NAME_RACES = [
  "Umano",
  "Nanico",
  "Elfico",
  "Halfling",
  "Gnomesco",
  "Mezzorco",
  "Draconico",
  "Tiefling",
] as const;

export type NameRace = (typeof NAME_RACES)[number];

const RACE_NAMES: Record<NameRace, RaceNames> = {
  Umano: {
    maschili: {
      prefissi: ["Ad", "Bran", "Cor", "Dor", "Ed", "Gar", "Hal", "Ian", "Ker", "Mar", "Ren", "Wil"],
      suffissi: ["ard", "ic", "in", "olfo", "on", "rick", "ston", "win", "wyn", "as"],
    },
    femminili: {
      prefissi: ["Al", "Bri", "Cel", "El", "Fio", "Gio", "Isa", "Lia", "Mar", "Ros", "Ser", "Val"],
      suffissi: ["a", "ana", "ella", "etta", "ia", "inda", "issa", "olina", "wen"],
    },
    cognomi: [
      "Ashford", "Blackwood", "Corvin", "Dellarte", "Fenwick", "Grimaldi", "Hawke", "Marchetti",
      "Norwood", "Ravenscroft", "Stanton", "Vance",
    ],
  },
  Nanico: {
    maschili: {
      prefissi: ["Bal", "Dor", "Gim", "Kaz", "Mor", "Thra", "Ulf", "Vor"],
      suffissi: ["gard", "grim", "in", "ok", "rik", "thok", "unn"],
    },
    femminili: {
      prefissi: ["Bri", "Dis", "Hel", "Kath", "Nor", "Tor", "Vess"],
      suffissi: ["a", "gard", "hild", "issa", "runa"],
    },
    cognomi: [
      "Barbaferrea", "Cuorditopazio", "Forgiacupa", "Martellopesante", "Occhiogrigio",
      "Piccafredda", "Scudorotto", "Venapietra",
    ],
  },
  Elfico: {
    maschili: {
      prefissi: ["Aer", "Cael", "El", "Fen", "Ith", "Lae", "Syl", "Thal"],
      suffissi: ["adan", "aris", "endil", "iel", "orn", "wyn", "ith"],
    },
    femminili: {
      prefissi: ["Aer", "Cael", "El", "Ily", "Lae", "Syl", "Thess", "Vaen"],
      suffissi: ["adriel", "andra", "ith", "ora", "wen", "ysse"],
    },
  },
  Halfling: {
    maschili: {
      prefissi: ["Ber", "Cor", "Fos", "Ham", "Mil", "Pip", "Tob", "Wil"],
      suffissi: ["in", "o", "old", "on", "us"],
    },
    femminili: {
      prefissi: ["Bel", "Do", "Lav", "Mer", "Poppy", "Ros", "Tilly"],
      suffissi: ["a", "etta", "ie", "inda"],
    },
    cognomi: ["Piedistretti", "Sottocolle", "Buonvino", "Tascaprofonda", "Passofelice", "Radicaverde"],
  },
  Gnomesco: {
    maschili: {
      prefissi: ["Bib", "Fon", "Nim", "Ob", "Pog", "Wren", "Zan"],
      suffissi: ["bo", "dee", "ick", "lo", "nick", "wick"],
    },
    femminili: {
      prefissi: ["Bree", "Cai", "Lil", "Nix", "Shim", "Wil"],
      suffissi: ["a", "ette", "ie", "la"],
    },
  },
  Mezzorco: {
    maschili: {
      prefissi: ["Grosh", "Karg", "Mog", "Thok", "Ugra", "Zan"],
      suffissi: ["ak", "gore", "nak", "og", "ubash"],
    },
    femminili: {
      prefissi: ["Grum", "Nag", "Sha", "Vok", "Yev"],
      suffissi: ["a", "esh", "ka", "sha"],
    },
  },
  Draconico: {
    maschili: {
      prefissi: ["Arjh", "Balas", "Bhar", "Kris", "Med", "Nadar", "Torin"],
      suffissi: ["an", "ax", "esh", "in", "orn"],
    },
    femminili: {
      prefissi: ["Akra", "Bir", "Fars", "Perna", "Sur", "Thava"],
      suffissi: ["a", "essa", "ith", "raa"],
    },
  },
  Tiefling: {
    maschili: {
      prefissi: ["Akmen", "Amn", "Barak", "Ekem", "Iado", "Mordai", "Zek"],
      suffissi: ["as", "iel", "on", "os", "us"],
    },
    femminili: {
      prefissi: ["Bryse", "Damai", "Kael", "Lira", "Ori", "Rieta"],
      suffissi: ["a", "eth", "is", "ka"],
    },
  },
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateName(race: NameRace, gender: "maschile" | "femminile"): string {
  const data = RACE_NAMES[race];
  const parts = gender === "maschile" ? data.maschili : data.femminili;
  const given = pick(parts.prefissi) + pick(parts.suffissi);
  const surname = data.cognomi ? ` ${pick(data.cognomi)}` : "";
  return given + surname;
}
