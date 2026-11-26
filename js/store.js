// Settings, usage log and jar state live in localStorage.
// Imported content (recordings, photos) lives in IndexedDB.
import { LETTERS } from './letters.js';

const K_SETTINGS = 'alef.settings.v1';
const K_LOG = 'alef.log.v1';
const K_JAR = 'alef.jar.v1';

export const DEFAULTS = {
  activeLetters: LETTERS.map(l => l.id),
  choices: 3,
  allowSimilar: false,
  sayIt: true,
  sayPause: 4,        // seconds
  fade: 1.2,          // image cross-fade, seconds
  jarSize: 15,
  chime: false,
  shuffleOrder: true,   // new letter order every time the letters screen appears
  shuffleColors: true,  // new colours every time
};

function readJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

// ---------- settings ----------
let settings = { ...DEFAULTS, ...readJSON(K_SETTINGS, {}) };
export const getSettings = () => settings;
export function saveSettings(patch) {
  settings = { ...settings, ...patch };
  writeJSON(K_SETTINGS, settings);
  return settings;
}

// ---------- usage log ----------
let log = readJSON(K_LOG, []);
export const getLog = () => log;
export function addRow(row) { log.push(row); writeJSON(K_LOG, log); return row; }
export function updateRow(row, patch) { Object.assign(row, patch); writeJSON(K_LOG, log); }
export function clearLog() { log = []; writeJSON(K_LOG, log); }

// ---------- jar ----------
// stickers: array of [shapeIndex, colorIndex] for the current jar
let jar = readJSON(K_JAR, { stickers: [], jarsFilled: 0, totalStickers: 0 });
export const getJar = () => jar;
export function saveJar(j) { jar = j; writeJSON(K_JAR, jar); }
export function resetJar() { saveJar({ stickers: [], jarsFilled: 0, totalStickers: 0 }); }

// ---------- persistent storage ----------
export async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch { }
  return false;
}

// ---------- imported content (IndexedDB) ----------
const DB_NAME = 'alef-content';
const STORE = 'files';
let dbPromise = null;
let keys = new Set();

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}
function tx(mode, fn) {
  return db().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    const out = fn(s);
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
  }));
}

export async function loadContentIndex() {
  try {
    const all = await tx('readonly', s => s.getAllKeys());
    keys = new Set(all);
  } catch { keys = new Set(); }
  return keys;
}
export const hasFile = k => keys.has(k);
export const contentKeys = () => keys;
export function getFile(k) {
  if (!keys.has(k)) return Promise.resolve(null);
  return tx('readonly', s => s.get(k)).catch(() => null);
}
export async function replaceContent(files /* Map key->Blob */) {
  await tx('readwrite', s => {
    s.clear();
    for (const [k, b] of files) s.put(b, k);
  });
  return loadContentIndex();
}
// Partial update: in one transaction, delete every existing key for which
// shouldClear(key) is true, then write the new files. All other keys stay.
export async function updateContent(shouldClear, files /* Map key->Blob */) {
  const doomed = [...keys].filter(shouldClear);
  await tx('readwrite', s => {
    for (const k of doomed) s.delete(k);
    for (const [k, b] of files) s.put(b, k);
  });
  return loadContentIndex();
}
export async function putFile(k, blob) {
  await tx('readwrite', s => s.put(blob, k));
  keys.add(k);
}
export async function deleteFile(k) {
  await tx('readwrite', s => s.delete(k));
  keys.delete(k);
}
export async function allFiles() {
  const out = new Map();
  for (const k of keys) { const b = await getFile(k); if (b) out.set(k, b); }
  return out;
}
export async function clearContent() {
  await tx('readwrite', s => s.clear());
  return loadContentIndex();
}
