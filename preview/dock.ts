import '@fontsource/exo-2/600.css';

// Essai : arrimage de la Comète à une station, vu sur l'écran de visée. La Comète avance seule ; les
// poussées latérales (bords de l'écran) corrigent la dérive. Comme sur le petit cadran « arrivée prévue », la
// station se place à l'écran selon le point d'arrivée prévu (position + dérive × temps restant), à grande
// échelle : il faut amener la cible dessinée sur le sas dans le viseur holographique du centre. Difficulté
// croissante : dérive, vent solaire, puis l'axe vertical. Alertes en texte, bips et voix : enregistrements
// d'EVA (art/voix/arrimage/, ceux qui manquent restent en texte et bip), ou synthèse du téléphone.
// http://localhost:5173/preview/dock.html  (?level=1..4 : départ direct)
// Clavier : ← → (Q D) poussées latérales, ↑ ↓ (Z S) poussées verticales, Entrée : rejouer.

interface Level {
  name: string;
  desc: string;
  start: number;
  drift: number;
  wind: number;
  vert: boolean;
  fuel: number;
}
const LEVELS: Level[] = [
  { name: 'Approche 1', desc: 'Dérive douce', start: 400, drift: 0.35, wind: 0, vert: false, fuel: 100 },
  { name: 'Approche 2', desc: 'Vent solaire', start: 600, drift: 0.5, wind: 0.14, vert: false, fuel: 100 },
  { name: 'Approche 3', desc: 'Axe vertical', start: 600, drift: 0.45, wind: 0.12, vert: true, fuel: 120 },
  { name: 'Approche 4', desc: 'Tempête', start: 700, drift: 0.65, wind: 0.26, vert: true, fuel: 120 },
];

/** Alertes : texte affiché (et dit par la synthèse). */
const VOICE = {
  engage: "Séquence d'arrimage engagée.",
  d500: 'Arrimage dans 500 mètres.',
  d300: 'Arrimage dans 300 mètres.',
  d100: 'Arrimage dans 100 mètres.',
  d50: 'Arrimage dans 50 mètres.',
  d10: 'Arrimage dans 10 mètres.',
  c4: 'Quatre.',
  c3: 'Trois.',
  c2: 'Deux.',
  c1: 'Un.',
  aligned: 'Alignement correct.',
  driftL: 'Attention, dérive à gauche.',
  driftR: 'Attention, dérive à droite.',
  driftU: 'Attention, dérive vers le haut.',
  driftD: 'Attention, dérive vers le bas.',
  speed: 'Vitesse excessive. Ralentissez.',
  reduce: 'Réduisez la poussée.',
  fuel: 'Carburant faible.',
  collision: 'Collision !',
  urgent: 'Impact imminent.',
  contact: 'Contact.',
  success: 'Arrimage réussi.',
  perfect: 'Arrimage parfait.',
  fail: "Échec de l'arrimage.",
} as const;
type VoiceId = keyof typeof VOICE;
const URGENT: ReadonlySet<VoiceId> = new Set(['collision', 'urgent', 'speed']);
const COUNT: readonly VoiceId[] = ['c1', 'c2', 'c3', 'c4'];
const DIST: Partial<Record<VoiceId, number>> = { d500: 500, d300: 300, d100: 100, d50: 50, d10: 10 };

