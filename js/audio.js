// Синтезированные звуки (WebAudio, без файлов).
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('borya-muted') === '1'; } catch (e) { /* нет хранилища */ }

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('borya-muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
}

let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}

function env(gainNode, t, a, peak, dec) {
  gainNode.gain.setValueAtTime(0.0001, t);
  gainNode.gain.exponentialRampToValueAtTime(peak, t + a);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}

const last = {};
function ok(kind, gap = 0.03) {
  if (!ctx || muted) return false;
  const now = ctx.currentTime;
  if (last[kind] && now - last[kind] < gap) return false;
  last[kind] = now;
  return true;
}

// стук шаров
export function clack(vol = 1) {
  if (!ok('clack', 0.02)) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(2600 + Math.random() * 600, t);
  const g = ctx.createGain();
  env(g, t, 0.002, Math.min(0.5, 0.08 + vol * 0.4), 0.06);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + 0.1);
  const n = noise();
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = 4000; f.Q.value = 1.5;
  const g2 = ctx.createGain();
  env(g2, t, 0.001, Math.min(0.4, vol * 0.3), 0.03);
  n.connect(f).connect(g2).connect(ctx.destination);
  n.start(t); n.stop(t + 0.05);
}

// удар о борт
export function thud(vol = 1) {
  if (!ok('thud', 0.04)) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(70, t + 0.15);
  const g = ctx.createGain();
  env(g, t, 0.004, Math.min(0.6, 0.1 + vol * 0.5), 0.15);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + 0.2);
}

// шар в лузе
export function pocket() {
  if (!ok('pocket', 0.05)) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(220 - i * 40, t + i * 0.07);
    const g = ctx.createGain();
    env(g, t + i * 0.07, 0.005, 0.35 / (i + 1), 0.12);
    o.connect(g).connect(ctx.destination);
    o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.2);
  }
}

// кий по голове — мультяшный «бонк»
export function bonk(vol = 1) {
  if (!ok('bonk', 0.05)) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(900, t);
  o.frequency.exponentialRampToValueAtTime(180, t + 0.22);
  const g = ctx.createGain();
  env(g, t, 0.003, 0.25 + vol * 0.35, 0.25);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + 0.3);
  const n = noise();
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 1500;
  const g2 = ctx.createGain();
  env(g2, t, 0.001, 0.3 * vol, 0.05);
  n.connect(f).connect(g2).connect(ctx.destination);
  n.start(t); n.stop(t + 0.08);
}

// падение Бори в лузу — свист вниз
export function whistle() {
  if (!ok('whistle', 0.2)) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(1400, t);
  o.frequency.exponentialRampToValueAtTime(200, t + 0.7);
  const g = ctx.createGain();
  env(g, t, 0.02, 0.2, 0.7);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + 0.8);
}

// победный аккорд
export function fanfare() {
  if (!ok('fanfare', 0.5)) return;
  const t = ctx.currentTime;
  [523, 659, 784, 1046].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = ctx.createGain();
    env(g, t + i * 0.12, 0.01, 0.2, 0.6);
    o.connect(g).connect(ctx.destination);
    o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.7);
  });
}

export function getCtx() { return ctx; }
