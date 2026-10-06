import {
  loadClassData,
  loadRaces,
  resolveClassFeatures,
  resolveSubclassFeatures,
} from "@/lib/fivetools/data";
// Dalle azioni del server e da un file puro, non dal componente del Compendio: quello si porta
// dietro database e autenticazione, che qui non servono a niente.
import { getRazzeIta, getTraduzioneIa } from "@/app/actions/compendio-ita";
import { parseIaClassText, parseIaRaceText } from "@/lib/fivetools/testo-ia";
import { trovaRazza } from "@/lib/fivetools/trova-razza";
import { abbinaPrivilegiTradotti } from "@/lib/privilegi-per-livello";
import { canonicalClassName, type Character } from "@/lib/dnd";

/** Una riga dell'elenco "privilegi e tratti" di un personaggio. */
export type PrivilegioScheda = {
  /** Nome da leggere: italiano quando il manuale o la cache lo hanno, altrimenti l'originale. */
  nome: string;
  /** Livello a cui arriva — assente per i tratti di razza, che si hanno dall'inizio. */
  livello?: number;
  origine: "classe" | "sottoclasse" | "razza";
  /** Da quale classe, quando il personaggio ne ha più di una. */
  classe?: string;
};

/**
 * I privilegi che un personaggio ha davvero: classe, sottoclasse e razza.
 *
 * Non sono dati della scheda — vivono nel Compendio e la scheda li mostra caricandoli al momento.
 * Finché è rimasto così, l'esportazione in PDF non poteva stamparli e la colonna "Privilegi di
 * classe e tratti" usciva vuota, con le sole righe da riempire a penna (segnalato dall'utente).
 * Qui si fa lo stesso lavoro della scheda, ma in una funzione sola che può chiamare anche chi
 * genera il PDF.
 *
 * Restano fuori i privilegi OPZIONALI (le regole varianti di Tasha's): nessuno li ha per il solo
 * fatto di essere salito di livello, e stamparli sulla scheda di qualcuno vorrebbe dire attribuirgli
 * capacità che non ha.
 */
export async function caricaPrivilegiScheda(character: Character): Promise<PrivilegioScheda[]> {
  const [daClassi, daRazza] = await Promise.all([
    privilegiDiClasse(character),
    trattiDiRazza(character.razza),
  ]);
  return [...daClassi, ...daRazza];
}

/**
 * Voci che nei dati esistono solo per rimandare altrove ("Divine Domain feature", "Monastic
 * Tradition feature"): sulla pagina del manuale sono una riga che dice "vedi la tua sottoclasse",
 * e il privilegio vero è già nell'elenco, portato dalla sottoclasse. In scheda sarebbero una riga
 * che non dice niente.
 *
 * Si scartano DOPO aver abbinato i nomi italiani, mai prima: l'abbinamento funziona confrontando
 * quanti privilegi ci sono a ciascun livello, e togliere una voce prima farebbe scivolare i nomi
 * su quelli sbagliati (vedi abbinaPrivilegiTradotti).
 */
function eUnRimando(nome: string): boolean {
  return /\sfeature$/i.test(nome.trim());
}

/** Nome italiano per ciascun privilegio, quando il testo del manuale lo permette. */
function nomiTradotti(
  privilegi: { name: string; level: number }[],
  descrizioneIta: string | null | undefined,
): (string | null)[] {
  const tradotti = descrizioneIta ? parseIaClassText(descrizioneIta) : [];
  return abbinaPrivilegiTradotti(privilegi, tradotti).map((t) => t?.name ?? null);
}

