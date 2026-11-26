// Playing recordings. If a recording hasn't been imported yet, a temporary
// placeholder is used: the device's Hebrew text-to-speech voice if it has one,
// otherwise a soft tone.
import * as store from './store.js';

let ctx = null;
let current = null;   // { stop() }

export function unlock() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { }
  // Warm up speech synthesis voices list
  try { speechSynthesis.getVoices(); } catch { }
}

export function stop() {
  if (current) { const c = current; current = null; c.stop(); }
}

function hebrewVoice() {
  try {
    const vs = speechSynthesis.getVoices();
    return vs.find(v => /^(he|iw)/i.test(v.lang)) || null;
  } catch { return null; }
}
export function placeholderKind() {
  return hebrewVoice() ? 'tts' : 'tone';
}

function playBlob(blob, onDuration) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    let done = false;
    const finish = (stopped) => {
      if (done) return; done = true;
      a.pause(); URL.revokeObjectURL(url);
      if (current && current.el === a) current = null;
      resolve({ stopped });
    };
    a.addEventListener('loadedmetadata', () => onDuration && isFinite(a.duration) && onDuration(a.duration));
    a.addEventListener('ended', () => finish(false));
    a.addEventListener('error', () => finish(false));
    current = { el: a, stop: () => finish(true) };
    a.play().catch(() => finish(false));
  });
}

function speak(text, minSeconds = 0) {
  return new Promise(resolve => {
    const v = hebrewVoice();
    const t0 = performance.now();
    let done = false, timer = null;
    const finish = (stopped) => {
      if (done) return; done = true;
      clearTimeout(timer);
      try { speechSynthesis.cancel(); } catch { }
      if (current && current.tts) current = null;
      resolve({ stopped });
    };
    const afterMin = () => {
      const left = minSeconds * 1000 - (performance.now() - t0);
      if (left > 0) timer = setTimeout(() => finish(false), left); else finish(false);
    };
    current = { tts: true, stop: () => finish(true) };
    if (v) {
      const u = new SpeechSynthesisUtterance(text);
      u.voice = v; u.lang = v.lang; u.rate = 0.85;
      u.onend = afterMin; u.onerror = afterMin;
      try { speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { afterMin(); }
      // safety net in case onend never fires
      setTimeout(() => !done && afterMin(), 1500 + text.length * 160);
    } else {
      tone(minSeconds > 2 ? 3 : 1);
      timer = setTimeout(() => finish(false), Math.max(minSeconds * 1000, 900));
    }
  });
}

// A few soft notes as a stand-in for speech.
function tone(notes = 1) {
  if (!ctx) return;
  const scale = [523.25, 587.33, 659.25];
  for (let i = 0; i < notes; i++) note(scale[i % 3], ctx.currentTime + i * 0.45, 0.6, 0.08);
}
function note(freq, at, dur, vol) {
  try {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(ctx.destination);
    o.start(at); o.stop(at + dur + 0.05);
  } catch { }
}

export function chime() {
  if (!ctx) return;
  note(880, ctx.currentTime, 0.9, 0.05);
  note(1318.5, ctx.currentTime + 0.12, 0.9, 0.035);
}

/**
 * Play a content file by key (e.g. "letters/bet/where.mp3" without extension).
 * fallbackText is spoken by the placeholder voice when the file is missing.
 */
export async function play(base, fallbackText, opts = {}) {
  stop();
  const key = findKey(base);
  if (key) {
    const blob = await store.getFile(key);
    if (blob) return playBlob(blob, opts.onDuration);
  }
  if (opts.onDuration) opts.onDuration(opts.placeholderSeconds || 0);
  return speak(fallbackText, opts.placeholderSeconds || 0);
}

const AUDIO_EXT = ['mp3', 'm4a', 'aac', 'ogg', 'opus', 'wav', 'webm', 'amr', '3gp'];
export function findKey(base) {
  for (const ext of AUDIO_EXT) {
    const k = `${base}.${ext}`;
    if (store.hasFile(k)) return k;
  }
  return null;
}
