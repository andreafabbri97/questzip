# 🎲 QuestZip

Gestore di campagne **D&D 5e** per master e giocatori. PWA installabile su telefono, pensata per essere usata al tavolo.

## Funzionalità (v0.1)

- **🎲 Tira dadi** — da d4 a d100, quantità multiple, modificatori, vantaggio/svantaggio sul d20, cronologia dei tiri, critici e fallimenti evidenziati.
- **🛡️ Personaggi** — scheda base: razza, classe, livello, punti ferita (con contatore rapido +/−), CA, velocità, le sei caratteristiche con modificatori calcolati in automatico, bonus di competenza, note libere.
- **🗺️ Campagne** — descrizione, master, lista giocatori e diario delle sessioni.
- **📖 Compendio** — incantesimi, mostri e oggetti magici della SRD 5.2, ricerca live via [Open5e API](https://open5e.com/).
- **📱 PWA** — installabile da Chrome/Safari ("Aggiungi a schermata Home"), tema scuro da taverna.

I dati di personaggi e campagne sono salvati in `localStorage` sul dispositivo: niente account, niente server. Il Compendio invece interroga Open5e in tempo reale (richiede connessione).

## Roadmap

- [ ] 🔄 Sync tra master e giocatori (backend su Vercel + database)
- [ ] ⚔️ Tracker di iniziativa per i combattimenti
- [ ] 🧙 Scheda personaggio completa (tiri salvezza, abilità, slot incantesimi)
- [ ] 📤 Export/import dei dati in JSON

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
