// Carica gli incantesimi/mostri già estratti e validati (parsed/*.json) nel database Neon.
// Idempotente: cancella prima le righe con la stessa fonte, così si può rilanciare in sicurezza.
//
// Uso: node --env-file=../../.env.local seed.mjs

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import {
  compendioItaClassi,
  compendioItaIncantesimi,
  compendioItaMostri,
  compendioItaOggetti,
  compendioItaRazze,
  compendioItaRegole,
  compendioItaTalenti,
} from "../../lib/db/schema.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PARSED_DIR = path.join(SCRIPT_DIR, "parsed");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL non impostato. Uso: node --env-file=../../.env.local seed.mjs");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

async function seedIncantesimi(bookKey) {
  const filePath = path.join(PARSED_DIR, `${bookKey}-incantesimi.json`);
  const spells = JSON.parse(readFileSync(filePath, "utf-8"));

  await db.delete(compendioItaIncantesimi).where(eq(compendioItaIncantesimi.fonte, bookKey));
  for (const s of spells) {
    await db.insert(compendioItaIncantesimi).values({
      nome: s.nome,
      livello: s.livello,
      scuola: s.scuola,
      rituale: s.rituale,
      tempoDiLancio: s.tempoDiLancio,
      gittata: s.gittata,
      componenti: s.componenti,
      durata: s.durata,
      descrizione: s.descrizione,
      fonte: s.fonte,
    });
  }
  console.log(`${spells.length} incantesimi caricati da ${bookKey}.`);
}

// scarta i rari falsi positivi residui (frasi narrative scambiate per un nome di mostro):
// un vero nome comincia sempre con una lettera maiuscola e non è mai una frase con un punto
function isPlausibleMonsterName(nome) {
  return /^[A-ZÀ-Þ]/.test(nome) && !nome.includes(".") && nome.length <= 60;
}

async function seedMostri(bookKey) {
  const filePath = path.join(PARSED_DIR, `${bookKey}-mostri.json`);
  const all = JSON.parse(readFileSync(filePath, "utf-8"));
  // qualità per voce, non per libro intero: nome plausibile, dati numerici completi
  // (non "sospetti"), e nessuna discrepanza trovata nell'incrocio con l'inglese quando c'è
  // stato un confronto — un'entry senza confronto disponibile ma con dati completi passa comunque
  const monsters = all.filter(
    (m) => isPlausibleMonsterName(m.nome) && !m.numericSuspect && m.crossCheck?.status !== "discrepanza",
  );
  if (monsters.length < all.length) {
    console.log(`${bookKey}: ${all.length - monsters.length}/${all.length} voci scartate (nome non plausibile, dati incompleti o discrepanza con l'inglese).`);
  }

  await db.delete(compendioItaMostri).where(eq(compendioItaMostri.fonte, bookKey));
  for (const m of monsters) {
    await db.insert(compendioItaMostri).values({
      nome: m.nome,
      tipo: m.tipo,
      taglia: m.taglia,
      allineamento: m.allineamento,
      classeArmatura: m.classeArmatura,
      puntiFerita: m.puntiFerita,
      velocita: m.velocita,
      caratteristiche: m.caratteristiche,
      tiriSalvezza: m.tiriSalvezza,
      abilita: m.abilita,
      vulnerabilitaDanni: m.vulnerabilitaDanni,
      resistenzaDanni: m.resistenzaDanni,
      immunitaDanni: m.immunitaDanni,
      immunitaCondizioni: m.immunitaCondizioni,
      sensi: m.sensi,
      linguaggi: m.linguaggi,
      sfida: m.sfida,
      pe: m.pe,
      tratti: m.tratti,
      azioni: m.azioni,
      azioniLeggendarie: m.azioniLeggendarie,
      reazioni: m.reazioni,
      numericSuspect: m.numericSuspect,
      fonte: m.fonte,
    });
  }
  console.log(`${monsters.length} mostri caricati da ${bookKey}.`);
}

