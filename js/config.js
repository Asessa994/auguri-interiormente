// ─────────────────────────────────────────────────────────────
//  InteriormenteDesign · Sfera di neve — configurazione
//  Tutto ciò che serve personalizzare si trova in questo file.
// ─────────────────────────────────────────────────────────────

// Due ambientazioni pronte: 'scuro' (antracite caldo, come l'introduzione)
// oppure 'chiaro' (avorio). Cambia `stage` qui sotto per passare dall'una all'altra.
const PALETTES = {
  scuro: {
    background: '#26211E',     // antracite caldo: introduzione e fondale
    backgroundEdge: '#120F0E', // bordi del fondale (vignettatura)
    backdropLight: 0.62,       // luce sul fondale dietro la sfera (stacca l'oggetto dallo sfondo)
    wallDarken: 0.15,
    marble: '#F7F5F0',         // marmo bianco caldo
    marbleVein: '#8F8A82',     // venature (molto attenuate)
    stone: '#2F2D2B',          // pietra antracite della base
    brass: '#CDB27C',          // ottone champagne
    gold: '#D8B36A',           // oro della targhetta sulla base
    enamel: '#262523',         // filetto smaltato della targhetta interna
    plaqueText: '#111111',     // colore delle lettere delle targhette
    snow: '#FFFFFF',
    text: '#EFE8DC',           // avorio
    textSoft: '#B8AD9D',
  },
  chiaro: {
    background: '#EFE8DC',
    backgroundEdge: '#D8CDBC',
    backdropLight: 0.05,
    wallDarken: 0.62,
    marble: '#F7F5F0',
    marbleVein: '#8F8A82',
    stone: '#2B2A28',
    brass: '#CDB27C',
    gold: '#D8B36A',
    enamel: '#262523',
    plaqueText: '#111111',
    snow: '#FFFFFF',
    text: '#2B2A28',
    textSoft: '#6E665C',
  },
};

export const CONFIG = {
  stage: 'scuro',
  palettes: PALETTES,
  get palette() { return PALETTES[this.stage] || PALETTES.scuro; },

  // Introduzione: frase al centro su fondo antracite (font Forum).
  intro: {
    lines: ['C’è sempre spazio', 'per un po’ di meraviglia.'],
    holdSeconds: 3,            // tempo in cui la frase resta pienamente leggibile
  },

  // Cosa c'è nella sfera: 'colonne' (due colonne ioniche e lapide centrale)
  // oppure 'david' (la testa del David). Si può provare anche con ?scena=david
  scene: 'colonne',

  // Colonne ioniche (lo stesso modello usato due volte, ai lati).
  columns: {
    url: './assets/ionic-column.glb',
    height: 1.2,               // altezza di ciascuna colonna (la sfera ha raggio 1)
    spacing: 0.4,              // distanza di ogni colonna dal centro
    z: -0.07,                  // un poco arretrate rispetto alla lapide
    rotationDeg: [0, 0, 0],
    keepScanMaps: true,        // scanalature e dettagli dalla normal map del modello
    keepScanColor: true,       // ombreggiature "cotte" nella texture del modello
    marbleTint: 1.06,          // >1 schiarisce il marmo delle colonne
  },

  // Lapide in marmo al centro, davanti alle colonne.
  centralPlaque: {
    lines: ['Interiormente', 'Design'],
    width: 0.64,
    height: 0.38,
    z: 0.15,
    ink: '#3A3530',            // colore delle lettere incise
  },

  // Decorazioni natalizie (solo con le colonne)
  decor: {
    lights: {
      enabled: true,
      colors: ['#FF5A4F', '#FFC14D', '#5ED08A', '#5B9BFF', '#FFF1D6'],   // rosso, ambra, verde, blu, bianco caldo
      turns: 3.5,              // giri del filo attorno a ogni colonna
      bulbsPerColumn: 26,
    },
    tree: { enabled: true, x: 0, z: -0.27, height: 0.78 },
    gifts: { enabled: true },
    // Sorpresa: agitando a lungo, tutto si stacca dal fondo e poi torna al suo posto
    easterEgg: { enabled: true, seconds: 5, message: 'Hai agitato così tanto che si è staccato tutto…' },
  },

  // Modello 3D della testa del David (usato con scene: 'david').
  david: {
    url: './assets/david-head.glb',
    autoFit: true,             // scala e centra automaticamente il modello sul supporto
    targetHeight: 0.98,        // altezza testa+collo in raggi della sfera (la sfera ha raggio 1)
    rotationDeg: [0, 50, 0],   // rotazione applicata PRIMA dell'adattamento: Y = 50° porta il volto verso chi guarda
    offset: [0, 0, 0],         // spostamento finale [x, y, z]
    scale: 1,                  // moltiplicatore finale della scala
    keepScanMaps: true,        // mantiene normal map e occlusion map della scansione, se presenti
    marbleTint: 1.0,           // 1 = colore palette.marble
  },

  // Targhetta interna, davanti al David.
  plaque: {
    text: 'InteriormenteDesign',
    font: './assets/fonts/cormorant-garamond-600.typeface.json',
  },

  // Targhetta in oro sulla base della sfera (due righe).
  basePlaque: {
    lines: ['InteriormenteDesign', 'Pietro Ricciardi'],
  },

  // Crediti mostrati in piccolo in basso (obbligatori se usi un modello con licenza CC BY).
  // Esempio: 'David: scansione SMK – Statens Museum for Kunst (CC0), ottimizzazione NOME AUTORE (CC BY 4.0)'
  credit: '',

  greeting: [
    'Ogni spazio custodisce una storia.',
    'Grazie per averci affidato la vostra.',
    'Buon Natale da InteriormenteDesign.',
  ],

  // Musica di sottofondo: parte al primo tocco (i browser non permettono l'avvio automatico).
  music: {
    url: './assets/audio/musica-natale.mp3',
    volume: 0.45,
    enabled: true,
  },

  // 'auto' | 'low' | 'medium' | 'high'  (puoi forzarlo anche con ?quality=low nell'indirizzo)
  quality: 'auto',

  // Vetro: 'auto' = rifrazione vera su computer, vetro "veloce" su telefono
  //        'refraction' | 'fast' per forzarlo (anche con ?glass=fast)
  glass: 'auto',

  motion: {
    gain: 1.35,         // quanto il movimento del telefono smuove il liquido
    deadzone: 0.5,      // m/s² ignorati (tremolio della mano)
    maxAccel: 24,       // m/s² massimo considerato per un singolo campione
  },

  drag: {
    gain: 0.55,         // forza del trascinamento rapido
  },
};