/** Enregistrements d'EVA (art/voix/arrimage/<nom>.mp3, liste dans son README) ; un fichier absent = texte et bip. */
const CLIP_OF: Partial<Record<VoiceId, string>> = {
  d100: 'dock_100m',
  d50: 'dock_50m',
  d10: 'dock_10m',
  c4: 'count_4',
  c3: 'count_3',
  c2: 'count_2',
  c1: 'count_1',
  driftL: 'drift_left',
  driftR: 'drift_right',
  driftU: 'drift_up',
  driftD: 'drift_down',
  urgent: 'impact_imminent',
  speed: 'speed_too_high',
  collision: 'collision',
  aligned: 'aligned',
  contact: 'contact',
  success: 'docking_success',
  fail: 'docking_failed',
};
const CLIP_URLS = import.meta.glob('../art/voix/arrimage/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const THRUST = 1.4; // m/s²
const FUEL_RATE = 9; // % par seconde de poussée sur un axe
const TOL = 1.5; // m : écart admis au contact
const PERFECT = 0.4;
const MAX_LAT_SPEED = 0.8; // m/s au contact
const STEP = 1 / 60;

// Vitesse d'approche automatique : A0 + B × distance (lente au contact, le temps du compte à rebours).
const A0 = 1.2;
const B = 0.08;
const approach = (d: number): number => A0 + B * d;
/** Temps restant avant le contact, à la vitesse d'approche automatique. */
const timeLeft = (d: number): number => Math.log(approach(d) / A0) / B;

// ---------- état ----------
const params = new URLSearchParams(location.search);
type Phase = 'menu' | 'run' | 'done';
const st = {
  phase: 'menu' as Phase,
  level: 0,
  dist: 260,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  fuel: 100,
  t: 0,
  windA: 0,
  windB: 0,
  result: '' as '' | 'perfect' | 'success' | 'fail',
  finalOff: 0,
  finalSpeed: 0,
  thrusting: false,
};
const input = { left: false, right: false, up: false, down: false };
type Dir = keyof typeof input;
let autopilot = false;
let timeScale = 1;
const said = new Set<VoiceId>();
const lastSaid = new Map<VoiceId, number>();
/** Animation de la vue : roulis des poussées, verrouillage du viseur (0 à 1). */
let bank = 0;
let lock = 0;
let aimLocked = false;

// ---------- audio ----------
let ac: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let hiss: GainNode | null = null;
let voiceBus: GainNode | null = null;
function audio(): AudioContext | null {
  if (ac) {
    // Créé hors geste (?level=) : il attend un toucher pour jouer.
    if (ac.state === 'suspended') void ac.resume();
    return ac;
  }
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ac = new Ctor();
  noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 900;
  bp.Q.value = 0.8;
  hiss = ac.createGain();
  hiss.gain.value = 0;
  src.connect(bp).connect(hiss).connect(ac.destination);
  src.start();
  voiceBus = ac.createGain();
  voiceBus.gain.value = 1;
  voiceBus.connect(ac.destination);
  loadClips(ac);
  return ac;
}
function beep(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.12, at = 0): void {
  const c = ac;
  if (!c) return;
  const t0 = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}
function crash(): void {
  const c = ac;
  if (!c || !noise) return;
  const s = c.createBufferSource();
  s.buffer = noise;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 500;
  const g = c.createGain();
  g.gain.setValueAtTime(0.5, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 1.2);
  s.connect(lp).connect(g).connect(c.destination);
  s.start();
  s.stop(c.currentTime + 1.3);
}

// ---------- enregistrements ----------
interface Clip {
  buf: AudioBuffer;
  at: number;
  dur: number;
}
const clips = new Map<VoiceId, Clip>();
let clipsAsked = false;
/** Silence de tête et de queue retiré : la durée sert aussi à enchaîner les alertes. */
function trimmed(buf: AudioBuffer): Clip {
  const d = buf.getChannelData(0);
  let a = 0;
  while (a < d.length && Math.abs(d[a]) < 0.02) a++;
  let b = d.length - 1;
  while (b > a && Math.abs(d[b]) < 0.02) b--;
  const pad = Math.round(0.04 * buf.sampleRate);
  const s = Math.max(0, a - pad);
  const e = Math.min(d.length, b + pad);
  return { buf, at: s / buf.sampleRate, dur: Math.max(0.05, (e - s) / buf.sampleRate) };
}
function loadClips(c: AudioContext): void {
  if (clipsAsked) return;
  clipsAsked = true;
  for (const [id, name] of Object.entries(CLIP_OF) as [VoiceId, string][]) {
    const url = CLIP_URLS[`../art/voix/arrimage/${name}.mp3`];
    if (!url) continue;
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => c.decodeAudioData(b))
      .then((buf) => clips.set(id, trimmed(buf)))
      .catch(() => undefined);
  }
}
let playing: AudioBufferSourceNode | null = null;
function stopClip(): void {
  if (!playing) return;
  try {
    playing.stop();
  } catch {
    // déjà fini
  }
  playing = null;
}
/** Joue l'enregistrement s'il est chargé ; renvoie sa durée (0 sinon). */
function playClip(id: VoiceId, delay: number): number {
  const c = ac;
  const clip = clips.get(id);
  if (!c || !voiceBus || !clip) return 0;
  stopClip();
  const s = c.createBufferSource();
  s.buffer = clip.buf;
  s.connect(voiceBus);
  s.start(c.currentTime + delay, clip.at, clip.dur);
  playing = s;
  return clip.dur + delay;
}

// ---------- voix et alertes ----------
const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
type VoiceMode = 'eva' | 'synth' | 'beep';
let voiceMode: VoiceMode = 'eva';
const voiceBtn = document.querySelector('#voice') as HTMLButtonElement;
function voiceLabel(): void {
  voiceBtn.textContent = voiceMode === 'eva' ? 'Voix : EVA' : voiceMode === 'synth' ? 'Voix : synthèse' : 'Voix : bips';
}
voiceLabel();
voiceBtn.addEventListener('click', () => {
  voiceMode = voiceMode === 'eva' ? (synth ? 'synth' : 'beep') : voiceMode === 'synth' ? 'beep' : 'eva';
  synth?.cancel();
  stopClip();
  voiceLabel();
});

