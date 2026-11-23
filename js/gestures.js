// ─────────────────────────────────────────────────────────────
//  Gesti con dito o mouse sulla scena.
//  • Trascinamento delicato → lenta rotazione di osservazione (con limiti).
//  • Trascinamento rapido   → agitazione della sfera.
//  La modalità si decide nei primi istanti del gesto e passa da
//  "rotazione" ad "agitazione" solo se il gesto accelera molto:
//  niente scatti, niente conflitti.
// ─────────────────────────────────────────────────────────────

const DECIDE_MS = 90;
const DECIDE_PX = 12;
const FAST = 3.0;      // raggi della sfera al secondo → agitazione
const FLICK = 6.0;     // durante la rotazione, oltre questa velocità si passa all'agitazione

export class GestureController {
  constructor(el, { getRadiusPx, onOrbit, onShake, onGrab, onFirstInteraction }) {
    this.el = el;
    this.getRadiusPx = getRadiusPx;
    this.onOrbit = onOrbit;           // (dAz, dEl) in radianti
    this.onShake = onShake;           // (dvx, dvy) Δv in raggi/s, assi schermo (y verso l'alto)
    this.onGrab = onGrab;             // (ox, oy) spostamento visivo della sfera in raggi
    this.onFirstInteraction = onFirstInteraction;
    this.pointerId = null;
    this._bind();
  }

  _bind() {
    const el = this.el;
    el.addEventListener('pointerdown', (e) => this._down(e));
    el.addEventListener('pointermove', (e) => this._move(e));
    el.addEventListener('pointerup', (e) => this._up(e));
    el.addEventListener('pointercancel', (e) => this._up(e, true));
    el.addEventListener('lostpointercapture', (e) => { if (e.pointerId === this.pointerId) this._up(e, true); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _down(e) {
    if (this.pointerId !== null) return; // un solo dito alla volta
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.pointerId = e.pointerId;
    try { this.el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    this.mode = 'pending';
    this.t0 = e.timeStamp || performance.now();
    this.x0 = this.lx = e.clientX;
    this.y0 = this.ly = e.clientY;
    this.lt = this.t0;
    this.vx = this.vy = 0;       // velocità filtrata (px/s)
    this.pvx = this.pvy = 0;     // velocità usata per l'ultimo impulso
    this.grabX = this.grabY = 0;
    this.onFirstInteraction?.();
  }

  _move(e) {
    if (e.pointerId !== this.pointerId) return;
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null;
    const list = events && events.length ? events : [e];
    for (const ev of list) this._sample(ev.clientX, ev.clientY, ev.timeStamp || performance.now());
  }

  _sample(x, y, t) {
    const dtMs = Math.max(1, t - this.lt);
    const dx = x - this.lx, dy = y - this.ly;
    this.lx = x; this.ly = y; this.lt = t;
    const R = Math.max(40, this.getRadiusPx());
    // velocità istantanea filtrata
    const k = 1 - Math.exp(-dtMs / 28);
    this.vx += ((dx / dtMs) * 1000 - this.vx) * k;
    this.vy += ((dy / dtMs) * 1000 - this.vy) * k;
    const speedR = Math.hypot(this.vx, this.vy) / R;

    if (this.mode === 'pending') {
      const dist = Math.hypot(x - this.x0, y - this.y0);
      if (t - this.t0 > DECIDE_MS || dist > DECIDE_PX) {
        this.mode = speedR > FAST ? 'shake' : 'orbit';
        if (this.mode === 'shake') { this.pvx = 0; this.pvy = 0; }
      } else {
        return;
      }
    }

    if (this.mode === 'orbit') {
      if (speedR > FLICK) {
        this.mode = 'shake';
        this.pvx = 0; this.pvy = 0;
      } else {
        this.onOrbit?.(-dx / R * 0.42, dy / R * 0.28);
        return;
      }
    }

    // agitazione: la sfera segue il dito; il liquido reagisce alle variazioni di velocità
    const dvx = (this.vx - this.pvx) / R;
    const dvy = (this.vy - this.pvy) / R;
    this.pvx = this.vx; this.pvy = this.vy;
    this.onShake?.(dvx, -dvy);
    this.grabX = Math.max(-1, Math.min(1, this.grabX + dx / R * 0.08));
    this.grabY = Math.max(-1, Math.min(1, this.grabY - dy / R * 0.08));
    this.onGrab?.(this.grabX * 0.05, this.grabY * 0.04);
  }

  _up(e, cancelled = false) {
    if (e.pointerId !== this.pointerId) return;
    if (this.mode === 'shake' && !cancelled) {
      const R = Math.max(40, this.getRadiusPx());
      // la sfera si ferma: il liquido prosegue per inerzia
      this.onShake?.(-this.pvx / R, this.pvy / R);
    }
    this.onGrab?.(0, 0);
    try { this.el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    this.pointerId = null;
    this.mode = null;
  }
}
