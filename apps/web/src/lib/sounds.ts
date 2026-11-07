/**
 * Short Web Audio cues. No asset files. Muted when the user prefers reduced
 * motion, or when HOUSEFUL_MUTE=1 is set on window for demos that need silence.
 */

type Cue = "tap" | "step" | "verify" | "bought" | "joined" | "handback" | "admit" | "reject";

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if ((window as Window & { HOUSEFUL_MUTE?: boolean }).HOUSEFUL_MUTE) return null;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function tone(c: AudioContext, freq: number, start: number, dur: number, gain = 0.04, type: OscillatorType = "sine") {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

const patterns: Record<Cue, (c: AudioContext, t0: number) => void> = {
  tap: (c, t0) => {
    tone(c, 660, t0, 0.04, 0.025, "triangle");
  },
  step: (c, t0) => {
    tone(c, 392, t0, 0.05, 0.025);
    tone(c, 523.25, t0 + 0.05, 0.06, 0.03);
  },
  verify: (c, t0) => {
    tone(c, 523.25, t0, 0.07, 0.03); // C5
    tone(c, 659.25, t0 + 0.06, 0.09, 0.035); // E5
  },
  bought: (c, t0) => {
    tone(c, 392, t0, 0.08, 0.035); // G4
    tone(c, 523.25, t0 + 0.07, 0.09, 0.04);
    tone(c, 783.99, t0 + 0.15, 0.14, 0.045); // G5
  },
  joined: (c, t0) => {
    tone(c, 440, t0, 0.1, 0.035);
    tone(c, 554.37, t0 + 0.1, 0.12, 0.04);
  },
  handback: (c, t0) => {
    tone(c, 659.25, t0, 0.08, 0.03);
    tone(c, 523.25, t0 + 0.09, 0.1, 0.035);
    tone(c, 392, t0 + 0.2, 0.14, 0.04);
  },
  admit: (c, t0) => {
    tone(c, 587.33, t0, 0.06, 0.045, "triangle"); // D5
    tone(c, 880, t0 + 0.05, 0.12, 0.05, "triangle"); // A5
  },
  reject: (c, t0) => {
    tone(c, 220, t0, 0.12, 0.04, "square");
    tone(c, 185, t0 + 0.1, 0.14, 0.035, "square");
  },
};

/** Play a named cue. Safe to call from click handlers; resumes a suspended context. */
export function playCue(cue: Cue) {
  const c = context();
  if (!c) return;
  void c.resume().then(() => {
    patterns[cue](c, c.currentTime + 0.01);
  });
}
