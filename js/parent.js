// Parent menu: summary, settings, content import, CSV export.
import { LETTERS, BY_ID } from './letters.js';
import * as store from './store.js';
import * as sound from './sound.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '—';

export const CSV_COLUMNS = [
  'timestamp', 'date', 'weekday', 'letter', 'letter_name', 'story_completed', 'story_seconds',
  'choices_shown', 'tapped', 'correct', 'seconds_to_tap', 'device', 'active_letters_count', 'choices_count',
];

let onChange = () => { };
let tab = 'summary';

export function initParent(opts) {
  onChange = opts.onChange || onChange;
  return { open };
}

function open() {
  sound.stop();
  const el = $('#parent');
  el.hidden = false;
  render();
}
function close() {
  stopRecording(true);
  sound.stop();
  editing = null;
  $('#parent').hidden = true;
  onChange();
}

function render() {
  stopRecording(true);
  const el = $('#parent');
  const tabs = [['summary', 'סיכום'], ['settings', 'הגדרות'], ['content', 'תוכן'], ['data', 'נתונים']];
  el.innerHTML = `
    <div class="p-head">
      <h1>תפריט הורים <small class="hint" id="pVer"></small></h1>
      <button class="p-close" id="pClose">סגירה</button>
    </div>
    <nav class="p-tabs">${tabs.map(([k, t]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${t}</button>`).join('')}</nav>
    <div class="p-body" id="pBody"></div>`;
  $('#pClose').onclick = close;
  // which app version this device runs (the name of its offline copy, e.g. alef-v9)
  if (window.caches) caches.keys().then(k => {
    const v = k.find(n => n.startsWith('alef-'));
    if (v && $('#pVer')) $('#pVer').textContent = 'גרסה ' + v.replace('alef-v', '');
  }).catch(() => { });
  el.querySelectorAll('.p-tabs button').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
  ({ summary, settings, content, data })[tab]($('#pBody'));
}

// ---------------------------------------------------------------- summary
export function computeSummary(rows, now = Date.now()) {
  const weekAgo = now - 7 * 864e5;
  const parse = r => new Date(r.timestamp).getTime();
  const sets = { total: rows, week: rows.filter(r => parse(r) >= weekAgo) };
  const out = {};
  for (const [k, rs] of Object.entries(sets)) {
    const answered = rs.filter(r => r.correct === 'yes' || r.correct === 'no');
    const right = answered.filter(r => r.correct === 'yes');
    const counts = {};
    rs.forEach(r => counts[r.letter_name] = (counts[r.letter_name] || 0) + 1);
    out[k] = {
      rounds: rs.length,
      days: new Set(rs.map(r => r.date)).size,
      storiesDone: rs.filter(r => r.story_completed === 'yes').length,
      answered: answered.length,
      right: right.length,
      top: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  }
  // per letter
  out.letters = LETTERS.map(l => {
    const mine = rows.filter(r => r.letter_name === l.id);
    const mineWeek = mine.filter(r => parse(r) >= weekAgo);
    const ans = rs => rs.filter(r => r.correct === 'yes' || r.correct === 'no');
    const ok = rs => rs.filter(r => r.correct === 'yes').length;
    return {
      l, chosen: mine.length, asked: ans(mine).length, right: ok(mine),
      askedWeek: ans(mineWeek).length, rightWeek: ok(mineWeek),
    };
  });
  return out;
}

function summary(body) {
  const rows = store.getLog();
  const s = computeSummary(rows);
  const jar = store.getJar();
  const top = t => t.length ? t.map(([id, n]) => `<span class="chip"><b>${BY_ID[id] ? BY_ID[id].ch : id}</b> ×${n}</span>`).join(' ') : '—';
  body.innerHTML = `
    <table class="p-table">
      <thead><tr><th></th><th>סה״כ</th><th>7 ימים אחרונים</th></tr></thead>
      <tbody>
        <tr><th>סבבים</th><td>${s.total.rounds}</td><td>${s.week.rounds}</td></tr>
        <tr><th>ימים עם משחק</th><td>${s.total.days}</td><td>${s.week.days}</td></tr>
        <tr><th>סיפורים עד הסוף</th><td>${s.total.storiesDone}</td><td>${s.week.storiesDone}</td></tr>
        <tr><th>זיהוי נכון</th><td>${pct(s.total.right, s.total.answered)} <small>(${s.total.right}/${s.total.answered})</small></td>
            <td>${pct(s.week.right, s.week.answered)} <small>(${s.week.right}/${s.week.answered})</small></td></tr>
        <tr><th>אותיות שנבחרו הכי הרבה</th><td>${top(s.total.top)}</td><td>${top(s.week.top)}</td></tr>
        <tr><th>מדבקות / צנצנות מלאות</th><td>${jar.totalStickers || 0} / ${jar.jarsFilled || 0}</td><td></td></tr>
      </tbody>
    </table>
    <h2>לפי אות</h2>
    <p class="hint">לחיצה על כותרת ממיינת את הטבלה.</p>
    <table class="p-table sortable" id="perLetter">
      <thead><tr>
        <th data-k="i">אות</th><th data-k="chosen">נבחרה</th><th data-k="asked">נשאלה</th>
        <th data-k="rate">הצלחה</th><th data-k="rateWeek">הצלחה, 7 ימים</th>
      </tr></thead>
      <tbody></tbody>
    </table>`;
  const data = s.letters.map((x, i) => ({
    ...x, i, rate: x.asked ? x.right / x.asked : -1, rateWeek: x.askedWeek ? x.rightWeek / x.askedWeek : -1,
  }));
  let sortKey = 'i', dir = 1;
  const fill = () => {
    const sorted = [...data].sort((a, b) => (a[sortKey] - b[sortKey]) * dir);
    $('#perLetter tbody').innerHTML = sorted.map(x => `
      <tr><th class="big">${x.l.ch}</th><td>${x.chosen}</td><td>${x.asked}</td>
      <td>${pct(x.right, x.asked)}</td><td>${pct(x.rightWeek, x.askedWeek)}</td></tr>`).join('');
  };
  body.querySelectorAll('#perLetter th[data-k]').forEach(th => th.onclick = () => {
    const k = th.dataset.k;
    dir = sortKey === k ? -dir : (k === 'i' ? 1 : -1);
    sortKey = k; fill();
  });
  fill();
}

// ---------------------------------------------------------------- settings
function settings(body) {
  const s = store.getSettings();
  body.innerHTML = `
    <h2>אותיות פעילות</h2>
    <div class="p-letters">${LETTERS.map(l => `<button data-id="${l.id}" class="${s.activeLetters.includes(l.id) ? 'on' : ''}">${l.ch}</button>`).join('')}</div>
    <div class="p-row"><button id="allOn">כולן</button><button id="allOff">אף אחת</button>
      <span class="hint" id="activeCount"></span></div>
    <label class="p-field"><input type="checkbox" id="shuffleOrder" ${s.shuffleOrder ? 'checked' : ''}> סדר אקראי בכל פעם (אחרת: לפי הא״ב)</label>
    <label class="p-field"><input type="checkbox" id="shuffleColors" ${s.shuffleColors ? 'checked' : ''}> צבעים אקראיים בכל פעם</label>

    <h2>"מצא את האות"</h2>
    <div class="p-field">מספר אותיות לבחירה
      <span class="seg" id="segChoices">${[2, 3, 4].map(n => `<button data-v="${n}" class="${s.choices === n ? 'on' : ''}">${n}</button>`).join('')}</span></div>
    <label class="p-field"><input type="checkbox" id="allowSimilar" ${s.allowSimilar ? 'checked' : ''}>
      לאפשר אותיות דומות יחד (ב/כ, ד/ר, ו/ז, ה/ח/ת, ג/נ)</label>
    <label class="p-field"><input type="checkbox" id="chime" ${s.chime ? 'checked' : ''}> צליל עדין בתשובה נכונה</label>

    <h2>"תגיד בקול"</h2>
    <label class="p-field"><input type="checkbox" id="sayIt" ${s.sayIt ? 'checked' : ''}> שלב "תגיד בקול" פעיל</label>
    <label class="p-field">זמן המתנה: <b id="sayPauseV">${s.sayPause}</b> שניות
      <input type="range" id="sayPause" min="2" max="6" step="1" value="${s.sayPause}"></label>

    <h2>סיפור</h2>
    <label class="p-field">מהירות מעבר בין תמונות: <b id="fadeV">${s.fade}</b> שניות
      <input type="range" id="fade" min="0.4" max="3" step="0.2" value="${s.fade}"></label>

    <h2>צנצנת מדבקות</h2>
    <div class="p-field">מדבקות בצנצנת
      <span class="seg" id="segJar">${[10, 15, 20, 30].map(n => `<button data-v="${n}" class="${s.jarSize === n ? 'on' : ''}">${n}</button>`).join('')}</span></div>
    <div class="p-row"><button id="resetJar">איפוס הצנצנת</button></div>`;

  const count = () => $('#activeCount').textContent = `${store.getSettings().activeLetters.length} מתוך 22`;
  count();
  body.querySelectorAll('.p-letters button').forEach(b => b.onclick = () => {
    const cur = new Set(store.getSettings().activeLetters);
    cur.has(b.dataset.id) ? cur.delete(b.dataset.id) : cur.add(b.dataset.id);
    store.saveSettings({ activeLetters: LETTERS.map(l => l.id).filter(id => cur.has(id)) });
    b.classList.toggle('on'); count();
  });
  $('#allOn').onclick = () => { store.saveSettings({ activeLetters: LETTERS.map(l => l.id) }); settings(body); };
  $('#allOff').onclick = () => { store.saveSettings({ activeLetters: [] }); settings(body); };
  const seg = (id, key) => body.querySelectorAll(`#${id} button`).forEach(b => b.onclick = () => {
    store.saveSettings({ [key]: Number(b.dataset.v) });
    body.querySelectorAll(`#${id} button`).forEach(x => x.classList.toggle('on', x === b));
  });
  seg('segChoices', 'choices'); seg('segJar', 'jarSize');
  for (const id of ['allowSimilar', 'sayIt', 'chime', 'shuffleOrder', 'shuffleColors']) $('#' + id).onchange = e => store.saveSettings({ [id]: e.target.checked });
  $('#sayPause').oninput = e => { store.saveSettings({ sayPause: Number(e.target.value) }); $('#sayPauseV').textContent = e.target.value; };
  $('#fade').oninput = e => { store.saveSettings({ fade: Number(e.target.value) }); $('#fadeV').textContent = e.target.value; };
  $('#resetJar').onclick = () => { if (confirm('לאפס את הצנצנת ואת ספירת המדבקות?')) { store.resetJar(); } };
}

