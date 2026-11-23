import * as THREE from 'three';
import { DIM, innerRadiusAt } from './dimensions.js';

// ─────────────────────────────────────────────────────────────
//  Neve immersa in un liquido.
//  • Il liquido ha una corrente d'insieme, alcuni vortici e una
//    turbolenza a divergenza nulla: tutti si smorzano nel tempo.
//  • Ogni fiocco insegue la velocità del liquido con una propria
//    inerzia e cade lentamente alla sua velocità limite.
//  • Collisioni con vetro, fondo, scultura e targhetta; i fiocchi
//    si depositano e vengono risollevati quando il liquido si muove.
//  Passo fisso ≤ 1/60 s con delta limitato: risultato indipendente
//  dal frame rate. Nessun fiocco viene mai "riciclato".
// ─────────────────────────────────────────────────────────────

const MAX_VORTICES = 7;
const FLOOR_RMAX = innerRadiusAt(DIM.FLOOR_Y) + 0.02;

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SnowSimulation {
  constructor(maxCount, { reducedMotion = false, fineTurbulence = true, maxVortices = MAX_VORTICES } = {}) {
    this.fineTurbulence = fineTurbulence; // seconda ottava di turbolenza (solo su computer)
    this.maxVortices = maxVortices;
    this._frame = 0;
    this.N = maxCount;
    this.active = maxCount;
    this.reducedMotion = reducedMotion;
    this.random = rand(1504);
    const N = maxCount;
    this.pos = new Float32Array(N * 3);
    this.vel = new Float32Array(N * 3);
    this.rad = new Float32Array(N);
    this.size = new Float32Array(N);
    this.sink = new Float32Array(N);
    this.tau = new Float32Array(N);
    this.lift = new Float32Array(N);
    this.restH = new Float32Array(N);
    this.phase = new Float32Array(N);
    this.freq = new Float32Array(N);
    this.seed = new Float32Array(N);
    this.spark = new Float32Array(N);
    this.rest = new Uint8Array(N);

    // liquido
    this.U = new THREE.Vector3();
    this.E = 0;
    this.vortices = [];
    this.pending = 0;
    this.pendingDir = new THREE.Vector3();
    this.time = 0;
    this._u = new Float32Array(3);
    this._stir = 0;

    this.slices = null;
    this.plaque = null;

    this.meanSpeed = 0;
    this.movingCount = 0;
    this.asleep = false;
    this.shakeCount = 0;

    this._initParticles();
  }

  setColliders({ slices, plaque }) {
    this.slices = slices;
    if (plaque) {
      this.plaque = {
        cx: plaque.center.x, cy: plaque.center.y, cz: plaque.center.z,
        c: Math.cos(plaque.rotX), s: Math.sin(plaque.rotX),
        hx: plaque.half.x, hy: plaque.half.y, hz: plaque.half.z,
      };
    }
    // risolve le compenetrazioni iniziali
    for (let i = 0; i < this.N; i++) this._collide(i);
  }

  setActiveCount(n) {
    this.active = Math.max(200, Math.min(this.N, n | 0));
  }

  _initParticles() {
    const R = this.random;
    for (let i = 0; i < this.N; i++) {
      const u = R();
      const d = 0.0082 + 0.018 * Math.pow(u, 2.4);   // diametro visivo (neve fine)
      const k = (d - 0.0082) / 0.018;
      this.size[i] = d;
      this.rad[i] = d * 0.5;
      this.sink[i] = 0.042 + 0.055 * k + R() * 0.018; // velocità limite (raggi/s)
      this.tau[i] = 0.06 + 0.16 * k + R() * 0.04;    // inerzia (breve: la neve risponde subito)
      this.lift[i] = 0.05 + 0.18 * R();               // velocità del liquido per risollevarlo
      this.restH[i] = R() * 0.011;
      this.phase[i] = R() * Math.PI * 2;
      this.freq[i] = 0.6 + R() * 1.6;
      this.seed[i] = R();
      this.spark[i] = R() > 0.82 ? 0.5 + R() * 0.5 : 0;

      const o = i * 3;
      if (i % 6 !== 0) {
        // depositato sul fondo
        const a = R() * Math.PI * 2, r = (FLOOR_RMAX - 0.045) * Math.sqrt(R());
        this.pos[o] = Math.cos(a) * r;
        this.pos[o + 2] = Math.sin(a) * r;
        this.pos[o + 1] = this._floorY(this.pos[o], this.pos[o + 2]) + this.rad[i] + this.restH[i];
        this.rest[i] = 1;
      } else {
        // sospeso: cade lentamente all'apertura
        let x, y, z;
        do {
          x = (R() * 2 - 1) * 0.9; y = DIM.FLOOR_Y + 0.15 + R() * 1.35; z = (R() * 2 - 1) * 0.9;
        } while (x * x + y * y + z * z > 0.86 * 0.86);
        this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z;
        this.vel[o + 1] = -this.sink[i];
        this.rest[i] = 0;
      }
    }
  }

  _floorY(x, z) {
    const t = Math.min(1, Math.sqrt(x * x + z * z) / FLOOR_RMAX);
    return DIM.FLOOR_Y + 0.016 * (1 - t * t);
  }

  // ── impulsi ───────────────────────────────────────────────
  // dv = variazione di velocità del contenitore (raggi/s, coordinate scena)
  shake(dx, dy, dz) {
    let mag = Math.hypot(dx, dy, dz);
    if (mag < 1e-4) return;
    if (mag > 2.2) { const k = 2.2 / mag; dx *= k; dy *= k; dz *= k; mag = 2.2; }
    const rm = this.reducedMotion ? 0.7 : 1;
    // il liquido resta indietro rispetto al vetro…
    this.U.x -= dx * 0.85 * rm; this.U.y -= dy * 0.85 * rm; this.U.z -= dz * 0.85 * rm;
    // …e così i fiocchi già sospesi: reagiscono nello stesso istante, senza ritardo
    const kx = dx * 0.7 * rm, ky = dy * 0.7 * rm, kz = dz * 0.7 * rm;
    const v = this.vel;
    for (let i = 0; i < this.active; i++) {
      if (this.rest[i]) continue;
      const o = i * 3;
      v[o] -= kx; v[o + 1] -= ky; v[o + 2] -= kz;
    }
    const ul = this.U.length();
    if (ul > 2.4) this.U.multiplyScalar(2.4 / ul);
    this.E = Math.min(2.6, this.E + mag * 0.75 * rm);
    this.pending += mag;
    this.pendingDir.x += dx; this.pendingDir.y += dy; this.pendingDir.z += dz;
    if (this.pending > 0.2) this._spawnVortex();
    this.asleep = false;
    this.shakeCount++;
  }

  _spawnVortex() {
    const R = this.random;
    const dir = this.pendingDir.clone();
    const amount = this.pending;
    this.pending = 0;
    this.pendingDir.set(0, 0, 0);
    if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
    dir.normalize();
    const axis = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
    if (axis.lengthSq() < 0.09) {
      const a = R() * Math.PI * 2;
      axis.set(Math.cos(a), (R() - 0.5) * 0.4, Math.sin(a));
    }
    axis.normalize();
    // leggera variazione dell'asse per evitare moti troppo regolari
    axis.x += (R() - 0.5) * 0.5; axis.y += (R() - 0.5) * 0.5; axis.z += (R() - 0.5) * 0.5;
    axis.normalize();
    const sign = R() > 0.5 ? 1 : -1;
    const rm = this.reducedMotion ? 0.7 : 1;
    const strength = Math.min(3.4, 0.7 + amount * 1.5) * sign * rm;
    let c;
    do {
      c = new THREE.Vector3((R() * 2 - 1) * 0.55, DIM.FLOOR_Y + 0.2 + R() * 1.0, (R() * 2 - 1) * 0.55);
    } while (c.length() > 0.62);
    const v = { c, a: axis, s: strength, r: 0.3 + R() * 0.26 };
    if (this.vortices.length < this.maxVortices) this.vortices.push(v);
    else {
      // energia aggiunta al vortice più debole: niente ripartenze da zero
      let w = 0;
      for (let i = 1; i < this.vortices.length; i++) if (Math.abs(this.vortices[i].s) < Math.abs(this.vortices[w].s)) w = i;
      const old = this.vortices[w];
      old.s = Math.sign(old.s || 1) * Math.min(3.4, Math.abs(old.s) + Math.abs(strength) * 0.6);
    }
  }

  // ── campo di velocità del liquido ─────────────────────────
  _fluid(x, y, z, t) {
    const U = this.U;
    let ux = U.x, uy = U.y, uz = U.z;
    for (let k = 0; k < this.vortices.length; k++) {
      const v = this.vortices[k];
      const rx = x - v.c.x, ry = y - v.c.y, rz = z - v.c.z;
      const ax = v.a.x, ay = v.a.y, az = v.a.z;
      const along = rx * ax + ry * ay + rz * az;
      const px = rx - ax * along, py = ry - ay * along, pz = rz - az * along;
      const rho2 = px * px + py * py + pz * pz;
      const r2 = v.r * v.r;
      const f = v.s * Math.exp(-rho2 / r2 - (along * along) / (r2 * 2.6));
      ux += f * (ay * pz - az * py);
      uy += f * (az * px - ax * pz);
      uz += f * (ax * py - ay * px);
    }
    // sollevamento: il liquido agitato "rimescola" il fondo e solleva la neve depositata
    const fh = y - DIM.FLOOR_Y;
    if (fh < 0.55 && this._stir > 0.01) uy += this._stir * Math.exp(-fh / 0.2);
    // turbolenza a divergenza nulla (flusso ABC), due ottave
    const amp = this.E * 0.34 + 0.0045;
    const ph = t * 0.45;
    const k1 = 3.3;
    ux += amp * 0.5 * (Math.sin(k1 * z + ph) + Math.cos(k1 * y - 0.7 * ph));
    uy += amp * 0.5 * (Math.sin(k1 * x + 1.3 * ph) + Math.cos(k1 * z + 0.5 * ph));
    uz += amp * 0.5 * (Math.sin(k1 * y - 0.9 * ph) + Math.cos(k1 * x + 1.1 * ph));
    if (this.fineTurbulence && this.E > 0.05) {
      const a2 = this.E * 0.11, k2 = 7.1, p2 = t * 0.9;
      ux += a2 * (Math.sin(k2 * z - p2) + Math.cos(k2 * y + p2));
      uy += a2 * (Math.sin(k2 * x + p2) + Math.cos(k2 * z - p2));
      uz += a2 * (Math.sin(k2 * y + p2) + Math.cos(k2 * x - p2));
    }
    // il liquido scorre lungo il vetro, non lo attraversa
    const r = Math.sqrt(x * x + y * y + z * z);
    if (r > 0.68) {
      const nx = x / r, ny = y / r, nz = z / r;
      const un = ux * nx + uy * ny + uz * nz;
      if (un > 0) {
        const w = Math.min(1, (r - 0.68) / 0.26);
        ux -= nx * un * w; uy -= ny * un * w; uz -= nz * un * w;
      }
    }
    if (fh < 0.1 && uy < 0) uy *= Math.max(0, fh / 0.1);
    const o = this._u;
    o[0] = ux; o[1] = uy; o[2] = uz;
    return o;
  }

  // ── collisioni ────────────────────────────────────────────
  // restituisce 1 se il fiocco poggia su una superficie rivolta verso l'alto
  _collide(i) {
    const p = this.pos, v = this.vel, o = i * 3;
    const rad = this.rad[i];
    let x = p[o], y = p[o + 1], z = p[o + 2];
    let up = 0;

    // fondo innevato
    const fy = this._floorY(x, z) + rad;
    if (y < fy) {
      y = fy;
      if (v[o + 1] < 0) v[o + 1] = 0;
      v[o] *= 0.7; v[o + 2] *= 0.7;
      up = 1;
    }

    // scultura (pila di ellissi)
    const S = this.slices;
    if (S && y > S.yMin && y < S.yMax + rad) {
      let f = (y - S.yMin) / S.dy;
      let k = Math.floor(f);
      let t = f - k;
      if (k >= S.n) { k = S.n - 1; t = 1; }
      const k1 = k + 1;
      let rx0 = S.rx[k], rx1 = S.rx[k1];
      if (rx0 === 0 && rx1 === 0) { /* niente */ }
      else {
        if (rx0 === 0) t = 1; else if (rx1 === 0) t = 0;
        const cx = S.cx[k] + (S.cx[k1] - S.cx[k]) * t;
        const cz = S.cz[k] + (S.cz[k1] - S.cz[k]) * t;
        const erx = (rx0 + (rx1 - rx0) * t) + rad;
        const erz = (S.rz[k] + (S.rz[k1] - S.rz[k]) * t) + rad;
        const ex = (x - cx) / erx, ez = (z - cz) / erz;
        const d2 = ex * ex + ez * ez;
        if (d2 < 1) {
          const d = Math.sqrt(d2);
          const radialPen = (1 - d) * 0.5 * (erx + erz);
          // via di fuga verso l'alto (cranio, spalle, piano del supporto)
          let upDist = Infinity;
          for (let j = k1; j <= Math.min(S.n, k + 7); j++) {
            const sx = S.rx[j];
            const yj = S.yMin + j * S.dy;
            if (sx === 0) { upDist = yj - y; break; }
            const qx = (x - S.cx[j]) / (sx + rad), qz = (z - S.cz[j]) / (S.rz[j] + rad);
            if (qx * qx + qz * qz >= 1) { upDist = yj - y; break; }
            if (j === S.n) upDist = S.yMax + rad - y;
          }
          if (upDist < radialPen * 1.25 && upDist < 0.07) {
            y += Math.max(0, upDist);
            if (v[o + 1] < 0) v[o + 1] = 0;
            v[o] *= 0.8; v[o + 2] *= 0.8;
            up = 1;
          } else {
            let nx = ex, nz = ez, dd = d;
            if (dd < 1e-4) { nx = 1; nz = 0; dd = 1; }
            x = cx + (nx / dd) * erx;
            z = cz + (nz / dd) * erz;
            let gx = ex / erx, gz = ez / erz;
            const gl = Math.hypot(gx, gz) || 1;
            gx /= gl; gz /= gl;
            const vn = v[o] * gx + v[o + 2] * gz;
            if (vn < 0) { v[o] -= gx * vn; v[o + 2] -= gz * vn; }
          }
        }
      }
    }

    // targhetta (parallelepipedo inclinato)
    const P = this.plaque;
    if (P) {
      const dx = x - P.cx, dy = y - P.cy, dz = z - P.cz;
      const lx = dx;
      const ly = P.c * dy + P.s * dz;
      const lz = -P.s * dy + P.c * dz;
      const px = P.hx + rad - Math.abs(lx);
      const py = P.hy + rad - Math.abs(ly);
      const pz = P.hz + rad - Math.abs(lz);
      if (px > 0 && py > 0 && pz > 0) {
        let nlx = 0, nly = 0, nlz = 0;
        let nx2 = lx, ny2 = ly, nz2 = lz;
        if (px < py && px < pz) { nlx = Math.sign(lx) || 1; nx2 = nlx * (P.hx + rad); }
        else if (py < pz) { nly = Math.sign(ly) || 1; ny2 = nly * (P.hy + rad); }
        else { nlz = Math.sign(lz) || 1; nz2 = nlz * (P.hz + rad); }
        // ritorno in coordinate della scena (R = rotazione attorno a X)
        x = P.cx + nx2;
        y = P.cy + P.c * ny2 - P.s * nz2;
        z = P.cz + P.s * ny2 + P.c * nz2;
        const wnx = nlx, wny = P.c * nly - P.s * nlz, wnz = P.s * nly + P.c * nlz;
        const vn = v[o] * wnx + v[o + 1] * wny + v[o + 2] * wnz;
        if (vn < 0) { v[o] -= wnx * vn; v[o + 1] -= wny * vn; v[o + 2] -= wnz * vn; }
        if (wny > 0.6) up = 1;
      }
    }

    // vetro (sfera interna): ultimo vincolo, nessun fiocco esce mai dal liquido
    const r = Math.sqrt(x * x + y * y + z * z);
    const lim = DIM.INNER_R - rad;
    if (r > lim) {
      const nx = x / r, ny = y / r, nz = z / r;
      x = nx * lim; y = ny * lim; z = nz * lim;
      const vn = v[o] * nx + v[o + 1] * ny + v[o + 2] * nz;
      if (vn > 0) { v[o] -= nx * vn; v[o + 1] -= ny * vn; v[o + 2] -= nz * vn; }
      if (ny < -0.55) up = 1;
    }

    p[o] = x; p[o + 1] = y; p[o + 2] = z;
    return up;
  }

  // ── passo di simulazione ─────────────────────────────────
  update(dt) {
    dt = Math.min(Math.max(dt, 0), 0.05);
    if (dt === 0) return;
    const steps = Math.max(1, Math.ceil(dt / (1 / 60) - 1e-6));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      this.time += h;
      this._stepFluid(h);
      this._stepParticles(h, this.time);
    }
    this._wakeResting();
  }

  get fluidActive() {
    return this.U.lengthSq() > 0.0025 || this.E > 0.06 || this.vortices.length > 0;
  }

  _stepFluid(h) {
    this.U.multiplyScalar(Math.exp(-h / 0.55));
    this._stir = (this.E * 0.42 + this.U.length() * 0.55) * (this.reducedMotion ? 0.8 : 1);
    this.E *= Math.exp(-h / 2.4);
    if (this.E < 0.002) this.E = 0;
    const kv = Math.exp(-h / 2.2);
    for (let k = this.vortices.length - 1; k >= 0; k--) {
      const v = this.vortices[k];
      v.s *= kv;
      v.c.addScaledVector(this.U, h * 0.35);
      if (v.c.length() > 0.7) v.c.multiplyScalar(0.7 / v.c.length());
      if (Math.abs(v.s) < 0.03) this.vortices.splice(k, 1);
    }
    if (this.U.lengthSq() < 1e-6) this.U.set(0, 0, 0);
  }

  _stepParticles(h, t) {
    const p = this.pos, v = this.vel;
    let moving = 0, speedSum = 0;
    const flutter = 0.011;
    for (let i = 0; i < this.active; i++) {
      if (this.rest[i]) continue;
      const o = i * 3;
      const u = this._fluid(p[o], p[o + 1], p[o + 2], t);
      const ph = this.phase[i], fq = this.freq[i];
      const tx = u[0] + Math.sin(t * fq + ph) * flutter;
      const ty = u[1] - this.sink[i];
      const tz = u[2] + Math.cos(t * fq * 0.83 + ph * 1.7) * flutter;
      const a = h / (this.tau[i] + h);
      let vx = v[o] + (tx - v[o]) * a;
      let vy = v[o + 1] + (ty - v[o + 1]) * a;
      let vz = v[o + 2] + (tz - v[o + 2]) * a;
      const sp2 = vx * vx + vy * vy + vz * vz;
      if (sp2 > 9) { const k = 3 / Math.sqrt(sp2); vx *= k; vy *= k; vz *= k; }
      v[o] = vx; v[o + 1] = vy; v[o + 2] = vz;
      p[o] += vx * h; p[o + 1] += vy * h; p[o + 2] += vz * h;
      const up = this._collide(i);
      const s2 = v[o] * v[o] + v[o + 1] * v[o + 1] + v[o + 2] * v[o + 2];
      if (up) {
        const fluid2 = u[0] * u[0] + u[1] * u[1] + u[2] * u[2];
        const l = this.lift[i] * 0.7;
        if (s2 < 0.0036 && fluid2 < l * l) {
          this.rest[i] = 1;
          v[o] = v[o + 1] = v[o + 2] = 0;
          const fy = this._floorY(p[o], p[o + 2]) + this.rad[i];
          if (p[o + 1] < fy + 0.02) {
            const ny = fy + this.restH[i];
            const lim = DIM.INNER_R - this.rad[i];
            if (p[o] * p[o] + ny * ny + p[o + 2] * p[o + 2] < lim * lim) p[o + 1] = ny;
          }
          continue;
        }
      }
      moving++;
      speedSum += Math.sqrt(s2);
    }
    this.movingCount = moving;
    this.meanSpeed = speedSum / Math.max(1, this.active);
  }

  _wakeResting() {
    if (!this.fluidActive) {
      if (this.movingCount === 0) this.asleep = true;
      return;
    }
    this.asleep = false;
    const p = this.pos, v = this.vel, t = this.time;
    const R = this.random;
    // i fiocchi depositati vengono controllati a turno (1/3 per fotogramma): costo ridotto, risposta entro ~50 ms
    const phase = this._frame++ % 3;
    for (let i = phase; i < this.active; i += 3) {
      if (!this.rest[i]) continue;
      const o = i * 3;
      const u = this._fluid(p[o], p[o + 1], p[o + 2], t);
      const s2 = u[0] * u[0] + u[1] * u[1] + u[2] * u[2];
      const l = this.lift[i];
      if (s2 > l * l) {
        const s = Math.sqrt(s2);
        this.rest[i] = 0;
        v[o] = u[0] * 0.6;
        v[o + 1] = Math.max(0.1, Math.abs(u[1]) * 0.6 + (s - l) * 1.2) + 0.08 * R();
        v[o + 2] = u[2] * 0.6;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
//  Rendering: un solo oggetto Points con buffer dinamico.
//  I fiocchi sono opachi (dischi con discard, nessuna trasparenza):
//  così entrano nel passaggio di trasmissione del vetro, vengono
//  rifratti come il resto dell'interno e rispettano la profondità
//  davanti e dietro la scultura. Il campionamento filtrato della
//  trasmissione ne ammorbidisce i bordi.
// ─────────────────────────────────────────────────────────────
export function createSnowPoints(sim, palette, { softEdges = false } = {}) {
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(sim.pos, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('aSize', new THREE.BufferAttribute(sim.size, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(sim.seed, 1));
  geo.setAttribute('aSpark', new THREE.BufferAttribute(sim.spark, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), DIM.R);
  geo.setDrawRange(0, sim.active);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uScale: { value: 500 },
      uSizeBoost: { value: 1 },
      uDpr: { value: 1 },
      uBright: { value: 1 },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(palette.snow) },
      uLightDir: { value: new THREE.Vector3(-0.5, 0.6, 0.6).normalize() },
      uFloorY: { value: DIM.FLOOR_Y },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aSeed;
      attribute float aSpark;
      uniform float uScale;
      uniform float uSizeBoost;
      uniform float uDpr;
      uniform float uBright;
      varying float vSeed;
      varying float vSpark;
      varying float vFade;
      varying float vFloor;
      uniform float uFloorY;
      void main() {
        vFloor = 1.0 - smoothstep( uFloorY + 0.012, uFloorY + 0.06, position.y );
        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mv;
        // su schermi piccoli i fiocchi crescono un po' per restare visibili; minimo ~2 px CSS
        float px = aSize * uSizeBoost * uScale / -mv.z;
        float minPx = 2.2 * uDpr;
        gl_PointSize = max( px, minPx );
        vFade = clamp( px / minPx, 0.6, 1.0 );
        vSeed = aSeed;
        vSpark = aSpark;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uLightDir;
      uniform float uTime;
      uniform float uBright;
      varying float vSeed;
      varying float vSpark;
      varying float vFade;
      varying float vFloor;
      void main() {
        if ( uBright < 0.01 ) discard;   // neve ancora al buio durante lo svelamento
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot( c, c );
        #if SOFT_EDGES == 1
          if ( r2 > 1.0 ) discard;
        #else
          if ( r2 > 0.86 ) discard;
        #endif
        // fiocco piatto e opaco: leggera luce dal lato della lampada, nessun bordo scuro
        float side = clamp( dot( c * vec2( 1.0, -1.0 ), normalize( uLightDir.xy + 1e-4 ) ) * 0.5 + 0.5, 0.0, 1.0 );
        // lato in luce più chiaro, lato in ombra appena grigio: il fiocco si stacca dal fondo chiaro
        vec3 col = uColor * ( 0.84 + 0.24 * side ) * ( 0.95 + 0.05 * vSeed ) * mix( 0.92, 1.0, vFade ) * uBright;
        float glint = pow( max( 0.0, sin( uTime * ( 1.1 + vSeed * 2.6 ) + vSeed * 61.0 ) ), 36.0 ) * vSpark;
        col += glint * 0.5 * ( 1.0 - vFloor );
        col *= 1.0 - 0.1 * vFloor;   // i fiocchi depositati si fondono con il letto di neve
        #if SOFT_EDGES == 1
          float a = ( 1.0 - smoothstep( 0.8, 1.0, r2 ) ) * min( 1.0, uBright * 1.5 );   // nucleo pieno, solo il bordo sfuma
        #else
          float a = 1.0;
        #endif
        gl_FragColor = vec4( col, a );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: false,
    depthWrite: true,
    // senza rifrazione (vetro veloce) i bordi si ammorbidiscono con l'antialiasing
    alphaToCoverage: softEdges,
    defines: { SOFT_EDGES: softEdges ? 1 : 0 },
  });

  const points = new THREE.Points(geo, material);
  points.name = 'snow';
  points.frustumCulled = false;
  return points;
}