let alertText = '';
let alertUrgent = false;
let alertLeft = 0;
const queue: VoiceId[] = [];
let speaking = 0;
function say(id: VoiceId, cooldown = 4): void {
  const last = lastSaid.get(id);
  if (last !== undefined && st.t - last < cooldown) return;
  if (queue.includes(id)) return;
  lastSaid.set(id, st.t);
  if (URGENT.has(id)) queue.unshift(id);
  else queue.push(id);
  if (queue.length > 2) queue.splice(2);
}
function sayOnce(id: VoiceId): void {
  if (said.has(id)) return;
  said.add(id);
  say(id, 0);
}
/** Coupe ce qui se dit et annonce tout de suite (compte à rebours, contact). */
function sayNow(...ids: VoiceId[]): void {
  queue.length = 0;
  for (const id of ids) {
    said.add(id);
    lastSaid.set(id, st.t);
    queue.push(id);
  }
  speaking = 0;
  stopClip();
  synth?.cancel();
}
function utter(id: VoiceId): number {
  alertText = VOICE[id];
  alertUrgent = URGENT.has(id) || id === 'fail';
  alertLeft = 2.2;
  const counting = COUNT.includes(id);
  if (alertUrgent) {
    beep(880, 0.12, 'square', 0.08);
    beep(660, 0.12, 'square', 0.08, 0.15);
  } else if (counting) beep(1000, 0.06, 'sine', 0.09);
  else beep(1320, 0.08, 'sine', 0.1);
  const textTime = 0.4 + VOICE[id].length * 0.055;
  if (voiceMode === 'eva') {
    const d = playClip(id, alertUrgent ? 0.3 : 0.08);
    return d > 0 ? d + 0.25 : textTime;
  }
  if (voiceMode === 'synth' && synth) {
    const u = new SpeechSynthesisUtterance(VOICE[id]);
    u.lang = 'fr-FR';
    u.rate = 1.12;
    u.pitch = 1.15;
    synth.speak(u);
  }
  return textTime;
}
function pumpVoice(dt: number): void {
  speaking -= dt;
  alertLeft -= dt;
  if (speaking > 0) return;
  // Une annonce de distance dépassée pendant l'attente ne se dit plus.
  while (queue.length > 0 && st.phase === 'run' && st.dist < (DIST[queue[0]] ?? 0) * 0.8) queue.shift();
  if (queue.length === 0) return;
  speaking = utter(queue.shift() as VoiceId);
}

// ---------- partie ----------
function start(level: number): void {
  audio();
  const L = LEVELS[level];
  st.level = level;
  st.phase = 'run';
  st.dist = L.start;
  const side = Math.random() < 0.5 ? -1 : 1;
  st.x = side * (2 + Math.random() * 3);
  st.y = L.vert ? (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 2.5) : 0;
  st.vx = side * L.drift * (0.6 + Math.random() * 0.4);
  st.vy = L.vert ? (Math.random() < 0.5 ? -1 : 1) * L.drift * (0.5 + Math.random() * 0.5) : 0;
  st.fuel = L.fuel;
  st.t = 0;
  st.windA = Math.random() * 6;
  st.windB = Math.random() * 6;
  st.result = '';
  said.clear();
  lastSaid.clear();
  queue.length = 0;
  speaking = 0;
  stopClip();
  synth?.cancel();
  clearTimeout(menuTimer);
  document.body.classList.toggle('vert', L.vert);
  for (const el of vertPads) el.hidden = !L.vert;
  menu.hidden = true;
  sayOnce('engage');
}

let menuTimer = 0;
function finish(): void {
  const L = LEVELS[st.level];
  st.phase = 'done';
  const off = Math.hypot(st.x, L.vert ? st.y : 0);
  const sp = Math.hypot(st.vx, L.vert ? st.vy : 0);
  st.finalOff = off;
  st.finalSpeed = sp;
  if (off <= TOL && sp <= MAX_LAT_SPEED) {
    st.result = off <= PERFECT && sp <= 0.3 ? 'perfect' : 'success';
    if (st.result === 'perfect') sayNow('contact', 'success', 'perfect');
    else sayNow('contact', 'success');
    beep(523, 0.25, 'triangle', 0.12);
    beep(659, 0.25, 'triangle', 0.12, 0.12);
    beep(784, 0.45, 'triangle', 0.12, 0.24);
  } else {
    st.result = 'fail';
    sayNow('collision', 'fail');
    crash();
  }
  if (hiss && ac) hiss.gain.setTargetAtTime(0, ac.currentTime, 0.05);
  menuTimer = window.setTimeout(showMenu, 1600);
}

