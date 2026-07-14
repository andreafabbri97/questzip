"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { compendioItaIncantesimi, compendioItaMostri, compendioItaRazze } from "@/lib/db/schema";

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
