import * as THREE from 'three';
import { DIM } from './dimensions.js';

// Inquadratura "da fotografia di prodotto": obiettivo lungo e
// decentramento ottico (come un obiettivo basculante) per mettere
// l'oggetto esattamente dove serve, con le verticali dritte.

export const CAMERA_FOV = 20;
export const DEFAULT_EL = 0.1;
export const TARGET = new THREE.Vector3(0, DIM.FRAME_CENTER_Y, 0);

const fitPoints = (() => {
  const pts = [];
  // bordo inferiore della base (davanti è più vicino alla camera)
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * 0.975, DIM.GROUND_Y, Math.sin(a) * 0.975));
  }
  // silhouette della sfera (parte sopra la base)
  const n = 160;
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = Math.PI * (3 - Math.sqrt(5)) * i;
    const p = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r).multiplyScalar(DIM.R);
    if (p.y > DIM.SEAT_Y) pts.push(p);
  }
  return pts;
})();

function placeCamera(camera, dist, az = 0, el = DEFAULT_EL) {
  camera.position.set(
    TARGET.x + Math.sin(az) * Math.cos(el) * dist,
    TARGET.y + Math.sin(el) * dist,
    TARGET.z + Math.cos(az) * Math.cos(el) * dist
  );
  camera.lookAt(TARGET);
  camera.updateMatrixWorld();
}

function projectedBounds(camera) {
  const v = new THREE.Vector3();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of fitPoints) {
    v.copy(p).project(camera);
    if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
  }
  return { minX, maxX, minY, maxY };
}

// Calcola distanza e decentramento perché l'oggetto occupi al massimo
// maxH × maxW pixel con il centro in (cx, cy). cy può essere una funzione
// che riceve l'altezza effettiva in pixel.
export function fitCamera(camera, vw, vh, { maxH, maxW, cx, cy }) {
  camera.fov = CAMERA_FOV;
  camera.aspect = vw / vh;
  camera.clearViewOffset();
  camera.updateProjectionMatrix();
  let dist = 7;
  let b;
  for (let i = 0; i < 4; i++) {
    placeCamera(camera, dist);
    b = projectedBounds(camera);
    const hPx = ((b.maxY - b.minY) / 2) * vh;
    const wPx = ((b.maxX - b.minX) / 2) * vw;
    dist *= Math.max(hPx / maxH, wPx / maxW);
  }
  placeCamera(camera, dist);
  b = projectedBounds(camera);
  const hPx = ((b.maxY - b.minY) / 2) * vh;
  const wPx = ((b.maxX - b.minX) / 2) * vw;
  const ox = ((b.minX + b.maxX) / 2 + 1) / 2 * vw;
  const oy = (1 - (b.minY + b.maxY) / 2) / 2 * vh;
  const ccx = typeof cx === 'function' ? cx(wPx, hPx) : cx;
  const ccy = typeof cy === 'function' ? cy(wPx, hPx) : cy;
  camera.setViewOffset(vw, vh, ox - ccx, oy - ccy, vw, vh);
  camera.updateProjectionMatrix();
  return { dist, hPx, wPx, cx: ccx, cy: ccy };
}

export { placeCamera };
