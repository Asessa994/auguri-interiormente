// Misure della scena (unità = raggio esterno della sfera di vetro).
export const DIM = {
  R: 1.0,               // raggio esterno del vetro
  GLASS_THICKNESS: 0.035,
  INNER_R: 0.962,       // raggio interno: confine del liquido per la neve
  GROUND_Y: -1.13,      // piano d'appoggio
  SEAT_Y: -0.645,       // dove il vetro entra nella base (anello in ottone)
  FLOOR_Y: -0.585,      // neve depositata sul fondo (superficie)
  PED_TOP: -0.40,       // piano superiore del supporto scultoreo
  TOP_Y: 1.0,
  // ingombro dell'oggetto completo per l'inquadratura
  FRAME_CENTER_Y: -0.065,
  FRAME_HEIGHT: 2.13,
  FRAME_WIDTH: 1.96,
};

// Raggio interno del vetro a una certa quota (sezione orizzontale della sfera).
export function innerRadiusAt(y) {
  const r2 = DIM.INNER_R * DIM.INNER_R - y * y;
  return r2 > 0 ? Math.sqrt(r2) : 0;
}
