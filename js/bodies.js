import * as THREE from 'three';
import { DIM, innerRadiusAt } from './dimensions.js';

// ─────────────────────────────────────────────────────────────
//  Oggetti che si muovono nel liquido.
//  • Pacchi regalo: sempre liberi, trascinati dalla corrente della
//    neve, rotolano e si riposano appoggiati su una faccia.
//  • Sorpresa: dopo un'agitazione lunga colonne, lapide e albero si
//    staccano dal fondo e fluttuano; quando tutto si calma tornano
//    dolcemente al loro posto.
// ─────────────────────────────────────────────────────────────

const UP = new THREE.Vector3(0, 1, 0);
const FLOOR_RMAX = innerRadiusAt(DIM.FLOOR_Y) + 0.02;
const floorY = (x, z) => {
  const t = Math.min(1, Math.hypot(x, z) / FLOOR_RMAX);
  return DIM.FLOOR_Y + 0.016 * (1 - t * t);
};

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// quaternione "appoggiato": l'asse locale più vicino alla verticale viene raddrizzato
function restingQuaternion(q, out) {
  const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  let best = null, bestDot = 0;
  for (const a of axes) {
    const w = a.clone().applyQuaternion(q);
    const d = w.dot(UP);
    if (Math.abs(d) > Math.abs(bestDot)) { bestDot = d; best = w; }
  }
  const target = UP.clone().multiplyScalar(Math.sign(bestDot) || 1);
  const align = new THREE.Quaternion().setFromUnitVectors(best.normalize(), target);
  return out.copy(align).multiply(q).normalize();
}

