import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DIM } from './dimensions.js';

// ─────────────────────────────────────────────────────────────
//  Decorazioni natalizie: filo di lucine sulle colonne, alberello
//  con palline e stella, pacchi regalo.
// ─────────────────────────────────────────────────────────────

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Lucine ─────────────────────────────────────────────────
// Filo a spirale attorno al fusto; il raggio segue la sagoma reale della colonna.
export function createColumnLights(column, sliceSet, cfg, { scaleUniform, showUniform, seed = 1 }) {
  const R = rng(seed);
  const group = new THREE.Group();
  group.name = 'lucine';
  const S = sliceSet;
  const radiusAt = (y) => {
    const f = THREE.MathUtils.clamp((y - S.yMin) / S.dy, 0, S.n);
    const k = Math.min(S.n - 1, Math.floor(f)), t = f - k;
    const r0 = (S.rx[k] + S.rz[k]) / 2, r1 = (S.rx[k + 1] + S.rz[k + 1]) / 2;
    return (r0 + (r1 - r0) * t) / 0.9; // il collisore è ristretto del 10%
  };
  const H = S.yMax - S.yMin;
  const yA = S.yMin + H * (cfg.from ?? 0.17), yB = S.yMin + H * (cfg.to ?? 0.83);
  const cx = S.bx, cz = S.bz;
  const turns = cfg.turns ?? 3.5;
  const phase0 = R() * Math.PI * 2;
  const at = (t, extra) => {
    const y = yA + (yB - yA) * t;
    const a = phase0 + t * turns * Math.PI * 2;
    const r = radiusAt(y) + extra;
    return new THREE.Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
  };
  // coordinate locali della colonna (le luci la seguono se si muove)
  column.updateMatrix();
  const toLocal = column.matrix.clone().invert();

  const wirePts = [];
  for (let i = 0; i <= 220; i++) wirePts.push(at(i / 220, 0.006).applyMatrix4(toLocal));
  const wire = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wirePts), 440, 0.0016, 5, false),
    new THREE.MeshStandardMaterial({ color: '#1E2A20', roughness: 0.55, metalness: 0.1 })
  );
  group.add(wire);

  const n = cfg.bulbsPerColumn ?? 26;
  const colors = (cfg.colors || ['#FF5A4F', '#FFC14D', '#5ED08A', '#5B9BFF', '#FFF1D6']).map((c) => new THREE.Color(c));
  const bulbGeo = new THREE.SphereGeometry(cfg.bulbSize ?? 0.0088, 10, 8);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, n);
  bulbs.name = 'lampadine';
  const glowPos = new Float32Array(n * 3);
  const glowCol = new Float32Array(n * 3);
  const glowBright = new Float32Array(n);
  const base = [], speed = new Float32Array(n), phase = new Float32Array(n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const p = at((i + 0.5) / n, 0.013).applyMatrix4(toLocal);
    m.makeTranslation(p.x, p.y, p.z);
    bulbs.setMatrixAt(i, m);
    glowPos.set([p.x, p.y, p.z], i * 3);
    const c = colors[i % colors.length];
    base.push(c);
    glowCol.set([c.r, c.g, c.b], i * 3);
    speed[i] = 0.7 + R() * 1.1;
    phase[i] = R() * Math.PI * 2;
    bulbs.setColorAt(i, c);
  }
  bulbs.instanceMatrix.needsUpdate = true;
  group.add(bulbs);

  // alone luminoso (additivo, sopra il vetro): fa "accendere" le lampadine
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
  gGeo.setAttribute('aColor', new THREE.BufferAttribute(glowCol, 3));
  const brightAttr = new THREE.BufferAttribute(glowBright, 1);
  brightAttr.setUsage(THREE.DynamicDrawUsage);
  gGeo.setAttribute('aBright', brightAttr);
  const glowMat = new THREE.ShaderMaterial({
    uniforms: { uScale: scaleUniform, uShow: showUniform, uSize: { value: cfg.glowSize ?? 0.095 } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor; attribute float aBright;
      uniform float uScale; uniform float uSize;
      varying vec3 vColor; varying float vBright;
      void main() {
        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uScale / -mv.z;
        vColor = aColor; vBright = aBright;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uShow;
      varying vec3 vColor; varying float vBright;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot( c, c );
        if ( r2 > 1.0 ) discard;
        float g = ( exp( -r2 * 7.0 ) * 0.9 + exp( -r2 * 2.2 ) * 0.25 ) * vBright * uShow;
        gl_FragColor = vec4( vColor * g, 1.0 );
      }`,
    // non "transparent": così entra anche nell'immagine che il vetro rifrange (su computer),
    // invece di essere nascosto dalla profondità del vetro; la somma additiva resta attiva
    transparent: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Points(gGeo, glowMat);
  glow.renderOrder = 1;
  glow.frustumCulled = false;
  group.add(glow);
  column.add(group);

  const white = new THREE.Color(1, 1, 1);
  const tmp = new THREE.Color();
  return {
    group,
    materials: [wire.material, bulbMat],
    update(t, reduced) {
      for (let i = 0; i < n; i++) {
        let b;
        if (reduced) b = 0.72 + 0.12 * Math.sin(t * 0.5 + phase[i]);
        else {
          const s = 0.5 + 0.5 * Math.sin(t * speed[i] + phase[i]);
          b = 0.1 + 0.9 * s * s * (3 - 2 * s);   // accensione e spegnimento morbidi
        }
        glowBright[i] = b;
        tmp.copy(base[i]).lerp(white, b * 0.3).multiplyScalar(0.16 + 0.95 * b);
        bulbs.setColorAt(i, tmp);
      }
      bulbs.instanceColor.needsUpdate = true;
      brightAttr.needsUpdate = true;
    },
  };
}

// ── Alberello ──────────────────────────────────────────────
export function createTree(cfg) {
  const R = rng(7);
  const group = new THREE.Group();
  group.name = 'alberello';
  const h = cfg.height ?? 0.58;
  const k = h / 0.58;
  const green = new THREE.MeshStandardMaterial({ color: cfg.color || '#1F4A35', roughness: 0.82, metalness: 0 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.022 * k, 0.028 * k, 0.09 * k, 12), new THREE.MeshStandardMaterial({ color: '#4A3424', roughness: 0.9 }));
  trunk.position.y = 0.045 * k;
  group.add(trunk);
  const tiers = [[0.19, 0.22, 0.07], [0.15, 0.2, 0.19], [0.112, 0.17, 0.3], [0.072, 0.14, 0.4]];
  const cones = [];
  for (const [r, th, y] of tiers) {
    const g = new THREE.ConeGeometry(r * k, th * k, 54, 6, true);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const rr = Math.hypot(v.x, v.z);
      if (rr < 1e-4) continue;
      const a = Math.atan2(v.z, v.x);
      const edge = 1 - (v.y / (th * k) + 0.5); // 1 sul bordo inferiore
      const s = 1 + (0.07 * Math.sin(a * 9) + 0.04 * (R() - 0.5)) * edge;
      v.x *= s; v.z *= s;
      v.y -= 0.012 * k * edge * (0.5 + 0.5 * Math.sin(a * 9 + 1.3));
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    const c = new THREE.Mesh(g, green);
    c.position.y = (y + th / 2) * k;
    cones.push({ r: r * k, y0: y * k, h: th * k });
    group.add(c);
  }
  // palline
  const n = cfg.ornaments ?? 22;
  const orn = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0115 * k, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.65, roughness: 0.28 }), n);
  const oc = (cfg.ornamentColors || ['#D8B36A', '#A3302A', '#EFE8DC']).map((c) => new THREE.Color(c));
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const c = cones[i % cones.length];
    const f = 0.25 + R() * 0.6;                       // altezza lungo il cono (0 base, 1 punta)
    const a = R() * Math.PI * 2 + i * 2.4;
    const rr = c.r * (1 - f) + 0.006 * k;
    m.makeTranslation(Math.cos(a) * rr, c.y0 + f * c.h, Math.sin(a) * rr);
    orn.setMatrixAt(i, m);
    orn.setColorAt(i, oc[i % oc.length]);
  }
  group.add(orn);
  // stella
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = (i % 2 ? 0.015 : 0.036) * k;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r); else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  star.closePath();
  const sg = new THREE.ExtrudeGeometry(star, { depth: 0.007 * k, bevelEnabled: true, bevelThickness: 0.002 * k, bevelSize: 0.002 * k, bevelSegments: 1 });
  sg.center();
  const starMesh = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: '#E2C07A', metalness: 0.9, roughness: 0.25, emissive: '#8A6A2A', emissiveIntensity: 0.55 }));
  starMesh.position.y = (0.4 + 0.14) * k + 0.03 * k;
  group.add(starMesh);
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.position.set(cfg.x ?? 0, DIM.FLOOR_Y - 0.004, cfg.z ?? -0.27);
  return { group, star: starMesh };
}

// ── Pacchi regalo ──────────────────────────────────────────
const GIFTS = [
  { x: -0.21, z: 0.37, s: 0.082, paper: '#8E2A2A', ribbon: '#D8B36A', yaw: 0.4 },
  { x: 0.25, z: 0.38, s: 0.07, paper: '#2D5A3F', ribbon: '#D8B36A', yaw: -0.5 },
  { x: -0.55, z: 0.13, s: 0.066, paper: '#EFE8DC', ribbon: '#A3302A', yaw: 0.9 },
  { x: 0.55, z: 0.2, s: 0.076, paper: '#283A5C', ribbon: '#D8B36A', yaw: -0.2 },
  { x: -0.2, z: -0.4, s: 0.06, paper: '#C9A55C', ribbon: '#8E2A2A', yaw: 0.2 },
  { x: 0.22, z: -0.42, s: 0.056, paper: '#8E2A2A', ribbon: '#EFE8DC', yaw: 1.1 },
];

export function createGifts(cfg = {}) {
  const list = cfg.items || GIFTS;
  const cache = new Map();
  const mat = (color, metal) => {
    const key = color + metal;
    if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial({ color, metalness: metal ? 0.75 : 0, roughness: metal ? 0.32 : 0.55 }));
    return cache.get(key);
  };
  return list.map((g) => {
    const group = new THREE.Group();
    group.name = 'regalo';
    const k = cfg.scale ?? 1.25;
    const w = g.s * k, h = g.s * 0.8 * k, d = g.s * 0.9 * k;
    const box = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.004), mat(g.paper, false));
    const metal = g.ribbon === '#D8B36A';
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(w + 0.002, h + 0.002, d * 0.18), mat(g.ribbon, metal));
    const r2 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.18, h + 0.002, d + 0.002), mat(g.ribbon, metal));
    const loopGeo = new THREE.TorusGeometry(w * 0.16, w * 0.035, 6, 16);
    const l1 = new THREE.Mesh(loopGeo, mat(g.ribbon, metal));
    const l2 = new THREE.Mesh(loopGeo, mat(g.ribbon, metal));
    l1.position.set(-w * 0.12, h / 2 + w * 0.1, 0); l1.rotation.set(0, 0, 0.6);
    l2.position.set(w * 0.12, h / 2 + w * 0.1, 0); l2.rotation.set(0, 0, -0.6);
    group.add(box, r1, r2, l1, l2);
    group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.position.set(g.x, DIM.FLOOR_Y + 0.016 + h / 2, g.z);
    group.rotation.y = g.yaw;
    return { group, half: new THREE.Vector3(w / 2, h / 2, d / 2), radius: Math.hypot(w, h, d) / 2 };
  });
}
