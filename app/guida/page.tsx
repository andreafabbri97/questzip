import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Guida e FAQ",
};

const indice = [
  { href: "#primi-passi", label: "🚀 Primi passi" },
  { href: "#personaggi", label: "🛡️ Personaggi" },
  { href: "#campagne", label: "🗺️ Campagne" },
  { href: "#sessione", label: "🎬 Gestire una sessione dal vivo" },
  { href: "#dadi", label: "🎲 Dadi" },
  { href: "#compendio", label: "📖 Compendio" },
  { href: "#amici-chat", label: "💬 Amici, chat e notifiche" },
  { href: "#profilo-pwa", label: "📱 Profilo e app sul telefono" },
  { href: "#assistenza-ia", label: "🤖 Assistenza IA" },
  { href: "#faq", label: "❓ Domande frequenti" },
  { href: "#problemi", label: "🔧 Problemi comuni" },
];

export default function GuidaPage() {
  return (
    <div className="space-y-10 max-w-2xl lg:max-w-3xl 2xl:max-w-4xl mx-auto">
      <section className="space-y-3">
        <h1 className="heading-ornate text-3xl sm:text-4xl font-bold text-accent-strong">
          📘 Guida e FAQ
        </h1>
        <p className="text-muted">
          Tutto quello che serve per usare QuestZip al tavolo (o a distanza) — dalla creazione di un
          personaggio alla gestione di una sessione dal vivo. Pensata sia per chi fa il master sia
          per chi gioca: se è la prima volta che apri l&apos;app, parti da &quot;Primi passi&quot;.
        </p>
      </section>

      <nav aria-label="Indice" className="card-elevated rounded-xl border border-edge bg-surface p-4 sm:p-5">
        <p className="text-xs uppercase tracking-widest text-muted mb-3">Indice</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {indice.map((voce) => (
            <li key={voce.href}>
              <a href={voce.href} className="text-foreground hover:text-accent-strong transition-colors">
                {voce.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* ---------------------------------------------------------------- Primi passi */}
      <Sezione id="primi-passi" titolo="🚀 Primi passi">
        <p>
          Tutto QuestZip richiede l&apos;accesso con un account Google (bottone &quot;Accedi con
          Google&quot; in alto) — non esiste una versione &quot;ospite&quot;, perché personaggi e
          campagne devono essere legati a un account per potersi sincronizzare.
        </p>
        <SottoTitolo>Se sei un giocatore</SottoTitolo>
        <ListaOrdinata
          voci={[
            <>
              Accedi con Google, poi vai su <Link href="/personaggi" className="text-accent-strong hover:underline">Personaggi</Link> e crea la tua scheda (vedi la sezione{" "}
              <a href="#personaggi" className="text-accent-strong hover:underline">Personaggi</a> qui sotto per i dettagli).
            </>,
            <>
              Fatti mandare dal master un link o un codice invito, e aprilo (o vai su{" "}
              <Link href="/campagne" className="text-accent-strong hover:underline">Campagne</Link> e usa &quot;Unisciti con un codice&quot;).
            </>,
            <>
              Una volta nella campagna, dalla scheda del party puoi &quot;portare&quot; il tuo
              personaggio nella campagna — è uno scatto condiviso, aggiornabile a mano quando vuoi,
              non una sincronizzazione automatica continua.
            </>,
          ]}
        />
        <SottoTitolo>Se fai il master</SottoTitolo>
        <ListaOrdinata
          voci={[
            <>
              Accedi con Google, poi vai su <Link href="/campagne" className="text-accent-strong hover:underline">Campagne</Link> e crea una nuova campagna: diventi automaticamente master.
            </>,
            <>
              Dalla pagina della campagna genera un link/codice invito e mandalo ai tuoi giocatori
              (chat, WhatsApp, quello che preferite fuori dall&apos;app — l&apos;invito non scade,
              resta valido finché non lo revochi tu).
            </>,
            <>
              Aggiungi i tuoi amici su QuestZip (sezione &quot;Amici&quot; nel{" "}
              <Link href="/profilo" className="text-accent-strong hover:underline">Profilo</Link>) per poterli invitare direttamente in campagna con un click, senza passare da un link esterno.
            </>,
          ]}
        />
      </Sezione>

      {/* ---------------------------------------------------------------- Personaggi */}
      <Sezione id="personaggi" titolo="🛡️ Personaggi">
        <p>
          La scheda personaggio è organizzata in 5 schede in stile Roll20: Combattimento,
          Incantesimi, Inventario, Tratti &amp; Talenti, Info &amp; Personalità. In alto resta sempre
          visibile ritratto, nome, razza/classe/livello.
        </p>
        <Suggerimento>
          Razza, classe, talenti, oggetti e incantesimi hanno l&apos;autocompletamento dal Compendio,
          <strong> cercabile anche in italiano</strong>: scrivere &quot;ladro&quot; trova gli stessi
          risultati di &quot;rogue&quot;.
        </Suggerimento>
        <SottoTitolo>Salvataggio: funziona come un documento</SottoTitolo>
        <p>
          Le modifiche restano una <strong>bozza locale</strong> finché non premi il bottone
          &quot;Salva&quot; in alto (disattivato se non c&apos;è nulla da salvare). Se provi a uscire
          con modifiche pendenti, un avviso ti chiede &quot;Salva ed esci / Annulla / Esci senza
          salvare&quot; — così una modifica fatta per sbaglio (es. hai cambiato un valore per
          calcolare qualcosa a mente) non resta scritta per sempre solo perché sei tornato indietro.
        </p>
        <p>
          Al salvataggio, il personaggio viene scritto sia in locale sul dispositivo sia sul tuo
          account (backup automatico) — lo ritrovi identico anche da un telefono nuovo o dopo aver
          svuotato il browser, senza dover fare nulla di manuale.
        </p>
        <SottoTitolo>Portare un personaggio in campagna</SottoTitolo>
        <p>
          Un personaggio esiste prima di tutto per conto suo (non serve essere in nessuna campagna
          per crearlo/salvarlo). Se sei loggato, dalla scheda del personaggio o dalla pagina della
          campagna puoi collegarlo alla campagna: è uno <strong>snapshot</strong> che il master vede
          nel party, aggiornabile a mano ogni volta che vuoi risincronizzarlo (non un collegamento
          live — se cambi PF a metà sessione sulla tua scheda, il master lo vede quando gestisce i PF
          dal tracker di iniziativa, non perché la tua scheda si aggiorna da sola su schermo suo).
        </p>
        <SottoTitolo>Cosa tiene traccia la scheda</SottoTitolo>
        <p>
          Oltre alle caratteristiche/PF/CA standard: Ispirazione, Dadi Vita (spesi a riposo breve,
          recuperati a riposo lungo), Affaticamento, fino a 3 Oggetti Armonizzati, Privilegi Limitati
          con usi e tipo di recupero, peso trasportato con avviso di sovraccarico, Visione al buio in
          metri (usata dalla mappa per la luce dinamica, vedi più sotto) e un Livello di Follia
          opzionale (regola homebrew disattivabile). Slot incantesimo, multiclasse, bonus di
          competenza e tiri salvezza/abilità sono calcolati automaticamente dal livello.
        </p>
        <SottoTitolo>Importare un personaggio</SottoTitolo>
        <p>
          Nella pagina Personaggi, accanto a &quot;Esporta&quot;/&quot;Importa&quot; (per i file
          JSON esportati da QuestZip stesso), c&apos;è anche <strong>&quot;📄 Importa da
          PDF&quot;</strong>: se hai un PDF della scheda cartacea che usiamo come gruppo già
          compilato, lo carichi e QuestZip legge da solo caratteristiche, classi/livelli, PF/CA,
          abilità, tiri salvezza, incantesimi (con il livello corretto), armi, inventario, tratti
          di personalità e le note di razza/classe direttamente dai campi del modulo — non serve
          ricopiare tutto a mano. Ricontrolla comunque il peso dei singoli oggetti in Inventario e
          il bonus d&apos;attacco delle armi dopo l&apos;import: sono gli unici due punti che
          restano volutamente non importati (il PDF non ha un modo affidabile di indicarli),
          QuestZip li ricalcola comunque da solo una volta inseriti caratteristica e competenza.
          Se il PDF non è questo template (o è una foto), puoi provare a farlo leggere
          dall&apos;assistente IA — vedi <a href="#assistenza-ia" className="text-accent-strong hover:underline">Assistenza IA</a> più sotto.
        </p>
      </Sezione>

      {/* ---------------------------------------------------------------- Campagne */}
      <Sezione id="campagne" titolo="🗺️ Campagne">
        <p>
          Una campagna è condivisa fra master e giocatori: chi la crea diventa master, e può
          assegnare il ruolo master/giocatore a ciascun membro in seguito (utile se vuoi co-master).
        </p>
        <SottoTitolo>Cosa contiene</SottoTitolo>
        <ListaPuntata
          voci={[
            <><strong>Chat vocale</strong> — audio diretto tra browser (nessun server in mezzo), vedi <a href="#sessione" className="text-accent-strong hover:underline">Gestire una sessione dal vivo</a> più sotto per i dettagli.</>,
            <><strong>Diario delle sessioni</strong> — note condivise, una per sessione giocata: guarda sempre indietro, &quot;cosa è già successo&quot;.</>,
            <><strong>Rubrica NPC</strong> <em>(solo master)</em> — chi popola il mondo: nome, aspetto/personalità/segreti, dove si trova, se è vivo/morto/scomparso. Consultabile al volo durante la sessione invece di doverselo ricordare a memoria.</>,
            <><strong>Trame e missioni</strong> <em>(solo master)</em> — fili narrativi aperti (missione principale, secondarie, agganci) con uno stato (attiva/completata/fallita/in pausa), separati dalle note di sessione così non si perdono tra un diario e l&apos;altro.</>,
            <><strong>Preparazione prossima sessione</strong> <em>(solo master)</em> — l&apos;unica sezione della campagna rivolta al FUTURO invece che al passato: una checklist libera per quello che vuoi preparare prima di giocare di nuovo.</>,
            <><strong>Party</strong> — le schede dei personaggi collegati dai giocatori, in sola lettura per gli altri.</>,
            <><strong>Mappa regionale</strong> — un editor di mappe di ambientazione (terreno dipinto a mano + marcatori con etichetta/icona/note), pensata come riferimento statico che il master prepara con calma: nessun token, nessuna fog of war, non cambia mentre i giocatori guardano.</>,
            <><strong>Dungeon</strong> — mappe di gioco vere e proprie, vedi la sezione sotto.</>,
            <><strong>Jukebox</strong> — condividi un URL YouTube o audio diretto: ognuno preme &quot;play&quot; sul proprio dispositivo (i browser bloccano l&apos;autoplay, quindi non parte da solo per tutti).</>,
            <><strong>Handout</strong> — lore/immagini che il master tiene nascosti finché non li rivela ai giocatori (con una bozza di testo generabile dall&apos;IA, vedi <a href="#assistenza-ia" className="text-accent-strong hover:underline">Assistenza IA</a>).</>,
            <><strong>Tabelle casuali</strong> — tabelle personalizzate con voci pesate (utili per incontri casuali, bottino, eventi).</>,
          ]}
        />
        <p className="text-sm text-muted">
          Rubrica NPC, Trame e Preparazione sono visibili SOLO al master — non compaiono in nessuna
          forma ai giocatori, nemmeno come sezione vuota, dato che possono contenere spoiler
          (identità segrete, esiti non ancora rivelati).
        </p>
      </Sezione>

      {/* ---------------------------------------------------------------- Gestire una sessione */}
      <Sezione id="sessione" titolo="🎬 Gestire una sessione dal vivo">
        <p>
          Questa è la parte pensata per l&apos;uso vero al tavolo: cosa fare prima, durante e dopo
          una sessione, con un esempio concreto.
        </p>

        <SottoTitolo>Prima della sessione (checklist master)</SottoTitolo>
        <ListaPuntata
          voci={[
            "Apri la campagna e dai un'occhiata al party: chi ha sincronizzato il personaggio, a che livello sono, quanti PF hanno da ultima volta.",
            "Se hai preparato uno scontro, tienilo a mente (mostri e difficoltà) — li aggiungerai al combattimento quando serve, non prima.",
            "Se ti serve una mappa, decidi se generarne una nuova (dungeon procedurale o scena esterna a bioma) o riusarne una già disegnata.",
            "Metti su un brano dal Jukebox se vuoi partire con un'atmosfera.",
          ]}
        />

        <SottoTitolo>Durante la sessione: esplorazione</SottoTitolo>
        <p>Nella sezione Dungeon della campagna puoi:</p>
        <ListaPuntata
          voci={[
            <><strong>Generare</strong> una mappa procedurale (interni: stanze rettangolari/organiche/circolari/poligonali; oppure una scena esterna a bioma — Bosco, Palude, Pianura, Rocciosa, Costa) oppure partire da una tela vuota e disegnarla a mano con il pennello.</>,
            <><strong>Fog of war</strong>: se la attivi, i giocatori vedono solo quello che i loro token hanno rivelato. Con &quot;Movimento e visione realistici&quot; attivo, la visuale di ciascuno usa il vero raggio di visione del suo personaggio (dalla Visione al buio in scheda) invece di un valore fisso uguale per tutti, ricalcolata a ogni spostamento (linea di vista bloccata dai muri). Puoi comunque rivelare a mano una stanza per un evento narrativo, indipendentemente da dove sono i token.</>,
            <><strong>Token</strong>: ogni giocatore trascina il proprio segnalino sulla mappa, gli altri lo vedono muoversi in tempo reale. Tu (master) puoi piazzare token mostro cercandoli dal Compendio.</>,
            <><strong>Template area d&apos;effetto</strong> (cerchio/cono/linea): trascinalo sulla mappa per vedere subito chi/cosa colpisce — comodo per annunciare una trappola o l&apos;area di un incantesimo prima ancora di tirare i dadi.</>,
            <><strong>Movimento realistico</strong>: durante il turno di un combattimento attivo, se un giocatore trascina il token oltre la propria velocità appare un avviso (non blocca il movimento — troppe eccezioni RAW come l&apos;azione Scatto, resta una segnalazione).</>,
          ]}
        />

        <SottoTitolo>Durante la sessione: combattimento</SottoTitolo>
        <ListaOrdinata
          voci={[
            "Dalla campagna, avvia un combattimento e aggiungi il party (un click) e i mostri — cercali dal Compendio (PF precompilati) oppure genera un incontro casuale in base a livello del party e difficoltà desiderata (bilanciamento XP standard).",
            "Il tracker calcola/ordina l'iniziativa e gestisce turni e round. Tutti i giocatori vedono ordine e PF di tutti in tempo reale, senza dover ricaricare la pagina.",
            "Per i PF usa il campo quantità + i bottoni \"Danno\"/\"Cura\": applicano l'importo in un colpo (il danno consuma prima i PF temporanei, poi quelli veri, regola RAW) — niente più click ripetuti uno a uno.",
            "A fine scontro, il master vede la somma XP dei mostri sconfitti già calcolata (divisibile per il party, modificabile a mano) e può scegliere \"sali di livello automaticamente se possibile\".",
          ]}
        />

        <SottoTitolo>Dopo il combattimento: XP e salita di livello</SottoTitolo>
        <p>
          L&apos;XP assegnata finisce in una &quot;casella postale&quot; sul personaggio del
          giocatore: lui la vede come banner sulla propria scheda e la applica quando vuole (se hai
          scelto &quot;automatico&quot; e il personaggio non è multiclasse, il livello si aggiorna da
          solo; i PF restano comunque un passo manuale della procedura guidata di salita di livello,
          che tira o fa la media del dado vita + Costituzione). Puoi anche assegnare XP a un singolo
          giocatore in qualsiasi
          momento, non solo dopo un combattimento — utile per premiare un&apos;idea furba o del
          roleplay ben giocato.
        </p>

        <SottoTitolo>Chat vocale e note</SottoTitolo>
        <p>
          Se giocate a distanza, la chat vocale (sezione &quot;🎙️ Chat vocale&quot; in campagna)
          collega i browser direttamente fra loro (P2P, nessun server audio in mezzo) — attivala
          solo se vi serve, pensata per gruppi piccoli (5-8 persone). Ogni partecipante ha un
          pallino che si accende quando sta parlando (utile per capire chi ha il turno senza
          doversi accavallare) e la propria riga mostra se sei silenziato. Se la connessione
          cade per un blip di rete, la chiamata prova a ristabilirsi da sola non appena torna —
          non serve più uscire e rientrare a mano. Se il browser nega il permesso al microfono (o
          non ne trova uno, o è già usato da un&apos;altra app), il messaggio d&apos;errore ti dice
          esattamente cosa correggere.
        </p>
        <p>
          A fine sessione, aggiungi una nota nel diario della campagna: è il modo più semplice per
          ritrovare &quot;dove eravamo rimasti&quot; alla sessione successiva — se l&apos;IA è
          configurata, un bottone può proporne una bozza leggendo la chat della sessione (vedi{" "}
          <a href="#assistenza-ia" className="text-accent-strong hover:underline">Assistenza IA</a>).
          Per preparare invece la sessione SUCCESSIVA, usa la checklist &quot;✅ Preparazione
          prossima sessione&quot; (solo master) — appunta lì cosa vuoi ricordarti di introdurre o
          preparare, e spuntalo quando è fatto.
        </p>

        <SottoTitolo>Esempio pratico: un&apos;imboscata in una stanza nascosta</SottoTitolo>
        <div className="card-elevated rounded-xl border border-edge bg-surface-raised/60 p-4 space-y-2 text-sm">
          <p>
            1. Il master ha già generato il dungeon e attivato fog of war + movimento realistico. I
            mostri sono piazzati come token in una stanza non ancora rivelata: i giocatori non la
            vedono.
          </p>
          <p>
            2. Il party si muove: appena un token giocatore ha linea di vista sulla stanza, la fog si
            apre da sola e i mostri diventano visibili a tutti — nessun click del master necessario.
          </p>
          <p>
            3. Il master avvia il combattimento, aggiunge il party (un click) e i mostri già
            piazzati sulla mappa, si tira/ordina l&apos;iniziativa.
          </p>
          <p>
            4. Chi lancia una palla di fuoco trascina il template &quot;cerchio&quot; sulla mappa per
            vedere subito chi viene coinvolto, poi tira attacco/danno con il bottone 🎲 sulla propria
            arma o incantesimo.
          </p>
          <p>
            5. A fine scontro il master vede l&apos;XP totale dei mostri sconfitti, la assegna al
            party (o a mano a chi se l&apos;è &quot;guadagnata&quot; di più), e chi sale di livello
            vede il banner sulla propria scheda.
          </p>
        </div>
      </Sezione>

      {/* ---------------------------------------------------------------- Dadi */}
      <Sezione id="dadi" titolo="🎲 Dadi">
        <p>
          Il tiro dadi si apre in un modal sopra qualunque pagina (icona 🎲 nella barra di
          navigazione): non serve uscire da dove sei per tirare un dado al volo.
        </p>
        <ListaPuntata
          voci={[
            "Da d4 a d100, fino a 100 dadi insieme, con modificatore e vantaggio/svantaggio (solo su 1d20).",
            <>
              <strong>Più tipi di dado nello stesso tiro</strong> — es. 1d12 (arma) + 2d8 (Punizione
              Divina) in un unico tiro, invece di doverli tirare separatamente e sommarli a mano.
              Bottone &quot;+ Aggiungi un altro dado&quot; sotto la quantità (fino a 4 gruppi); si
              disattiva automaticamente vantaggio/svantaggio, che ha senso solo per un 1d20 puro.
            </>,
            "I dadi 3D fisici veri (se il tuo dispositivo supporta WebGL) rotolano davvero con fisica reale — anche più tipi di dado insieme, nello stesso lancio fisico; se non disponibili, un tumble animato mostra comunque il risultato con lo stesso effetto \"suspense\".",
            "La cronologia dei tiri è sincronizzata sul tuo account: la ritrovi identica su ogni dispositivo dove fai login, non solo su quello con cui hai tirato. Tiene gli ultimi 30 tiri.",
            "Puoi eliminare un singolo tiro dalla cronologia (✕) o tutta la cronologia in un colpo (chiede conferma, non è reversibile).",
          ]}
        />
      </Sezione>

      {/* ---------------------------------------------------------------- Compendio */}
      <Sezione id="compendio" titolo="📖 Compendio">
        <p>
          Incantesimi, mostri (bestiario completo), oggetti magici, razze, talenti, background,
          condizioni e classi (tabella di progressione 1-20 completa, sottoclassi incluse) — sia
          edizione 2014 sia 2024/25.
        </p>
        <ListaPuntata
          voci={[
            <>Switch 🇬🇧/🇮🇹 in alto: mostra <strong>tutto</strong> originale o <strong>tutto</strong> tradotto, mai mischiato — per evitare confusione dato che la traduzione automatica non è perfetta.</>,
            <>Le voci con il badge &quot;📖 Testo ufficiale&quot; usano il testo estratto direttamente dai manuali italiani ufficiali (non una traduzione automatica) — copre incantesimi/mostri/razze/classi/talenti/oggetti principali.</>,
            <>La ricerca funziona in entrambe le lingue: scrivere &quot;elfo&quot; trova le stesse voci di &quot;elf&quot;.</>,
            <>Sezione &quot;📚 Regole&quot; separata: regole vere del Manuale del Giocatore (multiclasse, punteggi di caratteristica, avventura, combattimento, magia) e del Manuale del Master (condurre il gioco, inseguimenti, malattie/veleni/follia, creazione di mostri/incantesimi/oggetti magici/razze/classi/background), più Regole Principali e Costa della Spada. Le prime due sono testo digitale vero o trascritto a mano (badge &quot;✓ Verificato&quot;); le ultime due sono OCR da scansioni, qualità leggermente inferiore (badge &quot;📷 OCR&quot;).</>,
          ]}
        />
      </Sezione>

      {/* ---------------------------------------------------------------- Amici, chat, notifiche */}
      <Sezione id="amici-chat" titolo="💬 Amici, chat e notifiche">
        <SottoTitolo>Amici</SottoTitolo>
        <p>
          Dal <Link href="/profilo" className="text-accent-strong hover:underline">Profilo</Link>, sezione &quot;Amici&quot;: cerca per nome o email, manda una richiesta, accetta/rifiuta quelle ricevute. Essere amici serve a due cose: poter invitare direttamente in campagna (senza link esterni) e poter scrivere messaggi diretti.
        </p>
        <SottoTitolo>Chat</SottoTitolo>
        <p>
          L&apos;icona 💬 in header apre l&apos;hub chat: una lista unica di conversazioni (gruppi di
          campagna e messaggi diretti mescolati, ordinati per attività più recente, come su
          WhatsApp) con anteprima dell&apos;ultimo messaggio e conteggio dei non letti. Puoi
          rispondere a un messaggio specifico, eliminare i tuoi messaggi ed eliminare messaggi come
          master nella chat di campagna.
        </p>
        <p>
          Sui tuoi messaggi vedi le spunte ✓✓ in stile WhatsApp: grigie finché sono solo consegnate,
          colorate quando sono state lette — nelle DM dall&apos;altra persona, nella chat di campagna
          da <strong>tutti</strong> i membri (come le spunte blu di un gruppo).
        </p>
        <Suggerimento>
          Scrivendo <code className="text-accent-strong">#</code> seguito da un nome (anche in
          italiano) puoi menzionare qualunque voce del Compendio — appare un chip cliccabile che apre
          il dettaglio in un modal, senza uscire dalla chat.
        </Suggerimento>
        <SottoTitolo>Notifiche</SottoTitolo>
        <p>
          La campanella 🔔 in header mostra un&apos;anteprima delle notifiche più recenti (richieste
          di amicizia, inviti campagna — con Accetta/Rifiuta direttamente lì); &quot;Vedi tutte&quot;
          apre il centro notifiche completo su{" "}
          <Link href="/notifiche" className="text-accent-strong hover:underline">/notifiche</Link>.
        </p>
      </Sezione>

      {/* ---------------------------------------------------------------- Profilo e PWA */}
      <Sezione id="profilo-pwa" titolo="📱 Profilo e app sul telefono">
        <p>
          Il <Link href="/profilo" className="text-accent-strong hover:underline">Profilo</Link> (clicca il tuo nome/avatar in header) raccoglie: i personaggi creati, le campagne a cui partecipi, la lista amici, l&apos;interruttore per le notifiche push su quel dispositivo, il bottone per installare l&apos;app e il logout.
        </p>
        <SottoTitolo>Installare QuestZip come app</SottoTitolo>
        <p>
          QuestZip è una PWA: si installa da Chrome/Safari (&quot;Aggiungi a schermata Home&quot;) e
          si apre come un&apos;app vera, a schermo intero, senza barra del browser. Se il tuo browser
          lo supporta, compare un banner &quot;Installa l&apos;app&quot; direttamente nel Profilo; su
          iOS Safari (che non mostra il banner automatico) trovi lì anche le istruzioni passo-passo
          per farlo a mano.
        </p>
        <SottoTitolo>Notifiche push</SottoTitolo>
        <p>
          Attivandole dal Profilo, ricevi una notifica del sistema operativo (anche ad app chiusa)
          per richieste di amicizia, inviti campagna e nuovi messaggi in chat — sono per dispositivo,
          quindi vanno attivate su ciascun telefono/browser dove vuoi riceverle.
        </p>
      </Sezione>

      {/* ---------------------------------------------------------------- Assistenza IA */}
      <Sezione id="assistenza-ia" titolo="🤖 Assistenza IA">
        <p>
          Alcune funzioni sono assistite da un&apos;intelligenza artificiale (Gemini di Google) —
          sempre <strong>opzionali</strong>: se non sono configurate, o se l&apos;IA non risponde
          per qualunque motivo, il resto dell&apos;app funziona esattamente come sempre. Nessuna
          di queste salva mai nulla in automatico: il risultato finisce sempre in un campo che
          rivedi e modifichi tu prima di confermare, come farebbe un giocatore che ti propone una
          bozza.
        </p>
        <ListaPuntata
          voci={[
            <>
              <strong>Import di qualsiasi scheda PDF/foto</strong> — in Personaggi, se il PDF non
              è il nostro template conosciuto, puoi provare a farlo leggere dall&apos;IA (icona 📄
              Importa da PDF, poi &quot;Sì, prova con l&apos;IA&quot;).
            </>,
            <>
              <strong>Assistente regole</strong> — icona 🤖 in header, apre una domanda/risposta
              veloce sulle regole di D&amp;D 5e ancorata (dove possibile) alle voci vere del
              Compendio.
            </>,
            <>
              <strong>Riassunto sessioni</strong> — bottone &quot;✨ Genera riassunto IA&quot; nel
              Diario delle sessioni di una campagna: legge la chat dall&apos;ultima sessione e
              propone un riassunto da rivedere prima di salvare.
            </>,
            <>
              <strong>Bozze per gli Handout</strong> — bottone &quot;✨ Genera bozza&quot; quando
              crei un handout: propone il testo del documento in base al titolo.
            </>,
            <>
              <strong>Bozze per NPC e Trame</strong> — stesso bottone &quot;✨ Genera bozza&quot;
              nella Rubrica NPC (in base al nome, propone aspetto/personalità/segreto) e nel
              Tracciatore trame (in base al titolo, propone obiettivo/motore/possibile svolta).
            </>,
          ]}
        />
        <Suggerimento>
          Quando usi una di queste funzioni, il contenuto (il PDF/foto, il testo della chat, il
          titolo dell&apos;handout, la domanda) viene inviato ai server di Google per
          l&apos;elaborazione — non succede mai in automatico, solo quando premi tu il bottone
          apposito. Le risposte dell&apos;assistente regole sono generate, non tratte da un testo
          ufficiale: in caso di dubbio importante, verifica sempre sul Compendio o sul manuale.
        </Suggerimento>
      </Sezione>

      {/* ---------------------------------------------------------------- FAQ */}
      <Sezione id="faq" titolo="❓ Domande frequenti">
        <div className="space-y-2">
          <Faq domanda="Posso avere più personaggi?">
            Sì, non c&apos;è un limite al numero di personaggi che puoi creare e salvare sul tuo
            account.
          </Faq>
          <Faq domanda="Cosa succede se elimino un personaggio?">
            Viene eliminato definitivamente (sia dal dispositivo che dall&apos;account, chiede
            conferma con un modal — non un popup nativo del browser). Se lo avevi portato in una
            campagna, lo snapshot condiviso nella campagna resta finché il master non lo rimuove,
            ma non potrai più aggiornarlo.
          </Faq>
          <Faq domanda="Posso usare QuestZip offline?">
            No: sia le Campagne sia il Compendio hanno bisogno di connessione (dati condivisi su
            database e mirror del Compendio interrogato in tempo reale). I Personaggi hanno una
            copia locale, ma aprire l&apos;app la prima volta richiede comunque connessione.
          </Faq>
          <Faq domanda="Come faccio a diventare master di una campagna?">
            Chi crea una campagna ne è automaticamente il master. Un master può anche assegnare il
            ruolo master a un altro membro già dentro la campagna, se volete co-gestirla.
          </Faq>
          <Faq domanda="Un giocatore può vedere le stanze non ancora esplorate?">
            No: con la fog of war attiva, il server stesso filtra cosa manda a chi non è master — non
            è solo un&apos;interfaccia che nasconde graficamente, i dati delle stanze/mostri non
            rivelati non arrivano proprio al browser dei giocatori.
          </Faq>
          <Faq domanda="La traduzione italiana del Compendio è affidabile?">
            Dipende dalla voce: quelle con il badge &quot;📖 Testo ufficiale&quot; sono testo estratto
            dai manuali italiani veri, non una traduzione automatica. Le altre usano un servizio di
            traduzione automatica gratuito — utile per farsi un&apos;idea, ma senza garanzia di
            precisione assoluta: per le regole che contano davvero (es. il testo esatto di un
            incantesimo in un dubbio importante), fai sempre riferimento all&apos;inglese o al
            manuale cartaceo.
          </Faq>
          <Faq domanda="I miei dati sono al sicuro / visibili ad altri?">
            Personaggi e cronologia dadi sono privati, legati al tuo account. Le campagne sono
            visibili solo a chi ne è membro. La fog of war (vedi sopra) è applicata anche lato
            server, non solo nascosta a schermo.
          </Faq>
          <Faq domanda="Posso giocare da telefono E da computer con lo stesso account?">
            Sì — è pensato apposta per questo: personaggi, campagne, cronologia dadi e chat sono
            tutti legati all&apos;account, non al dispositivo.
          </Faq>
        </div>
      </Sezione>

      {/* ---------------------------------------------------------------- Problemi comuni */}
      <Sezione id="problemi" titolo="🔧 Problemi comuni">
        <div className="space-y-2">
          <Faq domanda="Non vedo aggiornarsi in tempo reale i token/il combattimento">
            Il realtime dipende da una connessione WebSocket separata: se cade (rete instabile,
            passaggio wifi↔dati mobili), l&apos;app torna al comportamento &quot;serve ricaricare la
            pagina&quot; finché la connessione non si ristabilisce da sola. Un refresh manuale
            risolve quasi sempre.
          </Faq>
          <Faq domanda="I dadi 3D non appaiono, vedo solo il numero che tumbla">
            Serve WebGL (praticamente ogni browser moderno lo supporta). Su dispositivi molto
            datati o con la GPU disattivata dal browser, l&apos;app ricade automaticamente sul tumble
            numerico — funzionalmente identico, solo senza l&apos;animazione fisica.
          </Faq>
          <Faq domanda="Ho chiuso senza salvare e ho perso le modifiche al personaggio">
            L&apos;avviso &quot;Salva ed esci / Esci senza salvare&quot; dovrebbe comparire sempre
            con modifiche pendenti — se hai chiuso direttamente la scheda del browser (non un
            pulsante &quot;indietro&quot; dentro l&apos;app), il browser stesso avvisa prima di
            chiudere, ma solo se non l&apos;hai ignorato/disattivato.
          </Faq>
          <Faq domanda="Non trovo un'opzione/pagina che mi aspetterei">
            Alcune funzioni sono deliberatamente fuori scope per restare un progetto gestibile per un
            piccolo gruppo di amici (es. modifica dei messaggi già inviati, &quot;sta scrivendo…&quot;,
            allegati/immagini, marketplace a pagamento). Se manca qualcosa che ti servirebbe davvero,
            chiedi a chi gestisce l&apos;app.
          </Faq>
        </div>
      </Sezione>
    </div>
  );
}

function Sezione({
  id,
  titolo,
  children,
}: {
  id: string;
  titolo: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3">
      <h2 className="text-2xl font-display font-bold text-accent-strong border-b border-edge pb-2">
        {titolo}
      </h2>
      <div className="space-y-3 text-sm sm:text-base text-foreground/90 leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function SottoTitolo({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-bold text-foreground pt-1">{children}</h3>;
}

function ListaPuntata({ voci }: { voci: React.ReactNode[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5 marker:text-accent">
      {voci.map((voce, index) => (
        <li key={index}>{voce}</li>
      ))}
    </ul>
  );
}

function ListaOrdinata({ voci }: { voci: React.ReactNode[] }) {
  return (
    <ol className="list-decimal pl-5 space-y-1.5 marker:text-accent marker:font-bold">
      {voci.map((voce, index) => (
        <li key={index}>{voce}</li>
      ))}
    </ol>
  );
}

function Suggerimento({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm">
      <span className="font-bold text-accent-strong">💡 Suggerimento — </span>
      {children}
    </p>
  );
}

// <details>/<summary> nativi invece di un accordion in JS: zero stato React necessario per una
// semplice lista di domande/risposte, coerente con "niente peso extra dove non serve".
function Faq({ domanda, children }: { domanda: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border border-edge bg-surface-raised p-4 [&::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 font-bold text-foreground">
        {domanda}
        <span className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-180">
          ▾
        </span>
      </summary>
      <p className="mt-2 text-sm text-muted leading-relaxed">{children}</p>
    </details>
  );
}