// ---------------------------------------------------------------- content
const AUDIO = /\.(mp3|m4a|aac|ogg|opus|wav|webm|amr|3gp)$/;
const IMG = /\.(jpe?g|png|webp|gif|svg)$/;
const LETTER_CLIPS = [
  ['name', 'שם האות', l => `"${l.name}" (מושמע עם הציור בתחילת הסיפור, וגם בשלב "תגיד")`],
  ['drawing', 'הקלטה לציור', l => `רשות: משפט קצר על הציור, למשל "${l.word}"`],
  ['story', 'סיפור', () => 'הסיפור או הפתגם (מושמע עם התמונות)'],
  ['where', 'שאלה', l => `"איפה האות ${l.name}?"`],
  ['here_is', 'תיקון עדין', l => `"הנה ${l.name}"`],
];
const PROMPT_CLIPS = [
  ['say_it', '"מה שם האות הזאת? תגיד בקול"'],
  ['correct1', '"נכון"'], ['correct2', '"יפה"'], ['correct3', '"כל הכבוד"'],
];
let editing = null;   // null = overview, a letter id, or 'prompts'

const audioKey = base => [...store.contentKeys()].find(k => k.startsWith(base + '.') && AUDIO.test(k)) || null;
const picKeys = id => [...store.contentKeys()]
  .filter(k => new RegExp(`^letters/${id}/\\d+\\.`).test(k) && IMG.test(k))
  .sort((a, b) => parseInt(a.split('/').pop()) - parseInt(b.split('/').pop()));

