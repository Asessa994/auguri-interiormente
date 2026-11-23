import * as THREE from 'three';
import { CONFIG } from './config.js';
import { DIM } from './dimensions.js';
import { createMaterials, updateSculptSpace } from './materials.js';
import { createStudioEnvironment, createBackdrop, createLights } from './studio.js';
import { buildGlobe } from './globe.js';
import { loadDavid, createPlaceholder, buildSliceCollider, applyTransform } from './david.js';
import { SnowSimulation, createSnowPoints } from './snow.js';
import { MotionController, MotionState } from './motion.js';
import { GestureController } from './gestures.js';
import { setupTunePanel } from './tune.js';
import { captureOgImage } from './capture.js';
import { fitCamera, placeCamera, CAMERA_FOV, DEFAULT_EL, TARGET } from './framing.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const body = document.body;

// ── Qualità ──────────────────────────────────────────────────
const TIERS = {
  low: { dprMax: 1.3, dprMin: 0.85, particles: 1500, shadow: 1024, transmission: 0.85 },
  medium: { dprMax: 1.6, dprMin: 1.0, particles: 2200, shadow: 1024, transmission: 1.0 },
  high: { dprMax: 2.0, dprMin: 1.0, particles: 2800, shadow: 2048, transmission: 1.0 },
};

function detectTier() {
  const forced = params.get('quality') || CONFIG.quality;
  if (TIERS[forced]) return forced;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  if (coarse) return mem <= 3 || cores <= 4 ? 'low' : 'medium';
  return cores <= 2 ? 'medium' : 'high';
}

// ── Utilità interfaccia ─────────────────────────────────────
function applyPalette(p) {
  const s = document.documentElement.style;
  s.setProperty('--bg', p.background);
  s.setProperty('--bg-edge', p.backgroundEdge);
  s.setProperty('--text', p.text);
  s.setProperty('--text-soft', p.textSoft);
  s.setProperty('--brass', p.brass);
  s.setProperty('--stone', p.stone);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = p.background;
}

function fillGreeting(lines) {
  const g = $('greeting');
  g.innerHTML = '';
  lines.forEach((text, i) => {
    const p = document.createElement('p');
    p.className = 'line' + (i === lines.length - 1 ? ' sign' : '');
    const parts = text.split(/(InteriormenteDesign)/);
    for (const part of parts) {
      if (part === 'InteriormenteDesign') {
        const s = document.createElement('span');
        s.className = 'nowrap';
        s.textContent = part;
        p.appendChild(s);
      } else p.appendChild(document.createTextNode(part));
    }
    g.appendChild(p);
  });
}

let statusTimer = 0;
function setStatus(text, ms = 6000) {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('is-visible', !!text);
  clearTimeout(statusTimer);
  if (text && ms) statusTimer = setTimeout(() => el.classList.remove('is-visible'), ms);
}

function setProgress(f, label) {
  const v = Math.round(Math.max(0, Math.min(1, f)) * 100);
  $('loader-fill').style.width = v + '%';
  $('loader').setAttribute('aria-valuenow', String(v));
  if (label) $('loader-text').textContent = label;
}

function showError(message) {
  clearTimeout(window.__loadTimeout);
  $('error-msg').textContent = message;
  $('error').hidden = false;
  body.classList.remove('is-loading');
}

