import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { DIM, innerRadiusAt } from './dimensions.js';

// ─────────────────────────────────────────────────────────────
//  Oggetto: base in pietra con anello in ottone, sfera di vetro,
//  letto di neve, supporto scultoreo e targhetta in ottone.
// ─────────────────────────────────────────────────────────────

function lathe(points, segments = 96) {
  const pts = points.map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, segments);
  g.computeVertexNormals();
  return g;
}

// Profilo della base (raggio, quota): plinto, sguscio, collare.
function baseProfile() {
  const G = DIM.GROUND_Y;
  const s = DIM.SEAT_Y;
  const H = s - G; // altezza totale della base
  const p = (r, t) => [r, G + t * H];
  return [
    [0, G], p(0.952, 0), p(0.968, 0.012), p(0.975, 0.032), p(0.975, 0.14),
    p(0.968, 0.155), p(0.95, 0.162), p(0.944, 0.18),
    p(0.936, 0.26), p(0.92, 0.38), p(0.9, 0.5), p(0.878, 0.62), p(0.858, 0.74), p(0.846, 0.84),
    p(0.84, 0.92), p(0.832, 0.97), p(0.818, 0.995), p(0.79, 1.0), [0.0, s],
  ];
}

// Raggio esterno della base a una certa quota (per appoggiarvi la targhetta).
function baseRadiusAt(y) {
  const pts = baseProfile().filter(([r]) => r > 0.5);
  for (let i = 0; i < pts.length - 1; i++) {
    const [r0, y0] = pts[i], [r1, y1] = pts[i + 1];
    if (y1 !== y0 && (y - y0) * (y - y1) <= 0) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return 0.9;
}

function pedestalProfile() {
  const F = DIM.FLOOR_Y - 0.03;
  const T = DIM.PED_TOP;
  const H = T - F;
  const p = (r, t) => [r, F + t * H];
  return [
    [0, F], p(0.212, 0), p(0.212, 0.14), p(0.204, 0.18), p(0.211, 0.24), p(0.206, 0.31),
    p(0.188, 0.35), p(0.162, 0.4), p(0.152, 0.47), p(0.146, 0.62), p(0.146, 0.76),
    p(0.152, 0.8), p(0.17, 0.84), p(0.181, 0.89), p(0.181, 0.96), p(0.172, 1.0), [0, T],
  ];
}

// Letto di neve: disco leggermente bombato con piccole irregolarità.
function snowBedGeometry() {
  const rMax = innerRadiusAt(DIM.FLOOR_Y) + 0.02;
  const rings = 26, seg = 96;
  const pos = [], idx = [];
  pos.push(0, DIM.FLOOR_Y + 0.016, 0);
  for (let i = 1; i <= rings; i++) {
    const t = i / rings;
    const r = rMax * t;
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const bump = 0.004 * Math.sin(x * 23 + z * 7) * Math.cos(z * 19 - x * 5) + 0.003 * Math.sin(a * 7 + t * 11);
      const y = DIM.FLOOR_Y + 0.016 * (1 - t * t) + bump * (1 - t) - (t > 0.97 ? (t - 0.97) * 0.4 : 0);
      pos.push(x, y, z);
    }
  }
  for (let j = 0; j < seg; j++) idx.push(0, 1 + ((j + 1) % seg), 1 + j);
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = 1 + i * seg + j, b = 1 + i * seg + ((j + 1) % seg);
      const c = 1 + (i + 1) * seg + j, d = 1 + (i + 1) * seg + ((j + 1) % seg);
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Ombreggiatura del bordo: suggerisce lo spessore del vetro.
function glassEdgeMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTint: { value: new THREE.Color('#3B3F3C') },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        vN = normalize( normalMatrix * normal );
        vV = normalize( -mv.xyz );
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint;
      uniform float uOpacity;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = 1.0 - abs( dot( normalize( vN ), normalize( vV ) ) );
        float band = smoothstep( 0.72, 0.985, f );
        float line = smoothstep( 0.965, 0.995, f );
        vec3 col = mix( uTint, vec3( 1.0 ), line * 0.75 );
        float a = band * 0.2 + line * 0.12;
        gl_FragColor = vec4( col, a * uOpacity );
        #include <colorspace_fragment>
      }
    `,
  });
}

export async function buildGlobe(materials, palette, plaqueCfg, { basePlaqueLines = null, maxAnisotropy = 8, pedestal: withPedestal = true, innerPlaque = true, centralPlaque = null } = {}) {
  const group = new THREE.Group();
  group.name = 'globe';

  // Base in pietra antracite.
  const base = new THREE.Mesh(lathe(baseProfile(), 128), materials.stone);
  base.name = 'base';
  base.receiveShadow = false;
  group.add(base);

  // Sottile filetto in ottone alla base del plinto.
  const fillet = new THREE.Mesh(new THREE.TorusGeometry(0.977, 0.0055, 10, 160), materials.brass);
  fillet.rotation.x = Math.PI / 2;
  fillet.position.y = DIM.GROUND_Y + (DIM.SEAT_Y - DIM.GROUND_Y) * 0.155;
  group.add(fillet);

  // Anello in ottone satinato dove il vetro entra nella base.
  const sy = DIM.SEAT_Y;
  const ringProfile = [
    [0.771, sy - 0.012], [0.828, sy - 0.012], [0.836, sy - 0.006], [0.838, sy + 0.004],
    [0.832, sy + 0.012], [0.79, sy + 0.017], [0.771, sy + 0.017],
  ];
  const ring = new THREE.Mesh(lathe(ringProfile, 160), materials.brass);
  ring.name = 'seat-ring';
  group.add(ring);

  // Targhetta in oro sulla base.
  let basePlaque = null;
  if (basePlaqueLines && basePlaqueLines.length) {
    try {
      basePlaque = await buildBasePlaque(palette, basePlaqueLines, maxAnisotropy);
      group.add(basePlaque.group);
    } catch (e) {
      console.error('[targhetta base] non creata:', e); // la scena prosegue comunque
      basePlaque = null;
    }
  }

  // Interno.
  const interior = new THREE.Group();
  interior.name = 'interior';
  group.add(interior);

  const bed = new THREE.Mesh(snowBedGeometry(), materials.snowBed);
  bed.name = 'snow-bed';
  bed.receiveShadow = true;
  interior.add(bed);

  const pedestal = new THREE.Mesh(lathe(pedestalProfile(), 96), materials.marble);
  pedestal.name = 'pedestal';
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  if (withPedestal) interior.add(pedestal);

  const plaque = innerPlaque ? await buildPlaque(materials, plaqueCfg) : null;
  if (plaque) interior.add(plaque.group);

  // Lapide centrale in marmo con l'iscrizione (versione con le colonne).
  let marblePlaque = null;
  if (centralPlaque) {
    try {
      marblePlaque = await buildMarblePlaque(materials, centralPlaque, maxAnisotropy);
      interior.add(marblePlaque.group);
    } catch (e) {
      console.error('[lapide] non creata:', e);
    }
  }

  // Vetro.
  const glassGeo = new THREE.SphereGeometry(DIM.R, 128, 96);
  const glass = new THREE.Mesh(glassGeo, materials.glass);
  glass.name = 'glass';
  glass.castShadow = false;
  glass.receiveShadow = false;
  group.add(glass);

  const edge = new THREE.Mesh(new THREE.SphereGeometry(DIM.R * 1.0008, 96, 64), glassEdgeMaterial());
  edge.name = 'glass-edge';
  edge.renderOrder = 2;
  group.add(edge);

  return { group, interior, base, pedestal: withPedestal ? pedestal : null, plaque, glass, edge, bed, basePlaque, marblePlaque };
}

// ─────────────────────────────────────────────────────────────
//  Lapide in marmo tra le colonne: iscrizione incisa (lettere scure
//  in incavo, con normal map calcolata dal testo) su un piccolo zoccolo.
// ─────────────────────────────────────────────────────────────
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / n;
      acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / n;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

async function buildMarblePlaque(materials, cfg, maxAnisotropy) {
  const group = new THREE.Group();
  group.name = 'marble-plaque';
  const W = cfg.width ?? 0.56, H = cfg.height ?? 0.34, D = 0.05;
  const PH = 0.045;                               // zoccolo
  const z0 = cfg.z ?? 0.03;
  const lines = cfg.lines?.length ? cfg.lines : ['Interiormente', 'Design'];

  // ── texture dell'iscrizione ──
  await loadFont('400 120px Forum');
  const cw = 1024, ch = Math.round(cw * (H / W));
  const mk = () => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; return c; };
  const maskC = mk(), mctx = maskC.getContext('2d');
  mctx.fillStyle = '#000'; mctx.fillRect(0, 0, cw, ch);
  mctx.fillStyle = mctx.strokeStyle = '#fff';
  // cornice incisa (doppio filetto)
  mctx.lineWidth = 5; mctx.strokeRect(cw * 0.045, ch * 0.07, cw * 0.91, ch * 0.86);
  mctx.lineWidth = 2; mctx.strokeRect(cw * 0.065, ch * 0.105, cw * 0.87, ch * 0.79);
  const font = (s) => `400 ${s}px Forum, 'Cormorant Garamond', serif`;
  let size = Math.round(ch * (lines.length > 1 ? 0.27 : 0.34));
  mctx.font = font(size);
  const widest = Math.max(...lines.map((l) => mctx.measureText(l).width));
  if (widest > cw * 0.76) size = Math.floor((size * cw * 0.76) / widest);
  mctx.font = font(size);
  mctx.textAlign = 'center';
  mctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in mctx) mctx.letterSpacing = Math.round(size * 0.04) + 'px';
  mctx.lineJoin = 'round';
  mctx.lineWidth = Math.max(2, size * 0.03);
  const lh = size * 1.18;
  const firstBase = ch / 2 - (lh * (lines.length - 1)) / 2 + size * 0.34;
  lines.forEach((l, i) => { mctx.strokeText(l, cw / 2, firstBase + i * lh); mctx.fillText(l, cw / 2, firstBase + i * lh); });

  const img = mctx.getImageData(0, 0, cw, ch).data;
  const mask = new Float32Array(cw * ch);
  for (let i = 0; i < cw * ch; i++) mask[i] = img[i * 4] / 255;
  const soft = boxBlur(mask, cw, ch, 2);

  // colore: marmo bianco con incavi scuri (come un'iscrizione dipinta)
  const albC = mk(), actx = albC.getContext('2d');
  const alb = actx.createImageData(cw, ch);
  const ink = new THREE.Color(cfg.ink || '#3A3530');
  const ir = Math.round(ink.r * 255), ig = Math.round(ink.g * 255), ib = Math.round(ink.b * 255);
  // normal map dal rilievo (lettere in incavo)
  const norC = mk(), nctx = norC.getContext('2d');
  const nor = nctx.createImageData(cw, ch);
  const strength = 3.2;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = y * cw + x, k = mask[i] * 0.85 + soft[i] * 0.15;
      alb.data[i * 4] = Math.round(255 + (ir - 255) * k);
      alb.data[i * 4 + 1] = Math.round(255 + (ig - 255) * k);
      alb.data[i * 4 + 2] = Math.round(255 + (ib - 255) * k);
      alb.data[i * 4 + 3] = 255;
      const xl = soft[y * cw + Math.max(0, x - 1)], xr = soft[y * cw + Math.min(cw - 1, x + 1)];
      const yu = soft[Math.max(0, y - 1) * cw + x], yd = soft[Math.min(ch - 1, y + 1) * cw + x];
      let nx = (xr - xl) * 0.5 * strength, ny = -(yd - yu) * 0.5 * strength;
      const l = Math.hypot(nx, ny, 1);
      nor.data[i * 4] = Math.round((nx / l * 0.5 + 0.5) * 255);
      nor.data[i * 4 + 1] = Math.round((ny / l * 0.5 + 0.5) * 255);
      nor.data[i * 4 + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
      nor.data[i * 4 + 3] = 255;
    }
  }
  actx.putImageData(alb, 0, 0);
  nctx.putImageData(nor, 0, 0);
  const albTex = new THREE.CanvasTexture(albC);
  albTex.colorSpace = THREE.SRGBColorSpace;
  albTex.anisotropy = Math.min(8, maxAnisotropy);
  const norTex = new THREE.CanvasTexture(norC);
  norTex.colorSpace = THREE.NoColorSpace;
  norTex.anisotropy = Math.min(8, maxAnisotropy);

  // ── geometria ──
  const bodyMat = materials.makeMarble();
  const faceMat = materials.makeMarble();
  faceMat.map = albTex;
  faceMat.normalMap = norTex;
  faceMat.normalScale = new THREE.Vector2(1, 1);
  faceMat.polygonOffset = true;
  faceMat.polygonOffsetFactor = -2;
  faceMat.polygonOffsetUnits = -2;

  const baseY = DIM.FLOOR_Y - 0.004;
  const plinth = new THREE.Mesh(new RoundedBoxGeometry(W + 0.07, PH, D + 0.06, 2, 0.006), bodyMat);
  plinth.position.set(0, baseY + PH / 2, z0);
  const slab = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 3, 0.008), bodyMat);
  slab.position.set(0, baseY + PH + H / 2, z0);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.014, H - 0.014), faceMat);
  face.position.set(0, baseY + PH + H / 2, z0 + D / 2 + 0.0007);
  for (const m of [plinth, slab]) { m.castShadow = true; m.receiveShadow = true; }
  face.receiveShadow = true;
  face.name = 'marble-plaque-face';
  group.add(plinth, slab, face);

  const colliders = [
    { center: plinth.position.clone(), half: new THREE.Vector3((W + 0.07) / 2, PH / 2, (D + 0.06) / 2), rotX: 0 },
    { center: slab.position.clone(), half: new THREE.Vector3(W / 2, H / 2, D / 2), rotX: 0 },
  ];
  return { group, colliders, materials: [bodyMat, faceMat] };
}

// ─────────────────────────────────────────────────────────────
//  Targhetta in oro sulla base: lastra curva che segue la pietra,
//  con incisione nera in Forum disegnata su una texture nitida.
// ─────────────────────────────────────────────────────────────
async function loadFont(spec, timeout = 2500) {
  if (!document.fonts || !document.fonts.load) return;
  try {
    await Promise.race([document.fonts.load(spec), new Promise((r) => setTimeout(r, timeout))]);
  } catch { /* si usa il font di riserva */ }
}

async function buildBasePlaque(palette, lines, maxAnisotropy) {
  const group = new THREE.Group();
  group.name = 'base-plaque';
  const y0 = -0.965, y1 = -0.785;          // fascia frontale dello sguscio
  const H = y1 - y0;
  const rb = baseRadiusAt(y0), rt = baseRadiusAt(y1);
  const W = 0.76;
  const half = W / ((rb + rt) / 2) / 2;    // semiampiezza angolare
  const T = 0.006;                          // spessore della lastra

  // texture: colore (sRGB) e dati (rugosità in G, metallo in B)
  await loadFont('400 120px Forum');
  const cw = 2048;
  const ch = Math.round(cw * (H / W));
  const colorCanvas = document.createElement('canvas');
  const dataCanvas = document.createElement('canvas');
  colorCanvas.width = dataCanvas.width = cw;
  colorCanvas.height = dataCanvas.height = ch;
  const cc = colorCanvas.getContext('2d');
  const dc = dataCanvas.getContext('2d');
  cc.fillStyle = '#ffffff'; cc.fillRect(0, 0, cw, ch);
  dc.fillStyle = 'rgb(255,150,255)'; dc.fillRect(0, 0, cw, ch);   // piastra: metallo satinato
  const ink = palette.plaqueText || '#111111';
  const inkData = 'rgb(0,255,0)';            // lettere: nero opaco, non metallico
  const draw = (fn) => { cc.fillStyle = cc.strokeStyle = ink; dc.fillStyle = dc.strokeStyle = inkData; fn(cc); fn(dc); };

  // filetto inciso lungo il bordo
  draw((c) => { c.lineWidth = 5; c.strokeRect(26, 22, cw - 52, ch - 44); });
  const [first, second] = lines;
  const fit = (text, size, maxW) => {
    cc.font = `400 ${size}px Forum, 'Cormorant Garamond', serif`;
    const w = cc.measureText(text).width;
    return w > maxW ? Math.floor((size * maxW) / w) : size;
  };
  const s1 = fit(first, Math.round(ch * 0.4), cw * 0.86);
  const s2 = second ? fit(second, Math.round(s1 * 0.74), cw * 0.76) : 0;
  // Forum è sottile: un leggero contorno nello stesso colore rende l'incisione leggibile anche da lontano
  const text = (c, str, size, y) => {
    c.font = `400 ${size}px Forum, 'Cormorant Garamond', serif`;
    c.lineJoin = 'round';
    c.lineWidth = Math.max(2, size * 0.035);
    c.strokeText(str, cw / 2, y);
    c.fillText(str, cw / 2, y);
  };
  draw((c) => {
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    text(c, first, s1, second ? ch * 0.5 : ch * 0.64);
    if (second) {
      if ('letterSpacing' in c) c.letterSpacing = Math.round(s2 * 0.05) + 'px';
      text(c, second, s2, ch * 0.83);
      if ('letterSpacing' in c) c.letterSpacing = '0px';
    }
  });

  const colorTex = new THREE.CanvasTexture(colorCanvas);
  colorTex.colorSpace = THREE.SRGBColorSpace;
  colorTex.anisotropy = Math.min(8, maxAnisotropy);
  const dataTex = new THREE.CanvasTexture(dataCanvas);
  dataTex.colorSpace = THREE.NoColorSpace;
  dataTex.anisotropy = Math.min(8, maxAnisotropy);

  const gold = new THREE.Color(palette.gold || palette.brass);
  const slabMat = new THREE.MeshStandardMaterial({
    color: gold, metalness: 1, roughness: 0.3, envMapIntensity: 1.2, side: THREE.DoubleSide,
  });
  const faceMat = new THREE.MeshStandardMaterial({
    color: gold, map: colorTex,
    metalness: 1, metalnessMap: dataTex,
    roughness: 0.62, roughnessMap: dataTex,
    emissive: gold, emissiveMap: colorTex, emissiveIntensity: 0.14,
    envMapIntensity: 1.15,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });

  const slabProfile = [
    new THREE.Vector2(rb - 0.002, y0), new THREE.Vector2(rb + T, y0),
    new THREE.Vector2(rt + T, y1), new THREE.Vector2(rt - 0.002, y1),
  ];
  const slab = new THREE.Mesh(new THREE.LatheGeometry(slabProfile, 72, -half, 2 * half), slabMat);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(rt + T + 0.0005, rb + T + 0.0005, H, 96, 1, true, -half, 2 * half), faceMat);
  face.position.y = (y0 + y1) / 2;
  face.name = 'base-plaque-face';
  group.add(slab, face);
  return { group, materials: [slabMat, faceMat] };
}

// Targhetta museale in ottone con campo smaltato e lettere in rilievo.
async function buildPlaque(materials, cfg) {
  const group = new THREE.Group();
  group.name = 'plaque';
  const W = 0.72, H = 0.13, D = 0.014;
  const tilt = THREE.MathUtils.degToRad(24);

  const plateGroup = new THREE.Group();
  const plate = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 3, 0.006), materials.plaqueBrass);
  plate.castShadow = true;
  plate.receiveShadow = false;
  plateGroup.add(plate);

  // filetto inciso lungo il bordo
  const frame = new THREE.Mesh(new RoundedBoxGeometry(W - 0.022, H - 0.022, 0.002, 2, 0.003), materials.enamel);
  frame.position.z = D / 2 - 0.0002;
  plateGroup.add(frame);
  const face = new THREE.Mesh(new RoundedBoxGeometry(W - 0.03, H - 0.03, 0.003, 2, 0.002), materials.plaqueFace);
  face.position.z = D / 2 + 0.0004;
  face.receiveShadow = false;
  plateGroup.add(face);

  let textOk = false;
  try {
    const font = await new FontLoader().loadAsync(cfg.font);
    const tg = new TextGeometry(cfg.text, {
      font, size: 0.05, depth: 0.0018, curveSegments: 6,
      bevelEnabled: false,
    });
    tg.computeBoundingBox();
    const bb = tg.boundingBox;
    const width = bb.max.x - bb.min.x;
    const maxW = W - 0.07;
    const s = maxW / width;
    tg.translate(-(bb.min.x + width / 2), -(bb.min.y + (bb.max.y - bb.min.y) / 2), 0);
    tg.scale(s, s, 1);
    // lettere nere opache sull'ottone: massima leggibilità, come le targhe museali
    const text = new THREE.Mesh(tg, materials.plaqueText);
    text.position.set(0, 0.003, D / 2 + 0.0014);
    text.castShadow = false;
    text.name = 'plaque-text';
    plateGroup.add(text);
    textOk = true;
  } catch (e) {
    console.error('[targhetta] Font non caricato:', e);
  }

  // inclinazione all'indietro, come un leggio museale
  plateGroup.rotation.x = -tilt;
  group.add(plateGroup);

  // piedino posteriore
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 0.006), materials.plaqueBrass);
  leg.position.set(0, -0.01, -0.04);
  leg.rotation.x = 0.5;
  group.add(leg);

  // zoccolo in ottone: solleva la targhetta sopra la neve depositata
  const FOOT_H = 0.022;
  const foot = new THREE.Mesh(new RoundedBoxGeometry(W * 0.82, FOOT_H, 0.07, 2, 0.004), materials.plaqueBrass);
  foot.castShadow = true;
  foot.receiveShadow = false;

  // posizione davanti al supporto
  const bottomOffset = (H / 2) * Math.cos(tilt) + (D / 2) * Math.sin(tilt);
  const baseY = DIM.FLOOR_Y + 0.006 + FOOT_H;
  group.position.set(0, baseY + bottomOffset, 0.335);
  foot.position.set(0, -bottomOffset - FOOT_H / 2, -0.012);
  group.add(foot);

  // collisore orientato per la neve (in coordinate dell'interno)
  group.updateMatrixWorld(true);
  const collider = {
    center: new THREE.Vector3(0, baseY + bottomOffset, 0.335),
    rotX: -tilt,
    half: new THREE.Vector3(W / 2 + 0.005, H / 2 + 0.004, D / 2 + 0.03),
  };
  return { group, collider, textOk };
}
