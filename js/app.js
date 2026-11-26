import { LETTERS, BY_ID, SIMILAR, BUNDLED_PICTURES } from './letters.js';
import * as store from './store.js';
import * as sound from './sound.js';
import * as art from './art.js';
import { initParent } from './parent.js';

const $ = s => document.querySelector(s);
const wait = ms => new Promise(r => setTimeout(r, ms));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const screens = { home: $('#home'), story: $('#story'), say: $('#say'), find: $('#find') };
let token = 0;              // increases whenever a round is cancelled or a new one starts
let busy = false;           // a round is in progress
let pendingSticker = false; // add a sticker when we get back home
let objectURLs = [];

// ---------------------------------------------------------------- screens
function show(name) {
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('on', k === name);
}

// ---------------------------------------------------------------- home: letters field
function seeded(i, k) { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); }

// A new arrangement (order, colours, small tilts) is drawn every time the
// letters screen is about to appear, so the child can't rely on a letter's
// place or colour, only on its shape. Window resizes keep the arrangement.
let arrangement = null;
function reshuffle() {
  const s = store.getSettings();
  let ids = LETTERS.map(l => l.id).filter(id => s.activeLetters.includes(id));
  if (s.shuffleOrder) {
    // avoid showing the same order twice in a row
    const prev = arrangement && arrangement.ids.join();
    for (let t = 0; t < 5; t++) { shuffle(ids); if (ids.join() !== prev || ids.length < 3) break; }
  }
  const pal = shuffle([...art.PALETTE.keys()]);
  const colors = {}, tilt = {};
  ids.forEach((id, i) => {
    // colours cycle through a shuffled palette, so neighbours differ
    colors[id] = s.shuffleColors ? pal[i % pal.length] : LETTERS.findIndex(l => l.id === id) % art.PALETTE.length;
    tilt[id] = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5];
  });
  arrangement = { ids, colors, tilt, key: s.activeLetters.join() };
}

function renderField() {
  const field = $('#field');
  const s = store.getSettings();
  if (!arrangement || arrangement.key !== s.activeLetters.join()) reshuffle();
  const letters = arrangement.ids.map(id => BY_ID[id]);
  field.innerHTML = '';
  if (!letters.length) return;
  const W = field.clientWidth, H = field.clientHeight;
  // pick the number of columns that gives the biggest tiles
  let best = { size: 0, cols: 1 };
  for (let c = 1; c <= letters.length; c++) {
    const rows = Math.ceil(letters.length / c);
    const size = Math.min(W / c, H / rows);
    if (size > best.size) best = { size, cols: c };
  }
  const cols = best.cols, rows = Math.ceil(letters.length / cols);
  const cell = best.size;
  const tile = Math.min(cell * 0.84, 260);
  const offX = (W - cols * cell) / 2, offY = (H - rows * cell) / 2;
  letters.forEach((l, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    // right-to-left order; the last row is centred
    const inRow = r === rows - 1 ? letters.length - r * cols : cols;
    const rowOff = (cols - inRow) * cell / 2;
    const [jx, jy, jr] = arrangement.tilt[l.id];
    const x = W - offX - rowOff - (c + 0.5) * cell + jx * cell * 0.12;
    const y = offY + (r + 0.5) * cell + jy * cell * 0.12;
    const rot = jr * 10;
    const b = document.createElement('button');
    b.className = 'tile';
    b.textContent = l.ch;
    b.style.cssText = `width:${tile}px;height:${tile}px;left:${x - tile / 2}px;top:${y - tile / 2}px;
      font-size:${tile * 0.66}px;background:${art.PALETTE[arrangement.colors[l.id]]};--rot:${rot}deg`;
    b.addEventListener('click', () => startRound(l, b));
    field.appendChild(b);
  });
}

// ---------------------------------------------------------------- jar
// Stickers are equal circles that pile up like bubbles: each one is dropped
// from a slightly different spot and rolls down until it settles in a pocket
// between the jar and the stickers already there. Earlier stickers never move.
// Everything is worked out in the jar drawing's own units (100 wide x 120 tall)
// and is deterministic, so the same jar always looks the same.
const JAR_INNER = (() => {
  // inner outline of the jar body (see JAR_SVG), slightly inset from the glass
  const pts = [];
  const bez = (p0, p1, p2, p3) => {
    for (let k = 1; k <= 12; k++) {
      const t = k / 12, u = 1 - t;
      pts.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
    }
  };
  pts.push([22, 22]);
  bez([22, 22], [10, 28], [6, 40], [6, 54]);
  pts.push([6, 102]);
  bez([6, 102], [6, 112], [14, 118], [24, 118]);
  pts.push([76, 118]);
  bez([76, 118], [86, 118], [94, 112], [94, 102]);
  pts.push([94, 54]);
  bez([94, 54], [94, 40], [90, 28], [78, 22]);
  return pts;
})();
const JAR_MARGIN = 3;   // keep stickers clear of the glass line
const JAR_TOP = 30;     // stickers stay below the jar's neck (the lid closes there)

