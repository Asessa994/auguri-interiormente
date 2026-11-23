// ─────────────────────────────────────────────────────────────
//  InteriormenteDesign · Sfera di neve — configurazione
//  Tutto ciò che serve personalizzare si trova in questo file.
// ─────────────────────────────────────────────────────────────

export const CONFIG = {
  // Palette: cambia i colori qui (anche l'interfaccia li eredita).
  palette: {
    background: '#EFE8DC',     // avorio caldo del fondale
    backgroundEdge: '#D8CDBC', // tono dei bordi (vignettatura morbida)
    marble: '#F7F5F0',         // marmo bianco caldo
    marbleVein: '#8F8A82',     // venature (molto attenuate)
    stone: '#2B2A28',          // pietra antracite della base
    brass: '#CDB27C',          // ottone champagne
    enamel: '#262523',         // fondo smaltato della targhetta
    snow: '#FFFFFF',
    text: '#2B2A28',
    textSoft: '#6E665C',
  },

  // Modello 3D della testa del David (GLB o glTF).
  david: {
    url: './assets/david-head.glb',
    autoFit: true,             // scala e centra automaticamente il modello sul supporto
    targetHeight: 0.98,        // altezza testa+collo in raggi della sfera (la sfera ha raggio 1)
    rotationDeg: [0, 0, 0],    // rotazione applicata PRIMA dell'adattamento (es. [-90, 0, 0] per modelli Z-up)
    offset: [0, 0, 0],         // spostamento finale [x, y, z]
    scale: 1,                  // moltiplicatore finale della scala
    keepScanMaps: true,        // mantiene normal map e occlusion map della scansione, se presenti
    marbleTint: 1.0,           // 1 = colore palette.marble
  },

  // Crediti mostrati in piccolo in basso (obbligatori se usi un modello con licenza CC BY).
  // Esempio: 'David: scansione SMK – Statens Museum for Kunst (CC0), ottimizzazione NOME AUTORE (CC BY 4.0)'
  credit: '',

  plaque: {
    text: 'InteriormenteDesign',
    font: './assets/fonts/cormorant-garamond-600.typeface.json',
  },

  greeting: [
    'Ogni spazio custodisce una storia.',
    'Grazie per averci affidato la vostra.',
    'Buon Natale da InteriormenteDesign.',
  ],

  // 'auto' | 'low' | 'medium' | 'high'  (puoi forzarlo anche con ?quality=low nell'indirizzo)
  quality: 'auto',

  motion: {
    gain: 1.35,         // quanto il movimento del telefono smuove il liquido
    deadzone: 0.5,      // m/s² ignorati (tremolio della mano)
    maxAccel: 24,       // m/s² massimo considerato per un singolo campione
  },

  drag: {
    gain: 0.55,         // forza del trascinamento rapido
  },
};
