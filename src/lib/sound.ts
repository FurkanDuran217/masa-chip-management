// Web Audio API ile sıfır harici bağımlılıkla gerçekçi poker çip ve masa sesleri
class SoundFX {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  private getContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public toggle(enable?: boolean) {
    this.enabled = enable !== undefined ? enable : !this.enabled;
    return this.enabled;
  }

  public isEnabled() {
    return this.enabled;
  }

  // Çip atma tıkırtısı (clack / ceramic chip sound)
  public chip() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2400 + Math.random() * 600, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.04);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.Q.setValueAtTime(4, now);

    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.06);

    // Çift tık etkisi (iki çip birbirine çarpması)
    setTimeout(() => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(3200 + Math.random() * 400, t);
      osc2.frequency.exponentialRampToValueAtTime(1200, t + 0.03);
      gain2.gain.setValueAtTime(0.3, t);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(t);
      osc2.stop(t + 0.04);
    }, 25);
  }

  // Bet artırma / kalın yığın sesi (derin kütleme + çip şıkırtısı)
  public raise() {
    this.chip();
    setTimeout(() => this.chip(), 40);
    setTimeout(() => this.chip(), 80);
  }

  // Masa tahtasına vurma (Check knock / tap)
  public check() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.08);

    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);

    // İkinci hafif vuruş (masaya iki parmak tık tık)
    setTimeout(() => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(130, t);
      osc2.frequency.exponentialRampToValueAtTime(40, t + 0.07);
      gain2.gain.setValueAtTime(0.4, t);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(t);
      osc2.stop(t + 0.09);
    }, 90);
  }

  // Pas geçme / kartı masaya sürtme
  public fold() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const bufferSize = ctx.sampleRate * 0.12;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(400, now + 0.12);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);
  }

  // Dramatik ALL-IN sesi (patlama ve gümbürtü + kule çip yıkımı)
  public allIn() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Bas darbesi
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.45);
    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.5);

    // Çip yağmuru
    for (let i = 0; i < 7; i++) {
      setTimeout(() => this.chip(), 30 * i + Math.random() * 20);
    }
  }

  // Pot kazanma / zafer sesi (akordeon jingling chimes)
  public win() {
    const ctx = this.getContext();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
      }, idx * 70);
    });
  }

  // Sıra sende uyarısı
  public yourTurn() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1174.66, now + 0.08); // A5 -> D6
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }
}

export const sound = new SoundFX();

// Dokunsal titreşim (Haptics)
export function vibrate(pattern: number | number[] = 25) {
  if (typeof window !== 'undefined' && 'navigator' in window && navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // sessizce geç
    }
  }
}