async function privilegiDiClasse(character: Character): Promise<PrivilegioScheda[]> {
  const data = await loadClassData();
  const risultato: PrivilegioScheda[] = [];
  const piuDiUna = character.classi.filter((c) => c.nome.trim()).length > 1;

  for (const entry of character.classi) {
    const nomeClasse = canonicalClassName(entry.nome).toLowerCase();
    const cls = data.classes.find((c) => c.name.toLowerCase() === nomeClasse);
    if (!cls) continue;

    // Tutti, opzionali compresi: il testo italiano è stato prodotto da questo stesso elenco e
    // li contiene nello stesso ordine, quindi toglierli adesso farebbe fallire l'abbinamento dei
    // nomi per quel livello. Si scartano subito dopo, quando i nomi sono già assegnati.
    const diClasse = resolveClassFeatures(data, cls).filter((f) => f.level <= entry.livello);
    // La riga di traduzione è indicizzata col nome INGLESE della classe: cercarla con quello
    // scritto in scheda ("Monaco") non trova niente.
    const iaClasse = await getTraduzioneIa("classi", cls.name, cls.source).catch(() => null);
    const nomiClasse = nomiTradotti(diClasse, iaClasse?.descrizioneIta);
    diClasse.forEach((f, i) => {
      // Gli opzionali (regole varianti di Tasha's) non si hanno per il solo fatto di essere
      // saliti di livello: si scelgono, e stamparli vorrebbe dire attribuire a qualcuno capacità
      // che non ha.
      if (f.isClassFeatureVariant === true) return;
      // Il controllo è sul nome ORIGINALE: una volta tradotto, "Divine Domain feature" diventa
      // "Privilegio del Dominio Divino" e non si riconosce più.
      if (eUnRimando(f.name)) return;
      risultato.push({
        nome: nomiClasse[i] ?? f.name,
        livello: f.level,
        origine: "classe",
        classe: piuDiUna ? entry.nome : undefined,
      });
    });

    const nomeSottoclasse = entry.sottoclasse?.trim();
    if (!nomeSottoclasse) continue;
    const subclass = data.subclasses.find(
      (s) => s.name === nomeSottoclasse && s.className.toLowerCase() === nomeClasse,
    );
    if (!subclass) continue;
    const diSottoclasse = resolveSubclassFeatures(data, subclass).filter(
      (f) => f.level <= entry.livello,
    );
    const iaSottoclasse = await getTraduzioneIa("classi", subclass.name, subclass.source).catch(
      () => null,
    );
    const nomiSottoclasse = nomiTradotti(diSottoclasse, iaSottoclasse?.descrizioneIta);
    diSottoclasse.forEach((f, i) => {
      risultato.push({
        nome: nomiSottoclasse[i] ?? f.name,
        livello: f.level,
        origine: "sottoclasse",
        classe: piuDiUna ? entry.nome : undefined,
      });
    });
  }

  return risultato.sort((a, b) => (a.livello ?? 0) - (b.livello ?? 0));
}

async function trattiDiRazza(razza: string): Promise<PrivilegioScheda[]> {
  if (!razza.trim()) return [];
  const [races, itaRazze] = await Promise.all([
    loadRaces(),
    getRazzeIta().catch(() => [] as Awaited<ReturnType<typeof getRazzeIta>>),
  ]);
  const race = trovaRazza(races, itaRazze, razza);
  if (!race) return [];

  // Prima il testo del manuale (collegato per nome e fonte inglesi), poi la cache tradotta, e solo
  // alla fine i nomi inglesi dei dati grezzi: stessa scala di qualità della scheda.
  const ufficiale = itaRazze.find(
    (r) => r.nomeInglese === race.name && r.fonteInglese === race.source,
  );
  const nomi: string[] = [];

  if (ufficiale) {
    for (const tratto of ufficiale.tratti) nomi.push(tratto.nome);
    for (const sottorazza of ufficiale.sottorazze) {
      for (const tratto of sottorazza.tratti) nomi.push(`${tratto.nome} (${sottorazza.nome})`);
    }
  } else {
    const ia = await getTraduzioneIa("razze", race.name, race.source).catch(() => null);
    if (ia?.descrizioneIta) {
      for (const tratto of parseIaRaceText(ia.descrizioneIta)) nomi.push(tratto.name);
    } else {
      // 5etools non valida i propri dati: certe razze arrivano senza "entries" nonostante il tipo.
      for (const entry of race.entries ?? []) {
        if (typeof entry !== "string" && entry.name) nomi.push(entry.name);
      }
    }
  }

  return nomi.map((nome) => ({ nome, origine: "razza" as const }));
}
