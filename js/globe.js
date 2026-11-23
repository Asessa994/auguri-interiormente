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
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = 1.0 - abs( dot( normalize( vN ), normalize( vV ) ) );
        float band = smoothstep( 0.72, 0.985, f );
        float line = smoothstep( 0.965, 0.995, f );
        vec3 col = mix( uTint, vec3( 1.0 ), line * 0.75 );
        float a = band * 0.2 + line * 0.12;
        gl_FragColor = vec4( col, a );
        #include <colorspace_fragment>
      }
    `,
  });
}

export async function buildGlobe(materials, palette, plaqueCfg) {
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
  interior.add(pedestal);

  const plaque = await buildPlaque(materials, plaqueCfg);
  interior.add(plaque.group);

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

  return { group, interior, base, pedestal, plaque, glass, edge, bed };
}

// Targhetta museale in ottone con campo smaltato e lettere in rilievo.
async function buildPlaque(materials, cfg) {
  const group = new THREE.Group();
  group.name = 'plaque';
  const W = 0.72, H = 0.13, D = 0.014;
  const tilt = THREE.MathUtils.degToRad(24);

  const plateGroup = new THREE.Group();
  const plate = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 3, 0.006), materials.brass);
  plate.castShadow = true;
  plate.receiveShadow = true;
  plateGroup.add(plate);

  // filetto inciso lungo il bordo
  const frame = new THREE.Mesh(new RoundedBoxGeometry(W - 0.022, H - 0.022, 0.002, 2, 0.003), materials.enamel);
  frame.position.z = D / 2 - 0.0002;
  plateGroup.add(frame);
  const face = new THREE.Mesh(new RoundedBoxGeometry(W - 0.03, H - 0.03, 0.003, 2, 0.002), materials.brass);
  face.position.z = D / 2 + 0.0004;
  face.receiveShadow = true;
  plateGroup.add(face);

  let textOk = false;
  try {
    const font = await new FontLoader().loadAsync(cfg.font);
    const tg = new TextGeometry(cfg.text, {
      font, size: 0.05, depth: 0.0016, curveSegments: 6,
      bevelEnabled: true, bevelThickness: 0.0004, bevelSize: 0.0003, bevelSegments: 1,
    });
    tg.computeBoundingBox();
    const bb = tg.boundingBox;
    const width = bb.max.x - bb.min.x;
    const maxW = W - 0.07;
    const s = maxW / width;
    tg.translate(-(bb.min.x + width / 2), -(bb.min.y + (bb.max.y - bb.min.y) / 2), 0);
    tg.scale(s, s, 1);
    // lettere smaltate scure sull'ottone: massima leggibilità, come le targhe museali
    const text = new THREE.Mesh(tg, materials.enamel);
    text.position.set(0, 0.003, D / 2 + 0.0016);
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
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 0.006), materials.brass);
  leg.position.set(0, -0.01, -0.04);
  leg.rotation.x = 0.5;
  group.add(leg);

  // zoccolo in ottone: solleva la targhetta sopra la neve depositata
  const FOOT_H = 0.022;
  const foot = new THREE.Mesh(new RoundedBoxGeometry(W * 0.82, FOOT_H, 0.07, 2, 0.004), materials.brass);
  foot.castShadow = true;
  foot.receiveShadow = true;

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