function sim(dt: number): void {
  if (st.phase !== 'run') return;
  const L = LEVELS[st.level];
  st.t += dt;
  // Pilote automatique (tests) : vise un écart nul à l'arrivée.
  if (autopilot) {
    const tl = Math.max(timeLeft(st.dist), 1.5);
    const wantX = -st.x / tl;
    const wantY = -st.y / tl;
    input.left = st.vx - wantX > 0.05;
    input.right = st.vx - wantX < -0.05;
    input.up = L.vert && st.vy - wantY < -0.05;
    input.down = L.vert && st.vy - wantY > 0.05;
  }
  let ax = 0;
  let ay = 0;
  const hasFuel = st.fuel > 0;
  if (hasFuel) {
    if (input.left) ax -= THRUST;
    if (input.right) ax += THRUST;
    if (L.vert && input.up) ay += THRUST;
    if (L.vert && input.down) ay -= THRUST;
  }
  const axes = (ax !== 0 ? 1 : 0) + (ay !== 0 ? 1 : 0);
  st.thrusting = axes > 0;
  st.fuel = Math.max(0, st.fuel - axes * FUEL_RATE * dt);
  // Vent solaire : poussée lente qui change de sens.
  if (L.wind > 0) {
    ax += L.wind * (Math.sin(st.t * 0.37 + st.windA) + 0.6 * Math.sin(st.t * 0.91 + st.windB));
    if (L.vert) ay += L.wind * (Math.sin(st.t * 0.43 + st.windB) + 0.6 * Math.sin(st.t * 0.77 + st.windA));
  }
  st.vx += ax * dt;
  st.vy += ay * dt;
  st.x += st.vx * dt;
  st.y += st.vy * dt;
  st.dist -= approach(st.dist) * dt;

  // Alertes
  const d = st.dist;
  const tl = timeLeft(Math.max(d, 0));
  // Compte à rebours des 4 dernières secondes : il passe avant tout le reste.
  const n = Math.ceil(tl);
  if (n >= 1 && n <= COUNT.length) {
    const id = COUNT[n - 1];
    if (!said.has(id)) sayNow(id);
  } else {
    if (d <= 500 && LEVELS[st.level].start > 500) sayOnce('d500');
    if (d <= 300) sayOnce('d300');
    if (d <= 100) sayOnce('d100');
    if (d <= 50) sayOnce('d50');
    if (d <= 10) sayOnce('d10');
    const px = st.x + st.vx * tl;
    const py = st.y + st.vy * tl;
    const pred = Math.hypot(px, L.vert ? py : 0);
    const lat = Math.hypot(st.vx, L.vert ? st.vy : 0);
    if (d < 60 && pred > TOL * 2) say('collision', 3);
    else if (d < 140 && pred > TOL * 1.3) say('urgent', 5);
    if (lat > 1.6) say('speed', 4);
    if (st.thrusting && lat > 1.2 && ((input.left && st.vx < -1) || (input.right && st.vx > 1))) say('reduce', 5);
    if (st.fuel < L.fuel * 0.25 && st.fuel > 0) say('fuel', 12);
    if (pred > TOL && d > 30) {
      if (Math.abs(px) > Math.abs(L.vert ? py : 0)) say(px < 0 ? 'driftL' : 'driftR', 5);
      else say(py > 0 ? 'driftU' : 'driftD', 5);
    } else if (pred < 0.6 && lat < 0.5 && (lastSaid.has('driftL') || lastSaid.has('driftR') || lastSaid.has('driftU') || lastSaid.has('driftD'))) {
      say('aligned', 8);
    }
  }
  if (st.dist <= 0) {
    st.dist = 0;
    finish();
  }
}