export class Floaters {
  constructor({ sim, gifts = [], eggBodies = [], obstacles = [], reduced = false }) {
    this.sim = sim;
    this.reduced = reduced;
    this.R = rand(25);
    this.obstacles = obstacles;   // cilindri {x, z, r, yTop} e scatole {cx, cz, hx, hz, yTop}
    this.gifts = gifts.map((g) => ({
      obj: g.group, half: g.half, radius: g.radius,
      p: g.group.position.clone(), v: new THREE.Vector3(),
      q: g.group.quaternion.clone(), w: new THREE.Vector3(),
      rest: true, home: g.group.position.clone(), homeQ: g.group.quaternion.clone(),
    }));
    this.bodies = eggBodies.map((b) => {
      b.obj.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(b.obj, true);
      const center = box.getCenter(new THREE.Vector3());
      const parentInv = b.obj.parent.matrixWorld.clone().invert();
      center.applyMatrix4(parentInv);              // nel sistema dell'interno della sfera
      const min = box.min.clone().applyMatrix4(parentInv), max = box.max.clone().applyMatrix4(parentInv);
      const invQ = b.obj.quaternion.clone().invert();
      const probes = [];
      for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) probes.push(new THREE.Vector3(x, y, z).sub(center).applyQuaternion(invQ));
      // limiti propri: al suo posto l'oggetto è un po' affondato nella neve e deve poterci tornare
      let rMax = 0;
      for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) rMax = Math.max(rMax, Math.hypot(x, y, z));
      return {
        floor: Math.min(DIM.FLOOR_Y + 0.006, min.y - 0.0005),
        glass: Math.max(DIM.INNER_R - 0.012, rMax + 0.0005),
        obj: b.obj, home: center.clone(), homeQ: b.obj.quaternion.clone(),
        offset: b.obj.position.clone().sub(center).applyQuaternion(invQ),   // origine rispetto al baricentro (locale)
        p: center.clone(), v: new THREE.Vector3(), q: b.obj.quaternion.clone(), w: new THREE.Vector3(),
        probes, core: b.core ?? 0.12, mass: b.mass ?? 1,
      };
    });
    this.egg = 'home';          // 'home' | 'free' | 'return'
    this.eggTime = 0;
    this.calmTime = 0;
    this.moving = false;
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
  }

  get eggActive() { return this.egg !== 'home'; }

  trigger() {
    if (this.egg !== 'home' || !this.bodies.length) return false;
    this.egg = 'free';
    this.eggTime = 0;
    this.calmTime = 0;
    const R = this.R;
    for (const b of this.bodies) {
      b.v.set((R() - 0.5) * 0.25, 0.32 + R() * 0.2, (R() - 0.5) * 0.2).divideScalar(b.mass);
      b.w.set((R() - 0.5) * 1.4, (R() - 0.5) * 1.0, (R() - 0.5) * 1.4).divideScalar(b.mass);
    }
    for (const g of this.gifts) { g.rest = false; g.v.y += 0.4 + R() * 0.3; g.w.set(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(4); }
    return true;
  }

  _fluid(p) {
    const u = this.sim._fluid(p.x, p.y, p.z, this.sim.time);
    return this._v.set(u[0], u[1], u[2]);
  }

  update(dt, shaking) {
    dt = Math.min(dt, 0.05);
    const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
    const h = dt / steps;
    let moving = false;
    for (let s = 0; s < steps; s++) {
      if (this._stepGifts(h)) moving = true;
      if (this.egg !== 'home') { this._stepBodies(h, shaking); moving = true; }
    }
    this.moving = moving;
    return moving;
  }

  // ── pacchi ──────────────────────────────────────────────
  _stepGifts(h) {
    const sim = this.sim;
    const free = this.egg !== 'home';
    const fluidOn = sim.fluidActive || free;
    let any = false;
    for (const g of this.gifts) {
      if (g.rest && !fluidOn) continue;
      const u = this._fluid(g.p);
      const sp = u.length();
      if (g.rest) {
        if (sp < 0.22 && !free) continue;   // serve una corrente decisa per smuovere un pacco
        g.rest = false;
      }
      any = true;
      // trascinamento della corrente + peso (quasi nullo durante la sorpresa)
      const tau = 0.4, grav = free ? 0.12 : 1.1;
      g.v.x += ((u.x - g.v.x) / tau) * h;
      g.v.y += ((u.y - g.v.y) / tau - grav) * h;
      g.v.z += ((u.z - g.v.z) / tau) * h;
      g.p.addScaledVector(g.v, h);

      // altezza d'appoggio secondo l'orientamento attuale
      const m = new THREE.Matrix4().makeRotationFromQuaternion(g.q).elements;
      const hy = Math.abs(m[1]) * g.half.x + Math.abs(m[5]) * g.half.y + Math.abs(m[9]) * g.half.z;
      let onFloor = false;
      const fy = floorY(g.p.x, g.p.z) + hy;
      if (g.p.y < fy) {
        g.p.y = fy;
        if (g.v.y < 0) g.v.y *= -0.15;
        const fr = Math.exp(-h * 5);
        g.v.x *= fr; g.v.z *= fr;
        onFloor = true;
      }
      // ostacoli fissi (solo quando le sculture sono al loro posto)
      if (!free) {
        for (const o of this.obstacles) {
          if (g.p.y - hy > o.yTop) continue;
          if (o.r !== undefined) {
            const dx = g.p.x - o.x, dz = g.p.z - o.z, d = Math.hypot(dx, dz), min = o.r + g.radius * 0.8;
            if (d < min && d > 1e-5) {
              const nx = dx / d, nz = dz / d;
              g.p.x = o.x + nx * min; g.p.z = o.z + nz * min;
              const vn = g.v.x * nx + g.v.z * nz;
              if (vn < 0) { g.v.x -= nx * vn * 1.3; g.v.z -= nz * vn * 1.3; }
            }
          } else {
            const lx = g.p.x - o.cx, lz = g.p.z - o.cz;
            const px = o.hx + g.radius * 0.8 - Math.abs(lx), pz = o.hz + g.radius * 0.8 - Math.abs(lz);
            if (px > 0 && pz > 0) {
              if (px < pz) { g.p.x += Math.sign(lx) * px; g.v.x = Math.sign(lx) * Math.abs(g.v.x) * 0.3; }
              else { g.p.z += Math.sign(lz) * pz; g.v.z = Math.sign(lz) * Math.abs(g.v.z) * 0.3; }
            }
          }
        }
      }
      // vetro
      const r = g.p.length(), lim = DIM.INNER_R - g.radius;
      if (r > lim) {
        const n = g.p.clone().divideScalar(r);
        g.p.copy(n).multiplyScalar(lim);
        const vn = g.v.dot(n);
        if (vn > 0) g.v.addScaledVector(n, -vn * 1.3);
      }
      // rotazione: rotolano nel verso del moto, poi si adagiano su una faccia
      const rollK = onFloor ? 10 : 3;
      g.w.x += g.v.z * rollK * h;
      g.w.z -= g.v.x * rollK * h;
      g.w.multiplyScalar(Math.exp(-h * (onFloor ? 4 : 1.5)));
      const wl = g.w.length();
      if (wl > 1e-5) {
        this._q.setFromAxisAngle(this._v.copy(g.w).divideScalar(wl), wl * h);
        g.q.premultiply(this._q).normalize();
      }
      if (onFloor) {
        const target = restingQuaternion(g.q, new THREE.Quaternion());
        g.q.slerp(target, Math.min(1, h * 6));
      }
      if (onFloor && g.v.lengthSq() < 0.0004 && wl < 0.05 && sp < 0.15 && !free) {
        g.rest = true;
        g.v.set(0, 0, 0); g.w.set(0, 0, 0);
        g.q.copy(restingQuaternion(g.q, new THREE.Quaternion()));
      }
      g.obj.position.copy(g.p);
      g.obj.quaternion.copy(g.q);
    }
    // urti tra pacchi
    for (let i = 0; i < this.gifts.length; i++) {
      for (let j = i + 1; j < this.gifts.length; j++) {
        const a = this.gifts[i], b = this.gifts[j];
        const d = this._v.subVectors(b.p, a.p), l = d.length(), min = (a.radius + b.radius) * 0.85;
        if (l < min && l > 1e-5) {
          d.divideScalar(l).multiplyScalar((min - l) / 2);
          a.p.sub(d); b.p.add(d);
          a.obj.position.copy(a.p); b.obj.position.copy(b.p);
          if (a.rest || b.rest) { a.rest = b.rest = false; }
        }
      }
    }
    return any;
  }

  // ── sorpresa: sculture che si staccano e poi tornano ──────
  _stepBodies(h, shaking) {
    this.eggTime += h;
    const calm = !shaking && this.sim.E < 0.45;
    this.calmTime = calm ? this.calmTime + h : 0;
    if (this.egg === 'free' && this.eggTime > 4 && this.calmTime > 2.5) this.egg = 'return';

    let settled = true;
    for (const b of this.bodies) {
      if (this.egg === 'free') {
        const u = this._fluid(b.p);
        const k = 0.9 / b.mass;                           // molla debole verso casa: vagano senza fuggire
        b.v.x += ((u.x * 0.7 - b.v.x) / 1.1 + (b.home.x - b.p.x) * k) * h;
        b.v.y += ((u.y * 0.7 - b.v.y) / 1.1 + (b.home.y + 0.12 - b.p.y) * k) * h;
        b.v.z += ((u.z * 0.7 - b.v.z) / 1.1 + (b.home.z - b.p.z) * k) * h;
        // piccola coppia casuale e richiamo leggero verso la posizione verticale
        b.w.x += (this.R() - 0.5) * 0.8 * h; b.w.z += (this.R() - 0.5) * 0.8 * h;
        this._q.copy(b.q).invert().premultiply(b.homeQ);
        const ang = 2 * Math.acos(Math.min(1, Math.abs(this._q.w)));
        if (ang > 1e-4) {
          const ax = this._v.set(this._q.x, this._q.y, this._q.z).normalize().multiplyScalar(Math.sign(this._q.w) || 1);
          b.w.addScaledVector(ax, ang * 0.7 * h);
        }
        b.w.multiplyScalar(Math.exp(-h * 0.6));
      } else {
        // ritorno: molla smorzata criticamente e rotazione verso quella originale
        const k = 7, c = 2 * Math.sqrt(k);
        b.v.x += ((b.home.x - b.p.x) * k - b.v.x * c) * h;
        b.v.y += ((b.home.y - b.p.y) * k - b.v.y * c) * h;
        b.v.z += ((b.home.z - b.p.z) * k - b.v.z * c) * h;
        b.w.multiplyScalar(Math.exp(-h * 6));
        b.q.slerp(b.homeQ, Math.min(1, h * 2.2));
      }
      b.p.addScaledVector(b.v, h);
      const wl = b.w.length();
      if (wl > 1e-5) {
        this._q.setFromAxisAngle(this._v.copy(b.w).divideScalar(wl), wl * h);
        b.q.premultiply(this._q).normalize();
      }
      // vincoli: dentro il vetro e sopra il fondo (sugli spigoli del volume)
      for (let it = 0; it < 2; it++) {
        let push = null, depth = 0;
        for (const pr of b.probes) {
          const wp = this._v.copy(pr).applyQuaternion(b.q).add(b.p);
          const r = wp.length(), lim = b.glass;
          if (r > lim && r - lim > depth) { depth = r - lim; push = wp.clone().divideScalar(-r); }
          const fy = b.floor - wp.y;
          if (fy > depth) { depth = fy; push = UP.clone(); }
        }
        if (!push) break;
        b.p.addScaledVector(push, depth);
        const vn = b.v.dot(push);
        if (vn < 0) b.v.addScaledVector(push, -vn * 1.2);
        b.w.multiplyScalar(0.92);
      }
      b.obj.position.copy(b.offset).applyQuaternion(b.q).add(b.p);
      b.obj.quaternion.copy(b.q);
      if (this.egg === 'return') {
        const ang = 2 * Math.acos(Math.min(1, Math.abs(b.q.dot(b.homeQ))));
        if (b.p.distanceTo(b.home) > 0.002 || ang > 0.004 || b.v.length() > 0.01) settled = false;
      }
    }
    // le sculture non si attraversano troppo (sfere attorno al baricentro)
    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        const a = this.bodies[i], b = this.bodies[j];
        const d = this._v.subVectors(b.p, a.p), l = d.length(), min = a.core + b.core;
        if (l < min && l > 1e-5) {
          d.divideScalar(l).multiplyScalar((min - l) / 2);
          a.p.sub(d); b.p.add(d);
        }
      }
    }
    if (this.egg === 'return' && settled) {
      for (const b of this.bodies) {
        b.p.copy(b.home); b.q.copy(b.homeQ); b.v.set(0, 0, 0); b.w.set(0, 0, 0);
        b.obj.position.copy(b.offset).applyQuaternion(b.homeQ).add(b.home);
        b.obj.quaternion.copy(b.homeQ);
      }
      this.egg = 'home';
      this.onSettled?.();
    }
  }
}
