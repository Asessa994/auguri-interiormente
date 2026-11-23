#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
//  Prepara la scansione del David per il web.
//
//  Uso (dalla cartella tools/):
//    npm install
//    node prepare-david.mjs ~/Download/head-of-michelangelos-david.stl
//
//  Opzioni:
//    --triangles 160000   triangoli finali (predefinito 160000: buon
//                         equilibrio tra dettaglio del volto e telefoni)
//    --rotate-x -90       rotazione in gradi prima dell'esportazione
//    --rotate-y 0         (utile per far guardare il volto verso di noi)
//    --no-auto-up         non raddrizzare automaticamente i modelli "Z-up"
//    --out ../assets/david-head.glb
//
//  Formati accettati: STL (binario o ASCII), OBJ, GLB, glTF.
//  Il risultato è un GLB compresso (meshopt) che la pagina carica
//  da assets/david-head.glb.
// ─────────────────────────────────────────────────────────────
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, meshopt, dedup, prune, getSceneVertexCount, VertexCountMethod } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('--') && !/^-?\d/.test(a));
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
if (!input || !existsSync(input)) {
  console.error('Indica il file della scansione. Esempio:\n  node prepare-david.mjs ~/Download/david.stl');
  process.exit(1);
}
const targetTris = Number(opt('triangles', 160000));
const rotX = Number(opt('rotate-x', 0));
const rotY = Number(opt('rotate-y', 0));
const autoUp = !args.includes('--no-auto-up');
const out = resolve(here, opt('out', '../assets/david-head.glb'));

await Promise.all([MeshoptSimplifier.ready, MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
});

const ext = extname(input).toLowerCase();
let doc;

function documentFromGeometry(geometry) {
  const d = new Document();
  const buffer = d.createBuffer();
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = d.createAccessor('POSITION').setType('VEC3').setArray(new Float32Array(g.attributes.position.array)).setBuffer(buffer);
  const prim = d.createPrimitive().setAttribute('POSITION', pos);
  const mat = d.createMaterial('marmo').setBaseColorFactor([0.96, 0.95, 0.93, 1]).setRoughnessFactor(0.4).setMetallicFactor(0);
  prim.setMaterial(mat);
  const mesh = d.createMesh('david').addPrimitive(prim);
  d.createScene('scene').addChild(d.createNode('david').setMesh(mesh));
  return d;
}

if (ext === '.stl') {
  const buf = readFileSync(input);
  const geo = new STLLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  doc = documentFromGeometry(geo);
} else if (ext === '.obj') {
  const group = new OBJLoader().parse(readFileSync(input, 'utf8'));
  const geos = [];
  group.traverse((o) => { if (o.isMesh) { o.updateMatrixWorld(true); geos.push(o.geometry.clone().applyMatrix4(o.matrixWorld)); } });
  if (!geos.length) throw new Error('Nessuna mesh trovata nel file OBJ');
  const merged = geos.length === 1 ? geos[0] : (await import('three/examples/jsm/utils/BufferGeometryUtils.js')).mergeGeometries(geos.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position') n.deleteAttribute(k); return n; }));
  doc = documentFromGeometry(merged);
} else if (ext === '.glb' || ext === '.gltf') {
  doc = await io.read(input);
} else {
  console.error('Formato non supportato: ' + ext + ' (usa STL, OBJ, GLB o glTF)');
  process.exit(1);
}

// Raddrizza e ruota: applichiamo la trasformazione direttamente ai vertici.
const root = doc.getRoot();
let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  const a = prim.getAttribute('POSITION');
  const v = [];
  for (let i = 0; i < a.getCount(); i++) {
    a.getElement(i, v);
    for (let k = 0; k < 3; k++) { if (v[k] < min[k]) min[k] = v[k]; if (v[k] > max[k]) max[k] = v[k]; }
  }
}
const size = max.map((m, i) => m - min[i]);
let rx = rotX;
if (autoUp && rotX === 0 && size[2] > size[1] * 1.15) {
  rx = -90;
  console.log('· Il modello sembra orientato con l’asse Z verso l’alto: lo raddrizzo (rotazione X −90°).');
}
if (rx || rotY) {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(rx), THREE.MathUtils.degToRad(rotY), 0, 'YXZ'));
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  const v = new THREE.Vector3();
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
    const p = prim.getAttribute('POSITION');
    const arr = p.getArray().slice();
    for (let i = 0; i < arr.length; i += 3) { v.fromArray(arr, i).applyMatrix4(m).toArray(arr, i); }
    p.setArray(arr);
    const n = prim.getAttribute('NORMAL');
    if (n) {
      const na = n.getArray().slice();
      for (let i = 0; i < na.length; i += 3) { v.fromArray(na, i).applyMatrix3(nm).normalize().toArray(na, i); }
      n.setArray(na);
    }
  }
}

const before = getSceneVertexCount(root.listScenes()[0], VertexCountMethod.RENDER) / 3;
const ratio = Math.min(1, targetTris / Math.max(1, before));
console.log(`· Triangoli in ingresso: ${Math.round(before).toLocaleString('it-IT')} → obiettivo ${targetTris.toLocaleString('it-IT')}`);

// Normali morbide (pesate per area) calcolate sulla mesh saldata.
function smoothNormals(force) {
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    if (prim.getAttribute('NORMAL') && !force) continue;
    const pos = prim.getAttribute('POSITION').getArray();
    const idx = prim.getIndices()?.getArray();
    if (!idx) continue;
    const n = new Float32Array(pos.length);
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
      const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
      const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
    }
    for (let i = 0; i < n.length; i += 3) {
      const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
      n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
    }
    const acc = doc.createAccessor('NORMAL').setType('VEC3').setArray(n).setBuffer(doc.getRoot().listBuffers()[0]);
    prim.setAttribute('NORMAL', acc);
  }
}

const fromScan = !(ext === '.glb' || ext === '.gltf');
if (fromScan) {
  // le normali delle facce STL impedirebbero la saldatura dei vertici
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) prim.setAttribute('NORMAL', null);
}
await doc.transform(dedup(), weld());
await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.0005, lockBorder: false }));
smoothNormals(fromScan);
await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));

mkdirSync(dirname(out), { recursive: true });
await io.write(out, doc);
const after = getSceneVertexCount(doc.getRoot().listScenes()[0], VertexCountMethod.RENDER) / 3;
console.log(`· Salvato ${out}`);
console.log(`  ${Math.round(after).toLocaleString('it-IT')} triangoli, ${(statSync(out).size / 1024 / 1024).toFixed(2)} MB`);
console.log('· Ora apri la pagina con ?tune per regolare rotazione e posizione, poi copia i valori in js/config.js.');
