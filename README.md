# Sfera di neve · InteriormenteDesign

Pagina web 3D per gli auguri di Natale. Si apre con una frase su fondo antracite («C’è sempre spazio / per un po’ di meraviglia.», font Forum); poi la sfera emerge dal buio: prima un riflesso sul vetro, poi il David illuminato, infine le targhette. Neve immersa nel liquido, base in pietra antracite con targhetta in oro (InteriormenteDesign · Pietro Ricciardi), musica natalizia. Si agita con il telefono, con il pulsante **Agita la sfera** o trascinando rapidamente.

Il progetto è statico (HTML, CSS, JavaScript, Three.js incluso): non serve nessun server particolare né alcun account. Basta pubblicare la cartella su un hosting **HTTPS**.

---

## 1. Il modello del David

Il modello è incluso in `assets/david-head.glb`: la versione ottimizzata scaricata da Sketchfab, ricompressa (2 MB invece di 4,8, stesso dettaglio) e girata di 50° perché il volto guardi verso chi osserva (`david.rotationDeg` in `js/config.js`). Se il file mancasse, nella sfera comparirebbe un **segnaposto astratto**, segnalato come *provvisorio*. Per usare un altro modello segui le istruzioni qui sotto.

**Scansione consigliata**: *Head of Michelangelo's David* — SMK, Statens Museum for Kunst (Copenaghen), calco in gesso del 1899 (inventario KAS2232), scansionato con Artec Eva da Scan The World e rilasciato da SMK in pubblico dominio (CC0).

