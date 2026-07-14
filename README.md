# 🎲 QuestZip

Gestore di campagne **D&D 5e** per master e giocatori. PWA installabile su telefono, pensata per essere usata al tavolo.

## Funzionalità (v0.1)

- **🎲 Tira dadi** — da d4 a d100, quantità multiple, modificatori, vantaggio/svantaggio sul d20, cronologia dei tiri, critici e fallimenti evidenziati.
- **🛡️ Personaggi** — razza/classe con autocompletamento dal Compendio, multiclasse (più classi, con sottoclasse e descrizione "come funziona" per ciascuna), generatore caratteristiche (manuale, array standard, acquisto punti, tiro dadi), calcolatore PF multiclasse (1° livello della classe di origine massimizzato, il resto in media), punti ferita (contatore rapido +/−), CA, velocità, bonus di competenza, note libere. Se sei loggato puoi portare il personaggio in una campagna condivisa (snapshot aggiornabile a mano, non sync live).
- **🗺️ Campagne** — condivise: accedi con Google, crea una campagna (diventi master), invita amici con un link/codice, assegna il ruolo master/giocatore a ciascun membro, diario delle sessioni condiviso, party con le schede dei personaggi di tutti i membri. Dati su database (Postgres/Neon), non più solo sul dispositivo.
- **📖 Compendio** — incantesimi, mostri (bestiario completo, 107 libri), oggetti magici, razze, talenti, background, condizioni e classi. Contenuto completo (non solo SRD) sia edizione 2014 che 2024/25, con badge/filtro per edizione e libro di provenienza. Elenco sfogliabile in pagine anche senza cercare. Ricerca e nomi anche in italiano (traduzione automatica, qualità non garantita). Dati dal mirror [5e.tools](https://5e.tools).
- **📱 PWA** — installabile da Chrome/Safari ("Aggiungi a schermata Home"), tema scuro da taverna.

I personaggi sono salvati in `localStorage` sul dispositivo (nessun account richiesto). Le campagne invece richiedono login (Google) e vivono su database condiviso, così master e giocatori vedono la stessa cosa. Il Compendio interroga il mirror dati di 5e.tools in tempo reale (richiede connessione; il primo caricamento di ogni scheda può richiedere qualche secondo). La traduzione italiana usa l'endpoint pubblico non ufficiale di Google Translate (gratuito, nessuna chiave, ma senza garanzie di continuità/qualità).

## Configurazione (variabili d'ambiente)

Necessarie in `.env.local` (sviluppo) e nelle Environment Variables del progetto Vercel (produzione):

- `DATABASE_URL` — connection string Postgres (Neon, collegato da Vercel → Storage → Create Database).
- `AUTH_SECRET` — stringa casuale per cifrare le sessioni (`openssl rand -base64 32` o simile).
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — OAuth client da [Google Cloud Console](https://console.cloud.google.com) → Credentials, redirect URI `<dominio>/api/auth/callback/google`.

Dopo aver modificato lo schema in `lib/db/schema.ts`, sincronizzalo col database con `npm run db:push`.

## Roadmap

- [ ] 🐉 Strumenti master: aggiungere mostri alla campagna, generatore dungeon/incontri
- [ ] 🖍️ Lavagna/mappa condivisa in tempo reale per i dungeon
- [ ] ⚔️ Tracker di iniziativa per i combattimenti
- [ ] 🧙 Scheda personaggio completa (tiri salvezza, abilità, slot incantesimi)
- [ ] 📤 Export/import dei dati in JSON
- [ ] 🇮🇹 Compendio in italiano dai manuali ufficiali (richiede pipeline OCR/estrazione testo dai PDF, tipo il Mastrino)

## Sviluppo

```bash
npm install
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000).

## Stack

- [Next.js](https://nextjs.org) (App Router) + React 19 + TypeScript
- [Tailwind CSS v4](https://tailwindcss.com)
- [Zod](https://zod.dev) per la validazione dei dati salvati in locale (Personaggi)
- [Neon](https://neon.tech) (Postgres) + [Drizzle ORM](https://orm.drizzle.team) per le Campagne condivise
- [Auth.js](https://authjs.dev) (NextAuth v5) per il login con Google

## Deploy

Su [Vercel](https://vercel.com): importa il repo GitHub e deploya, zero configurazione.