function content(body) {
  stopRecording(true);
  if (editing === 'prompts') return promptsEditor(body);
  if (editing) return letterEditor(body, BY_ID[editing]);
  const mark = ok => ok ? '<span class="ok">✓</span>' : '<span class="no">–</span>';
  const voice = sound.placeholderKind() === 'tts' ? 'קול עברי של המכשיר' : 'צליל עדין (אין במכשיר קול עברי)';
  body.innerHTML = `
    <p>ההקלטות והתמונות נשמרות רק במכשיר הזה. אפשר להקליט ולבחור תמונות כאן, או לייבא קובץ zip מהמחשב.</p>
    <p class="hint">כל עוד חסרה הקלטה, משמיעים במקומה: ${voice}. כל סיפור מתחיל בציור של האות, ואחריו התמונות שהוספת. בלי תמונות, הציור נשאר לאורך כל הסיפור.</p>
    <button class="p-wide" id="editPrompts">הנחיות כלליות
      <span>${PROMPT_CLIPS.map(([b]) => mark(audioKey('prompts/' + b))).join(' ')}</span></button>
    <h2>לפי אות <small class="hint">(לחיצה על אות פותחת אותה להקלטה)</small></h2>
    <table class="p-table clickable">
      <thead><tr><th>אות</th><th>שם</th><th>ציור</th><th>סיפור</th><th>שאלה</th><th>תיקון</th><th>תמונות</th></tr></thead>
      <tbody>${LETTERS.map(l => `<tr data-id="${l.id}"><th class="big">${l.ch}</th>
        ${LETTER_CLIPS.map(([b]) => `<td>${mark(audioKey(`letters/${l.id}/${b}`))}</td>`).join('')}
        <td>${picKeys(l.id).length || '–'}</td></tr>`).join('')}</tbody>
    </table>
    <h2>גיבוי והעברה</h2>
    <div class="p-row">
      <button id="exportZip" class="primary">שמירת כל התוכן כ-zip</button>
      <label class="filebtn">ייבוא תוכן (zip)<input type="file" id="zipIn" accept=".zip,application/zip"></label>
    </div>
    <p class="hint">את קובץ ה-zip אפשר לפתוח במחשב לתוך התיקייה content בפרויקט myAlef, וכך ההקלטות נשמרות גם ב-GitHub.
       ייבוא של zip מלא (content.zip) מחליף את כל התוכן שבמכשיר. zip של עדכון חלקי (content-update.zip) מחליף רק את סוגי התוכן שרשומים בו, ולפני הייבוא מוצג מה ישתנה.</p>
    <p class="hint" id="importMsg"></p>
    <div class="p-row"><button id="clearContent">מחיקת כל התוכן</button></div>`;
  body.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => { editing = tr.dataset.id; content(body); });
  $('#editPrompts').onclick = () => { editing = 'prompts'; content(body); };
  $('#exportZip').onclick = () => exportContentZip($('#importMsg'));
  $('#zipIn').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    $('#importMsg').textContent = 'קורא את הקובץ…';
    try {
      const found = await readZip(f);
      const text = describeImport(found);
      if ((found.manifest || store.contentKeys().size) && !confirm(text.confirm)) {
        e.target.value = ''; $('#importMsg').textContent = ''; return;
      }
      $('#importMsg').textContent = 'טוען…';
      await applyImport(found);
      content(body);  // redraw the table with the new content, then show the result under it
      $('#importMsg').textContent = text.done;
      return;
    } catch (err) {
      $('#importMsg').textContent = 'הייבוא נכשל: ' + (err && err.message || err);
    }
    e.target.value = '';
  };
  $('#clearContent').onclick = async () => {
    if (!confirm('למחוק את כל ההקלטות והתמונות שבמכשיר? מומלץ לשמור zip קודם.')) return;
    await store.clearContent(); content(body);
  };
}

