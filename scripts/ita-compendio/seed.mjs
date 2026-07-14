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
  compendioItaIncantesimi,
  compendioItaMostri,
  compendioItaRazze,
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

async function main() {
  await seedIncantesimi("phb");
  await seedIncantesimi("tasha");
  await seedIncantesimi("xanathar");
  for (const book of ["mm", "multiverso", "fizban", "bigby", "dragonlance", "ravenloft"]) {
    await seedMostri(book);
  }
  await seedRazze("phb");
  console.log("Fatto.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
