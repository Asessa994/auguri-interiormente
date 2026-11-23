import * as THREE from 'three';
import { fitCamera, placeCamera } from './framing.js';

// Genera l'immagine di anteprima per WhatsApp (1200×630) dalla scena reale.
// Apri la pagina con ?capture quando il modello del David è al suo posto:
// comparirà l'immagine con il pulsante per scaricarla come og-image.jpg.

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function captureOgImage({ renderer, scene, camera, shake, view, palette, restore, snow, updateSculptSpace }) {
  await wait(900);
  shake();
  await wait(2600);

  const W = 1200, H = 630;
  const prevDpr = renderer.getPixelRatio();
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);

  // sfera al centro: resta leggibile anche nel ritaglio quadrato delle miniature
  const fit = fitCamera(camera, W, H, { maxH: H * 0.9, maxW: W * 0.6, cx: W / 2, cy: H / 2 });
  placeCamera(camera, fit.dist, view.az, view.el);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  snow.material.uniforms.uScale.value = H / (2 * tanHalf);
  updateSculptSpace();
  renderer.render(scene, camera);

  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const ctx = out.getContext('2d');
  ctx.drawImage(renderer.domElement, 0, 0, W, H);

  try { await document.fonts.load('italic 500 56px "Cormorant Garamond"'); await document.fonts.load('500 14px Inter'); } catch { /* facoltativo */ }
  ctx.fillStyle = palette.text;
  ctx.textBaseline = 'middle';
  ctx.font = 'italic 500 54px "Cormorant Garamond", serif';
  ctx.textAlign = 'left';
  ctx.fillText('Buon', 64, H / 2 - 30);
  ctx.fillText('Natale', 64, H / 2 + 28);
  ctx.textAlign = 'right';
  ctx.font = '500 15px Inter, sans-serif';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '5px';
  ctx.fillText('INTERIORMENTE', W - 64, H / 2 - 12);
  ctx.fillStyle = palette.brass;
  ctx.fillText('DESIGN', W - 64, H / 2 + 14);

  renderer.setPixelRatio(prevDpr);
  restore();

  out.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:40;background:rgba(20,20,20,.75);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:20px';
    const img = new Image();
    img.src = url;
    img.style.cssText = 'max-width:92vw;max-height:70vh;box-shadow:0 10px 40px rgba(0,0,0,.4)';
    const a = document.createElement('a');
    a.href = url;
    a.download = 'og-image.jpg';
    a.textContent = 'Scarica og-image.jpg';
    a.style.cssText = 'font:500 14px Inter,sans-serif;color:#fff;border:1px solid #fff;padding:10px 18px;border-radius:999px;text-decoration:none';
    const close = document.createElement('button');
    close.textContent = 'Chiudi';
    close.style.cssText = 'font:500 13px Inter,sans-serif;background:none;color:#ddd;border:0;cursor:pointer';
    close.onclick = () => wrap.remove();
    wrap.append(img, a, close);
    document.body.appendChild(wrap);
  }, 'image/jpeg', 0.86);
}