function clipRow(base, title, sub) {
  const has = !!audioKey(base);
  return `<div class="clip" data-base="${base}">
    <div class="clip-t"><b>${title}</b><span class="hint">${sub}</span></div>
    <div class="clip-b">
      <button class="rec" title="הקלטה">●</button>
      <button class="play" ${has ? '' : 'disabled'} title="השמעה">▶</button>
      <button class="del" ${has ? '' : 'disabled'} title="מחיקה">✕</button>
    </div>
    <div class="clip-s hint">${has ? 'יש הקלטה' : 'אין הקלטה'}</div>
  </div>`;
}

function wireClips(body, redraw) {
  body.querySelectorAll('.clip').forEach(row => {
    const base = row.dataset.base;
    const status = row.querySelector('.clip-s');
    row.querySelector('.rec').onclick = async e => {
      if (rec && rec.base === base) { stopRecording(); return; }
      stopRecording(true);
      try {
        await startRecording(base, e.currentTarget, status, redraw);
      } catch (err) {
        status.textContent = 'אין גישה למיקרופון. יש לאשר הרשאת מיקרופון לאפליקציה.';
      }
    };
    row.querySelector('.play').onclick = async () => {
      stopRecording(true);
      const k = audioKey(base);
      if (k) await sound.play(base, '');
    };
    row.querySelector('.del').onclick = async () => {
      const k = audioKey(base);
      if (!k || !confirm('למחוק את ההקלטה?')) return;
      await store.deleteFile(k); redraw();
    };
  });
}