// ---------- rendu ----------
const cv = document.querySelector('#screen') as HTMLCanvasElement;
const g = cv.getContext('2d') as CanvasRenderingContext2D;
let W = 0;
let H = 0;
let dpr = 1;
function resize(): void {
  dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  W = window.innerWidth;
  H = window.innerHeight;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

const STARS = Array.from({ length: 160 }, () => ({ x: (Math.random() - 0.5) * 400, y: (Math.random() - 0.5) * 240, z: Math.random() * 600 + 20 }));
let starShift = 0;

function drawStation(cx: number, cy: number, k: number, t: number): void {
  // k : pixels par mètre au plan du sas.
  const hex = (r: number, rot = 0): void => {
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = rot + (i / 6) * Math.PI * 2;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i) g.lineTo(px, py);
      else g.moveTo(px, py);
    }
    g.closePath();
  };
  // Bras et panneaux
  g.fillStyle = '#1c2134';
  g.strokeStyle = '#3a4466';
  g.lineWidth = Math.max(1, k * 0.15);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    g.save();
    g.translate(cx, cy);
    g.rotate(a);
    g.fillRect(k * 14, -k * 2.2, k * 22, k * 4.4);
    g.strokeRect(k * 14, -k * 2.2, k * 22, k * 4.4);
    g.fillStyle = '#2f5d9a';
    for (let j = 0; j < 4; j++) g.fillRect(k * (16 + j * 5), -k * 1.8, k * 4, k * 3.6);
    g.fillStyle = '#1c2134';
    g.restore();
  }
  hex(k * 15, Math.PI / 6);
  g.fill();
  g.stroke();
  // Hublots allumés
  g.fillStyle = '#ffd36b';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.fillRect(cx + Math.cos(a) * k * 11 - k * 0.5, cy + Math.sin(a) * k * 11 - k * 0.35, k, k * 0.7);
  }
  // Anneau d'amarrage
  hex(k * 6, Math.PI / 6);
  g.fillStyle = '#262c44';
  g.fill();
  g.strokeStyle = '#8a95c4';
  g.stroke();
  // Feux de guidage qui clignotent
  const on = Math.floor(t * 2) % 2 === 0;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.fillStyle = on === (i % 2 === 0) ? '#3ff0ff' : '#0d3a44';
    g.beginPath();
    g.arc(cx + Math.cos(a) * k * 4.5, cy + Math.sin(a) * k * 4.5, Math.max(1.5, k * 0.35), 0, Math.PI * 2);
    g.fill();
  }
  // Sas
  g.fillStyle = '#05060c';
  g.beginPath();
  g.arc(cx, cy, k * 2, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#3ff0ff';
  g.lineWidth = Math.max(1.5, k * 0.18);
  g.stroke();
}

/** Cible holographique posée sur le sas : c'est elle qu'on amène dans le viseur. */
function drawTarget(x: number, y: number, r: number, ok: boolean, t: number): void {
  const col = ok ? '120,255,160' : '255,176,60';
  g.strokeStyle = `rgba(${col},0.25)`;
  g.lineWidth = 6;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = `rgba(${col},0.95)`;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
  // Anneau intérieur en tirets qui tourne
  g.save();
  g.translate(x, y);
  g.rotate(t * 0.8);
  g.setLineDash([5, 5]);
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.restore();
  // Point central et quatre pointes tournées vers lui
  g.fillStyle = `rgba(${col},1)`;
  g.beginPath();
  g.arc(x, y, Math.max(2.5, r * 0.12), 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const tip = r * 1.12;
    const base = r * 1.5;
    const w = r * 0.22;
    g.beginPath();
    g.moveTo(x + ux * tip, y + uy * tip);
    g.lineTo(x + ux * base - uy * w, y + uy * base + ux * w);
    g.lineTo(x + ux * base + uy * w, y + uy * base - ux * w);
    g.closePath();
    g.fill();
  }
}

/** Viseur holographique fixe au centre : son cercle vaut l'écart admis au contact. */
function drawSight(cx: number, cy: number, R: number, ok: boolean, t: number): void {
  const col = ok ? '120,255,160' : '120,240,255';
  const flick = 0.85 + 0.15 * Math.sin(t * 23);
  g.strokeStyle = `rgba(${col},${0.14 * flick})`;
  g.lineWidth = 8;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = `rgba(${col},${0.85 * flick})`;
  g.lineWidth = 1.6;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.stroke();
  // Graduations
  g.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const l = i % 6 === 0 ? 0.22 : 0.09;
    g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    g.lineTo(cx + Math.cos(a) * R * (1 - l), cy + Math.sin(a) * R * (1 - l));
  }
  g.stroke();
  // Crochets : ils se referment sur le viseur quand la cible y est.
  const br = R * (1.55 - 0.32 * lock);
  g.lineWidth = 3;
  g.save();
  g.translate(cx, cy);
  g.rotate(t * 0.25 * (1 - lock));
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    g.beginPath();
    g.arc(0, 0, br, a - 0.32, a + 0.32);
    g.stroke();
  }
  g.restore();
  // Croix centrale
  g.lineWidth = 1.2;
  g.strokeStyle = `rgba(${col},0.7)`;
  g.beginPath();
  g.moveTo(cx - R * 0.45, cy);
  g.lineTo(cx - R * 0.15, cy);
  g.moveTo(cx + R * 0.15, cy);
  g.lineTo(cx + R * 0.45, cy);
  g.moveTo(cx, cy - R * 0.45);
  g.lineTo(cx, cy - R * 0.15);
  g.moveTo(cx, cy + R * 0.15);
  g.lineTo(cx, cy + R * 0.45);
  g.stroke();
}