- STL originale: https://www.myminifactory.com/object/3d-print-head-of-michelangelo-s-david-52645
- Versione già ottimizzata (GLB, 100k triangoli, licenza CC BY → citare l'autore): https://skfb.ly/o8AFK

### Prepararlo (5 minuti)

Serve [Node.js](https://nodejs.org) (versione 18 o successiva).

```bash
cd tools
npm install
node prepare-david.mjs ~/Download/head_of_michelangelos_david.stl
```

Lo script raddrizza il modello, lo alleggerisce a 160.000 triangoli preservando il volto, lo comprime e lo salva in `assets/david-head.glb`. Opzioni utili: `--triangles 120000`, `--rotate-y 20`.

Se scarichi il GLB da Sketchfab puoi anche copiarlo direttamente in `assets/` con il nome `david-head.glb`.

### Regolarlo

Apri la pagina con **`?tune`** in fondo all'indirizzo (es. `http://localhost:8080/?tune`). Compare un pannello con rotazione, altezza e spostamenti: quando il volto guarda bene verso di te, copia il blocco `david: {...}` mostrato nel riquadro dentro `js/config.js`.

---

## 2. Provare in locale

I moduli JavaScript non funzionano aprendo il file con doppio clic: serve un piccolo server.

```bash
# dalla cartella del progetto
npx serve .
# oppure
python3 -m http.server 8080
```

Poi apri `http://localhost:8080`. I sensori del telefono richiedono HTTPS: per provarli usa la pubblicazione qui sotto.

---

## 3. Pubblicare in HTTPS (GitHub Pages)

1. Su GitHub crea un repository pubblico chiamato **`auguri-interiormente`**.
2. *Add file → Upload files*: trascina **tutto il contenuto** di questa cartella (`index.html` deve stare nella radice). La cartella `tools/` non serve online, ma non fa danni.
3. *Settings → Pages → Build and deployment*: *Deploy from a branch*, ramo `main`, cartella `/ (root)`.
4. Dopo un minuto il sito è su **https://asessa994.github.io/auguri-interiormente/**.

Se usi un altro nome di repository o un dominio tuo, sostituisci l'indirizzo nelle righe `og:url` e `og:image` di `index.html`.

Alternativa senza account GitHub: [Netlify Drop](https://app.netlify.com/drop) — trascini la cartella e ottieni subito un link HTTPS.

---

## 4. Anteprima su WhatsApp

`index.html` contiene già titolo, descrizione e tag Open Graph. L'immagine `assets/og-image.jpg` (1200×630) è **provvisoria e solo tipografica**, finché non c'è il David.

Quando il modello è al suo posto:

1. apri la pagina con **`?capture`**;
2. dopo pochi secondi compare l'immagine generata dalla scena reale: premi *Scarica og-image.jpg*;
3. sostituisci `assets/og-image.jpg` e ripubblica.

WhatsApp memorizza l'anteprima la prima volta che il link viene condiviso: se la cambi dopo, condividi il link con un parametro nuovo (es. `…/auguri-interiormente/?v=2`).

---

## 5. Personalizzare

Tutto in **`js/config.js`**:

- `stage`: `'scuro'` (antracite, predefinito) o `'chiaro'` (avorio); i colori di ciascuna ambientazione sono in `PALETTES` in cima al file (anche l'interfaccia li eredita);
- `intro.lines` / `intro.holdSeconds`: la frase iniziale e quanto resta leggibile;
- `basePlaque.lines`: le due righe della targhetta in oro sulla base;
- `music`: file, volume (0–1), attiva o no all'apertura;
- `greeting`: le tre righe dell'augurio;
- `plaque.text`: la scritta della targhetta; `palette.plaqueText`: colore delle lettere (nero di base);
- `glass`: `'auto'` (rifrazione vera su computer, vetro veloce su telefono), oppure `'refraction'` / `'fast'`;
- `credit`: riga di crediti in basso (serve se usi un modello con licenza CC BY);
- `david`: file, rotazione, altezza, posizione;
- `quality`: `'auto'` oppure `'low' | 'medium' | 'high'`;
- `motion.gain` / `drag.gain`: sensibilità di telefono e trascinamento.

Parametri utili nell'indirizzo: `?tune`, `?capture`, `?skipintro` (salta la frase iniziale), `?quality=low`, `?glass=fast`, `?rot=0,50,0` (prova una rotazione del David), `?debug=noglass` (nasconde il vetro per controllare il marmo), `?model=percorso/altro.glb`, `?motion` (mostra il pulsante sensori anche su computer).

---

## 6. Come funziona (in breve)

- **Introduzione e svelamento**: la frase compare in dissolvenza, resta leggibile circa 3 secondi (un tocco la fa proseguire) mentre la scena si carica dietro. Poi la sfera emerge dallo stesso fondo antracite: gli oggetti partono "velati" del colore esatto dello sfondo e si accendono per gruppi (vetro → David e base → targhette), con un lento avvicinamento della camera. Con *riduci movimento* il passaggio è una dissolvenza semplice.
- **Musica**: i browser non permettono l'avvio automatico dell'audio, quindi parte al primo tocco (anche quello che salta l'introduzione) con una dissolvenza; il pulsante in alto a destra la spegne e la scelta viene ricordata. Si ferma quando la pagina non è visibile.

- **Vetro**: su computer, materiale fisico a trasmissione con spessore, indice di rifrazione basso (1,22) per non deformare il volto, riflettanza da vetro reale e un filtro di bordo che suggerisce lo spessore. Environment map da studio generata in tempo reale (softbox laterale, riempimento, lama di luce sul bordo). Su telefono si usa un vetro "veloce": stessi riflessi e stesso bordo, ma senza ridisegnare due volte la scena (circa metà del lavoro della scheda grafica).
- **Neve**: un unico oggetto `Points` con buffer dinamico. I fiocchi sono opachi, quindi entrano nel passaggio di rifrazione del vetro: si vedono davanti e dietro la testa con le occlusioni corrette, senza sparizioni. Simulazione con passo fisso ≤ 1/60 s e delta limitato, liquido con corrente, vortici e turbolenza che si smorzano, collisioni con vetro, fondo, scultura (sagoma ricavata dai vertici reali del modello) e targhetta. I fiocchi si depositano e vengono risollevati; nessun riciclo dall'alto.
- **Marmo**: mappatura triplanare (funziona anche su scansioni senza UV), venature appena percettibili, grana cristallina con micro-riflessi, diffusione sottosuperficiale approssimata. Normal map e occlusion della scansione vengono mantenute se presenti.
- **Sensori**: `DeviceMotionEvent.requestPermission()` chiamato direttamente nel tocco (iOS), gestione di permesso concesso/negato, errori, assenza di dati, HTTPS mancante; accelerazione senza gravità oppure ricavata da `accelerationIncludingGravity` con filtro passa-basso; filtro del rumore, zona morta, limite agli impulsi, orientamento dello schermo.
- **Gesti**: trascinamento lento = rotazione di osservazione con limiti; trascinamento rapido = agitazione. La modalità si decide all'inizio del gesto e non salta da una all'altra.
- **Prestazioni**: qualità scelta in base al dispositivo (su telefono anche marmo e base senza strati di vernice simulata), risoluzione adattiva in base al frame rate, numero di fiocchi ridotto solo durante l'ingresso, animazione sospesa quando la pagina non è visibile o quando tutta la neve si è posata, ombre ricalcolate solo quando serve, rispetto di *riduci movimento*.

---

## 7. Verifiche

**Eseguite** (Chrome headless con rendering software, quindi con frame rate molto basso):

- rendering desktop, telefono verticale e orizzontale; vetro, base, targhetta leggibile, ombra e caustica sul piano;
- caricamento di una vera scansione di testa (modello di prova della libreria three.js, non incluso) per controllare adattamento, marmo e collisioni; script `prepare-david.mjs` provato con STL e GLB;
- neve davanti e dietro la scultura attraverso il vetro, nessun fiocco fuori dal liquido (verifica numerica: 0 valori non validi, distanza massima dal centro sempre entro il vetro);
- simulazione a 60 e 24 fps: dopo un'agitazione tutta la neve si solleva, ricade in circa 20–25 s e si deposita; agitazioni successive sommano energia; ~0,3 ms per fotogramma con 1.800 fiocchi;
- percorsi dei sensori simulati: permesso concesso, negato, errore, `DeviceMotionEvent` assente, nessun dato, sola `accelerationIncludingGravity`;
- comparsa dell'augurio dopo la prima agitazione, senza coprire la sfera; messaggio d'errore se manca WebGL;
- caricamento di un GLB compresso con lo script, pannello `?tune`, generazione dell'anteprima con `?capture`;
- pausa completa della simulazione con la pagina nascosta e ripresa senza salti; *riduci movimento* (nessuna oscillazione dell'oggetto).

**Da verificare su un telefono reale** (non simulabili qui):

- sensazione dell'agitazione con i sensori veri su iPhone (Safari) e Android (Chrome): eventualmente regola `motion.gain`;
- fluidità effettiva e temperatura del telefono dopo un minuto;
- anteprima del link su WhatsApp dopo la pubblicazione.

---

## 8. Crediti e licenze

- [Three.js](https://threejs.org) — licenza MIT (`vendor/three/LICENSE`).
- Forum, Cormorant Garamond e Inter — SIL Open Font License (`assets/fonts/`).
- Musica: `assets/audio/musica-natale.mp3` (brano "Christmas" di Pulsebox, fornito dal cliente e ricompresso a 96 kbps). Verifica la licenza nella pagina da cui è stato scaricato.
- Texture di marmo e pietra: generate proceduralmente per questo progetto.
- Scansione del David (`assets/david-head.glb`, versione ottimizzata scaricata da Sketchfab e ricompressa): dati originali SMK – Statens Museum for Kunst, CC0; l'ottimizzazione su Sketchfab è CC BY, quindi inserisci il nome dell'autore nella riga `credit` di `js/config.js`.

**Nota sull'immagine del David.** La licenza CC0 riguarda la scansione. In Italia il Codice dei beni culturali prevede l'autorizzazione per gli usi commerciali dell'immagine dei beni culturali, e il Tribunale di Firenze ha dato ragione alla Galleria dell'Accademia in casi di uso pubblicitario del David (2017, 2023). Un biglietto di auguri ai clienti è un caso diverso da una campagna pubblicitaria, ma se la pagina ha un uso promozionale vale la pena chiedere un parere o contattare la Galleria. Questa nota è informativa e non sostituisce una consulenza legale.