function letterEditor(body, l) {
  const pics = picKeys(l.id);
  const idx = LETTERS.indexOf(l);
  const prev = LETTERS[(idx + LETTERS.length - 1) % LETTERS.length], next = LETTERS[(idx + 1) % LETTERS.length];
  body.innerHTML = `
    <div class="p-row ed-head">
      <button id="edBack">→ כל האותיות</button>
      <span class="ed-letter">${l.ch}</span>
      <span class="ed-nav"><button id="edPrev">${prev.ch}</button><button id="edNext">${next.ch}</button></span>
    </div>
    <p class="hint">לוחצים ● כדי להתחיל להקליט, ושוב כדי לעצור. הקלטה חדשה מחליפה את הקודמת.</p>
    ${LETTER_CLIPS.map(([b, t, sub]) => clipRow(`letters/${l.id}/${b}`, t, sub(l))).join('')}
    <h2>תמונות <small class="hint">(קודם הציור, ואז התמונות לפי המספרים)</small></h2>
    <div class="thumbs" id="thumbs"><div class="thumb fixed" style="order:-1"><img src="pictures/${l.id}.svg" alt="">
      <span class="n">ציור</span><div class="t-b hint">עם שם האות${audioKey(`letters/${l.id}/drawing`) ? ' והקלטת הציור' : ''}</div></div></div>
    <p class="hint">התמונות מתחלפות במהלך הסיפור, וכל אחת מקבלת חלק שווה מאורכו. לזמנים מדויקים: קובץ timing.txt (ראו README).</p>
    <div class="p-row">
      <label class="filebtn">+ הוספת תמונות<input type="file" id="picIn" accept="image/*" multiple></label>
      <label class="filebtn">📷 צילום<input type="file" id="camIn" accept="image/*" capture="environment"></label>
      <span class="hint" id="picMsg"></span>
    </div>
    `;
  const redraw = () => letterEditor(body, l);
  $('#edBack').onclick = () => { editing = null; content(body); };
  $('#edPrev').onclick = () => { editing = prev.id; content(body); };
  $('#edNext').onclick = () => { editing = next.id; content(body); };
  wireClips(body, redraw);
  // thumbnails
  const box = $('#thumbs');
  pics.forEach(async (k, i) => {
    const blob = await store.getFile(k);
    const div = document.createElement('div');
    div.className = 'thumb';
    const url = blob ? URL.createObjectURL(blob) : '';
    div.innerHTML = `<img src="${url}" alt=""><span class="n">${i + 1}</span>
      <div class="t-b"><button class="mv" data-d="-1" ${i === 0 ? 'disabled' : ''}>→</button>
      <button class="rm">✕</button>
      <button class="mv" data-d="1" ${i === pics.length - 1 ? 'disabled' : ''}>←</button></div>`;
    div.style.order = i;
    box.appendChild(div);
    div.querySelector('.rm').onclick = async () => {
      if (!confirm('להסיר את התמונה?')) return;
      const list = picKeys(l.id).filter(x => x !== k);
      await store.deleteFile(k);
      await renumberPics(l.id, list); redraw();
    };
    div.querySelectorAll('.mv').forEach(b => b.onclick = async () => {
      const list = picKeys(l.id);
      const j = list.indexOf(k), t = j + Number(b.dataset.d);
      if (t < 0 || t >= list.length) return;
      [list[j], list[t]] = [list[t], list[j]];
      await renumberPics(l.id, list); redraw();
    });
  });
  // Gallery and camera both go through the same path: shrink, then append.
  const addPics = async e => {
    const files = [...e.target.files];
    if (!files.length) return;
    $('#picMsg').textContent = 'שומר…';
    const list = picKeys(l.id);
    let n = list.length;
    for (const f of files) {
      const blob = await shrinkImage(f);
      n += 1;
      await store.putFile(`letters/${l.id}/${n}.jpg`, blob);
    }
    redraw();
  };
  $('#picIn').onchange = addPics;
  $('#camIn').onchange = addPics;
}

