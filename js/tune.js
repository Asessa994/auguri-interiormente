// Pannello di regolazione del modello (apri la pagina con ?tune).
// Serve a trovare rotazione, scala e posizione giuste per il tuo GLB:
// copia poi il blocco "david" mostrato nel riquadro dentro js/config.js.

export function setupTunePanel(cfg, onChange, triangles) {
  const panel = document.createElement('div');
  panel.className = 'tune';
  panel.innerHTML = `
    <h3>Regolazione David · ${Number(triangles).toLocaleString('it-IT')} triangoli</h3>
    <div class="rows"></div>
    <textarea readonly aria-label="Configurazione da copiare"></textarea>
  `;
  document.body.appendChild(panel);
  const rows = panel.querySelector('.rows');
  const out = panel.querySelector('textarea');

  const fields = [
    { label: 'Rotazione X', get: () => cfg.rotationDeg[0], set: (v) => (cfg.rotationDeg[0] = v), min: -180, max: 180, step: 1 },
    { label: 'Rotazione Y', get: () => cfg.rotationDeg[1], set: (v) => (cfg.rotationDeg[1] = v), min: -180, max: 180, step: 1 },
    { label: 'Rotazione Z', get: () => cfg.rotationDeg[2], set: (v) => (cfg.rotationDeg[2] = v), min: -180, max: 180, step: 1 },
    { label: 'Altezza', get: () => cfg.targetHeight, set: (v) => (cfg.targetHeight = v), min: 0.6, max: 1.15, step: 0.01 },
    { label: 'Scala extra', get: () => cfg.scale, set: (v) => (cfg.scale = v), min: 0.7, max: 1.3, step: 0.01 },
    { label: 'Sposta Y', get: () => cfg.offset[1], set: (v) => (cfg.offset[1] = v), min: -0.2, max: 0.2, step: 0.005 },
    { label: 'Sposta Z', get: () => cfg.offset[2], set: (v) => (cfg.offset[2] = v), min: -0.2, max: 0.2, step: 0.005 },
  ];

  const render = () => {
    out.value = 'david: ' + JSON.stringify({
      url: cfg.url, autoFit: cfg.autoFit, targetHeight: cfg.targetHeight,
      rotationDeg: cfg.rotationDeg, offset: cfg.offset, scale: cfg.scale,
      keepScanMaps: cfg.keepScanMaps, marbleTint: cfg.marbleTint,
    }, null, 2) + ',';
  };

  for (const f of fields) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    const value = document.createElement('span');
    input.type = 'range';
    input.min = f.min; input.max = f.max; input.step = f.step;
    input.value = f.get();
    value.textContent = f.get();
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      f.set(v);
      value.textContent = v;
      onChange(cfg);
      render();
    });
    label.append(f.label, input, value);
    rows.appendChild(label);
  }
  render();
}