function text(s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left'): void {
  g.font = `600 ${size}px 'Exo 2', sans-serif`;
  g.textAlign = align;
  g.fillStyle = color;
  g.fillText(s, x, y);
}

function draw(): void {
  const L = LEVELS[st.level];
  g.fillStyle = '#02030a';
  g.fillRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H / 2;
  const m = Math.min(W, H);
  const F = m * 1.1;
  // Point d'arrivée prévu, comme sur le petit cadran, mais à l'échelle du viseur.
  const R = m * 0.11;
  const S = R / TOL;
  const tl = timeLeft(Math.max(st.dist, 0));
  const px = st.x + st.vx * tl;
  const py = L.vert ? st.y + st.vy * tl : 0;
  const pred = Math.hypot(px, py);
  const ox = -px * S;
  const oy = py * S;
  aimLocked = st.phase !== 'menu' && pred <= TOL;

  // Scène (étoiles, station, cible), penchée par les poussées latérales.
  g.save();
  g.translate(cx, cy);
  g.rotate(bank);
  g.translate(-cx, -cy);
  for (const s of STARS) {
    let z = s.z - starShift;
    z = ((z % 620) + 620) % 620 + 5;
    const sx = cx + (s.x / z) * F * 0.25 + ox * 0.18;
    const sy = cy + (s.y / z) * F * 0.25 + oy * 0.18;
    const r = Math.min(2.2, 60 / z);
    g.fillStyle = `rgba(200,220,255,${Math.min(1, 80 / z)})`;
    g.fillRect(sx, sy, r, r);
  }
  const d = Math.max(st.dist, 1.2);
  const k = F / d;
  const tx = cx + ox;
  const ty = cy + oy;
  drawStation(tx, ty, k, st.t);
  drawTarget(tx, ty, R * 0.42, aimLocked, st.t);
  g.restore();

  // Hors champ : flèche au bord, vers la cible.
  const ol = Math.hypot(ox, oy);
  const maxOff = Math.max(40, Math.min(W / 2 - 125, H / 2 - 40));
  if (ol > maxOff) {
    const ux = ox / ol;
    const uy = oy / ol;
    const ex = cx + ux * maxOff;
    const ey = cy + uy * maxOff;
    g.fillStyle = 'rgba(255,176,60,0.95)';
    g.beginPath();
    g.moveTo(ex + ux * 14, ey + uy * 14);
    g.lineTo(ex - uy * 10, ey + ux * 10);
    g.lineTo(ex + uy * 10, ey - ux * 10);
    g.closePath();
    g.fill();
  }
  // Fil de guidage du viseur vers la cible.
  if (st.phase === 'run' && !aimLocked) {
    g.strokeStyle = 'rgba(255,176,60,0.45)';
    g.lineWidth = 1.2;
    g.setLineDash([4, 6]);
    g.beginPath();
    g.moveTo(cx + (ox / ol) * R, cy + (oy / ol) * R);
    g.lineTo(cx + (ox / ol) * Math.min(ol, maxOff), cy + (oy / ol) * Math.min(ol, maxOff));
    g.stroke();
    g.setLineDash([]);
  }
  drawSight(cx, cy, R, aimLocked, st.t);

  // Écran : cadre, lignes de balayage
  g.strokeStyle = 'rgba(63,240,255,0.5)';
  g.lineWidth = 2;
  g.strokeRect(104, 54, W - 208, H - 74);
  g.fillStyle = 'rgba(63,240,255,0.035)';
  for (let y = 54; y < H - 20; y += 4) g.fillRect(104, y, W - 208, 1);

  if (st.phase === 'menu') return;
  const below = cy + R * 1.6;
  if (st.phase === 'run') text(aimLocked ? '◆ ALIGNÉ ◆' : 'HORS AXE', cx, below + 14, 12, aimLocked ? '#78ffa0' : '#ffb070', 'center');
  // Lectures
  text(`DISTANCE  ${Math.max(0, st.dist).toFixed(0)} m`, 118, 78, 15, '#c8fdff');
  text(`APPROCHE  ${approach(Math.max(st.dist, 0)).toFixed(1)} m/s`, 118, 98, 13, '#9fb4d8');
  const lat = L.vert ? `${st.vx >= 0 ? '→' : '←'} ${Math.abs(st.vx).toFixed(2)}  ${st.vy >= 0 ? '↑' : '↓'} ${Math.abs(st.vy).toFixed(2)}` : `${st.vx >= 0 ? '→' : '←'} ${Math.abs(st.vx).toFixed(2)} m/s`;
  text(`DÉRIVE  ${lat}`, W - 118, 78, 15, Math.hypot(st.vx, st.vy) > MAX_LAT_SPEED ? '#ffb070' : '#c8fdff', 'right');
  text(L.name.toUpperCase(), W - 118, 98, 13, '#9fb4d8', 'right');
  // Carburant
  const fw = 140;
  g.strokeStyle = '#3a4466';
  g.strokeRect(cx - fw / 2, 64, fw, 10);
  const f = st.fuel / L.fuel;
  g.fillStyle = f < 0.25 ? '#ff5a6a' : '#3ff0ff';
  g.fillRect(cx - fw / 2 + 1, 65, (fw - 2) * f, 8);
  text('CARBURANT', cx, 90, 11, '#9fb4d8', 'center');

  // Petit cadran « arrivée prévue », en bas à droite du cadre
  const gr = 34;
  const gx = W - 118 - gr;
  const gy = H - 40 - gr;
  g.strokeStyle = 'rgba(200,253,255,0.5)';
  g.lineWidth = 1;
  g.beginPath();
  g.arc(gx, gy, gr, 0, Math.PI * 2);
  g.moveTo(gx - gr, gy);
  g.lineTo(gx + gr, gy);
  g.moveTo(gx, gy - gr);
  g.lineTo(gx, gy + gr);
  g.stroke();
  const scale = gr / (TOL * 3);
  g.strokeStyle = 'rgba(120,255,160,0.8)';
  g.beginPath();
  g.arc(gx, gy, TOL * scale, 0, Math.PI * 2);
  g.stroke();
  let mx = px * scale;
  let my = -py * scale;
  const ml = Math.hypot(mx, my);
  if (ml > gr) {
    mx *= gr / ml;
    my *= gr / ml;
  }
  g.fillStyle = pred <= TOL ? '#78ffa0' : '#ffaa3c';
  g.beginPath();
  g.moveTo(gx + mx, gy + my - 5);
  g.lineTo(gx + mx + 5, gy + my);
  g.lineTo(gx + mx, gy + my + 5);
  g.lineTo(gx + mx - 5, gy + my);
  g.fill();
  text('ARRIVÉE PRÉVUE', gx, gy + gr + 14, 10, '#9fb4d8', 'center');

  // Alerte, sous le viseur
  if (alertLeft > 0 && alertText) {
    const a = Math.min(1, alertLeft * 2);
    g.globalAlpha = a;
    const big = COUNT.some((id) => VOICE[id] === alertText);
    text(alertText, cx, below + (big ? 52 : 44), big ? 30 : 22, alertUrgent ? '#ff6a7a' : '#ffe6a8', 'center');
    g.globalAlpha = 1;
  }
  if (st.phase === 'done') {
    const ok = st.result !== 'fail';
    g.fillStyle = ok ? 'rgba(63,240,255,0.18)' : 'rgba(255,60,80,0.25)';
    g.fillRect(0, 0, W, H);
  }
}