function promptsEditor(body) {
  body.innerHTML = `
    <div class="p-row ed-head"><button id="edBack">→ חזרה</button><b>הנחיות כלליות</b></div>
    <p class="hint">לוחצים ● כדי להתחיל להקליט, ושוב כדי לעצור. החיזוקים מושמעים לסירוגין.</p>
    ${PROMPT_CLIPS.map(([b, t]) => clipRow(`prompts/${b}`, t, '')).join('')}`;
  $('#edBack').onclick = () => { editing = null; content(body); };
  wireClips(body, () => promptsEditor(body));
}

// Rewrite picture keys as 1..n in the given order.
async function renumberPics(id, orderedKeys) {
  const blobs = [];
  for (const k of orderedKeys) blobs.push([k, await store.getFile(k)]);
  for (const [k] of blobs) await store.deleteFile(k);
  let i = 0;
  for (const [k, b] of blobs) {
    i += 1;
    const ext = k.split('.').pop();
    if (b) await store.putFile(`letters/${id}/${i}.${ext}`, b);
  }
}

// Photos from a phone camera are large; keep them at most 1600px.
function shrinkImage(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => resolve(b || file), 'image/jpeg', 0.86);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// ---------- recording ----------
let rec = null;   // { base, mr, stream, chunks, timer, btn, status, redraw }

async function startRecording(base, btn, status, redraw) {
  sound.stop();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks = [];
  mr.ondataavailable = e => e.data.size && chunks.push(e.data);
  const t0 = Date.now();
  rec = { base, mr, stream, chunks, btn, status, redraw, discard: false };
  rec.timer = setInterval(() => { status.textContent = `מקליט… ${Math.floor((Date.now() - t0) / 1000)} שנ׳ (לחיצה על ● לעצירה)`; }, 250);
  btn.classList.add('on');
  status.textContent = 'מקליט…';
  const r = rec;
  mr.onstop = async () => {
    clearInterval(r.timer);
    r.stream.getTracks().forEach(t => t.stop());
    r.btn.classList.remove('on');
    if (r.discard || !chunks.length) return;
    const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
    const ext = /mp4/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : 'webm';
    const old = audioKey(base);
    if (old) await store.deleteFile(old);
    await store.putFile(`${base}.${ext}`, blob);
    r.redraw();
  };
  mr.start();
}

function stopRecording(discard = false) {
  if (!rec) return;
  const r = rec; rec = null;
  r.discard = discard;
  try { r.mr.state !== 'inactive' ? r.mr.stop() : r.mr.onstop(); } catch { }
}

