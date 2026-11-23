// ─────────────────────────────────────────────────────────────
//  Musica di sottofondo.
//  I browser permettono l'audio solo dopo un gesto dell'utente:
//  la musica parte al primo tocco/clic (anche quello che salta
//  l'introduzione), con una dissolvenza in entrata. Il volume passa
//  per Web Audio, così la dissolvenza funziona anche su iPhone.
//  La scelta "musica sì/no" viene ricordata.
// ─────────────────────────────────────────────────────────────

const KEY = 'interiormente-musica';

export class Music {
  constructor({ url, volume = 0.45, enabled = true }, onChange) {
    this.volume = volume;
    this.onChange = onChange;
    let stored = null;
    try { stored = localStorage.getItem(KEY); } catch { /* archiviazione non disponibile */ }
    this.enabled = stored ? stored === 'on' : enabled;
    this.started = false;
    this.playing = false;
    this.audio = new Audio();
    this.audio.src = url;
    this.audio.loop = true;
    this.audio.preload = 'none';
    this.audio.setAttribute('playsinline', '');
    this.ctx = null;
    this.gain = null;
    this._fadeRaf = 0;
    this.audio.addEventListener('error', () => {
      console.warn('[musica] file non caricato:', url);
      this.failed = true;
      this.onChange?.(this);
    });
  }

  _ensureGraph() {
    if (this.ctx || this._noGraph) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this._noGraph = true; return; }
    try {
      this.ctx = new AC();
      const src = this.ctx.createMediaElementSource(this.audio);
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0;
      src.connect(this.gain).connect(this.ctx.destination);
    } catch (e) {
      this._noGraph = true;
      this.ctx = null;
      this.gain = null;
    }
  }

  _setLevel(v) {
    if (this.gain) this.gain.gain.value = v;
    else this.audio.volume = Math.max(0, Math.min(1, v));
  }

  _fade(to, seconds, done) {
    cancelAnimationFrame(this._fadeRaf);
    const from = this.gain ? this.gain.gain.value : this.audio.volume;
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / (seconds * 1000));
      this._setLevel(from + (to - from) * (k * k * (3 - 2 * k)));
      if (k < 1) this._fadeRaf = requestAnimationFrame(step);
      else done?.();
    };
    step();
  }

  // Da chiamare dentro un gesto dell'utente.
  unlock() {
    if (!this.enabled || this.failed || this.playing) return;
    this._ensureGraph();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (!this.started) this._setLevel(0);
    this.started = true;
    const p = this.audio.play();
    this.playing = true;
    Promise.resolve(p).then(() => {
      this._fade(this.volume, 2.8);
      this.onChange?.(this);
    }).catch(() => {
      // il browser ha rifiutato: si riproverà al prossimo gesto
      this.playing = false;
      this.onChange?.(this);
    });
  }

  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem(KEY, this.enabled ? 'on' : 'off'); } catch { /* ignora */ }
    if (this.enabled) this.unlock();
    else this._fade(0, 0.6, () => { this.audio.pause(); this.playing = false; });
    this.onChange?.(this);
  }

  // Pagina nascosta: silenzio; al ritorno riprende da dov'era.
  suspend() {
    if (!this.playing) return;
    this.audio.pause();
    this._resumeOnShow = true;
    this.playing = false;
  }

  resume() {
    if (!this._resumeOnShow || !this.enabled) return;
    this._resumeOnShow = false;
    const p = this.audio.play();
    this.playing = true;
    Promise.resolve(p).catch(() => { this.playing = false; });
  }
}
