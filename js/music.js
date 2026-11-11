// Тапёр немого кино: синтезированное пианино + треск пластинки.
// Все мелодии оригинальные. Режимы: theme (рэгтайм), tension (тремоло при натяжке кия),
// chase (галоп, пока Боря катится), dizzy (пьяный вальс).
import { getCtx } from './audio.js?v=7';

let enabled = true;
try { enabled = localStorage.getItem('borya-music') !== '0'; } catch (e) { /* нет хранилища */ }

let ctx = null, bus = null, out = null, crackle = null, timer = null;
let mode = 'theme', intensity = 0;
let nextTime = 0;
const steps = { theme: 0, tension: 0, chase: 0, dizzy: 0 };

// ---------- ноты ----------
const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = (n) => {
  const m = /^([A-G])(#?)(-?\d)$/.exec(n);
  return 12 * (+m[3] + 1) + NAMES[m[1]] + (m[2] ? 1 : 0);
};

let wave = null, wobbleLfo = null;
function piano(n, t, dur, vel, wobble = 0) {
  const m = typeof n === 'number' ? n : midi(n);
  const f = 440 * Math.pow(2, (m - 69) / 12);
  const g = ctx.createGain();
  const decay = Math.max(0.3, 1.5 - (m - 36) * 0.02);
  const end = t + Math.min(decay, dur + 0.2);
  g.gain.setValueAtTime(0.0001, t);
  const v = vel * 0.42;   // форма волны нормирована — громче прежних треугольников
  g.gain.exponentialRampToValueAtTime(v, t + 0.006);
  g.gain.exponentialRampToValueAtTime(v * 0.4, t + 0.09);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  g.connect(bus);
  // «расстроенное» пианино: два слегка разъехавшихся голоса с готовым тембром (обертоны в форме волны)
  for (const det of [-7, 7]) {
    const o = ctx.createOscillator();
    o.setPeriodicWave(wave);
    o.frequency.value = f;
    o.detune.value = det;
    if (wobble) wobbleLfo[wobble > 30 ? 1 : 0].connect(o.detune);
    o.connect(g);
    o.start(t); o.stop(end + 0.03);
  }
}

// ---------- партитуры ----------
// Тема: рэгтайм, 2/4, 16 тактов по 8 шестнадцатых. Левая рука — «страйд».
const CH = {
  C: { bass: ['C3', 'G2'], chord: ['E3', 'G3', 'C4'] },
  G7: { bass: ['G2', 'D3'], chord: ['F3', 'B3', 'D4'] },
  C7: { bass: ['C3', 'G2'], chord: ['E3', 'G3', 'A#3'] },
  F: { bass: ['F2', 'C3'], chord: ['F3', 'A3', 'C4'] },
  Fm: { bass: ['F2', 'C3'], chord: ['F3', 'G#3', 'C4'] },
};
const THEME = [
  ['C', [[0, 'E5', 1], [1, 'G5', 2], [3, 'C6', 2], [5, 'B5', 1], [6, 'C6', 2]]],
  ['C', [[0, 'E6', 3], [3, 'D6', 1], [4, 'C6', 2], [6, 'G5', 2]]],
  ['G7', [[0, 'F5', 1], [1, 'A5', 2], [3, 'D6', 2], [5, 'C#6', 1], [6, 'D6', 2]]],
  ['G7', [[0, 'F6', 3], [3, 'E6', 1], [4, 'D6', 2], [6, 'B5', 2]]],
  ['G7', [[0, 'G5', 1], [1, 'B5', 2], [3, 'D6', 1], [4, 'F6', 2], [6, 'E6', 1], [7, 'D6', 1]]],
  ['G7', [[0, 'C6', 1], [1, 'B5', 1], [2, 'A5', 1], [3, 'G5', 1], [4, 'F5', 2], [6, 'D5', 2]]],
  ['C', [[0, 'E5', 1], [1, 'D#5', 1], [2, 'E5', 1], [3, 'G5', 2], [5, 'C6', 3]]],
  ['C', [[0, 'G5', 2], [2, 'E5', 2], [4, 'C5', 4]]],
  ['C', [[0, 'G5', 1], [1, 'C6', 2], [3, 'E6', 2], [5, 'D#6', 1], [6, 'E6', 2]]],
  ['C7', [[0, 'G6', 2], [2, 'E6', 1], [3, 'C6', 1], [4, 'A#5', 2], [6, 'G5', 2]]],
  ['F', [[0, 'A5', 1], [1, 'C6', 2], [3, 'F6', 2], [5, 'E6', 1], [6, 'F6', 2]]],
  ['Fm', [[0, 'G#5', 2], [2, 'F5', 1], [3, 'C6', 1], [4, 'G#5', 2], [6, 'F5', 2]]],
  ['C', [[0, 'E5', 1], [1, 'G5', 1], [2, 'C6', 1], [3, 'E6', 1], [4, 'G6', 2], [6, 'E6', 2]]],
  ['G7', [[0, 'F6', 1], [1, 'D6', 1], [2, 'B5', 1], [3, 'G5', 1], [4, 'F5', 1], [5, 'D5', 1], [6, 'B4', 2]]],
  ['C', [[0, 'C5', 1], [1, 'E5', 1], [2, 'G5', 1], [3, 'C6', 3], [6, 'G5', 1], [7, 'G5', 1]]],
  ['C', [[0, 'C6', 2], [2, 'G5', 1], [4, 'C5', 2]]],
];

// Погоня: ля минор, галоп, бегущие шестнадцатые
const CHASE_CH = {
  Am: { bass: ['A2', 'E2'], chord: ['A3', 'C4', 'E4'] },
  E7: { bass: ['E2', 'B1'], chord: ['G#3', 'B3', 'D4'] },
  Dm: { bass: ['D2', 'A2'], chord: ['A3', 'D4', 'F4'] },
};
const CHASE = [
  ['Am', 'E5 A5 C6 E6 D6 C6 B5 A5'],
  ['Am', 'G#5 A5 B5 C6 D6 E6 F6 E6'],
  ['E7', 'D6 B5 G#5 E5 G#5 B5 D6 B5'],
  ['E7', 'E6 D6 C6 B5 A5 G#5 F5 E5'],
  ['Am', 'A5 C6 E6 A6 G#6 A6 E6 C6'],
  ['Am', 'A5 E5 C5 E5 A5 C6 E6 C6'],
  ['Dm', 'F6 E6 D6 A5 F5 A5 D6 F6'],
  ['E7', 'E6 D#6 E6 B5 G#5 E5 G#5 B5'],
];

// Напряжение: тремоло на уменьшённом аккорде + ползущая хроматика
const TENSION_MEL = { 0: ['E5', 6], 8: ['F5', 6], 16: ['E5', 2], 18: ['D#5', 2], 20: ['E5', 6], 28: ['A#4', 4] };

// Головокружение: вальс 3/4, хроматический спуск с «плывущей» высотой
const DIZZY_MEL = ['C6', 'B5', 'A#5', 'A5', 'G#5', 'G5', 'F#5', 'F5', 'E5', 'D#5', 'D5', 'C#5'];

function schedule(t) {
  const st = steps[mode]++;
  if (mode === 'theme') {
    const s = st % (THEME.length * 8);
    const [chName, mel] = THEME[(s / 8) | 0];
    const slot = s % 8;
    const ch = CH[chName];
    const d16 = 0.085;
    if (slot === 0) piano(ch.bass[0], t, 0.3, 0.32);
    if (slot === 4) piano(ch.bass[1], t, 0.3, 0.28);
    if (slot === 2 || slot === 6) for (const n of ch.chord) piano(n, t, 0.15, 0.12);
    for (const [sl, n, len] of mel) if (sl === slot) piano(n, t, len * d16, 0.24);
    return d16;
  }
  if (mode === 'tension') {
    const k = Math.min(1, intensity);
    const d16 = 0.085 - 0.04 * k;
    const lo = st % 2 === 0 ? ['B1', 'F2'] : ['D2', 'G#2'];
    for (const n of lo) piano(n, t, d16, 0.1 + 0.22 * k);
    if (st % 2 === 0) piano(st % 4 === 0 ? 'B3' : 'D4', t, d16, 0.05 + 0.1 * k);
    const m = TENSION_MEL[st % 32];
    if (m) piano(m[0], t, m[1] * d16, 0.16 + 0.12 * k);
    return d16;
  }
  if (mode === 'chase') {
    const s = st % (CHASE.length * 8);
    const [chName, line] = CHASE[(s / 8) | 0];
    const slot = s % 8;
    const ch = CHASE_CH[chName];
    const d16 = 0.072 - 0.014 * Math.min(1, intensity);
    if (slot === 0) piano(ch.bass[0], t, 0.2, 0.3);
    if (slot === 4) piano(ch.bass[1], t, 0.2, 0.26);
    if (slot === 2 || slot === 6) for (const n of ch.chord) piano(n, t, 0.12, 0.1);
    piano(line.split(' ')[slot], t, d16, 0.2);
    return d16;
  }
  // dizzy
  const s = st % 36;
  const d8 = 0.17;
  const beat = s % 3;
  if (beat === 0) piano(s % 6 === 0 ? 'C3' : 'G2', t, 0.4, 0.26, 25);
  else for (const n of ['E3', 'G3', 'A#3']) piano(n, t, 0.2, 0.08, 25);
  piano(DIZZY_MEL[s % DIZZY_MEL.length], t, d8 * 1.2, 0.18, 45);
  return d8;
}

// ---------- треск пластинки ----------
function makeCrackle() {
  const len = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    d[i] = (Math.random() * 2 - 1) * 0.004;
    if (Math.random() < 0.00015) {
      // мягкие редкие щелчки (раньше были резкие и громкие — звучали как хрип)
      const a = (Math.random() * 0.08 + 0.03) * (Math.random() < 0.5 ? -1 : 1);
      for (let k = 0; k < 60 && i + k < len; k++) d[i + k] += a * Math.sin((k / 60) * Math.PI) * Math.exp(-k / 25);
    }
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2500;
  bp.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.value = 0.35;
  src.connect(bp).connect(g).connect(out);
  src.start();
  return src;
}

function tick() {
  if (!ctx) return;
  if (!enabled) { nextTime = ctx.currentTime + 0.05; return; }
  if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
  while (nextTime < ctx.currentTime + 0.3) nextTime += schedule(nextTime);
}

function ensure() {
  if (ctx) return true;
  ctx = getCtx();
  if (!ctx) return false;
  // тракт «граммофона»: срез низа и верха
  out = ctx.createGain();
  out.gain.value = enabled ? 0.55 : 0;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 160;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 4200;
  // ограничитель на выходе — страховка от перегруза
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -8;
  lim.knee.value = 6;
  lim.ratio.value = 12;
  lim.attack.value = 0.003;
  lim.release.value = 0.15;
  out.connect(hp).connect(lp).connect(lim).connect(ctx.destination);
  bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(out);
  // тембр пианино: основной тон + затухающие обертоны
  const real = new Float32Array([0, 0, 0, 0, 0, 0, 0]);
  const imag = new Float32Array([0, 1, 0.42, 0.18, 0.09, 0.05, 0.03]);
  wave = ctx.createPeriodicWave(real, imag);
  // общие модуляторы «плывущей» высоты для вальса
  wobbleLfo = [25, 45].map((depth) => {
    const l = ctx.createOscillator();
    l.frequency.value = 3.5;
    const lg = ctx.createGain();
    lg.gain.value = depth;
    l.connect(lg);
    l.start();
    return lg;
  });
  crackle = makeCrackle();
  return true;
}

// Вызвать после первого жеста пользователя (когда создан AudioContext)
export function startMusic() {
  if (!ensure() || timer) return;
  nextTime = ctx.currentTime + 0.1;
  timer = setInterval(tick, 40);
}

export function setMode(m, k = 0) {
  intensity = k;
  if (m === mode) return;
  mode = m;
  if (m !== 'theme') steps[m] = 0;   // тема продолжается с того же места
}

export function isMusicOn() { return enabled; }
export function setMusic(on) {
  enabled = on;
  try { localStorage.setItem('borya-music', on ? '1' : '0'); } catch (e) { /* ignore */ }
  if (out) out.gain.setTargetAtTime(on ? 0.55 : 0, ctx.currentTime, 0.1);
}

// Приглушить музыку на миг (удар кием)
export function duck() {
  if (!bus) return;
  const t = ctx.currentTime;
  bus.gain.cancelScheduledValues(t);
  bus.gain.setValueAtTime(0.3, t);
  bus.gain.setTargetAtTime(1, t + 0.15, 0.2);
}