function keepInside(c, r) {
  // The jar outline is convex, so "inside, at least r + margin from the glass"
  // means being on the inner side of every edge line by that much.
  const need = r + JAR_MARGIN;
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < JAR_INNER.length; k++) {
      const [ax, ay] = JAR_INNER[k], [bx, by] = JAR_INNER[(k + 1) % JAR_INNER.length];
      const ex = bx - ax, ey = by - ay, l = Math.hypot(ex, ey);
      const nx = ey / l, ny = -ex / l;             // inward normal
      const side = (c.x - ax) * nx + (c.y - ay) * ny;
      if (side < need) { c.x += (need - side) * nx; c.y += (need - side) * ny; }
    }
  }
}

function pileUp(n, r) {
  const placed = [];
  for (let i = 0; i < n; i++) {
    const c = { x: 24 + seeded(i, 5) * 52, y: JAR_TOP - r };
    for (let step = 0; step < 600; step++) {
      const before = c.y;
      c.y += 0.6;                                  // gravity
      for (let it = 0; it < 3; it++) {
        for (const o of placed) {                  // never overlap an earlier sticker
          const dx = c.x - o.x, dy = c.y - o.y, d = Math.hypot(dx, dy), min = 2 * r;
          if (d < min) {
            if (d < 1e-6) { c.x += 0.01; continue; }
            c.x += dx / d * (min - d); c.y += dy / d * (min - d);
          }
        }
        keepInside(c, r);
      }
      if (step > 40 && Math.abs(c.y - before) < 0.002) break;  // settled
    }
    // final check: if pushing apart left any overlap, nudge straight up out of it
    for (let guard = 0; guard < 50; guard++) {
      const hit = placed.some(o => Math.hypot(c.x - o.x, c.y - o.y) < 2 * r - 0.05);
      if (!hit) break;
      c.y -= 0.3;
    }
    placed.push(c);
  }
  return placed;
}

const layoutCache = new Map();
function slotLayout(n) {
  if (layoutCache.has(n)) return layoutCache.get(n);
  // biggest sticker size for which all n settle below the neck
  const area = 86 * 80;                            // rough usable area of the jar
  let r = Math.sqrt(area * 0.8 / (n * Math.PI));
  let pile;
  for (let tries = 0; tries < 40; tries++) {
    pile = pileUp(n, r);
    if (pile.every(c => c.y - r >= JAR_TOP - 0.5)) break;
    r *= 0.97;
  }
  const layout = {
    slots: pile.map((c, i) => ({ x: c.x / 100, y: c.y / 120, rot: (seeded(i, 7) - 0.5) * 50 })),
    size: (2 * r * 0.98) / 100,                    // a hair smaller, so neighbours just touch
  };
  layoutCache.set(n, layout);
  return layout;
}

function stickerEl(st, i, layout) {
  const s = layout.slots[i];
  const el = document.createElement('div');
  el.className = 'sticker';
  el.innerHTML = art.stickerSVG(st[0], st[1]);
  el.style.cssText = `left:${s.x * 100}%;top:${s.y * 100}%;width:${layout.size * 100}%;--rot:${s.rot}deg`;
  return el;
}

function renderJar() {
  const jar = store.getJar();
  const n = store.getSettings().jarSize;
  const box = $('#jarStickers');
  box.innerHTML = '';
  const layout = slotLayout(n);
  jar.stickers.slice(0, n).forEach((st, i) => box.appendChild(stickerEl(st, i, layout)));
}

