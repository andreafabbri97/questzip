// Dice all'app che le tabelle del Compendio sono cambiate.
//
// Le letture del Compendio sono in cache a tempo indeterminato (app/actions/compendio-ita.ts):
// quel contenuto non scade da sé, cambia solo quando lo riscriviamo noi con questi script. Va
// quindi svuotata a mano, ed è l'ultimo passo di ogni aggiornamento — saltarlo significa lasciare
// l'app sulla versione precedente senza nessun segnale.
//
// Uso: node --env-file=../../.env.local invalida-cache.mjs [url]
//   url predefinito: quello di produzione in COMPENDIO_URL, altrimenti http://localhost:3000
const secret = process.env.COMPENDIO_REVALIDATE_SECRET;
if (!secret) {
  console.error(
    "COMPENDIO_REVALIDATE_SECRET non impostato: va aggiunto a .env.local e alle variabili del progetto su Vercel (lo stesso valore).",
  );
  process.exit(1);
}

const base = process.argv[2] ?? process.env.COMPENDIO_URL ?? "http://localhost:3000";
const risposta = await fetch(new URL("/api/compendio/invalida", base), {
  method: "POST",
  headers: { "x-compendio-secret": secret },
});

if (!risposta.ok) {
  console.error(`Invalidazione fallita: HTTP ${risposta.status} — ${await risposta.text()}`);
  process.exit(1);
}
console.log(`Cache del Compendio svuotata su ${base}: la prossima apertura rilegge dal database.`);