async function exportContentZip(msgEl) {
  const files = await store.allFiles();
  if (!files.size) { msgEl.textContent = 'אין עדיין תוכן לשמור.'; return; }
  msgEl.textContent = 'מכין קובץ…';
  const zip = new window.JSZip();
  for (const [k, b] of files) zip.file(k, b);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const name = `alef-content-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.zip`;
  await saveOrShare(blob, name, 'application/zip', true);
  msgEl.textContent = `נשמר: ${name} (${files.size} קבצים)`;
}

async function saveOrShare(blob, name, type, share) {
  const file = new File([blob], name, { type });
  try {
    if (share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---- kinds of content (must match KINDS in tools/make_content_zip.py)
const KINDS = ['name', 'where', 'here_is', 'drawing_line', 'story', 'photos', 'prompts'];
const KIND_LABEL = {
  name: 'שמות האותיות', where: 'שאלות "איפה"', here_is: 'תיקונים "הנה"', drawing_line: 'הקלטות הציור',
  story: 'סיפורים', photos: 'תמונות (ו-timing.txt)', prompts: 'הנחיות כלליות',
};
const AUDIO_KIND = { name: 'name', where: 'where', here_is: 'here_is', drawing: 'drawing_line', story: 'story' };
const MANIFEST_FORMAT = 1;

// "letters/bet/story.mp3" -> { kind: 'story', letter: 'bet' }; null if it isn't content.
function kindOf(key) {
  const parts = key.split('/');
  if (parts[0] === 'prompts') return { kind: 'prompts', letter: null };
  if (parts[0] !== 'letters' || parts.length !== 3) return null;
  const file = parts[2];
  if (file === 'timing.txt' || (/^\d+\./.test(file) && IMG.test(file))) return { kind: 'photos', letter: parts[1] };
  const kind = AUDIO.test(file) && AUDIO_KIND[file.replace(/\.[^.]+$/, '')];
  return kind ? { kind, letter: parts[1] } : null;
}

// Reads manifest.json of a partial update, or returns null for a full zip.
async function readManifest(zip) {
  const f = Object.values(zip.files).find(f => !f.dir && !f.name.includes('__MACOSX')
    && /(^|\/)manifest\.json$/i.test(f.name) && !/(^|\/)(letters|prompts)\//i.test(f.name));
  if (!f) return null;
  let m;
  try { m = JSON.parse(await f.async('string')); } catch { throw new Error('הקובץ manifest.json פגום'); }
  if (!m || m.mode !== 'partial') throw new Error('הקובץ manifest.json לא מוכר');
  if (m.format > MANIFEST_FORMAT) throw new Error('הקובץ נבנה בגרסה חדשה יותר של הכלי. יש לעדכן את האפליקציה');
  const replace = Array.isArray(m.replace) ? m.replace.map(String) : [];
  const badKind = replace.filter(k => !KINDS.includes(k));
  if (!replace.length || badKind.length) throw new Error('סוגי תוכן לא מוכרים ב-manifest.json: ' + badKind.join(', '));
  let letters = null;  // null = all letters
  if (m.letters !== 'all' && m.letters !== undefined) {
    letters = Array.isArray(m.letters) ? m.letters.map(String) : [];
    const badL = letters.filter(id => !BY_ID[id]);
    if (!letters.length || badL.length) throw new Error('אותיות לא מוכרות ב-manifest.json: ' + badL.join(', '));
  }
  return { replace, letters };
}

// Does a key fall inside what a partial update replaces?
function inScope(manifest, key) {
  const k = kindOf(key);
  if (!k || !manifest.replace.includes(k.kind)) return false;
  return k.kind === 'prompts' || !manifest.letters || manifest.letters.includes(k.letter);
}

// Step 1: read a zip whose files are under letters/... and prompts/...,
// optionally inside a top folder (e.g. content/letters/...).
// A zip with manifest.json is a partial update; without it, a full replacement.
export async function readZip(file) {
  const zip = await window.JSZip.loadAsync(file);
  const manifest = await readManifest(zip);
  const files = new Map();
  let skipped = 0;
  const entries = Object.values(zip.files).filter(f => !f.dir);
  for (const f of entries) {
    let p = f.name.replace(/\\/g, '/').toLowerCase();
    if (p.includes('__macosx/') || p.split('/').pop().startsWith('.')) continue;
    const i = p.search(/(^|\/)(letters|prompts)\//);
    if (i < 0) continue;
    p = p.slice(i).replace(/^\//, '');
    if (manifest && !inScope(manifest, p)) { skipped++; continue; }  // never touch what the update doesn't list
    const blob = await f.async('blob');
    files.set(p, blob.type ? blob : new Blob([blob], { type: mime(p) }));
  }
  if (!manifest && !files.size) throw new Error('לא נמצאו בקובץ תיקיות letters או prompts');
  return { manifest, files, skipped };
}

// Plain-text description of an import, for the confirmation dialog and the result message.
function describeImport({ manifest, files }) {
  if (!manifest) return { confirm: 'הייבוא יחליף את כל ההקלטות והתמונות שבמכשיר. להמשיך?', done: `נטענו ${files.size} קבצים.` };
  const removed = [...store.contentKeys()].filter(k => inScope(manifest, k) && !files.has(k)).length;
  const which = manifest.letters ? manifest.letters.map(id => BY_ID[id].ch).join(' ') : 'כל האותיות';
  const replaced = manifest.replace.map(k => KIND_LABEL[k]).join(', ');
  const kept = KINDS.filter(k => !manifest.replace.includes(k)).map(k => KIND_LABEL[k]).join(', ') || 'כלום';
  return {
    confirm: `עדכון חלקי.\n\nיוחלפו: ${replaced}\nאותיות: ${which}\nיישארו בלי שינוי: ${kept}\n\n`
      + `ייכתבו ${files.size} קבצים` + (removed ? `, ויימחקו ${removed} קבצים שאין להם תחליף בעדכון.` : '.')
      + '\n\nלהמשיך?',
    done: `עודכנו: ${replaced} (${files.size} קבצים). כל השאר נשאר כמו שהיה.`,
  };
}

// Step 2: write what readZip found.
export async function applyImport({ manifest, files }) {
  if (manifest) await store.updateContent(k => inScope(manifest, k), files);
  else await store.replaceContent(files);
  return files.size;
}

export async function importZip(file) {
  return applyImport(await readZip(file));
}
function mime(p) {
  const ext = p.split('.').pop();
  return ({
    mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav',
    webm: 'audio/webm', amr: 'audio/amr', '3gp': 'audio/3gpp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', txt: 'text/plain',
  })[ext] || 'application/octet-stream';
}

// ---------------------------------------------------------------- data
export function toCSV(rows) {
  const cell = v => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [CSV_COLUMNS.join(','), ...rows.map(r => CSV_COLUMNS.map(c => cell(r[c])).join(','))].join('\r\n') + '\r\n';
}

function data(body) {
  const rows = store.getLog();
  body.innerHTML = `
    <p>נשמרו <b>${rows.length}</b> סבבים במכשיר הזה.</p>
    <div class="p-row"><button id="exportCsv" class="primary">שיתוף CSV</button><button id="downloadCsv">הורדת CSV</button></div>
    <p class="hint">"שיתוף" פותח את תפריט השיתוף של אנדרואיד (Drive, מייל, WhatsApp). "הורדה" שומר בתיקיית ההורדות.
       הקובץ נפתח כרגיל ב-Excel וב-Google Sheets. מומלץ לייצא מדי פעם, גם כגיבוי.</p>
    <h2>מחיקה</h2>
    <div class="p-row"><button id="clearLog">מחיקת כל נתוני השימוש</button></div>`;
  $('#exportCsv').onclick = () => exportCSV(rows, true);
  $('#downloadCsv').onclick = () => exportCSV(rows, false);
  $('#clearLog').onclick = () => {
    if (!confirm('למחוק את כל נתוני השימוש? מומלץ לייצא קודם.')) return;
    store.clearLog(); data(body);
  };
}

async function exportCSV(rows, share) {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  const name = `abc-usage-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.csv`;
  await saveOrShare(new Blob([toCSV(rows)], { type: 'text/csv' }), name, 'text/csv', share);
}