async function addSticker() {
  const jar = store.getJar();
  const n = store.getSettings().jarSize;
  const last = jar.stickers[jar.stickers.length - 1];
  let shape, color;
  do { shape = Math.floor(Math.random() * art.STICKER_SHAPES); color = Math.floor(Math.random() * art.STICKER_COLORS); }
  while (last && last[0] === shape && last[1] === color);
  jar.stickers.push([shape, color]);
  jar.totalStickers = (jar.totalStickers || 0) + 1;
  store.saveJar(jar);

  const layout = slotLayout(n);
  const el = stickerEl([shape, color], jar.stickers.length - 1, layout);
  el.classList.add('falling');
  $('#jarStickers').appendChild(el);
  await wait(30);
  el.classList.remove('falling');
  await wait(1500);

  if (jar.stickers.length >= n) {
    // jar is full: close the lid, then swap for a new empty jar (no sound)
    const jarEl = $('#jar');
    jarEl.classList.add('closed');
    await wait(1800);
    jarEl.classList.add('away');
    await wait(900);
    jar.stickers = [];
    jar.jarsFilled = (jar.jarsFilled || 0) + 1;
    store.saveJar(jar);
    renderJar();
    jarEl.classList.remove('closed');
    await wait(50);
    jarEl.classList.remove('away');
  }
}

// ---------------------------------------------------------------- content helpers
const IMG_RE = /^(\d+)\.(jpe?g|png|webp|gif|svg)$/;

// The letter's pencil drawing (always shown first, while its name is said).
function drawingURL(letter) {
  if (BUNDLED_PICTURES.includes(letter.id)) return `pictures/${letter.id}.svg`;
  return art.placeholderPictures(LETTERS.indexOf(letter))[0];
}

// The parent's photos for the story (1.jpg, 2.jpg …), in number order. May be empty.
async function photoURLs(letter) {
  const prefix = `letters/${letter.id}/`;
  const files = [...store.contentKeys()]
    .filter(k => k.startsWith(prefix) && IMG_RE.test(k.slice(prefix.length)))
    .sort((a, b) => parseInt(a.slice(prefix.length)) - parseInt(b.slice(prefix.length)));
  const urls = [];
  for (const k of files) {
    const blob = await store.getFile(k);
    if (blob) { const u = URL.createObjectURL(blob); objectURLs.push(u); urls.push(u); }
  }
  return urls;
}

// Start second of each photo, counted from the start of the story recording.
// timing.txt gives one number per photo, in order. Photo 1 always starts at 0.
// If the file lists fewer numbers than there are photos, the last listed photo and
// the unlisted ones after it share the remaining time equally.
// Without timing.txt, all photos share the story's length equally.
function photoStarts(count, dur, given) {
  const out = [0];
  for (const n of (given || []).slice(1, count)) {
    if (!(n > out[out.length - 1] && n < dur)) break;   // ignore anything out of order or past the end
    out.push(n);
  }
  const k = out.length;                // photos with a start time so far
  if (k < count) {
    const from = out[k - 1];
    const step = (dur - from) / (count - k + 1);
    for (let i = 1; i <= count - k; i++) out.push(from + step * i);
  }
  return out;
}

async function timings(letter) {
  const blob = await store.getFile(`letters/${letter.id}/timing.txt`);
  if (!blob) return null;
  const nums = (await blob.text()).split(/[\s,;]+/).map(Number).filter(n => isFinite(n));
  return nums.length ? nums : null;
}

function freeURLs() { objectURLs.forEach(u => URL.revokeObjectURL(u)); objectURLs = []; }

// Empty both story picture slots instantly (no fade), so no earlier
// letter's picture can ever be seen at the start of a new story.
function clearPics() {
  [$('#picA'), $('#picB')].forEach(im => {
    im.style.transitionDuration = '0s';
    im.classList.remove('on');
    im.removeAttribute('src');
  });
}

// Load an image fully before it is shown (ignore failures).
function loadPic(im, url) {
  im.src = url;
  return (im.decode ? im.decode() : Promise.resolve()).catch(() => { });
}

