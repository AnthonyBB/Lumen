// ============================================================
// Sfx — tiny procedural sound-effect engine (Web Audio API).
//
// All sounds are SYNTHESIZED at runtime (oscillators + a noise buffer); there
// are no audio asset files to ship or license. One shared AudioContext is
// created lazily on the first play (browsers block audio until a user gesture,
// and every sound here is triggered by a click/keypress, so that's fine).
//
// Usage:  import { Sfx } from '../systems/Sfx';  Sfx.play('hitEnemy')
// Mute is persisted to localStorage and respected globally.
// ============================================================

export type SfxName =
  | 'click' | 'menu' | 'select'
  | 'swing' | 'hitEnemy' | 'hitPlayer'
  | 'heal' | 'buff'
  | 'victory' | 'defeat' | 'recruit'

const MUTE_KEY = 'lumen_sfx_muted'

class SfxEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private muted = false

  constructor() {
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1' } catch { /* ignore */ }
  }

  get isMuted() { return this.muted }

  setMuted(m: boolean) {
    this.muted = m
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0') } catch { /* ignore */ }
  }

  toggleMuted(): boolean { this.setMuted(!this.muted); return this.muted }

  /** Lazily create / resume the shared context. Returns null when muted/unsupported. */
  private ensure(): AudioContext | null {
    if (this.muted) return null
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!AC) return null
        this.ctx = new AC()
        this.master = this.ctx.createGain()
        this.master.gain.value = 0.16
        this.master.connect(this.ctx.destination)
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {})
      return this.ctx
    } catch { return null }
  }

  private noise(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuf) return this.noiseBuf
    const len = Math.floor(ctx.sampleRate * 0.4)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    this.noiseBuf = buf
    return buf
  }

  /** One oscillator note with an exponential attack/decay envelope. */
  private tone(
    type: OscillatorType, freq: number, t0: number, dur: number,
    peak = 1, glideTo?: number,
  ) {
    const ctx = this.ctx!, master = this.master!
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + dur)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g); g.connect(master)
    osc.start(t0); osc.stop(t0 + dur + 0.02)
  }

  /** A filtered noise burst — for impacts/whooshes. */
  private burst(
    t0: number, dur: number, filter: BiquadFilterType, cutoff: number, peak = 1,
  ) {
    const ctx = this.ctx!, master = this.master!
    const src = ctx.createBufferSource()
    src.buffer = this.noise(ctx)
    const f = ctx.createBiquadFilter()
    f.type = filter; f.frequency.value = cutoff
    const g = ctx.createGain()
    g.gain.setValueAtTime(peak, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(f); f.connect(g); g.connect(master)
    src.start(t0); src.stop(t0 + dur + 0.02)
  }

  play(name: SfxName) {
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    const t = ctx.currentTime
    switch (name) {
      case 'click':
        this.tone('triangle', 660, t, 0.06, 0.7)
        break
      case 'menu':
        this.tone('triangle', 520, t, 0.08, 0.6)
        this.tone('triangle', 740, t + 0.06, 0.1, 0.6)
        break
      case 'select':
        this.tone('square', 600, t, 0.05, 0.4)
        this.tone('square', 880, t + 0.04, 0.07, 0.4)
        break
      case 'swing':
        // Quick downward whoosh.
        this.tone('triangle', 440, t, 0.12, 0.5, 150)
        this.burst(t, 0.1, 'highpass', 1200, 0.25)
        break
      case 'hitEnemy':
        // Punchy impact: noise crack + a short low body.
        this.burst(t, 0.09, 'bandpass', 1800, 0.5)
        this.tone('square', 165, t, 0.1, 0.6, 90)
        break
      case 'hitPlayer':
        // Duller, lower thud — "you've been hit".
        this.burst(t, 0.14, 'lowpass', 700, 0.5)
        this.tone('square', 110, t, 0.16, 0.7, 62)
        break
      case 'heal':
        this.tone('sine', 523.25, t, 0.22, 0.6)
        this.tone('sine', 783.99, t + 0.09, 0.3, 0.6)
        break
      case 'buff':
        this.tone('sine', 440, t, 0.2, 0.5, 660)
        break
      case 'victory': {
        const notes = [523.25, 659.25, 783.99, 1046.5] // C major arpeggio
        notes.forEach((f, i) => this.tone('triangle', f, t + i * 0.12, 0.5, 0.8))
        break
      }
      case 'defeat': {
        const notes = [392, 330, 262, 196] // descending, minor-ish
        notes.forEach((f, i) => this.tone('sawtooth', f, t + i * 0.16, 0.4, 0.5))
        break
      }
      case 'recruit':
        this.tone('triangle', 523.25, t, 0.14, 0.7)
        this.tone('triangle', 783.99, t + 0.1, 0.28, 0.7)
        break
    }
  }
}

export const Sfx = new SfxEngine()
