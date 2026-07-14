# 🎲 QuestZip

Gestore di campagne **D&D 5e** per master e giocatori. PWA installabile su telefono, pensata per essere usata al tavolo.

## Funzionalità (v0.1)

- **🎲 Tira dadi** — da d4 a d100, quantità multiple, modificatori, vantaggio/svantaggio sul d20, cronologia dei tiri, critici e fallimenti evidenziati.
- **🛡️ Personaggi** — scheda base: razza, classe, livello, punti ferita (con contatore rapido +/−), CA, velocità, le sei caratteristiche con modificatori calcolati in automatico, bonus di competenza, note libere.
- **🗺️ Campagne** — descrizione, master, lista giocatori e diario delle sessioni.
- **📖 Compendio** — incantesimi, mostri e oggetti magici, contenuto completo (non solo SRD) sia edizione 2014 che 2024/25, con badge/filtro per edizione e libro di provenienza. Dati dal mirror [5e.tools](https://5e.tools).
- **📱 PWA** — installabile da Chrome/Safari ("Aggiungi a schermata Home"), tema scuro da taverna.

I dati di personaggi e campagne sono salvati in `localStorage` sul dispositivo: niente account, niente server. Il Compendio interroga il mirror dati di 5e.tools in tempo reale (richiede connessione, contenuto in inglese; il primo caricamento di ogni scheda può richiedere qualche secondo).

## Roadmap

- [ ] 🔄 Sync tra master e giocatori (backend su Vercel + database)
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
- [Zod](https://zod.dev) per la validazione dei dati salvati

## Deploy

Su [Vercel](https://vercel.com): importa il repo GitHub e deploya, zero configurazione.