// ---------------------------------------------------------------- one round
function localStamp(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const deviceKind = () => Math.min(screen.width, screen.height) >= 600 ? 'tablet' : 'phone';

async function startRound(letter, tileEl) {
  if (busy) return;
  busy = true;
  sound.unlock();
  const my = ++token;
  const alive = () => my === token;
  const s = store.getSettings();
  const d = new Date();
  const row = store.addRow({
    timestamp: localStamp(d), date: localStamp(d).slice(0, 10), weekday: WEEKDAYS[d.getDay()],
    letter: letter.ch, letter_name: letter.id,
    story_completed: 'no', story_seconds: 0,
    choices_shown: '', tapped: '', correct: '', seconds_to_tap: '',
    device: deviceKind(), active_letters_count: s.activeLetters.length, choices_count: '',
  });
  keepAwake(true);

  // ---- story
  tileEl.classList.add('picked');
  await wait(450);
  if (!alive()) return;
  $('#storyLetter').textContent = letter.ch;
  const drawing = drawingURL(letter);
  const photos = await photoURLs(letter);
  const times = await timings(letter);
  const imgs = [$('#picA'), $('#picB')];
  clearPics();
  await loadPic(imgs[0], drawing);
  if (!alive()) return;
  imgs[0].classList.add('on');          // appears at once, with the screen's own fade
  void imgs[0].offsetWidth;             // apply before turning cross-fades back on
  imgs.forEach(im => { im.style.transitionDuration = s.fade + 's'; });
  let front = 0;
  const showPic = url => {
    if (!alive()) return;
    const back = 1 - front;
    imgs[back].src = url;
    imgs[back].classList.add('on');
    imgs[front].classList.remove('on');
    front = back;
  };
  show('story');
  tileEl.classList.remove('picked');
  await wait(700);
  if (!alive()) return;

  let t0 = null;   // when the story recording itself started
  const timers = [];
  backHandler = () => {
    timers.forEach(clearTimeout);
    const secs = t0 === null ? 0 : Math.round((performance.now() - t0) / 1000);
    store.updateRow(row, { story_completed: 'no', story_seconds: secs });
    endRound(false);
  };

  // 1. letter + drawing, while the letter's name is said, then 1 second
  let r = await sound.play(`letters/${letter.id}/name`, letter.name);
  if (!alive() || r.stopped) return;
  await wait(1000);
  if (!alive()) return;

  // 2. the drawing's own recording, if there is one, then 1 second
  if (sound.findKey(`letters/${letter.id}/drawing`)) {
    r = await sound.play(`letters/${letter.id}/drawing`, '');
    if (!alive() || r.stopped) return;
    await wait(1000);
    if (!alive()) return;
  }

  // 3. the story, with the photos (or the drawing stays if there are none)
  if (photos.length) showPic(photos[0]);
  t0 = performance.now();
  const res = await sound.play(`letters/${letter.id}/story`, `כאן יהיה הסיפור של האות ${letter.name}. ${letter.word}.`, {
    placeholderSeconds: 8,
    onDuration: dur => {
      if (photos.length < 2) return;
      const starts = photoStarts(photos.length, dur || 8, times);
      starts.forEach((sec, i) => { if (i > 0) timers.push(setTimeout(() => showPic(photos[i]), sec * 1000)); });
    },
  });
  timers.forEach(clearTimeout);
  backHandler = null;
  if (!alive() || res.stopped) return;
  store.updateRow(row, { story_completed: 'yes', story_seconds: Math.round((performance.now() - t0) / 1000) });
  await wait(700);
  if (!alive()) return;

  // ---- say it
  if (s.sayIt) {
    $('#sayLetter').textContent = letter.ch;
    show('say');
    await wait(900);
    if (!alive()) return;
    await sound.play('prompts/say_it', 'מה שם האות הזאת? תגיד בקול');
    if (!alive()) return;
    await wait(s.sayPause * 1000);
    if (!alive()) return;
    await sound.play(`letters/${letter.id}/name`, letter.name);
    if (!alive()) return;
    await wait(900);
    if (!alive()) return;
  }

  // ---- find it
  const options = pickChoices(letter, s);
  store.updateRow(row, { choices_shown: options.map(l => l.ch).join(' '), choices_count: options.length });
  const tiles = layoutChoices(options);
  show('find');
  await wait(800);
  if (!alive()) return;
  const shownAt = performance.now();
  let answered = false;
  let resolveTap;
  const tapped = new Promise(r => (resolveTap = r));
  tiles.forEach(({ el, l }) => el.addEventListener('click', () => {
    if (answered) return;
    answered = true;
    sound.stop();
    resolveTap({ el, l });
  }));
  const ask = () => sound.play(`letters/${letter.id}/where`, `איפה האות ${letter.name}?`);
  ask();
  // if nothing is tapped for a while, ask once more
  const again = setTimeout(() => { if (!answered && alive()) ask(); }, 14000);
  const { el, l } = await tapped;
  clearTimeout(again);
  if (!alive()) return;
  const correct = l.id === letter.id;
  store.updateRow(row, {
    tapped: l.ch, correct: correct ? 'yes' : 'no',
    seconds_to_tap: ((performance.now() - shownAt) / 1000).toFixed(1),
  });
  if (correct) {
    el.classList.add('right');
    if (s.chime) sound.chime();
    const n = 1 + Math.floor(Math.random() * 3);
    await sound.play(`prompts/correct${n}`, ['נכון', 'יפה', 'כל הכבוד'][n - 1]);
    pendingSticker = true;
    await wait(700);
  } else {
    const target = tiles.find(t => t.l.id === letter.id);
    target.el.classList.add('show');
    await wait(500);
    await sound.play(`letters/${letter.id}/here_is`, `הנה ${letter.name}`);
    await wait(1100);
  }
  if (!alive()) return;
  endRound(true);
}

let backHandler = null;

async function endRound() {
  token++;
  sound.stop();
  keepAwake(false);
  reshuffle();
  renderField();
  show('home');
  busy = false;
  await wait(900);
  if (!busy) clearPics();
  freeURLs();
  if (pendingSticker) { pendingSticker = false; await addSticker(); }
}

function pickChoices(letter, s) {
  const n = Math.max(2, Math.min(4, s.choices));
  let pool = LETTERS.filter(l => l.id !== letter.id && s.activeLetters.includes(l.id));
  // with too few active letters, fall back to the whole alphabet
  if (pool.length < n - 1) pool = LETTERS.filter(l => l.id !== letter.id);
  const conflicts = id => SIMILAR.some(g => g.includes(id) && g.some(x => x !== id && chosen.some(c => c.id === x)));
  let chosen = [letter];
  for (const l of shuffle([...pool])) {
    if (chosen.length >= n) break;
    if (!s.allowSimilar && conflicts(l.id)) continue;
    chosen.push(l);
  }
  // if the similar-letter rule left us short, fill up anyway
  for (const l of shuffle([...pool])) { if (chosen.length >= n) break; if (!chosen.includes(l)) chosen.push(l); }
  return shuffle(chosen);
}

const SLOTS = {
  2: [[0.30, 0.33], [0.70, 0.68]],
  3: [[0.72, 0.18], [0.28, 0.50], [0.72, 0.82]],
  4: [[0.28, 0.20], [0.72, 0.38], [0.30, 0.62], [0.70, 0.82]],
};
function layoutChoices(options) {
  const box = $('#choices');
  box.innerHTML = '';
  const W = box.clientWidth, H = box.clientHeight;
  const n = options.length;
  const size = Math.min(W * (n === 2 ? 0.5 : n === 3 ? 0.46 : 0.42), H * (n === 4 ? 0.21 : n === 3 ? 0.28 : 0.36), 320);
  const colors = shuffle([...art.PALETTE.keys()]);
  const flipX = Math.random() < 0.5, flipY = Math.random() < 0.5;
  const slots = SLOTS[n].map(([x, y]) => [flipX ? 1 - x : x, flipY ? 1 - y : y]);
  return options.map((l, i) => {
    const [fx, fy] = slots[i];
    const x = fx * W + (Math.random() - 0.5) * W * 0.05;
    const y = fy * H + (Math.random() - 0.5) * H * 0.03;
    const el = document.createElement('button');
    el.className = 'tile choice';
    el.textContent = l.ch;
    const idx = colors[i];
    el.style.cssText = `width:${size}px;height:${size}px;left:${x - size / 2}px;top:${y - size / 2}px;
      font-size:${size * 0.66}px;background:${art.PALETTE[idx]};--rot:${(Math.random() - 0.5) * 12}deg`;
    box.appendChild(el);
    return { el, l };
  });
}

// ---------------------------------------------------------------- screen wake lock
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen');
    if (!on && wakeLock) { wakeLock.release(); wakeLock = null; }
  } catch { }
}

// ---------------------------------------------------------------- setup
function init() {
  $('#backBtn').innerHTML = art.BACK_SVG;
  $('#backBtn').addEventListener('click', () => { if (backHandler) backHandler(); });
  $('#jarBody').innerHTML = art.JAR_SVG;
  $('#jarLid').innerHTML = art.LID_SVG;

  // parent menu: 3-second press on the faint dot
  const dot = $('#parentDot');
  let pressTimer = null;
  const cancel = () => clearTimeout(pressTimer);
  dot.addEventListener('pointerdown', e => { e.preventDefault(); pressTimer = setTimeout(openParent, 3000); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => dot.addEventListener(ev, cancel));

  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('pointerdown', () => sound.unlock(), { once: true });
  window.addEventListener('resize', () => { renderField(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && busy) { if (backHandler) backHandler(); else endRound(); }
  });

  store.loadContentIndex().then(() => { renderField(); renderJar(); });
  renderField();
  renderJar();
  show('home');
  store.requestPersist();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
}

const { open: openParent } = initParent({
  onChange: () => { reshuffle(); renderField(); renderJar(); },
});

init();