async function seedRazze(bookKey) {
  const filePath = path.join(PARSED_DIR, `${bookKey}-razze.json`);
  const races = JSON.parse(readFileSync(filePath, "utf-8"));

  await db.delete(compendioItaRazze).where(eq(compendioItaRazze.fonte, bookKey));
  for (const r of races) {
    await db.insert(compendioItaRazze).values({
      nome: r.nome,
      introduzione: r.introduzione,
      tratti: r.tratti,
      sottorazze: r.sottorazze,
      fonte: r.fonte,
    });
  }
  console.log(`${races.length} razze caricate da ${bookKey}.`);
}

async function seedClassi(bookKey) {
  const filePath = path.join(PARSED_DIR, `${bookKey}-classi-merged.json`);
  const classes = JSON.parse(readFileSync(filePath, "utf-8"));

  await db.delete(compendioItaClassi).where(eq(compendioItaClassi.fonte, bookKey));
  for (const c of classes) {
    await db.insert(compendioItaClassi).values({
      nome: c.nome,
      dadoVita: c.dadoVita,
      puntiFerita1Livello: c.puntiFerita1Livello,
      puntiFeritaSuccessivi: c.puntiFeritaSuccessivi,
      armature: c.armature,
      armi: c.armi,
      strumenti: c.strumenti,
      tiriSalvezza: c.tiriSalvezza,
      abilita: c.abilita,
      equipaggiamento: c.equipaggiamento,
      tabellaLivelli: c.tabellaLivelli,
      fonte: c.fonte,
    });
  }
  console.log(`${classes.length} classi caricate da ${bookKey}.`);
}

async function seedRegole(bookKey) {
  const filePath = path.join(PARSED_DIR, `${bookKey}-regole.json`);
  const sections = JSON.parse(readFileSync(filePath, "utf-8"));

  await db.delete(compendioItaRegole).where(eq(compendioItaRegole.fonte, bookKey));
  for (const s of sections) {
    await db.insert(compendioItaRegole).values({
      titolo: s.titolo,
      testo: s.testo,
      pagina: s.pagina,
      fonte: s.fonte,
    });
  }
  console.log(`${sections.length} sezioni di regole caricate da ${bookKey}.`);
}

async function seedOggetti(bookKey) {
  const filePath = path.join(PARSED_DIR, `${bookKey}-oggetti.json`);
  const items = JSON.parse(readFileSync(filePath, "utf-8"));

  await db.delete(compendioItaOggetti).where(eq(compendioItaOggetti.fonte, bookKey));
  for (const i of items) {
    await db.insert(compendioItaOggetti).values({
      nome: i.nome,
      categoria: i.categoria,
      rarita: i.rarita,
      sintonia: i.sintonia,
      descrizione: i.descrizione,
      fonte: i.fonte,
    });
  }
  console.log(`${items.length} oggetti magici caricati da ${bookKey}.`);
}

async function seedTalenti(bookKey) {
  const filePath = path.join(PARSED_DIR, `${bookKey}-talenti.json`);
  const feats = JSON.parse(readFileSync(filePath, "utf-8"));

  await db.delete(compendioItaTalenti).where(eq(compendioItaTalenti.fonte, bookKey));
  for (const f of feats) {
    await db.insert(compendioItaTalenti).values({
      nome: f.nome,
      prerequisito: f.prerequisito,
      descrizione: f.descrizione,
      fonte: f.fonte,
    });
  }
  console.log(`${feats.length} talenti caricati da ${bookKey}.`);
}

async function main() {
  await seedIncantesimi("phb");
  await seedIncantesimi("tasha");
  await seedIncantesimi("xanathar");
  for (const book of ["mm", "multiverso", "fizban", "bigby", "dragonlance", "ravenloft"]) {
    await seedMostri(book);
  }
  await seedRazze("phb");
  await seedClassi("phb");
  for (const book of ["regole_base", "costa_spada", "oggetti_magici"]) {
    await seedRegole(book);
  }
  await seedOggetti("oggetti_magici");
  await seedTalenti("phb");
  console.log("Fatto.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
