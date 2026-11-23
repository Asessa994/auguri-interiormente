import * as THREE from 'three';

// Inversa (approssimata) del tone mapping "Neutral" di three.js.
// Serve perché il fondale, una volta passato dal tone mapping, abbia
// esattamente il colore dello sfondo della pagina (introduzione compresa),
// sia visto direttamente sia attraverso il vetro.
export function inverseNeutral(color) {
  const t = color.clone();               // colore lineare desiderato in uscita
  const mt = Math.min(t.r, t.g, t.b);
  let offset;
  if (mt < 0.04) {
    const m = Math.sqrt(mt / 6.25);       // min(c) tale che m - 6.25 m² = m - mt
    offset = m - mt;
  } else {
    offset = 0.04;
  }
  return new THREE.Color(t.r + offset, t.g + offset, t.b + offset);
}
