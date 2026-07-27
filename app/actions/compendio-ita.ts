"use server";

import { ne } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  compendioItaClassi,
  compendioItaIncantesimi,
  compendioItaMostri,
  compendioItaOggetti,
  compendioItaRazze,
  compendioItaRegole,
  compendioItaTalenti,
} from "@/lib/db/schema";

async function requireAuth() {
  const session = await auth();
  if (!session?.user) throw new Error("Devi accedere per continuare.");
}

export async function getIncantesimiIta() {
  await requireAuth();
  return db.select().from(compendioItaIncantesimi);
}

export async function getMostriIta() {
  await requireAuth();
  return db.select().from(compendioItaMostri);
}

export async function getRazzeIta() {
  await requireAuth();
  return db.select().from(compendioItaRazze);
}

export async function getClassiIta() {
  await requireAuth();
  return db.select().from(compendioItaClassi);
}

export async function getRegoleIta() {
  await requireAuth();
  // "oggetti_magici" era OCR di 8 pagine di flavor text inglese di qualità troppo bassa per
  // essere utile (screenshot di un lettore, non una scansione vera) — il catalogo oggetti magici
  // vero vive già pulito nel tab Oggetti magici, questa fonte era solo rumore.
  return db.select().from(compendioItaRegole).where(ne(compendioItaRegole.fonte, "oggetti_magici"));
}

export async function getOggettiIta() {
  await requireAuth();
  return db.select().from(compendioItaOggetti);
}

export async function getTalentiIta() {
  await requireAuth();
  return db.select().from(compendioItaTalenti);
}