// ---------- menu ----------
const menu = document.querySelector('#menu') as HTMLElement;
const menuTitle = document.querySelector('#menu-title') as HTMLElement;
const menuText = document.querySelector('#menu-text') as HTMLElement;
const levelsEl = document.querySelector('#levels') as HTMLElement;
const vertPads = [...document.querySelectorAll<HTMLElement>('.thr.v')];
function showMenu(): void {
  if (st.phase === 'run') return;
  levelsEl.textContent = '';
  if (st.phase === 'done') {
    const L = LEVELS[st.level];
    menuTitle.textContent = st.result === 'perfect' ? 'Arrimage parfait !' : st.result === 'success' ? 'Arrimage réussi' : 'Échec de l’arrimage';
    menuText.textContent = `${L.name} : écart ${st.finalOff.toFixed(2)} m (admis ${TOL} m), dérive ${st.finalSpeed.toFixed(2)} m/s (admise ${MAX_LAT_SPEED}), carburant ${Math.round((st.fuel / L.fuel) * 100)} %.`;
  }
  LEVELS.forEach((L, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `${L.name}<small>${L.desc}${L.vert ? ' · ▲▼' : ''}</small>`;
    if (st.phase === 'done' && i === (st.result === 'fail' ? st.level : Math.min(st.level + 1, LEVELS.length - 1))) b.classList.add('best');
    b.addEventListener('click', () => start(i));
    levelsEl.append(b);
  });
  menu.hidden = false;
}
showMenu();

