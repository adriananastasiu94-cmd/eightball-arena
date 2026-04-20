"use client";

export class ArenaAudio {
  private ctx: AudioContext | null = null;

  private ensureCtx() {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  private tone(freq: number, duration = 0.06, gain = 0.1) {
    const ctx = this.ensureCtx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = "triangle";
    g.gain.value = gain;
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  cueHit() {
    this.tone(145, 0.08, 0.12);
  }

  collision() {
    this.tone(260, 0.03, 0.06);
  }

  pocket() {
    this.tone(95, 0.12, 0.08);
  }

  uiTap() {
    this.tone(500, 0.03, 0.04);
  }

  win() {
    this.tone(680, 0.08, 0.1);
    setTimeout(() => this.tone(820, 0.1, 0.1), 70);
  }

  lose() {
    this.tone(180, 0.12, 0.09);
  }
}

export const arenaAudio = new ArenaAudio();