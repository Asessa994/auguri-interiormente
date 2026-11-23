# Sfera di neve · InteriormenteDesign

Pagina web 3D per gli auguri di Natale: una sfera di vetro con la testa del David in marmo, neve immersa nel liquido, base in pietra antracite con dettagli in ottone. Si agita con il telefono, con il pulsante **Agita la sfera** o trascinando rapidamente.

Il progetto è statico (HTML, CSS, JavaScript, Three.js incluso): non serve nessun server particolare né alcun account. Basta pubblicare la cartella su un hosting **HTTPS**.

---

## 1. Cosa manca: il modello del David

La cartella contiene tutto tranne la scansione 3D, che va scaricata dal sito di origine (non è stato possibile scaricarla qui). Finché manca, nella sfera compare un **segnaposto astratto**, segnalato in alto a destra come *provvisorio*.

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

- `palette`: avorio, marmo, antracite, ottone, colori dei testi (anche l'interfaccia li eredita);
- `greeting`: le tre righe dell'augurio;
- `plaque.text`: la scritta della targhetta;
- `david`: file, rotazione, altezza, posizione;
- `quality`: `'auto'` oppure `'low' | 'medium' | 'high'`;
- `motion.gain` / `drag.gain`: sensibilità di telefono e trascinamento.

Parametri utili nell'indirizzo: `?tune`, `?capture`, `?quality=low`, `?debug=noglass` (nasconde il vetro per controllare il marmo), `?model=percorso/altro.glb`, `?motion` (mostra il pulsante sensori anche su computer).

---

## 6. Come funziona (in breve)

- **Vetro**: materiale fisico a trasmissione con spessore, indice di rifrazione basso (1,22) per non deformare il volto, riflettanza da vetro reale e un filtro di bordo che suggerisce lo spessore. Environment map da studio generata in tempo reale (softbox laterale, riempimento, lama di luce sul bordo).
- **Neve**: un unico oggetto `Points` con buffer dinamico. I fiocchi sono opachi, quindi entrano nel passaggio di rifrazione del vetro: si vedono davanti e dietro la testa con le occlusioni corrette, senza sparizioni. Simulazione con passo fisso ≤ 1/60 s e delta limitato, liquido con corrente, vortici e turbolenza che si smorzano, collisioni con vetro, fondo, scultura (sagoma ricavata dai vertici reali del modello) e targhetta. I fiocchi si depositano e vengono risollevati; nessun riciclo dall'alto.
- **Marmo**: mappatura triplanare (funziona anche su scansioni senza UV), venature appena percettibili, grana cristallina con micro-riflessi, diffusione sottosuperficiale approssimata. Normal map e occlusion della scansione vengono mantenute se presenti.
- **Sensori**: `DeviceMotionEvent.requestPermission()` chiamato direttamente nel tocco (iOS), gestione di permesso concesso/negato, errori, assenza di dati, HTTPS mancante; accelerazione senza gravità oppure ricavata da `accelerationIncludingGravity` con filtro passa-basso; filtro del rumore, zona morta, limite agli impulsi, orientamento dello schermo.
- **Gesti**: trascinamento lento = rotazione di osservazione con limiti; trascinamento rapido = agitazione. La modalità si decide all'inizio del gesto e non salta da una all'altra.
- **Prestazioni**: qualità scelta in base al dispositivo, risoluzione adattiva in base al frame rate, numero di fiocchi ridotto solo durante l'ingresso, animazione sospesa quando la pagina non è visibile o quando tutta la neve si è posata, ombre ricalcolate solo quando serve, rispetto di *riduci movimento*.

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
- Cormorant Garamond e Inter — SIL Open Font License (`assets/fonts/`).
- Texture di marmo e pietra: generate proceduralmente per questo progetto.
- Scansione del David (quando aggiunta): SMK – Statens Museum for Kunst, CC0. Citazione di cortesia consigliata: *“Head of Michelangelo's David”, SMK – National Gallery of Denmark, scansione Scan The World.*

**Nota sull'immagine del David.** La licenza CC0 riguarda la scansione. In Italia il Codice dei beni culturali prevede l'autorizzazione per gli usi commerciali dell'immagine dei beni culturali, e il Tribunale di Firenze ha dato ragione alla Galleria dell'Accademia in casi di uso pubblicitario del David (2017, 2023). Un biglietto di auguri ai clienti è un caso diverso da una campagna pubblicitaria, ma se la pagina ha un uso promozionale vale la pena chiedere un parere o contattare la Galleria. Questa nota è informativa e non sostituisce una consulenza legale.
