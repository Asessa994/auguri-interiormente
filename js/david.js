import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { DIM } from './dimensions.js';

// ─────────────────────────────────────────────────────────────
//  Testa del David: caricamento del GLB/glTF, adattamento al
//  supporto, materiale marmo. Se il file manca viene mostrato un
//  segnaposto astratto, dichiarato come provvisorio.
// ─────────────────────────────────────────────────────────────

export async function loadDavid(cfg, materials, onProgress) {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('./vendor/three/addons/libs/draco/');
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);

  let gltf;
  try {
    gltf = await loader.loadAsync(cfg.url, (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    });
  } catch (err) {
    draco.dispose();
    return { ok: false, reason: describeLoadError(err, cfg.url) };
  }
  draco.dispose();

  const model = gltf.scene;
  const root = new THREE.Group();
  root.name = 'david';
  const holder = new THREE.Group(); // riceve la rotazione di configurazione
  holder.add(model);
  root.add(holder);

  let triangles = 0;
  model.traverse((o) => {
    if (!o.isMesh) return;
    let g = o.geometry;
    if (!g.attributes.normal) {
      // scansioni esportate senza normali: saldiamo i vertici per un'ombreggiatura morbida
      g = mergeVertices(g, 1e-5);
      g.computeVertexNormals();
      o.geometry = g;
    }
    triangles += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    const src = Array.isArray(o.material) ? o.material[0] : o.material;
    const m = materials.makeMarble();
    if (cfg.keepScanMaps && src) {
      if (src.normalMap) { m.normalMap = src.normalMap; m.normalScale = src.normalScale?.clone() ?? new THREE.Vector2(1, 1); }
      if (src.aoMap) { m.aoMap = src.aoMap; m.aoMapIntensity = 1; }
    }
    m.color.multiplyScalar(cfg.marbleTint ?? 1);
    o.material = m;
    o.castShadow = true;
    o.receiveShadow = true;
  });

  applyTransform(root, holder, cfg);

  if (triangles > 400000) {
    console.warn(`[David] Il modello ha ${Math.round(triangles / 1000)}k triangoli: per i telefoni conviene ottimizzarlo (vedi tools/prepare-david.mjs).`);
  }
  return { ok: true, root, holder, triangles: Math.round(triangles) };
}

// Rotazione di configurazione → adattamento automatico → offset/scala manuali.
export function applyTransform(root, holder, cfg) {
  const [rx, ry, rz] = cfg.rotationDeg.map(THREE.MathUtils.degToRad);
  holder.rotation.set(rx, ry, rz, 'YXZ');
  holder.position.set(0, 0, 0);
  holder.scale.setScalar(1);
  root.position.set(0, 0, 0);
  root.scale.setScalar(1);
  root.updateMatrixWorld(true);

  if (cfg.autoFit) {
    const box = new THREE.Box3().setFromObject(holder, true);
    const size = box.getSize(new THREE.Vector3());
    const s = (cfg.targetHeight / Math.max(size.y, 1e-6)) * cfg.scale;
    holder.scale.setScalar(s);
    root.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(holder, true);
    const c = box2.getCenter(new THREE.Vector3());
    holder.position.set(-c.x, -box2.min.y, -c.z);
  } else {
    holder.scale.setScalar(cfg.scale);
  }
  root.position.set(cfg.offset[0], DIM.PED_TOP - 0.004 + cfg.offset[1], cfg.offset[2]);
  root.updateMatrixWorld(true);
}

function describeLoadError(err, url) {
  const msg = String(err?.message || err);
  if (/404|Not Found/i.test(msg)) return `File non trovato: ${url}`;
  if (/JSON|magic|Unexpected/i.test(msg)) return `Il file ${url} non sembra un GLB/glTF valido`;
  return `Impossibile caricare ${url} (${msg})`;
}

// Segnaposto PROVVISORIO: volume astratto testa+collo, volutamente
// non realistico. Va sostituito con la scansione reale del David.
export function createPlaceholder(materials) {
  const root = new THREE.Group();
  root.name = 'david-placeholder';
  const pts = [];
  const H = 0.96;
  const prof = [
    [0.0, 0.0], [0.165, 0.0], [0.17, 0.03], [0.13, 0.12], [0.118, 0.26], [0.13, 0.33],
    [0.2, 0.42], [0.235, 0.52], [0.245, 0.62], [0.238, 0.72], [0.21, 0.82], [0.16, 0.9],
    [0.09, 0.95], [0.0, 0.965],
  ];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y * (H / 0.965)));
  const g = new THREE.LatheGeometry(pts, 96);
  g.scale(1, 1, 1.12);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, materials.marble);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  root.position.set(0, DIM.PED_TOP - 0.004, 0);
  return root;
}

// ─────────────────────────────────────────────────────────────
//  Collisore approssimato per la neve: la scultura (supporto +
//  testa) viene descritta come una pila di ellissi orizzontali
//  ricavate dai vertici reali del modello.
// ─────────────────────────────────────────────────────────────
export function buildSliceCollider(objects, spaceInverse, { slices = 64, shrink = 0.9 } = {}) {
  const pts = [];
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  for (const obj of objects) {
    obj.updateWorldMatrix(true, true);
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position;
      m.multiplyMatrices(spaceInverse, o.matrixWorld);
      const step = Math.max(1, Math.floor(pos.count / 60000));
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        pts.push(v.x, v.y, v.z);
      }
    });
  }
  let yMin = Infinity, yMax = -Infinity;
  for (let i = 1; i < pts.length; i += 3) { yMin = Math.min(yMin, pts[i]); yMax = Math.max(yMax, pts[i]); }
  yMin = Math.max(yMin, DIM.FLOOR_Y - 0.05);
  const n = slices;
  const dy = (yMax - yMin) / n;
  const minX = new Float32Array(n + 1).fill(Infinity), maxX = new Float32Array(n + 1).fill(-Infinity);
  const minZ = new Float32Array(n + 1).fill(Infinity), maxZ = new Float32Array(n + 1).fill(-Infinity);
  for (let i = 0; i < pts.length; i += 3) {
    const k = Math.round((pts[i + 1] - yMin) / dy);
    if (k < 0 || k > n) continue;
    if (pts[i] < minX[k]) minX[k] = pts[i];
    if (pts[i] > maxX[k]) maxX[k] = pts[i];
    if (pts[i + 2] < minZ[k]) minZ[k] = pts[i + 2];
    if (pts[i + 2] > maxZ[k]) maxZ[k] = pts[i + 2];
  }
  const cx = new Float32Array(n + 1), cz = new Float32Array(n + 1);
  const rx = new Float32Array(n + 1), rz = new Float32Array(n + 1);
  for (let k = 0; k <= n; k++) {
    if (minX[k] === Infinity) continue; // sezione vuota: niente collisione
    cx[k] = (minX[k] + maxX[k]) / 2;
    cz[k] = (minZ[k] + maxZ[k]) / 2;
    rx[k] = ((maxX[k] - minX[k]) / 2) * shrink;
    rz[k] = ((maxZ[k] - minZ[k]) / 2) * shrink;
  }
  // l'ultima sezione si chiude: il cranio diventa una cupola
  return { yMin, yMax, dy, n, cx, cz, rx, rz };
}
