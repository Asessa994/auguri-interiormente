// ─────────────────────────────────────────────────────────────
//  Introduzione: frase in Forum su antracite caldo.
//  Dissolvenza morbida, ~3 s pienamente leggibile, un tocco per
//  proseguire. Se la scena non è ancora pronta, la frase resta
//  e compare una sottile linea di avanzamento.
// ─────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Intro {
  constructor({ lines, holdSeconds = 3, reduced = false, onTap, skip = false }) {
    this.el = document.getElementById('intro');
    this.textEl = document.getElementById('intro-text');
    this.hintEl = document.getElementById('intro-hint');
    this.reduced = reduced;
    this.hold = holdSeconds * 1000;
    this.onTap = onTap;
    this._ready = false;
    this._readyWaiters = [];
    this._tapWaiters = [];
    this.tapped = skip;     // ?skipintro / ?capture: salta la frase (verifiche e anteprime)

    this.textEl.innerHTML = '';
    for (const line of lines) {
      const s = document.createElement('span');
      s.textContent = line;
      this.textEl.appendChild(s);
    }
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.hintEl.textContent = coarse ? 'Tocca per continuare' : 'Clicca per continuare';

    const tap = (e) => {
      if (e.type === 'keydown' && !['Enter', ' '].includes(e.key)) return;
      if (e.type === 'keydown') e.preventDefault();
      this.tapped = true;
      this.onTap?.();
      this._tapWaiters.splice(0).forEach((r) => r());
    };
    this.el.addEventListener('click', tap);
    this.el.addEventListener('keydown', tap);
  }

  _waitTap(ms) {
    if (this.tapped) return Promise.resolve();
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      this._tapWaiters.push(() => { clearTimeout(t); resolve(); });
    });
  }

  setProgress(f) {
    const fill = document.getElementById('loader-fill');
    if (fill) fill.style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + '%';
  }

  sceneReady() {
    this._ready = true;
    this._readyWaiters.splice(0).forEach((r) => r());
  }

  _waitReady() {
    if (this._ready) return Promise.resolve();
    return new Promise((r) => this._readyWaiters.push(r));
  }

  // Esegue la frase e si risolve quando è svanita e la scena è pronta.
  async run() {
    const body = document.body;
    // il font Forum deve essere pronto prima di mostrare la frase (niente cambi di carattere)
    try {
      if (document.fonts?.load) await Promise.race([document.fonts.load('400 48px Forum'), sleep(1500)]);
    } catch { /* si prosegue con il font di riserva */ }
    this.el.focus({ preventScroll: true });
    body.classList.add('intro-text-in');
    const fadeIn = this.reduced ? 500 : 1700;
    setTimeout(() => body.classList.add('intro-hint-in'), fadeIn + 900);
    await this._waitTap(fadeIn + this.hold);
    if (!this._ready) {
      body.classList.add('intro-waiting');
      await this._waitReady();
    }
    body.classList.add('intro-text-out');
    await sleep(this.reduced ? 450 : 1150);
  }

  // Toglie lo strato dell'introduzione (sotto c'è già la scena, dello stesso colore).
  finish() {
    document.body.classList.add('intro-done');
    setTimeout(() => { this.el.hidden = true; }, 900);
  }
}
