# 🎲 QuestZip

Gestore di campagne **D&D 5e** per master e giocatori. PWA installabile su telefono, pensata per essere usata al tavolo.

**L'intero sito richiede il login con Google** — non è più possibile navigare nessuna pagina senza aver effettuato l'accesso (gate applicato a livello di `proxy.ts`, la nuova convenzione Next.js per il middleware). I personaggi restano comunque salvati solo su `localStorage`, il login serve solo a vedere il sito.

## Funzionalità (v0.1)

- **🎲 Tira dadi** — da d4 a d100, quantità multiple, modificatori, vantaggio/svantaggio sul d20, cronologia dei tiri, critici e fallimenti evidenziati.
- **🛡️ Personaggi** — razza/classe con autocompletamento dal Compendio, multiclasse (più classi, con sottoclasse e descrizione "come funziona" per ciascuna), generatore caratteristiche (manuale, array standard, acquisto punti, tiro dadi), calcolatore PF multiclasse (1° livello della classe di origine massimizzato, il resto in media), punti ferita (contatore rapido +/−), CA, velocità, bonus di competenza, tiri salvezza e le 18 abilità (competenza/esperto con suggerimento automatico dalla classe di origine), slot incantesimi con contatore usati/disponibili per livello (calcolati anche in multiclasse, più il Patto Magico separato del Warlock) e bottoni riposo breve/lungo, note libere, export/import in JSON. Se sei loggato puoi portare il personaggio in una campagna condivisa (snapshot aggiornabile a mano, non sync live).
- **🗺️ Campagne** — condivise: accedi con Google, crea una campagna (diventi master), invita amici con un link/codice, assegna il ruolo master/giocatore a ciascun membro, diario delle sessioni condiviso, party con le schede dei personaggi di tutti i membri. Tracker di iniziativa: il master avvia un combattimento, aggiunge il party e mostri (cercabili dal Compendio, PF precompilati, o generati casualmente in base a livello del party e difficoltà desiderata secondo le regole standard di bilanciamento XP), gestisce turni/round/PF; i giocatori vedono ordine e PF di tutti **in tempo reale**, senza ricaricare la pagina. Dungeon: generatore procedurale (stanze rettangolari, organiche, circolari o poligonali — geometria vettoriale vera, non solo a blocchi — numero di stanze min/max a scelta) oppure tela vuota da disegnare a mano (pennello muri/pavimento/porte con trascinamento, punti d'interesse cliccabili); in entrambi i casi si può cliccare una stanza/punto per aggiungere a mano incontro e ricompensa. Ogni giocatore può mettere il proprio segnalino sulla mappa e trascinarlo: gli altri lo vedono muoversi live (realtime via Cloudflare/PartyKit, vedi sotto). La modifica della mappa (muri/stanze) resta invece manuale con salvataggio esplicito. Dati su database (Postgres/Neon), non più solo sul dispositivo.
- **📖 Compendio** — incantesimi, mostri (bestiario completo, 107 libri), oggetti magici, razze, talenti, background, condizioni e classi (tabella di progressione 1-20, tutte le caratteristiche di classe, sottoclassi espandibili con le loro caratteristiche — non solo l'elenco dei nomi). Contenuto completo (non solo SRD) sia edizione 2014 che 2024/25, con badge/filtro per edizione e libro di provenienza. Elenco sfogliabile in pagine anche senza cercare. Switch di lingua 🇬🇧/🇮🇹 (default inglese): mostra o tutto originale o tutto tradotto, mai mischiato, per non confondere visto che la traduzione è automatica; i nomi invece sono sempre mostrati in entrambe le lingue insieme. Ricerca funziona in entrambe le lingue. Dati dal mirror [5e.tools](https://5e.tools). Per gli incantesimi di Manuale del Giocatore/Tasha/Xanathar, i mostri di 6 manuali (Manuale dei Mostri, Mostri del Multiverso, Fizban, Bigby, Dragonlance, Van Richten's Ravenloft — solo le schede verificate incrociandole con i dati inglesi), le 9 razze e le 12 classi del Manuale del Giocatore (dado vita/competenze/equipaggiamento e tabella di progressione livelli complete per tutte), in italiano viene mostrato il testo ufficiale (estratto dai manuali, non tradotto automaticamente) quando disponibile, con badge "📖 Testo ufficiale". Sezione separata "📚 Regole" con contenuto di regole generali/lore (Regole Principali, Costa della Spada) estratto via OCR da scansioni pure — qualità del testo inferiore al resto, segnalato con un badge.
- **📱 PWA** — installabile da Chrome/Safari ("Aggiungi a schermata Home"), tema scuro da taverna. Layout ottimizzato sia per mobile (colonna singola) che desktop (colonne affiancate: elenco+dettaglio nel Compendio, sezioni accoppiate in Personaggi/Campagne).

I personaggi sono salvati in `localStorage` sul dispositivo, ma il login (Google) è comunque richiesto per usare il sito. Le campagne vivono su database condiviso, così master e giocatori vedono la stessa cosa. Il Compendio interroga il mirror dati di 5e.tools in tempo reale (richiede connessione; il primo caricamento di ogni scheda può richiedere qualche secondo). La traduzione italiana usa l'endpoint pubblico non ufficiale di Google Translate (gratuito, nessuna chiave, ma senza garanzie di continuità/qualità).

## Configurazione (variabili d'ambiente)

Necessarie in `.env.local` (sviluppo) e nelle Environment Variables del progetto Vercel (produzione):

- `DATABASE_URL` — connection string Postgres (Neon, collegato da Vercel → Storage → Create Database).
- `AUTH_SECRET` — stringa casuale per cifrare le sessioni (`openssl rand -base64 32` o simile).
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — OAuth client da [Google Cloud Console](https://console.cloud.google.com) → Credentials, redirect URI `<dominio>/api/auth/callback/google`.
- `PARTYKIT_AUTH_SECRET` — segreto condiviso tra Next.js (Vercel) e il Worker Cloudflare (vedi sezione Realtime sotto), usato per firmare/verificare i token di connessione. Va impostato **sia** su Vercel **sia** come secret del Worker (`npx wrangler secret put PARTYKIT_AUTH_SECRET`), con lo stesso valore. Se assente, l'app funziona comunque ma senza aggiornamenti live (torna al comportamento "ricarica la pagina").
- `NEXT_PUBLIC_PARTYKIT_HOST` — host del Worker Cloudflare deployato (es. `questzip-party.<tuo-account>.workers.dev`, senza `https://`). Pubblico per forza (serve al browser per aprire il WebSocket).

Dopo aver modificato lo schema in `lib/db/schema.ts`, sincronizzalo col database con `npm run db:push`.

## Realtime (combattimento live + token sulla lavagna)

Combattimento/party live e i token dei giocatori sulla lavagna usano [PartyKit](https://github.com/cloudflare/partykit) (ora parte di Cloudflare): una Durable Object (`party/campaign-room.ts`) che fa da relay in tempo reale tra i client connessi a una campagna/dungeon. **Postgres resta sempre l'unica fonte di verità** — la Durable Object non scrive mai sul database, si limita a inoltrare "è cambiato qualcosa" (combattimento) o i movimenti dei token (lavagna); se non è raggiungibile o non configurata, l'app continua a funzionare come prima (refresh manuale).

Deploy (una tantum, sul tuo account Cloudflare gratuito, separato da Vercel):

```bash
npx wrangler login                        # apre il browser, richiede un account Cloudflare gratuito
npx wrangler secret put PARTYKIT_AUTH_SECRET   # stessa stringa messa anche su Vercel
npm run party:deploy                      # pubblica party/campaign-room.ts su *.workers.dev
```

Poi imposta `PARTYKIT_AUTH_SECRET` e `NEXT_PUBLIC_PARTYKIT_HOST` (l'URL stampato da `party:deploy`) nelle Environment Variables del progetto Vercel e ridistribuisci. In sviluppo locale, `npm run party:dev` avvia il Worker su `localhost:1999` (Wrangler dev, richiede comunque un account Cloudflare per `wrangler login`).

## Roadmap

- [x] 🏅 Talenti in italiano (Manuale del Giocatore, Cap. 6) — **chiuso**: 41 talenti estratti dal testo digitale (`scripts/ita-compendio/parse-talenti.mjs`), nuova tabella `compendio_ita_talento`, collegati al tab Talenti del Compendio con lo stesso pattern "📖 Testo ufficiale" di razze/classi/oggetti.
- [x] 🎒 Oggetti magici collegati all'inventario di Personaggi — **chiuso**: il campo nome oggetto nell'Equipaggiamento ora usa l'autocomplete sul Compendio (resta testo libero per l'equipaggiamento non magico); se l'oggetto è riconosciuto, mostra rarità/sintonia e un pannello "Come funziona" con la descrizione (testo ufficiale italiano quando disponibile, altrimenti l'inglese del Compendio).
- [x] 🖍️ Lavagna condivisa in tempo reale sopra le mappe dungeon: i player mettono il proprio segnalino e lo trascinano, gli altri lo vedono muoversi live — **chiuso**, vedi sezione Realtime sopra. La mappa di base (muri/stanze) resta invece a salvataggio manuale, non sync live.
- [x] 🔄 Aggiornamenti live per party/combattimento — **chiuso**: le server action di `app/actions/encounters.ts` notificano la Durable Object dopo ogni scrittura, i client connessi si riallineano senza ricaricare (vedi sezione Realtime sopra).
- [x] 🇮🇹 Compendio in italiano dai manuali ufficiali — **chiuso** (vedi `scripts/ita-compendio/`): incantesimi (Manuale del Giocatore, Tasha, Xanathar), mostri (6 manuali, filtrati voce per voce incrociando i dati con l'inglese), razze (le 9 del Manuale del Giocatore, sottorazze incluse) e classi (dado vita/competenze/equipaggiamento e tabella di progressione livelli **complete per tutte e 12**, incluse le 4 classi incantatrici principali che inizialmente sembravano irrecuperabili — l'estrazione geometrica non si affida più al numero di livello stampato, spesso assente dal testo, ma conta le righe della tabella con il bonus di competenza come ancora principale). Nuova sezione "📚 Regole" nel Compendio: "Regole Principali" riscritta pulita e organizzata per tema (viaggio, combattimento, punti ferita, condizioni...) invece di tenere il testo OCR grezzo — sono regole 5e standard e ben note, l'OCR delle scansioni originali (anche a 300/400dpi) restava troppo rumoroso da leggere. "Guida agli Avventurieri della Costa della Spada" (164 pagine di lore, troppe per riscriverle a mano) resta testo OCR ma raggruppato per argomento/luogo invece che per numero di pagina. "Oggetti Magici (Dm e Book of many things).pdf" si è rivelato un file misto: le prime 8 pagine sono un estratto inglese del supplement "Book of Many Things" (le sue schede oggetto esistono già, pulite, nel tab Oggetti via 5etools — estratto solo il testo di ambientazione/consigli per il master, non le schede), ma le restanti 65 pagine sono in realtà uno **screenshot del catalogo "OGGETTI MAGICI A-Z" del Manuale del DM italiano** — leggibile via OCR nonostante il Manuale del DM digitale abbia il font offuscato (il problema del font non si pone: qui si legge l'immagine resa, non il font). Nuova tabella `compendio_ita_oggetto` (210 oggetti magici italiani, nome/categoria/rarità/sintonia/descrizione), collegata al tab Oggetti esistente con lo stesso pattern "📖 Testo ufficiale" già usato per razze/classi, badge di avviso qualità OCR incluso (screenshot, non scansione: qualche refuso atteso). **Manuale del DM**: tentativo serio fatto fino in fondo, esito negativo confermato — l'idea di allineare l'OCR dell'intera pagina col testo geometricamente corretto di PyMuPDF (per ricostruire un dizionario "codice cifrato → lettera vera" per ogni sotto-insieme di font) funziona in teoria e su singole pagine di prova, ma il libro usa 1147 sotto-insiemi di font quasi tutti confinati a 1-2 pagine ciascuno: troppo poco testo per sotto-insieme perché il voto di maggioranza converga. Allineate tutte le 320 pagine (~4 ore) e decodificato l'intero libro: anche con la soglia di fiducia più permissiva possibile, la pagina migliore ha il 32% di caratteri irrisolti e la mediana il 96% — non utilizzabile. Confermato definitivamente fuori scope, un decoder affidabile richiederebbe accedere al font embedded pagina per pagina (progetto a sé, vedi `scripts/ita-compendio/decode_dm_manual.py` se si volesse riprendere in futuro con un approccio diverso).

## Sviluppo

```bash
npm install
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000).

### Pipeline compendio italiano (`scripts/ita-compendio/`)

Estrae incantesimi/mostri/razze/classi/regole dai manuali PDF ufficiali (posseduti privatamente, mai nel repo) e li carica nel DB, mai nel codice pubblico. Richiede `pip install pymupdf easyocr` e i PDF in una cartella locale `Manuali DND 5E giocatore e DM/Manuali campagna/` (percorso configurato in `books.json`, tutto gitignored).

```bash
python scripts/ita-compendio/extract_pdf.py <chiave_libro>      # testo grezzo -> extracted/
node scripts/ita-compendio/parse-spells.mjs <chiave_libro>      # -> parsed/<chiave>-incantesimi.json
node scripts/ita-compendio/parse-mostri.mjs <chiave_libro>      # -> parsed/<chiave>-mostri.json
node scripts/ita-compendio/parse-razze.mjs <chiave_libro>       # -> parsed/<chiave>-razze.json
node scripts/ita-compendio/cross-validate-mostri.mjs <chiave> [fonte5etools]  # confronta CA/PF/Sfida con l'inglese
python scripts/ita-compendio/extract_class_table.py             # tabelle di progressione livelli -> parsed/phb-classi-tabelle.json
node scripts/ita-compendio/merge-classi.mjs                     # unisce campi base + tabelle -> parsed/phb-classi-merged.json
python scripts/ita-compendio/ocr_extract_pdf.py <chiave_libro>   # OCR pagina per pagina (scansioni pure) -> extracted/
node scripts/ita-compendio/parse-regole.mjs <chiave_libro>       # -> parsed/<chiave>-regole.json
node scripts/ita-compendio/group-costa-spada.mjs                # raggruppa per argomento/luogo -> parsed/costa_spada-regole.json
node scripts/ita-compendio/parse-oggetti-magici-flavor.mjs      # pagine 0-7 (EN, Book of Many Things): solo testo di ambientazione -> parsed/oggetti_magici-regole.json
node scripts/ita-compendio/parse-oggetti-magici.mjs             # pagine 8+ (IT, catalogo DMG): nome/categoria/rarità/descrizione -> parsed/oggetti_magici-oggetti.json
node scripts/ita-compendio/parse-talenti.mjs                    # capitolo Talenti del PHB -> parsed/phb-talenti.json
node --env-file=.env.local scripts/ita-compendio/seed.mjs       # carica tutto nel DB
```

Manuale del DM (font offuscato, vedi roadmap): `python scripts/ita-compendio/decode_dm_manual.py align <inizio> <fine>` costruisce/aggiorna il dizionario codice→lettera in `extracted/dm-manuale-mappa.json` (rilanciabile, riprende da dove si era fermato), `python scripts/ita-compendio/decode_dm_manual.py decode` applica il dizionario a tutto il libro.

## Stack

- [Next.js](https://nextjs.org) (App Router) + React 19 + TypeScript
- [Tailwind CSS v4](https://tailwindcss.com)
- [Zod](https://zod.dev) per la validazione dei dati salvati in locale (Personaggi)
- [Neon](https://neon.tech) (Postgres) + [Drizzle ORM](https://orm.drizzle.team) per le Campagne condivise
- [Auth.js](https://authjs.dev) (NextAuth v5) per il login con Google

## Deploy

Su [Vercel](https://vercel.com): importa il repo GitHub e deploya, zero configurazione.
