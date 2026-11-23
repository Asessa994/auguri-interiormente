// ─────────────────────────────────────────────────────────────
//  Sensori di movimento del telefono (DeviceMotionEvent).
//  • Permesso richiesto direttamente dentro il gesto (iOS 13+).
//  • Accelerazione senza gravità, oppure ricavata filtrando
//    accelerationIncludingGravity con un passa-basso.
//  • Filtro del rumore, zona morta, limite agli impulsi eccessivi.
//  • Conversione dagli assi del dispositivo agli assi dello schermo
//    tenendo conto della rotazione (verticale/orizzontale).
// ─────────────────────────────────────────────────────────────

export const MotionState = {
  IDLE: 'idle',
  REQUESTING: 'requesting',
  ACTIVE: 'active',
  DENIED: 'denied',
  UNSUPPORTED: 'unsupported',
  INSECURE: 'insecure',
  NO_DATA: 'nodata',
  ERROR: 'error',
};

export class MotionController {
  constructor({ onImpulse, onState, config }) {
    this.onImpulse = onImpulse;   // (sx, sy, sz, dt) — Δv in m/s negli assi schermo
    this.onState = onState;
    this.cfg = config;
    this.state = MotionState.IDLE;
    this._handler = (e) => this._onMotion(e);
    this._reset();
  }

  _reset() {
    this.gravity = null;
    this.smooth = [0, 0, 0];
    this.last = 0;
    this.startedAt = 0;
    this.validSamples = 0;
    this.usingGravityFilter = false;
  }

  static get available() {
    return typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
  }

  _set(state, detail) {
    this.state = state;
    this.onState?.(state, detail);
  }

  // Da chiamare SINCRONAMENTE dentro il gestore del tocco/clic.
  enable() {
    if (this.state === MotionState.ACTIVE) return Promise.resolve(this.state);
    if (!MotionController.available) {
      this._set(MotionState.UNSUPPORTED);
      return Promise.resolve(this.state);
    }
    if (!window.isSecureContext) {
      this._set(MotionState.INSECURE);
      return Promise.resolve(this.state);
    }
    const DME = window.DeviceMotionEvent;
    if (typeof DME.requestPermission === 'function') {
      this._set(MotionState.REQUESTING);
      let p;
      try {
        p = DME.requestPermission(); // nessun await prima di questa chiamata: resta nel gesto dell'utente
      } catch (err) {
        this._set(MotionState.ERROR, err);
        return Promise.resolve(this.state);
      }
      return Promise.resolve(p).then((res) => {
        if (res === 'granted') this._start();
        else this._set(MotionState.DENIED);
        return this.state;
      }).catch((err) => {
        // Safari lancia un errore se la richiesta non arriva da un gesto o se è già stata negata
        const denied = /denied|not allowed|NotAllowed/i.test(String(err && (err.name || err.message)));
        this._set(denied ? MotionState.DENIED : MotionState.ERROR, err);
        return this.state;
      });
    }
    this._start();
    return Promise.resolve(this.state);
  }

  _start() {
    this._reset();
    this.startedAt = performance.now();
    window.addEventListener('devicemotion', this._handler);
    this._set(MotionState.REQUESTING);
    clearTimeout(this._watchdog);
    // se entro 2,5 s non arrivano dati validi, il dispositivo non ha sensori utilizzabili
    this._watchdog = setTimeout(() => {
      if (this.validSamples === 0) {
        this.stop();
        this._set(MotionState.NO_DATA);
      }
    }, 2500);
  }

  stop() {
    window.removeEventListener('devicemotion', this._handler);
    clearTimeout(this._watchdog);
  }

  _screenAngle() {
    const so = window.screen && window.screen.orientation;
    if (so && typeof so.angle === 'number') return so.angle;
    if (typeof window.orientation === 'number') return window.orientation;
    return 0;
  }

  _onMotion(e) {
    const now = performance.now();
    let dt = this.last ? (now - this.last) / 1000 : 1 / 60;
    this.last = now;
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);

    let ax, ay, az;
    const a = e.acceleration;
    if (a && a.x != null && a.y != null && a.z != null && !this.forceGravityFilter) {
      ax = a.x; ay = a.y; az = a.z;
      this.usingGravityFilter = false;
    } else {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x == null || g.y == null || g.z == null) return;
      this.usingGravityFilter = true;
      if (!this.gravity) this.gravity = [g.x, g.y, g.z];
      // passa-basso (~0,3 s) per stimare la gravità; il resto è il gesto
      const k = 1 - Math.exp(-dt / 0.3);
      this.gravity[0] += (g.x - this.gravity[0]) * k;
      this.gravity[1] += (g.y - this.gravity[1]) * k;
      this.gravity[2] += (g.z - this.gravity[2]) * k;
      ax = g.x - this.gravity[0]; ay = g.y - this.gravity[1]; az = g.z - this.gravity[2];
    }
    if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az)) return;

    this.validSamples++;
    if (this.validSamples === 1) {
      clearTimeout(this._watchdog);
      this._set(MotionState.ACTIVE, { gravityFilter: this.usingGravityFilter });
    }
    // breve assestamento iniziale del filtro di gravità
    if (this.usingGravityFilter && now - this.startedAt < 350) return;

    // filtro del rumore (passa-basso ~25 ms: toglie il tremolio senza ritardare il gesto)
    const ks = 1 - Math.exp(-dt / 0.025);
    const s = this.smooth;
    s[0] += (ax - s[0]) * ks; s[1] += (ay - s[1]) * ks; s[2] += (az - s[2]) * ks;

    let mag = Math.hypot(s[0], s[1], s[2]);
    const dz = this.cfg.deadzone;
    if (mag <= dz) return;
    // zona morta morbida + limite agli impulsi eccessivi
    const eff = Math.min(mag - dz, this.cfg.maxAccel);
    const scale = eff / mag;
    let dx = s[0] * scale, dy = s[1] * scale, dzv = s[2] * scale;

    // assi dispositivo → assi schermo
    const ang = (this._screenAngle() * Math.PI) / 180;
    const c = Math.cos(ang), sn = Math.sin(ang);
    const sx = dx * c - dy * sn;
    const sy = dx * sn + dy * c;

    this.onImpulse?.(sx * dt, sy * dt, dzv * dt, dt);
  }
}