// ---------- commandes ----------
// Trois boutons de chaque côté (▲ au-dessus, ◀ ou ▶ au milieu, ▼ dessous) : une direction peut avoir deux boutons.
const keyHeld: Record<Dir, boolean> = { left: false, right: false, up: false, down: false };
const pads: { dir: Dir; on: boolean; el: HTMLElement }[] = [];
function refresh(dir: Dir): void {
  input[dir] = keyHeld[dir] || pads.some((p) => p.dir === dir && p.on);
}
for (const el of document.querySelectorAll<HTMLElement>('.thr')) {
  const pad = { dir: el.dataset.dir as Dir, on: false, el };
  pads.push(pad);
  const set = (on: boolean): void => {
    pad.on = on;
    el.classList.toggle('on', on);
    refresh(pad.dir);
  };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    audio();
    el.setPointerCapture(e.pointerId);
    set(true);
  });
  el.addEventListener('pointerup', () => set(false));
  el.addEventListener('pointercancel', () => set(false));
  el.addEventListener('lostpointercapture', () => set(false));
}
const KEYS: Record<string, Dir> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  KeyQ: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  KeyZ: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
};
window.addEventListener('keydown', (e) => {
  const k = KEYS[e.code];
  if (k) {
    keyHeld[k] = true;
    refresh(k);
    e.preventDefault();
  }
  if (e.code === 'Enter' && st.phase !== 'run') start(st.phase === 'done' && st.result !== 'fail' ? Math.min(st.level + 1, LEVELS.length - 1) : st.level);
});
window.addEventListener('keyup', (e) => {
  const k = KEYS[e.code];
  if (k) {
    keyHeld[k] = false;
    refresh(k);
  }
});
window.addEventListener('blur', () => {
  for (const p of pads) {
    p.on = false;
    p.el.classList.remove('on');
  }
  for (const k of Object.keys(keyHeld) as Dir[]) {
    keyHeld[k] = false;
    refresh(k);
  }
});
window.addEventListener('contextmenu', (e) => e.preventDefault());
document.querySelector('#back')?.addEventListener('click', () => {
  synth?.cancel();
  stopClip();
  location.href = 'tests.html';
});

// ---------- boucle ----------
let last = performance.now();
let acc = 0;
function frame(now: number): void {
  requestAnimationFrame(frame);
  const raw = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (document.hidden) return;
  acc += raw * timeScale;
  while (acc >= STEP) {
    acc -= STEP;
    sim(STEP);
    pumpVoice(STEP);
  }
  if (st.phase === 'run') starShift += approach(st.dist) * raw * timeScale * 0.5;
  const run = st.phase === 'run' && st.fuel > 0;
  const bankTo = run ? ((input.left ? 1 : 0) - (input.right ? 1 : 0)) * 0.04 : 0;
  bank += (bankTo - bank) * Math.min(1, raw * 4);
  lock += ((aimLocked ? 1 : 0) - lock) * Math.min(1, raw * 8);
  if (hiss && ac) hiss.gain.setTargetAtTime(st.phase === 'run' && st.thrusting ? 0.07 : 0, ac.currentTime, 0.03);
  draw();
}
requestAnimationFrame(frame);

const lv = Number(params.get('level'));
if (lv >= 1 && lv <= LEVELS.length) start(lv - 1);

// Aide de test.
(window as unknown as { __xrDock: unknown }).__xrDock = {
  info: () => ({
    phase: st.phase,
    level: st.level + 1,
    dist: st.dist,
    x: st.x,
    y: st.y,
    vx: st.vx,
    vy: st.vy,
    fuel: st.fuel,
    result: st.result,
    finalOff: st.finalOff,
    alert: alertLeft > 0 ? alertText : '',
    said: [...lastSaid.keys()],
    locked: aimLocked,
    clips: [...clips.keys()],
  }),
  start: (level: number) => start(level - 1),
  autopilot: (on = true) => {
    autopilot = on;
    if (!on) input.left = input.right = input.up = input.down = false;
  },
  timeScale: (s: number) => {
    timeScale = s;
  },
  /** true : voix d'EVA ; false : bips seulement ; 'synth' : synthèse du téléphone. */
  voice: (on: boolean | 'synth') => {
    voiceMode = on === 'synth' ? 'synth' : on ? 'eva' : 'beep';
    voiceLabel();
  },
};