// ── Avvio ────────────────────────────────────────────────────
async function main() {
  applyPalette(CONFIG.palette);
  fillGreeting(CONFIG.greeting);
  if (CONFIG.credit) { $('credit').textContent = CONFIG.credit; $('credit').hidden = false; }

  const reducedMQ = matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = reducedMQ.matches;
  const tierName = detectTier();
  const tier = TIERS[tierName];

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (err) {
    console.error(err);
    showError('Il browser non riesce ad attivare la grafica 3D (WebGL 2). Prova ad aggiornarlo o ad aprire il link con Safari o Chrome.');
    return;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.transmissionResolutionScale = tier.transmission;
  renderer.setClearColor(CONFIG.palette.background, 1);

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    setStatus('La scena si sta ripristinando…', 0);
  });
  canvas.addEventListener('webglcontextrestored', () => location.reload());

  setProgress(0.08, 'Preparazione della sfera…');

  // Scena
  const scene = new THREE.Scene();
  scene.environment = createStudioEnvironment(renderer, CONFIG.palette);
  scene.environmentIntensity = 0.85;

  const pivot = new THREE.Group();          // perno sul piano d'appoggio: l'oscillazione avviene qui
  pivot.position.y = DIM.GROUND_Y;
  scene.add(pivot);
  const object = new THREE.Group();
  object.position.y = -DIM.GROUND_Y;
  pivot.add(object);

  const lights = createLights(scene, object, CONFIG.palette);
  lights.key.shadow.mapSize.set(tier.shadow, tier.shadow);
  scene.add(createBackdrop(CONFIG.palette, lights.keyDirection));

  // Su telefono: vetro senza secondo passaggio di rendering e marmo alleggerito.
  const glassMode = params.get('glass') || CONFIG.glass;
  const fastGlass = glassMode === 'fast' || (glassMode !== 'refraction' && tierName !== 'high');
  const mats = createMaterials(renderer, CONFIG.palette, { fastGlass, lite: tierName !== 'high' });
  const globe = await buildGlobe(mats, CONFIG.palette, CONFIG.plaque);
  object.add(globe.group);
  if (params.get('debug') === 'noglass') { globe.glass.visible = false; globe.edge.visible = false; }
  setProgress(0.2);

  // Testa del David
  const davidCfg = structuredClone(CONFIG.david);
  // ?model= accetta solo file dello stesso sito (niente indirizzi esterni)
  const pm = params.get('model');
  if (pm && /^[\w./-]+\.(glb|gltf)$/i.test(pm) && !pm.startsWith('//')) davidCfg.url = pm;
  setProgress(0.22, 'Caricamento della scultura…');
  const dv = await loadDavid(davidCfg, mats, (f) => setProgress(0.22 + f * 0.6));
  let davidRoot;
  let davidHolder = null;
  if (dv.ok) {
    davidRoot = dv.root;
    davidHolder = dv.holder;
    console.info(`[David] modello caricato: ${dv.triangles.toLocaleString('it-IT')} triangoli`);
  } else {
    davidRoot = createPlaceholder(mats);
    $('placeholder-badge').hidden = false;
    body.classList.add('has-placeholder');
    console.warn('[David] ' + dv.reason + ' — mostro un segnaposto PROVVISORIO. Vedi assets/LEGGIMI-MODELLO.txt');
  }
  globe.interior.add(davidRoot);

  setProgress(0.86, 'Ultimi ritocchi…');
  await mats.ready;

  // Neve + collisori
  const sim = new SnowSimulation(tier.particles, { reducedMotion });
  const buildColliders = () => {
    globe.interior.updateWorldMatrix(true, true);
    const inv = globe.interior.matrixWorld.clone().invert();
    const slices = buildSliceCollider([globe.pedestal, davidRoot], inv);
    sim.setColliders({ slices, plaque: globe.plaque.collider });
  };
  buildColliders();
  const snow = createSnowPoints(sim, CONFIG.palette, { softEdges: fastGlass });
  globe.interior.add(snow);
  const posAttr = snow.geometry.attributes.position;

  // Camera e impaginazione
  const intro = { t: reducedMotion ? 1 : 0, dur: 2.8 };
  let introEaseNow = intro.t;
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 140);
  const target = TARGET;
  const view = { az: 0, el: DEFAULT_EL, azT: 0, elT: DEFAULT_EL, dist: 10, radiusPx: 150 };
  const AZ_LIM = 0.55, EL_MIN = 0.02, EL_MAX = 0.3;
  let dpr = Math.min(window.devicePixelRatio || 1, tier.dprMax);
  let layout = null;
  let needsRender = true;

  // Dove mettere l'oggetto nello schermo (pixel CSS).
  function computeLayout(vw, vh) {
    if (vw / vh > 1.15) {
      return {
        mode: 'side', maxH: vh * 0.84, maxW: vw * 0.5,
        cx: (w) => Math.max(w / 2 + vw * 0.04, vw * 0.36), cy: vh * 0.5,
      };
    }
    const topMin = Math.max(104, vh * 0.15);
    const bottomMin = Math.max(228, vh * 0.3);
    return {
      mode: 'stack', maxH: Math.max(160, vh - topMin - bottomMin), maxW: vw * 0.92,
      cx: vw / 2,
      cy: (w, h) => topMin + Math.max(0, vh - topMin - bottomMin - h) * 0.42 + h / 2,
    };
  }

  function applyLayout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const lay = computeLayout(vw, vh);
    renderer.setPixelRatio(dpr);
    renderer.setSize(vw, vh, false);
    const fit = fitCamera(camera, vw, vh, lay);
    layout = { ...lay, ...fit, vw, vh };
    view.dist = fit.dist;
    view.radiusPx = fit.hPx / 2.25;
    const s = document.documentElement.style;
    s.setProperty('--obj-top', Math.max(0, fit.cy - fit.hPx / 2) + 'px');
    s.setProperty('--obj-bottom', Math.min(vh, fit.cy + fit.hPx / 2 + 4) + 'px');
    s.setProperty('--obj-right', (fit.cx + fit.wPx / 2 + vw * 0.025) + 'px');
    body.classList.toggle('layout-side', lay.mode === 'side');
    body.classList.toggle('layout-stack', lay.mode === 'stack');
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    snow.material.uniforms.uScale.value = (vh * dpr) / (2 * tanHalf);
    snow.material.uniforms.uDpr.value = dpr;
    snow.material.uniforms.uSizeBoost.value = THREE.MathUtils.clamp(250 / Math.max(1, view.radiusPx), 1, 1.7);
    updateCamera(introEaseNow);
    needsRender = true;
  }

  let resizeQueued = false;
  const queueResize = () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => { resizeQueued = false; applyLayout(); });
  };
  window.addEventListener('resize', queueResize);
  window.addEventListener('orientationchange', () => setTimeout(queueResize, 250));
  window.visualViewport?.addEventListener('resize', queueResize);
  applyLayout();

  // Oscillazione smorzata dell'oggetto e piccolo "aggancio" al dito
  const wob = { x: 0, z: 0, wx: 0, wz: 0, gx: 0, gy: 0, gxT: 0, gyT: 0 };
  const basis = { r: new THREE.Vector3(), u: new THREE.Vector3(), b: new THREE.Vector3() };

  let firstShakeAt = 0;
  let peakSpeed = 0;
  let greetingShown = false;

  function onAnyShake() {
    if (!firstShakeAt) {
      firstShakeAt = performance.now();
      body.classList.add('has-shaken');
    }
    needsRender = true;
  }

  // Δv del contenitore negli assi dello schermo (raggi/s) → scena
  function shakeScreen(sx, sy, sz, wobbleGain = 1) {
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    basis.r.set(e[0], e[1], e[2]);
    basis.u.set(e[4], e[5], e[6]);
    basis.b.set(e[8], e[9], e[10]);
    const wx = basis.r.x * sx + basis.u.x * sy + basis.b.x * sz;
    const wy = basis.r.y * sx + basis.u.y * sy + basis.b.y * sz;
    const wz = basis.r.z * sx + basis.u.z * sy + basis.b.z * sz;
    sim.shake(wx, wy, wz);
    if (!reducedMotion) {
      wob.wz += -wx * 0.32 * wobbleGain;
      wob.wx += wz * 0.32 * wobbleGain;
    }
    onAnyShake();
  }

  // Pulsante "Agita la sfera": breve sequenza alternata, energia che si somma
  let shakeSeq = [];
  function shakeButton() {
    const base = (Math.random() - 0.5) * 0.6;
    const amps = [1.05, -1.3, 1.15, -0.85, 0.45];
    shakeSeq.forEach(clearTimeout);
    shakeSeq = amps.map((m, i) => setTimeout(() => {
      const a = base + (Math.random() - 0.5) * 0.35;
      shakeScreen(Math.cos(a) * m * 1.45, Math.sin(a) * m * 1.0 + 0.22 * Math.abs(m), (Math.random() - 0.5) * 0.5 * m);
    }, i * 115));
  }
  $('btn-shake').addEventListener('click', shakeButton);

  // Sensori di movimento
  const motionBtn = $('btn-motion');
  const touchLike = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || params.has('motion');
  if (touchLike) motionBtn.hidden = false;
  const MSG = {
    [MotionState.REQUESTING]: 'Attivazione dei sensori…',
    [MotionState.ACTIVE]: 'Movimento attivo: agita il telefono.',
    [MotionState.DENIED]: 'Accesso ai sensori negato. Puoi agitare la sfera con il pulsante o trascinandola; per riprovare ricarica la pagina e consenti l’accesso.',
    [MotionState.UNSUPPORTED]: 'Questo browser non offre i sensori di movimento: agita la sfera con il pulsante o trascinandola.',
    [MotionState.INSECURE]: 'I sensori di movimento funzionano solo su una connessione sicura (https).',
    [MotionState.NO_DATA]: 'Nessun dato dai sensori di movimento: agita la sfera con il pulsante o trascinandola.',
    [MotionState.ERROR]: 'Non è stato possibile attivare i sensori: agita la sfera con il pulsante o trascinandola.',
  };
  const motion = new MotionController({
    config: CONFIG.motion,
    onImpulse: (sx, sy, sz) => {
      if (document.hidden) return;
      const g = CONFIG.motion.gain;
      shakeScreen(sx * g, sy * g, sz * g, 0.35);
    },
    onState: (state, detail) => {
      if (detail && state !== MotionState.ACTIVE) console.warn('[sensori]', state, detail);
      setStatus(MSG[state] || '', state === MotionState.REQUESTING ? 0 : 7000);
      if (state === MotionState.ACTIVE) {
        motionBtn.textContent = 'Movimento attivo';
        motionBtn.setAttribute('aria-pressed', 'true');
        motionBtn.disabled = true;
        if (detail?.gravityFilter) console.info('[sensori] accelerazione ricavata da accelerationIncludingGravity');
      } else if (state !== MotionState.REQUESTING) {
        motionBtn.disabled = false;
        motionBtn.removeAttribute('aria-pressed');
        motionBtn.textContent = 'Attiva il movimento';
      }
    },
  });
  // nessun await prima di enable(): la richiesta di permesso resta legata al tocco
  motionBtn.addEventListener('click', () => { motion.enable(); });

  // Gesti
  new GestureController(canvas, {
    getRadiusPx: () => view.radiusPx,
    onOrbit: (dAz, dEl) => {
      view.azT = THREE.MathUtils.clamp(view.azT + dAz, -AZ_LIM, AZ_LIM);
      view.elT = THREE.MathUtils.clamp(view.elT + dEl, EL_MIN, EL_MAX);
      needsRender = true;
    },
    onShake: (dvx, dvy) => shakeScreen(dvx * CONFIG.drag.gain, dvy * CONFIG.drag.gain, 0, 0.6),
    onGrab: (ox, oy) => {
      wob.gxT = reducedMotion ? 0 : ox;
      wob.gyT = reducedMotion ? 0 : oy;
      needsRender = true;
    },
  });

  canvas.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      view.azT = THREE.MathUtils.clamp(view.azT + (k === 'ArrowLeft' ? 0.08 : -0.08), -AZ_LIM, AZ_LIM);
    } else if (k === 'ArrowUp' || k === 'ArrowDown') {
      view.elT = THREE.MathUtils.clamp(view.elT + (k === 'ArrowUp' ? 0.04 : -0.04), EL_MIN, EL_MAX);
    } else if (k === ' ' || k === 'Enter') {
      shakeButton();
    } else return;
    e.preventDefault();
    needsRender = true;
  });

  reducedMQ.addEventListener?.('change', (e) => {
    reducedMotion = e.matches;
    sim.reducedMotion = reducedMotion;
  });

  // Compilazione anticipata degli shader (evita scatti al primo fotogramma)
  try { await renderer.compileAsync(scene, camera); } catch { /* opzionale */ }

  setProgress(1);
  renderer.shadowMap.needsUpdate = true;
  updateSculptSpace(globe.interior);
  renderer.render(scene, camera);

  // ── Ciclo di animazione ───────────────────────────────────
  let last = performance.now();
  let running = true;
  let frameTimes = [];
  let goodWindows = 0;
  let renderedFrames = 0;
  let qualityClock = 0;
  const startedAt = performance.now();

  function updateCamera(introEase) {
    introEaseNow = introEase;
    placeCamera(camera, view.dist * (1 + (1 - introEase) * 0.07), view.az + (1 - introEase) * 0.16, view.el + (1 - introEase) * 0.03);
  }

  function adaptQuality(dt, rendered) {
    if (!rendered) { frameTimes.length = 0; return; }
    frameTimes.push(dt);
    qualityClock += dt;
    if (qualityClock < 1.0) return;
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    frameTimes.length = 0;
    qualityClock = 0;
    const early = performance.now() - startedAt < 3500;
    if (avg > 0.024) {
      goodWindows = 0;
      if (dpr > tier.dprMin + 0.01) {
        dpr = Math.max(tier.dprMin, dpr - 0.2);
        applyLayout();
      }
      // il numero di fiocchi si riduce solo durante l'ingresso, mai a scena avviata
      if (early && sim.active > 700) {
        sim.setActiveCount(Math.round(sim.active * 0.75));
        snow.geometry.setDrawRange(0, sim.active);
      }
    } else if (avg < 0.0185) {
      goodWindows++;
      const cap = Math.min(window.devicePixelRatio || 1, tier.dprMax);
      if (goodWindows >= 3 && dpr < cap - 0.01) {
        dpr = Math.min(cap, dpr + 0.1);
        goodWindows = 0;
        applyLayout();
      }
    }
  }

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;

    // ingresso
    let introEase = 1;
    if (intro.t < 1) {
      intro.t = Math.min(1, intro.t + dt / intro.dur);
      introEase = 1 - Math.pow(1 - intro.t, 3);
      needsRender = true;
    }

    // camera (rotazione di osservazione smorzata)
    const kc = 1 - Math.exp(-dt * 7);
    const camMoving = Math.abs(view.azT - view.az) > 1e-4 || Math.abs(view.elT - view.el) > 1e-4;
    view.az += (view.azT - view.az) * kc;
    view.el += (view.elT - view.el) * kc;
    if (camMoving || intro.t < 1 || needsRender) updateCamera(introEase);

    // oscillazione smorzata (molla sottosmorzata) + aggancio
    const wobActive = Math.abs(wob.x) + Math.abs(wob.z) + Math.abs(wob.wx) + Math.abs(wob.wz) > 1e-5
      || Math.abs(wob.gx - wob.gxT) + Math.abs(wob.gy - wob.gyT) > 1e-5 || Math.abs(wob.gx) + Math.abs(wob.gy) > 1e-5;
    if (wobActive) {
      const steps = Math.ceil(dt / (1 / 120));
      const h = dt / Math.max(1, steps);
      for (let i = 0; i < steps; i++) {
        wob.wx += (-58 * wob.x - 3.3 * wob.wx) * h;
        wob.wz += (-58 * wob.z - 3.3 * wob.wz) * h;
        wob.x = THREE.MathUtils.clamp(wob.x + wob.wx * h, -0.035, 0.035);
        wob.z = THREE.MathUtils.clamp(wob.z + wob.wz * h, -0.035, 0.035);
      }
      const kg = 1 - Math.exp(-dt * 9);
      wob.gx += (wob.gxT - wob.gx) * kg;
      wob.gy += (wob.gyT - wob.gy) * kg;
      if (Math.abs(wob.x) + Math.abs(wob.z) + Math.abs(wob.wx) + Math.abs(wob.wz) < 1e-5) wob.x = wob.z = wob.wx = wob.wz = 0;
      pivot.rotation.set(wob.x, 0, wob.z);
      pivot.position.set(wob.gx, DIM.GROUND_Y + wob.gy, 0);
      // la luce principale si muove con l'oggetto: la mappa d'ombra resta valida,
      // basta aggiornarne la matrice (niente nuovo rendering delle ombre a ogni fotogramma)
      pivot.updateMatrixWorld(true);
      lights.key.shadow.updateMatrices(lights.key);
      needsRender = true;
    }

    // neve
    const simAwake = !sim.asleep || sim.fluidActive;
    if (simAwake) {
      sim.update(dt);
      posAttr.clearUpdateRanges();
      posAttr.addUpdateRange(0, sim.active * 3);
      posAttr.needsUpdate = true;
      needsRender = true;
    }

    // augurio: compare mentre la neve rallenta dopo la prima agitazione
    if (firstShakeAt && !greetingShown) {
      peakSpeed = Math.max(peakSpeed, sim.meanSpeed);
      const since = (now - firstShakeAt) / 1000;
      if ((since > 1.6 && sim.meanSpeed < peakSpeed * 0.55) || since > 6) {
        greetingShown = true;
        const g = $('greeting');
        g.setAttribute('aria-hidden', 'false');
        g.classList.add('is-visible');
      }
    }

    let rendered = false;
    if (needsRender) {
      snow.material.uniforms.uTime.value = now / 1000;
      const ld = snow.material.uniforms.uLightDir.value;
      ld.copy(lights.keyDirection).transformDirection(camera.matrixWorldInverse);
      updateSculptSpace(globe.interior);
      renderer.render(scene, camera);
      needsRender = false;
      rendered = true;
      renderedFrames++;
    }
    adaptQuality(dt, rendered);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      running = false;
    } else if (!running) {
      running = true;
      last = performance.now();
      needsRender = true;
      requestAnimationFrame(frame);
    }
  });

  // Rivela la scena
  clearTimeout(window.__loadTimeout);
  body.classList.remove('is-loading');
  body.classList.add('is-ready');
  last = performance.now();
  requestAnimationFrame(frame);

  // Strumenti opzionali
  if (params.has('tune') && davidHolder) {
    setupTunePanel(davidCfg, (cfg) => {
      applyTransform(davidRoot, davidHolder, cfg);
      buildColliders();
      renderer.shadowMap.needsUpdate = true;
      needsRender = true;
    }, dv.triangles);
  } else if (params.has('tune')) {
    setStatus('Il pannello di regolazione richiede il file del David in assets/david-head.glb.', 0);
  }
  if (params.has('capture')) {
    captureOgImage({ renderer, scene, camera, shake: shakeButton, view, palette: CONFIG.palette, restore: applyLayout, snow, updateSculptSpace: () => updateSculptSpace(globe.interior) });
  }

  // per le verifiche automatiche
  window.__sfera = { sim, view, motion, shakeButton, shakeScreen, renderer, scene, camera, get greetingShown() { return greetingShown; }, tier: tierName, fastGlass, get dpr() { return dpr; }, get frames() { return renderedFrames; }, placeholder: !dv.ok };
}

main().catch((err) => {
  console.error(err);
  showError('Si è verificato un errore durante il caricamento. Ricarica la pagina; se il problema continua, prova con un altro browser.');
});
