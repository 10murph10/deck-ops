/* Deck Ops: cyberdeck build tracker. Android app (Capacitor) and web app share this file. */
(function () {
'use strict';

const APP_VERSION = '1.3.0';
const APP_REPO = '10murph10/deck-ops';
const APK_URL = 'https://github.com/' + APP_REPO + '/releases/latest/download/DeckOps.apk';
const Cap = window.Cap || null;
const NATIVE = !!(Cap && Cap.Capacitor && Cap.Capacitor.isNativePlatform && Cap.Capacitor.isNativePlatform());

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const money = n => (n == null || isNaN(n)) ? '—' : '$' + Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const parseISO = iso => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const fmtDate = iso => iso ? parseISO(iso).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
const fmtShort = iso => iso ? parseISO(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '';
const daysFrom = iso => Math.round((parseISO(todayISO()) - parseISO(iso)) / 864e5);
const minsLabel = m => m >= 480 ? 'study, weeks' : m >= 60 ? (m / 60).toString().replace(/\.0$/, '') + ' h' : m + ' min';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
const ago = ts => { const s = Math.round((Date.now() - ts) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + 'm ago' : s < 86400 ? Math.round(s / 3600) + 'h ago' : Math.round(s / 86400) + 'd ago'; };
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']; // index 0 = Capacitor weekday 1
const hhmm = (h, m) => new Date(2000, 0, 1, h, m).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });

const NODE = {}; NODES.forEach((n, i) => { NODE[n.id] = Object.assign({ ord: i, needs: [], cmd: null, code: null, links: null }, n); });
const TERM = {}; TERMS.forEach(t => { TERM[t.id] = t; });
const BR = {}; BRANCHES.forEach((b, i) => { BR[b.id] = Object.assign({ ord: i }, b); });
const VIEWS = [['ops', 'Ops'], ['route', 'Route'], ['skills', 'Skills'], ['parts', 'Parts'], ['log', 'Log'], ['codex', 'Codex']];
const STATUSES = ['wanted', 'ordered', 'arrived', 'installed'];
const TAGS = ['Linux', 'Electronics', 'CAD', 'Radio', 'Base', 'Signal', 'Case', 'Other'];
const BR_TAG = { linux: 'Linux', elec: 'Electronics', cad: 'CAD', radio: 'Radio', base: 'Base' };
const THEMES = [['phosphor', 'Phosphor', '#03140c'], ['amber', 'Amber', '#140d03'], ['blueprint', 'Blueprint', '#0d2b4e']];

/* ---------- state ----------
   S: synced progress. Every change goes through put(), which stamps S.t[path] so two devices merge per item.
   LOG: synced journal entries; each carries u (updated ms) and del (tombstone).
   DEV: this device only (theme, sound, reminders toggles, GitHub key). Never synced. */
const LS = 'deckops.state.v2', LSLOG = 'deckops.log.v2', LSDEV = 'deckops.device.v1';
const blank = () => ({ v: 2, started: todayISO(), done: {}, parts: {}, custom: {}, ahead: {}, tu: {}, sched: { on: true, weekday: 4, hour: 19, minute: 0 }, t: {} });
function normalize(d) {
  const o = Object.assign(blank(), d || {});
  ['done', 'parts', 'ahead', 'tu', 't'].forEach(k => { if (!o[k] || typeof o[k] !== 'object' || Array.isArray(o[k])) o[k] = {}; });
  if (Array.isArray(o.custom)) { const m = {}; o.custom.forEach(c => { if (c && c.id) m[c.id] = c; }); o.custom = m; }
  if (!o.custom || typeof o.custom !== 'object') o.custom = {};
  if (!o.sched || typeof o.sched !== 'object') o.sched = blank().sched;
  o.v = 2;
  return o;
}
const readJSON = (k, d) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (e) { return d; } };
let S = normalize(readJSON(LS, null) || readJSON('deck-ops-v1', null));
let LOG = (readJSON(LSLOG, null) || readJSON('deck-ops-log-v1', []) || []).filter(e => e && e.id);
const DEV = Object.assign({ theme: 'phosphor', sound: true, haptics: true, speak: false, remNight: true, remParts: true, remUpd: true,
  owner: '10murph10', repo: 'deck-ops-data', token: '', lastSync: 0, syncErr: '', bootSeen: false, introSeen: false }, readJSON(LSDEV, {}));

const ui = { view: 'ops', branch: 'linux', phase: null, lesson: null, codexTab: 'terms', q: '', logTag: 'all',
  draft: null, editing: null, confirm: null, uploading: false, flashTerm: null, lastFocus: null, layout: null,
  sync: 'idle', update: null, notif: 'unknown', importMsg: '' };

function saveLocal() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {} }
function saveLog() { try { localStorage.setItem(LSLOG, JSON.stringify(LOG)); } catch (e) {} }
function saveDev() { try { localStorage.setItem(LSDEV, JSON.stringify(DEV)); localStorage.setItem('deckops.theme', DEV.theme); } catch (e) {} }

function put(sec, key, val) {
  const now = Date.now();
  if (key == null) { if (val === undefined || val === null) delete S[sec]; else S[sec] = val; S.t[sec] = now; return; }
  if (!S[sec] || typeof S[sec] !== 'object') S[sec] = {};
  if (val === undefined || val === null) delete S[sec][key]; else S[sec][key] = val;
  S.t[sec + '.' + key] = now;
}
function getPath(o, p) { const i = p.indexOf('.'); if (i < 0) return o[p]; const s = p.slice(0, i), k = p.slice(i + 1); return o[s] ? o[s][k] : undefined; }
function setPath(o, p, v) {
  const i = p.indexOf('.');
  if (i < 0) { if (v === undefined) delete o[p]; else o[p] = v; return; }
  const s = p.slice(0, i), k = p.slice(i + 1);
  if (!o[s] || typeof o[s] !== 'object') o[s] = {};
  if (v === undefined) delete o[s][k]; else o[s][k] = v;
}
function mergeState(a, b) {
  const out = clone(a); out.t = Object.assign({}, a.t);
  const keys = new Set(Object.keys(a.t || {}).concat(Object.keys(b.t || {})));
  keys.forEach(p => { const ta = (a.t || {})[p] || 0, tb = (b.t || {})[p] || 0; if (tb > ta) { setPath(out, p, clone(getPath(b, p))); out.t[p] = tb; } });
  // items the other side has but never stamped (older formats): keep them
  ['done', 'parts', 'custom', 'ahead'].forEach(sec => Object.keys(b[sec] || {}).forEach(k => { if (!(sec + '.' + k in out.t) && out[sec][k] === undefined) out[sec][k] = clone(b[sec][k]); }));
  if (b.started && b.started < out.started) out.started = b.started;
  return normalize(out);
}
function mergeLog(a, b) {
  const m = new Map();
  a.concat(b).forEach(e => { const cur = m.get(e.id); if (!cur || (e.u || 0) > (cur.u || 0)) m.set(e.id, e); });
  return Array.from(m.values());
}
const liveLog = () => LOG.filter(e => !e.del);

/* ---------- progress logic ---------- */
const isDone = id => !!S.done[id];
const phaseById = id => PHASES.find(p => p.id === id);
const phaseCleared = p => p.obj.every(isDone);
function phaseUnlocked(p) {
  if (!p.gate) return true;
  if (p.gate.node) return isDone(p.gate.node);
  if (p.gate.phase) return phaseCleared(phaseById(p.gate.phase));
  return true;
}
const phaseState = p => !phaseUnlocked(p) ? 'locked' : phaseCleared(p) ? 'cleared' : 'active';
function gateText(p) {
  if (!p.gate) return 'Open from the start.';
  const g = NODE[p.gate.node];
  return (phaseUnlocked(p) ? 'Opened by ' : 'Opens when you finish ') + g.id + ' ' + g.t + '.';
}
function nodeLock(n) {
  const p = phaseById(n.phase);
  if (!phaseUnlocked(p)) return { kind: 'phase', text: 'Opens with phase ' + p.id + ', ' + p.name + ' (finish ' + p.gate.node + ' ' + NODE[p.gate.node].t + ')' };
  const miss = n.req.filter(r => !isDone(r));
  if (miss.length) return { kind: 'req', text: 'Needs ' + miss.map(r => r + ' ' + NODE[r].t).join(', ') };
  return null;
}
function currentPhase() { const act = PHASES.filter(p => phaseState(p) === 'active'); return act[0] || PHASES[PHASES.length - 1]; }

function allParts() {
  const base = PARTS.map(p => {
    const o = S.parts[p.id] || {};
    return Object.assign({}, p, { status: o.status || p.dflt || 'wanted', paid: o.paid != null ? o.paid : null, eta: o.eta != null ? o.eta : (p.eta || '') });
  });
  const cust = Object.values(S.custom).map(c => Object.assign({ where: '', note: '', status: 'wanted', paid: null, eta: '' }, c, { custom: true }));
  return base.concat(cust);
}
const partById = id => allParts().find(p => p.id === id);
const partReady = p => p && (p.status === 'arrived' || p.status === 'installed');
const waitingOn = n => (n.needs || []).map(partById).filter(p => p && !partReady(p));
const partCost = p => p.status === 'wanted' ? 0 : (p.paid != null ? Number(p.paid) : (p.price || 0));
function budget(phase) {
  const list = allParts().filter(p => phase == null ? p.phase > 0 : p.phase === phase);
  return { planned: list.reduce((a, p) => a + (p.price || 0), 0), spent: list.reduce((a, p) => a + partCost(p), 0), list };
}
function etaLabel(p) {
  if (p.status !== 'ordered' || !p.eta) return '';
  const d = -daysFrom(p.eta);
  if (d > 1) return ' (due ' + fmtDate(p.eta) + ', ' + d + ' days)';
  if (d === 1) return ' (due tomorrow)';
  if (d === 0) return ' (due today)';
  return ' (was due ' + fmtShort(p.eta) + ')';
}
function nextUp(k) {
  const avail = NODES.filter(n => !isDone(n.id) && !nodeLock(n));
  avail.sort((a, b) => ((waitingOn(a).length > 0) - (waitingOn(b).length > 0)) || (a.phase - b.phase) || (BR[a.b].ord - BR[b.b].ord) || (NODE[a.id].ord - NODE[b.id].ord));
  return avail.slice(0, k);
}
const xpTotal = () => NODES.filter(n => isDone(n.id)).reduce((a, n) => a + n.xp, 0);
function nextDeckNight() {
  const sc = S.sched; if (!sc || !sc.on) return null;
  const now = new Date(), d = new Date(now);
  d.setHours(sc.hour, sc.minute, 0, 0);
  const want = sc.weekday - 1;
  let add = (want - d.getDay() + 7) % 7;
  if (add === 0 && d < now) add = 7;
  d.setDate(d.getDate() + add);
  return d;
}

/* ---------- commit: save, then sync and reschedule in the background ---------- */
let syncT = null, remT = null;
function commit(msg) {
  saveLocal(); render();
  if (msg) toast(msg);
  clearTimeout(syncT); syncT = setTimeout(() => syncNow(), 4000);
  clearTimeout(remT); remT = setTimeout(() => REM.resched(), 1500);
}

/* ---------- photos (IndexedDB) ---------- */
const IDB = (() => {
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => { const r = indexedDB.open('deckops', 1); r.onupgradeneeded = () => r.result.createObjectStore('photos'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    return dbp;
  }
  function run(mode, fn) {
    return open().then(db => new Promise((res, rej) => {
      const t = db.transaction('photos', mode), req = fn(t.objectStore('photos'));
      t.oncomplete = () => res(req ? req.result : undefined); t.onerror = () => rej(t.error);
    }));
  }
  return { get: id => run('readonly', s => s.get(id)), put: (id, v) => run('readwrite', s => s.put(v, id)), del: id => run('readwrite', s => s.delete(id)), keys: () => run('readonly', s => s.getAllKeys()) };
})();
const photoURL = new Map();
async function hydratePhotos(root) {
  const imgs = (root || document).querySelectorAll('img[data-pid]');
  for (const img of imgs) {
    const id = img.getAttribute('data-pid');
    if (photoURL.has(id)) { img.src = photoURL.get(id); continue; }
    try {
      let rec = await IDB.get(id);
      if (!rec && ghReady() && navigator.onLine) { const blob = await GH.getPhoto(id); if (blob) { rec = { blob, synced: true }; await IDB.put(id, rec); } }
      if (rec && rec.blob) { const u = URL.createObjectURL(rec.blob); photoURL.set(id, u); img.src = u; }
      else img.alt = 'Photo not on this device yet. It downloads on the next sync.';
    } catch (e) {}
  }
}
async function compress(file) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
}
function b64ToBlob(b64, type) { const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type }); }
function bytesToB64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
const utf8ToB64 = str => bytesToB64(new TextEncoder().encode(str));
const b64ToUtf8 = b64 => { const bin = atob(String(b64).replace(/\s/g, '')), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new TextDecoder().decode(a); };
async function attachPhoto(blob) {
  const id = 'p' + uid();
  await IDB.put(id, { blob, synced: false });
  photoURL.set(id, URL.createObjectURL(blob));
  return id;
}
async function takePhoto() {
  if (NATIVE && Cap.Camera) {
    const r = await Cap.Camera.getPhoto({ quality: 80, width: 1600, allowEditing: false, correctOrientation: true, saveToGallery: false,
      resultType: Cap.CameraResultType.Base64, source: Cap.CameraSource.Prompt, promptLabelHeader: 'Add a photo', promptLabelPhoto: 'From gallery', promptLabelPicture: 'Take a photo' });
    return await compress(b64ToBlob(r.base64String, 'image/' + (r.format || 'jpeg')));
  }
  return await new Promise((res, rej) => {
    const inp = $('#photoIn'); inp.value = '';
    inp.onchange = async () => { if (!inp.files || !inp.files[0]) return rej(new Error('cancel')); try { res(await compress(inp.files[0])); } catch (e) { rej(e); } };
    inp.click();
  });
}

/* ---------- GitHub sync ----------
   Files in the private data repo: deck/progress.json, deck/log.json, deck/photos/<id>.jpg */
const ghReady = () => !!(DEV.token && DEV.owner && DEV.repo);
const GH = {
  url: p => 'https://api.github.com/repos/' + encodeURIComponent(DEV.owner) + '/' + encodeURIComponent(DEV.repo) + '/contents/' + p,
  async req(path, opts, raw) {
    let r;
    try {
      r = await fetch(GH.url(path) + (opts && opts.method === 'PUT' ? '' : '?t=' + Date.now()), Object.assign({ cache: 'no-store' }, opts || {}, {
        headers: Object.assign({ Authorization: 'Bearer ' + DEV.token.trim(), Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, opts && opts.body ? { 'Content-Type': 'application/json' } : {})
      }));
    } catch (e) { const err = new Error('offline'); err.code = 'offline'; throw err; }
    if (r.status === 401) { const e = new Error('The GitHub key was refused. It may have expired or been mistyped.'); e.code = 'auth'; throw e; }
    if (r.status === 403) { const e = new Error('The GitHub key can\'t write to ' + DEV.repo + '. Check it has Contents: read and write on that repository.'); e.code = 'auth'; throw e; }
    return r;
  },
  async get(path) {
    const r = await GH.req(path);
    if (r.status === 404) return { sha: null, text: null };
    if (!r.ok) throw Object.assign(new Error('GitHub answered ' + r.status + ' reading ' + path), { code: 'http' });
    const j = await r.json();
    if (j.encoding === 'base64' && j.content) return { sha: j.sha, text: b64ToUtf8(j.content) };
    const rr = await GH.req(path, null, true);
    return { sha: j.sha, text: await rr.text() };
  },
  async put(path, b64, sha, message) {
    const body = { message, content: b64 }; if (sha) body.sha = sha;
    const r = await GH.req(path, { method: 'PUT', body: JSON.stringify(body) });
    if (r.status === 409 || r.status === 422) throw Object.assign(new Error('conflict'), { code: 'conflict', status: r.status });
    if (r.status === 404) throw Object.assign(new Error('Repository ' + DEV.owner + '/' + DEV.repo + ' wasn\'t found, or the key can\'t see it.'), { code: 'repo' });
    if (!r.ok) throw Object.assign(new Error('GitHub answered ' + r.status + ' saving ' + path), { code: 'http' });
    return (await r.json()).content.sha;
  },
  async getPhoto(id) {
    const r = await GH.req('deck/photos/' + id + '.jpg', null, true);
    if (!r.ok) return null;
    return new Blob([await r.arrayBuffer()], { type: 'image/jpeg' });
  }
};
let syncing = false, syncAgain = false;
async function syncNow(manual) {
  if (!ghReady()) { ui.sync = 'nosync'; renderStatus(); if (manual) toast('Add your GitHub key in Settings first.'); return; }
  if (!navigator.onLine) { ui.sync = 'offline'; renderStatus(); if (manual) toast('No signal. Sync runs when you\'re back online.'); return; }
  if (syncing) { syncAgain = true; return; }
  syncing = true; ui.sync = 'syncing'; renderStatus();
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const f = await GH.get('deck/progress.json');
        if (f.text) { S = mergeState(S, normalize(JSON.parse(f.text))); saveLocal(); }
        const out = JSON.stringify(S, null, 1);
        if (out !== f.text) await GH.put('deck/progress.json', utf8ToB64(out), f.sha, 'progress ' + todayISO());
        const g = await GH.get('deck/log.json');
        if (g.text) { const remote = JSON.parse(g.text); LOG = mergeLog(LOG, (remote && remote.entries) || []); saveLog(); }
        const lout = JSON.stringify({ v: 1, entries: LOG.slice().sort((a, b) => a.id < b.id ? -1 : 1) }, null, 1);
        if (lout !== g.text) await GH.put('deck/log.json', utf8ToB64(lout), g.sha, 'log ' + todayISO());
        break;
      } catch (e) { if (e.code === 'conflict' && attempt < 2) continue; throw e; }
    }
    const keys = await IDB.keys();
    for (const id of keys) {
      const rec = await IDB.get(id);
      if (!rec || rec.synced || !rec.blob) continue;
      const b64 = bytesToB64(new Uint8Array(await rec.blob.arrayBuffer()));
      try { await GH.put('deck/photos/' + id + '.jpg', b64, null, 'photo ' + id); }
      catch (e) { if (e.code !== 'conflict') throw e; }
      rec.synced = true; await IDB.put(id, rec);
    }
    DEV.lastSync = Date.now(); DEV.syncErr = ''; ui.sync = 'synced';
    if (manual) toast('Synced');
  } catch (e) {
    ui.sync = e.code === 'offline' ? 'offline' : e.code === 'auth' || e.code === 'repo' ? 'autherr' : 'error';
    DEV.syncErr = e.code === 'offline' ? '' : (e.message || 'Sync failed');
    if (manual) toast(e.code === 'offline' ? 'No signal. Sync runs when you\'re back online.' : DEV.syncErr);
  } finally {
    syncing = false; saveDev(); render(); REM.resched();
    if (syncAgain) { syncAgain = false; setTimeout(() => syncNow(), 800); }
  }
}

/* ---------- sound + haptics ---------- */
const SFX = (() => {
  let ctx = null;
  function ac() {
    if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; try { ctx = new A(); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  function tone(f, d, vol, when, type) {
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + (when || 0);
    o.type = type || 'square'; o.frequency.value = f;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d + 0.03);
  }
  function click() {
    const c = ac(); if (!c) return;
    const len = Math.floor(c.sampleRate * 0.012), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = 'highpass'; f.frequency.value = 1800; g.gain.value = 0.22;
    s.connect(f); f.connect(g); g.connect(c.destination); s.start();
  }
  const on = () => DEV.sound;
  return {
    click: () => on() && click(),
    boot: () => on() && (tone(880, 0.09, 0.035), tone(1320, 0.13, 0.03, 0.12)),
    done: () => on() && (tone(660, 0.08, 0.04), tone(990, 0.16, 0.04, 0.09)),
    err: () => on() && tone(196, 0.2, 0.03, 0, 'sawtooth')
  };
})();
const HAP = {
  tap() { if (!DEV.haptics) return; if (NATIVE && Cap.Haptics) Cap.Haptics.impact({ style: Cap.ImpactStyle.Light }).catch(() => {}); else if (navigator.vibrate) navigator.vibrate(8); },
  done() { if (!DEV.haptics) return; if (NATIVE && Cap.Haptics) Cap.Haptics.notification({ type: Cap.NotificationType.Success }).catch(() => {}); else if (navigator.vibrate) navigator.vibrate([20, 40, 30]); }
};

/* ---------- reminders (phone app only) ---------- */
const REM = {
  ok: () => NATIVE && !!Cap.LocalNotifications,
  async check() { if (!REM.ok()) { ui.notif = 'unsupported'; return; } try { ui.notif = (await Cap.LocalNotifications.checkPermissions()).display; } catch (e) { ui.notif = 'unsupported'; } },
  async ask() { if (!REM.ok()) return; try { ui.notif = (await Cap.LocalNotifications.requestPermissions()).display; } catch (e) {} render(); REM.resched(); },
  async resched() {
    if (!REM.ok()) return;
    await REM.check();
    if (ui.notif !== 'granted') return;
    const LN = Cap.LocalNotifications;
    try { const p = await LN.getPending(); if (p.notifications.length) await LN.cancel({ notifications: p.notifications.map(n => ({ id: n.id })) }); } catch (e) {}
    const list = [], sc = S.sched;
    if (DEV.remNight && sc && sc.on) {
      const nu = nextUp(1)[0];
      list.push({ id: 1, title: 'Deck night', body: nu ? 'Tonight: ' + nu.id + ' ' + nu.t + '. ' + nu.mission : 'Open the deck and pick up where you left off.',
        schedule: { on: { weekday: sc.weekday, hour: sc.hour, minute: sc.minute }, allowWhileIdle: true }, extra: { go: nu ? 'node-' + nu.id.toLowerCase() : 'ops' } });
    }
    if (DEV.remParts) {
      allParts().filter(p => p.status === 'ordered' && p.eta).forEach((p, i) => {
        const at = parseISO(p.eta); at.setHours(8, 0, 0, 0);
        if (at > new Date() && i < 50) list.push({ id: 100 + i, title: 'Parts due today', body: (p.short || p.name) + ' should arrive today. Mark it arrived when it lands.', schedule: { at, allowWhileIdle: true }, extra: { go: 'parts' } });
      });
    }
    if (DEV.remUpd && isDone('L1')) {
      list.push({ id: 2, title: 'Update check', body: 'Run sudo apt update, then sudo apt full-upgrade on the deck.', schedule: { on: { day: 1, hour: 19, minute: 0 }, allowWhileIdle: true }, extra: { go: 'node-l4' } });
    }
    if (list.length) { try { await LN.schedule({ notifications: list }); } catch (e) { console.warn('schedule failed', e); } }
  },
  async test() {
    if (!REM.ok()) return;
    if (ui.notif !== 'granted') await REM.ask();
    if (ui.notif !== 'granted') return toast('Notifications are off for Deck Ops in Android settings.');
    try { await Cap.LocalNotifications.schedule({ notifications: [{ id: 999, title: 'Deck Ops', body: 'Test reminder. This is how deck night will look.', schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true } }] }); toast('Test reminder in 5 seconds'); }
    catch (e) { toast('Couldn\'t schedule the test.'); }
  }
};

/* ---------- updates ---------- */
const newer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) > (y[i] || 0)) return true; if ((x[i] || 0) < (y[i] || 0)) return false; } return false; };
async function checkUpdate(manual) {
  try {
    const r = await fetch('https://api.github.com/repos/' + APP_REPO + '/releases/latest', { cache: 'no-store' });
    if (!r.ok) throw new Error('no release');
    const j = await r.json(), latest = String(j.tag_name || '').replace(/^v/, '');
    ui.update = latest && newer(latest, APP_VERSION) ? latest : null;
    if (manual) toast(ui.update ? 'Version ' + ui.update + ' is ready' : 'You\'re on the latest version');
    render();
  } catch (e) { if (manual) toast('Couldn\'t check for updates. Are you online?'); }
}

/* ---------- toast + copy ---------- */
let tt = null;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2800); }
async function copyText(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg || 'Copied'); }
  catch (e) { toast('Copy was blocked here. Select the text and copy it by hand.'); }
}

/* ---------- status + keys ---------- */
function renderStatus() {
  const cur = currentPhase();
  const L = {
    idle: ['◌', 'starting', 'Loading'], nosync: ['○', 'this device', 'Not syncing yet. Add your GitHub key in Settings.'],
    syncing: ['◌', 'syncing', 'Syncing with GitHub'], synced: ['●', 'synced', 'Last synced ' + (DEV.lastSync ? ago(DEV.lastSync) : '')],
    offline: ['○', 'offline', 'No signal. Changes are saved here and sync when you\'re back online.'],
    error: ['✕', 'sync error', DEV.syncErr || 'Sync failed'], autherr: ['✕', 'check key', DEV.syncErr || 'GitHub key problem']
  };
  const [g, l, tip] = L[ui.sync] || L.idle;
  const cls = ui.sync === 'synced' ? 's-synced' : ui.sync === 'syncing' || ui.sync === 'idle' ? 's-connecting' : 's-local';
  $('#status').innerHTML =
    '<span class="brand">deck-ops</span><span class="sep">│</span><span>day ' + (daysFrom(S.started) + 1) + '</span>' +
    '<span class="sep hide-sm">│</span><span class="hide-sm">phase ' + cur.id + ' ' + esc(cur.name.toLowerCase()) + '</span>' +
    '<span class="sep">│</span><span class="' + cls + '" title="' + esc(tip) + '">' + g + ' ' + l + '<span class="sr">. ' + esc(tip) + '</span></span>' +
    '<span class="grow"></span><button class="sys" data-sys>Settings</button>';
}
function renderKeys() {
  $('#keys').innerHTML = VIEWS.map(([v, l], i) =>
    '<button data-go="' + v + '"' + (ui.view === v ? ' aria-current="page"' : '') + '><span class="fk">F' + (i + 1) + '</span><span class="lb">' + l + '</span></button>').join('');
}

/* ---------- shared pieces ---------- */
function meter(done, total) {
  let s = '<div class="meter" role="img" aria-label="' + done + ' of ' + total + ' done">';
  for (let i = 0; i < total; i++) s += '<i class="' + (i < done ? 'on' : '') + '"></i>';
  return s + '</div>';
}
function dimLine(spent, planned) {
  const pct = planned > 0 ? Math.min(100, spent / planned * 100) : 0, over = spent > planned && planned > 0;
  return '<div class="dim' + (over ? ' over' : '') + '"><div class="spent">' + money(spent) + ' spent' + (over ? ', ' + money(spent - planned) + ' over plan' : '') + '</div>' +
    '<div class="bar" role="img" aria-label="' + money(spent) + ' of ' + money(planned) + ' planned"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
    '<div class="dl"><b class="l"></b><b class="r"></b><span>' + money(planned) + ' planned</span></div></div>';
}
function nodeRow(n) {
  const d = isDone(n.id), lock = d ? null : nodeLock(n), wait = (!d && !lock) ? waitingOn(n) : [];
  const st = d ? 'done' : lock ? 'locked' : 'open', ck = d ? '[x]' : lock ? '[-]' : '[ ]';
  let note = '';
  if (d) note = 'done ' + fmtDate(S.done[n.id]);
  else if (lock) note = lock.text;
  else if (wait.length) note = 'waiting on ' + wait.map(p => (p.short || p.name.split(',')[0]) + etaLabel(p)).join('; ');
  const meta = BR[n.b].name.toLowerCase() + '   ' + minsLabel(n.mins) + '   +' + n.xp + ' xp';
  return '<button class="node st-' + st + (wait.length ? ' wait' : '') + '" data-open="' + n.id + '" aria-label="' + esc(n.id + ' ' + n.t + ', ' + (d ? 'done' : lock ? 'locked' : 'open') + (note ? ', ' + note : '')) + '">' +
    '<span class="ck" aria-hidden="true">' + ck + '</span><span class="nid">' + n.id + '</span>' +
    '<span class="nbody"><span class="nt">' + esc(n.t) + '</span><span class="nm">' + esc(meta) + '</span>' + (note ? '<span class="nn">' + esc(note) + '</span>' : '') + '</span></button>';
}

/* ---------- views ---------- */
function lessonCard(n, night) {
  const wait = waitingOn(n), ph = phaseById(n.phase);
  let h = '<section class="hero"><div class="hero-top"><span class="big">' + n.id + '</span><div><div class="sh-br">' + esc(BR[n.b].name) + '   phase ' + ph.id + ' ' + esc(ph.name) + '   ' + minsLabel(n.mins) + '</div><h2 class="vt">' + esc(n.t) + '</h2></div></div>';
  h += '<p class="hero-why">' + fmt(n.why) + '</p><div class="mission"><h3>Mission</h3><p>' + fmt(n.mission) + '</p></div>';
  if (wait.length) h += '<p class="warn">Waiting on ' + esc(wait.map(p => (p.short || p.name) + etaLabel(p)).join('; ')) + '. You can read it now and do the mission once it arrives.</p>';
  return h + '<div class="row"><button class="btn primary big" data-open="' + n.id + '">' + (night ? 'Start tonight\'s lesson' : 'Start lesson') + '</button><button class="btn ghost" data-tutor="' + n.id + '">' + (S.tu[n.id] ? 'Tutor: step ' + (S.tu[n.id] + 1) : 'Walk me through it') + '</button>' + (wait.length ? '<button class="btn ghost" data-go="parts">Open Parts</button>' : '') + '</div></section>';
}
function qrow(label, value, go, extra) {
  return '<button class="qrow" ' + go + '><span class="ql">' + esc(label) + '</span><span class="qv">' + value + '</span>' + (extra || '') + '</button>';
}
function viewOps() {
  const nu = nextUp(3), first = nu[0], dn = nextDeckNight(), night = !!dn && dn.toDateString() === new Date().toDateString();
  const cur = currentPhase(), cd = cur.obj.filter(isDone).length, parts = allParts();
  const inbound = parts.filter(p => p.status === 'ordered').sort((a, b) => (a.eta || '9').localeCompare(b.eta || '9'));
  const toOrder = parts.filter(p => p.status === 'wanted' && p.phase > 0 && phaseUnlocked(phaseById(p.phase)));
  const doneN = NODES.filter(n => isDone(n.id)).length, latest = liveLog().sort(byDate)[0];
  let h = '';
  if (ui.update && NATIVE) h += '<div class="banner"><span class="vt">Update ' + esc(ui.update) + ' ready</span><a class="btn primary" href="' + APK_URL + '">Download</a><span class="muted" style="font-size:12px">Open the file when it lands and tap Update. Your data stays.</span></div>';
  if (!ghReady() && (doneN > 0 || liveLog().length)) h += '<div class="banner"><span>Your progress lives only on this device.</span><button class="btn ghost" data-sys>Set up sync</button></div>';
  if (!DEV.introSeen) h += '<section class="win intro"><h2 class="wt">How Deck Ops works</h2><ol class="steps">' +
    '<li>This screen always shows your next lesson. Tap Start.</li>' +
    '<li>Read it, do the mission, then tap Mark complete. The next lesson moves up here.</li>' +
    '<li>Not sure what to do? Walk me through it opens the tutor: one step at a time, with hints before answers.</li>' +
    '<li>When you order or receive a part, tap its status in Parts. Lessons waiting on it open up.</li>' +
    '<li>Write down what you did in Log, with a photo if you like.</li></ol>' +
    '<p class="muted" style="margin:0 0 12px">Route shows the whole plan as ' + PHASES.length + ' phases. Skills lists every lesson. Codex has the glossary, commands and safety notes.</p><button class="btn ghost" data-intro>Got it</button></section>';
  h += '<h1 class="vt">' + (night ? 'Tonight\'s lesson' : 'Your next lesson') + '<span class="cur" aria-hidden="true"></span></h1>';
  h += first ? lessonCard(first, night) : '<p class="empty">Every open lesson is done. Check Route for what opens next.</p>';
  h += '<div class="ops"><div>';
  if (nu.length > 1) h += '<section class="win"><h2 class="wt">After that</h2>' + nu.slice(1).map(nodeRow).join('') + '</section>';
  h += '</div><div><section class="win"><h2 class="wt">Status</h2>';
  h += qrow('Deck night', dn ? esc(dn.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' + hhmm(S.sched.hour, S.sched.minute)) : 'off', 'data-sys');
  h += qrow('Phase ' + cur.id, esc(cur.name) + '   ' + cd + ' / ' + cur.obj.length, 'data-routeto="' + cur.id + '"', meter(cd, cur.obj.length));
  h += qrow('Parts', inbound.length ? esc((inbound[0].short || inbound[0].name) + (inbound[0].eta ? ' due ' + fmtShort(inbound[0].eta) : ' on the way')) + (inbound.length > 1 ? ' +' + (inbound.length - 1) : '') : toOrder.length + ' to order', 'data-go="parts"');
  h += qrow('Lessons', doneN + ' of ' + NODES.length + '   ' + xpTotal() + ' xp', 'data-go="skills"');
  h += qrow('Log', latest ? esc(fmtShort(latest.date) + ': ' + latest.t) : 'no entries yet', 'data-go="log"');
  return h + '</section></div></div>';
}
const byDate = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || 0) - (a.created || 0);

/* route diagram */
const ROUTE = {
  wide: { W: 860, H: 348, bw: 196, bh: 82, pos: { 1: [96, 24], 2: [368, 24], 6: [640, 24], 7: [96, 134], 5: [368, 134], 8: [640, 134], 3: [96, 244], 4: [368, 244], 9: [640, 244] } },
  tall: { W: 344, H: 404, bw: 106, bh: 86, pos: { 1: [2, 56], 7: [119, 56], 3: [236, 56], 2: [2, 182], 5: [119, 182], 4: [236, 182], 6: [2, 308], 8: [119, 308], 9: [236, 308] } }
};
function corners(x, y, w, h, k) {
  const r = x + w, b = y + h;
  return 'M' + x + ' ' + (y + k) + ' V' + y + ' H' + (x + k) + ' M' + (r - k) + ' ' + y + ' H' + r + ' V' + (y + k) +
    ' M' + r + ' ' + (b - k) + ' V' + b + ' H' + (r - k) + ' M' + (x + k) + ' ' + b + ' H' + x + ' V' + (b - k);
}
function nameText(name, x, y, kind, size) {
  if (kind === 'wide') return '<text class="nm" x="' + x + '" y="' + (y + 46) + '" font-size="' + size + '">' + esc(name) + '</text>';
  const i = name.indexOf(' '), a = i > 0 ? name.slice(0, i) : name, b = i > 0 ? name.slice(i + 1) : '';
  return '<text class="nm" x="' + x + '" y="' + (y + 38) + '" font-size="' + size + '">' + esc(a) + '</text>' + (b ? '<text class="nm" x="' + x + '" y="' + (y + 56) + '" font-size="' + size + '">' + esc(b) + '</text>' : '');
}
function routeSVG(kind, sel) {
  const L = ROUTE[kind], { bw, bh } = L, P = L.pos;
  const cx = id => P[id][0] + bw / 2, cy = id => P[id][1] + bh / 2, R = id => P[id][0] + bw, B = id => P[id][1] + bh, T = id => P[id][1], Lx = id => P[id][0];
  const on = id => phaseUnlocked(phaseById(id));
  const wire = (d, child, lbl, lx, ly) => '<path class="wire' + (on(child) ? '' : ' off') + '" d="' + d + '" marker-end="url(#ah' + (on(child) ? '' : 'o') + ')"/><text class="glbl" x="' + lx + '" y="' + ly + '">' + lbl + '</text>';
  let s = '<svg viewBox="0 0 ' + L.W + ' ' + L.H + '" role="group" aria-label="Build route: ' + PHASES.length + ' phases and what opens each">' +
    '<defs><marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path class="mk" d="M0,0 L8,4 L0,8 z"/></marker>' +
    '<marker id="aho" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path class="mk off" d="M0,0 L8,4 L0,8 z"/></marker></defs>';
  if (kind === 'wide') {
    const mid = (cy(1) + cy(3)) / 2;
    s += '<path class="ant" d="M38 ' + mid + ' V' + (mid - 30) + ' L26 ' + (mid - 52) + ' M38 ' + (mid - 30) + ' L50 ' + (mid - 52) + ' M38 ' + (mid - 30) + ' V' + (mid - 56) + '"/>' +
      '<path class="wire" d="M38 ' + mid + ' H70 M70 ' + cy(1) + ' V' + cy(3) + ' M70 ' + cy(1) + ' H' + (Lx(1) - 2) + ' M70 ' + cy(7) + ' H' + (Lx(7) - 2) + ' M70 ' + cy(3) + ' H' + (Lx(3) - 2) + '"/>';
    s += wire('M' + R(1) + ' ' + cy(1) + ' H' + (Lx(2) - 3), 2, 'L4', R(1) + 22, cy(1) - 8);
    s += wire('M' + R(2) + ' ' + cy(2) + ' H' + (Lx(6) - 3), 6, 'R4', R(2) + 22, cy(2) - 8);
    s += wire('M' + R(1) + ' ' + (cy(1) + 22) + ' H' + (R(1) + 36) + ' V' + cy(5) + ' H' + (Lx(5) - 3), 5, 'E5', R(1) + 42, cy(1) + 62);
    s += wire('M' + R(3) + ' ' + cy(3) + ' H' + (Lx(4) - 3), 4, 'C8', R(3) + 22, cy(3) - 8);
    s += wire('M' + R(5) + ' ' + cy(5) + ' H' + (Lx(8) - 3), 8, 'L7', R(5) + 22, cy(5) - 8);
    s += wire('M' + R(5) + ' ' + (cy(5) + 22) + ' H' + (R(5) + 36) + ' V' + cy(9) + ' H' + (Lx(9) - 3), 9, 'E10', R(5) + 42, cy(5) + 62);
  } else {
    s += '<path class="ant" d="M172 22 V40 M172 22 L162 6 M172 22 L182 6 M172 22 V2"/><path class="wire" d="M172 40 V44 M' + cx(1) + ' 44 H' + cx(3) + ' M' + cx(1) + ' 44 V' + (T(1) - 2) + ' M' + cx(7) + ' 44 V' + (T(7) - 2) + ' M' + cx(3) + ' 44 V' + (T(3) - 2) + '"/>';
    s += wire('M' + cx(1) + ' ' + B(1) + ' V' + (T(2) - 3), 2, 'L4', cx(1) + 8, B(1) + 24);
    s += wire('M' + (cx(1) + 30) + ' ' + B(1) + ' V' + (B(1) + 20) + ' H' + cx(5) + ' V' + (T(5) - 3), 5, 'E5', cx(5) + 8, B(1) + 34);
    s += wire('M' + cx(3) + ' ' + B(3) + ' V' + (T(4) - 3), 4, 'C8', cx(3) + 8, B(3) + 24);
    s += wire('M' + cx(2) + ' ' + B(2) + ' V' + (T(6) - 3), 6, 'R4', cx(2) + 8, B(2) + 24);
    s += wire('M' + cx(5) + ' ' + B(5) + ' V' + (T(8) - 3), 8, 'L7', cx(5) + 8, B(5) + 30);
    s += wire('M' + (cx(5) + 30) + ' ' + B(5) + ' V' + (B(5) + 20) + ' H' + cx(9) + ' V' + (T(9) - 3), 9, 'E10', cx(5) + 38, B(5) + 14);
  }
  PHASES.forEach(p => {
    const [x, y] = P[p.id], st = phaseState(p), d = p.obj.filter(isDone).length, tot = p.obj.length;
    const pad = kind === 'wide' ? 12 : 8, nmSize = kind === 'wide' ? 28 : 22, tw = (bw - pad * 2 - (tot - 1) * 3) / tot;
    let ticks = '';
    for (let i = 0; i < tot; i++) ticks += '<rect class="tk' + (i < d ? ' on' : '') + '" x="' + (x + pad + i * (tw + 3)).toFixed(1) + '" y="' + (y + bh - 15) + '" width="' + tw.toFixed(1) + '" height="6"/>';
    const stLabel = st === 'cleared' ? 'cleared' : st === 'locked' ? 'locked' : d + '/' + tot;
    s += '<g class="blk ' + st + (sel === p.id ? ' is-sel' : '') + '" data-phase="' + p.id + '" tabindex="0" role="button" aria-pressed="' + (sel === p.id) + '" aria-label="Phase ' + p.id + ', ' + p.name + ', ' + (st === 'active' ? d + ' of ' + tot + ' done' : st) + '">' +
      '<path class="sel" d="' + corners(x - 5, y - 5, bw + 10, bh + 10, 12) + '"/><rect class="box" x="' + x + '" y="' + y + '" width="' + bw + '" height="' + bh + '"/>' +
      '<text class="pn" x="' + (x + pad) + '" y="' + (y + 17) + '">phase ' + p.id + '</text><text class="ct" x="' + (x + bw - pad) + '" y="' + (y + 17) + '" text-anchor="end">' + stLabel + '</text>' +
      nameText(p.name, x + pad, y, kind, nmSize) + ticks + '</g>';
  });
  return s + '</svg>';
}
function viewRoute() {
  const kind = window.innerWidth >= 760 ? 'wide' : 'tall'; ui.layout = kind;
  const sel = ui.phase || currentPhase().id, p = phaseById(sel), st = phaseState(p), b = budget(p.id);
  let h = '<h1 class="vt">The route</h1><p class="lead">' + PHASES.length + ' phases. Three are open from the start: the bench deck, the case and the base station. The rest open when you finish the lesson on their wire. Select a phase for its work and parts.</p>';
  h += '<div class="route-wrap route">' + routeSVG(kind, sel) + '</div>';
  h += '<section class="win"><h2 class="wt">Phase ' + p.id + '  ' + esc(p.name) + ' <small>' + st + '</small></h2><p class="lead">' + esc(p.blurb) + '</p><p class="' + (st === 'locked' ? 'warn' : 'muted') + '" style="margin:0 0 10px">' + esc(gateText(p)) + '</p>';
  h += '<h3 class="sub">Objectives</h3>' + p.obj.map(id => nodeRow(NODE[id])).join('');
  if (b.list.length) h += '<h3 class="sub">Parts</h3><ul class="plain">' + b.list.map(x => '<li class="pline"><span>' + esc(x.name) + '</span><span class="muted" style="white-space:nowrap">' + (x.approx ? '~' : '') + money(x.price) + '   ' + x.status + '</span></li>').join('') + '</ul>' + dimLine(b.spent, b.planned);
  if (p.id === 4) h += '<p class="warn" style="margin-top:12px">Lithium cells are the one real hazard in this build. <button class="linkbtn" data-safety>Read the safety page</button> before buying.</p>';
  if (p.id === 9) h += '<p class="warn" style="margin-top:12px">The wrist runs on a LiPo pouch cell. <button class="linkbtn" data-safety>Read the safety page</button> before buying one.</p>';
  return h + '</section>';
}
function viewSkills() {
  const b = BR[ui.branch], ns = NODES.filter(n => n.b === b.id);
  let h = '<h1 class="vt">Skill trees</h1><p class="lead">' + NODES.filter(n => isDone(n.id)).length + ' of ' + NODES.length + ' lessons done, ' + xpTotal() + ' xp. Lessons open in order; tap any one to read it.</p><div class="tabs" role="tablist" aria-label="Branches">' + BRANCHES.map(x => {
    const all = NODES.filter(n => n.b === x.id), d = all.filter(n => isDone(n.id)).length;
    return '<button role="tab" aria-selected="' + (x.id === b.id) + '" data-branch="' + x.id + '">' + esc(x.name) + '<span class="c">' + d + '/' + all.length + '</span></button>';
  }).join('') + '</div><p class="lead">' + esc(b.blurb) + '</p><ol class="trace">';
  return h + ns.map(n => '<li class="' + (isDone(n.id) ? 'done' : nodeLock(n) ? 'locked' : 'open') + '">' + nodeRow(n) + '</li>').join('') + '</ol>';
}
function viewParts() {
  const all = budget(null);
  let h = '<h1 class="vt">Quartermaster</h1><section class="win"><h2 class="wt">All phases</h2>' + dimLine(all.spent, all.planned) +
    '<p class="muted" style="font-size:12px;margin:8px 0 0">Tap a status to move it along: wanted, ordered, arrived, installed. A ~ marks an estimate; enter what you paid once ordered. Set an ETA and the phone reminds you that morning.</p></section>';
  const pp = allParts(), inb = pp.filter(p => p.status === 'ordered'), want = pp.filter(p => p.status === 'wanted' && p.phase > 0 && phaseUnlocked(phaseById(p.phase)));
  h += '<section class="win"><h2 class="wt">On the way</h2>' + (inb.length ? '<ul class="plain">' + inb.map(p => '<li>' + esc(p.name) + '<br><span class="muted" style="font-size:12px">' + (p.eta ? esc(etaLabel(p).replace(/^ \(|\)$/g, '')) : 'no ETA set') + '</span></li>').join('') + '</ul>' : '<p class="empty">Nothing on order.</p>') + '<p class="muted" style="font-size:12px;margin:8px 0 0">' + want.length + ' parts in open phases still to order.</p></section>';
  PHASES.map(p => p.id).concat([0]).forEach(gid => {
    const list = allParts().filter(p => p.phase === gid); if (!list.length) return;
    const ph = phaseById(gid), bb = budget(gid);
    h += '<section class="win"><h2 class="wt">' + (ph ? 'Phase ' + ph.id + '  ' + esc(ph.name) : 'Bench and later') + (ph && phaseState(ph) === 'locked' ? ' <small>locked</small>' : '') + '</h2>';
    h += ph ? dimLine(bb.spent, bb.planned) : '<p class="muted" style="font-size:12px;margin:0">Outside the deck budget.</p>';
    h += '<ul class="plain">' + list.map(partRow).join('') + '</ul></section>';
  });
  return h + '<section class="win"><h2 class="wt">Add a part</h2><form class="form" id="addPart"><label class="f">Name<input name="name" required maxlength="120"></label>' +
    '<div class="two"><label class="f">Phase<select name="phase">' + PHASES.map(p => '<option value="' + p.id + '">' + p.id + ' ' + esc(p.name) + '</option>').join('') + '<option value="0">Bench and later</option></select></label>' +
    '<label class="f">Price (CAD)<input name="price" type="number" step="0.01" min="0" inputmode="decimal"></label></div>' +
    '<div class="two"><label class="f">Where<input name="where" maxlength="80"></label><label class="f">Link<input name="url" type="url" placeholder="https://"></label></div>' +
    '<div><button class="btn primary">Add part</button></div></form></section>';
}
function partRow(p) {
  const link = p.url && /^https?:\/\//.test(p.url) ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + esc(p.name) + '</a>' : esc(p.name);
  let h = '<li class="prow s-' + p.status + '"><button class="pst" data-status="' + esc(p.id) + '" aria-label="' + esc(p.name) + ' status: ' + p.status + '. Change status">' + p.status + '</button><div><div class="pname">' + link + '</div>';
  if (p.where || p.note) h += '<div class="pmeta">' + esc(p.where || '') + (p.where && p.note ? '. ' : '') + esc(p.note || '') + '</div>';
  h += '</div><div class="pnum"><span class="pprice">' + (p.approx ? '~' : '') + money(p.price) + '</span>';
  if (p.status !== 'wanted') h += '<label>paid <input type="number" step="0.01" min="0" inputmode="decimal" data-paid="' + esc(p.id) + '" value="' + (p.paid != null ? esc(p.paid) : '') + '" placeholder="' + (p.price != null ? esc(p.price) : '') + '"></label>';
  if (p.status === 'ordered') h += '<label>eta <input type="date" data-eta="' + esc(p.id) + '" value="' + esc(p.eta || '') + '"></label>';
  if (p.custom) h += '<button class="linkbtn" data-delpart="' + esc(p.id) + '">remove</button>';
  return h + '</div></li>';
}
function viewLog() {
  const list = liveLog().sort(byDate).filter(e => ui.logTag === 'all' || (e.tags || []).includes(ui.logTag));
  let h = '<h1 class="vt">Field log</h1><div class="row" style="margin-bottom:14px"><button class="btn primary" data-newlog>New entry</button></div>';
  h += '<div style="margin-bottom:10px">' + ['all'].concat(TAGS).map(t => '<button class="chip" data-logtag="' + t + '" aria-pressed="' + (ui.logTag === t) + '">' + (t === 'all' ? 'All' : t) + '</button>').join('') + '</div>';
  if (ui.draft) h += logForm();
  if (!list.length) h += '<p class="empty">' + (liveLog().length ? 'No entries with that tag.' : 'No entries yet. Log what you did, what broke and what fixed it. In six months this is the page you\'ll value most.') + '</p>';
  return h + '<ol class="plain">' + list.map(entryRow).join('') + '</ol>';
}
function entryRow(e) {
  let h = '<li class="entry"><div class="e-date vt">' + esc(fmtShort(e.date)) + '</div><div><h3>' + esc(e.t || 'Untitled') + '</h3><div>' + (e.tags || []).map(t => '<span class="tag">' + esc(t) + '</span>').join('') +
    (e.node && NODE[e.node] ? '<button class="chip" data-open="' + esc(e.node) + '">' + esc(e.node) + ' ' + esc(NODE[e.node].t) + '</button>' : '') + '</div>';
  if (e.freq) h += '<div class="e-sig">' + esc(e.freq) + ' MHz ' + esc(e.mode || '') + '</div>';
  if (e.body) h += '<p class="e-body">' + esc(e.body) + '</p>';
  if (e.photo) h += '<button class="e-photo" data-photo="' + esc(e.photo) + '" aria-label="Open photo"><img data-pid="' + esc(e.photo) + '" alt="Photo: ' + esc(e.t || '') + '"></button>';
  h += '<div class="e-act">' + (ui.confirm === e.id
    ? '<span class="warn">Delete this entry?</span><button class="linkbtn" data-dellog="' + esc(e.id) + '">Yes, delete</button><button class="linkbtn" data-keep>Keep it</button>'
    : '<button class="linkbtn" data-editlog="' + esc(e.id) + '">Edit</button><button class="linkbtn" data-askdel="' + esc(e.id) + '">Delete</button>');
  return h + '</div></div></li>';
}
function logForm() {
  const d = ui.draft, sig = d.tags.includes('Signal');
  let h = '<section class="win"><h2 class="wt">' + (ui.editing ? 'Edit entry' : 'New entry') + '</h2><form class="form" id="logForm">';
  h += '<div class="two"><label class="f">Date<input type="date" data-draft="date" value="' + esc(d.date) + '" required></label><label class="f">Lesson (optional)<select data-draft="node"><option value="">None</option>' +
    NODES.map(n => '<option value="' + n.id + '"' + (d.node === n.id ? ' selected' : '') + '>' + n.id + ' ' + esc(n.t) + '</option>').join('') + '</select></label></div>';
  h += '<label class="f">Title<input data-draft="t" value="' + esc(d.t) + '" maxlength="140" required placeholder="What you did"></label>';
  h += '<div><span class="muted" style="font-size:12px;display:block;margin-bottom:4px">Tags</span>' + TAGS.map(t => '<button type="button" class="chip" data-dtag="' + t + '" aria-pressed="' + d.tags.includes(t) + '">' + t + '</button>').join('') + '</div>';
  if (sig) h += '<div class="two"><label class="f">Frequency (MHz)<input data-draft="freq" value="' + esc(d.freq) + '" inputmode="decimal" placeholder="162.450"></label><label class="f">Mode<select data-draft="mode">' +
    ['FM', 'AM', 'USB', 'LSB', 'CW', 'Digital', 'Other'].map(m => '<option' + (d.mode === m ? ' selected' : '') + '>' + m + '</option>').join('') + '</select></label></div>';
  h += '<label class="f">Notes<textarea data-draft="body" placeholder="What worked, what broke, what fixed it">' + esc(d.body) + '</textarea></label>';
  h += '<div class="row">' + (d.photo ? '<img data-pid="' + esc(d.photo) + '" alt="Attached photo" style="max-width:160px;border:1px solid var(--line)"><button type="button" class="linkbtn" data-dropphoto>Remove photo</button>'
    : '<button type="button" class="btn ghost" data-snap' + (ui.uploading ? ' disabled' : '') + '>' + (ui.uploading ? 'Saving photo…' : NATIVE ? 'Take or pick a photo' : 'Add a photo') + '</button>') + '</div>';
  return h + '<div class="row"><button class="btn primary" type="submit"' + (ui.uploading ? ' disabled' : '') + '>Save entry</button><button type="button" class="btn ghost" data-cancellog>Cancel</button></div></form></section>';
}
const scramble = s => s.replace(/[^\s]/g, '░');
function viewCodex() {
  const q = ui.q.trim().toLowerCase();
  let h = '<h1 class="vt">Codex</h1><div class="tabs" role="tablist" aria-label="Codex sections">' + [['terms', 'Terms'], ['commands', 'Commands'], ['safety', 'Safety']].map(([k, l]) => '<button role="tab" aria-selected="' + (ui.codexTab === k) + '" data-ctab="' + k + '">' + l + '</button>').join('') + '</div>';
  if (ui.codexTab !== 'safety') h += '<label class="sr" for="cq">Search</label><input id="cq" class="search" type="search" placeholder="Search ' + (ui.codexTab === 'terms' ? 'terms' : 'commands') + '" value="' + esc(ui.q) + '" data-q>';
  if (ui.codexTab === 'terms') {
    h += '<p class="muted" style="margin:0 0 6px">' + TERMS.filter(t => isDone(t.from)).length + ' of ' + TERMS.length + ' terms learned. Terms from lessons you haven\'t done stay scrambled until you do them, or until you read ahead.</p><dl style="margin:0">';
    h += TERMS.filter(t => !q || t.t.toLowerCase().includes(q) || ((isDone(t.from) || S.ahead[t.id]) && t.d.toLowerCase().includes(q))).map(t => {
      const open = isDone(t.from) || S.ahead[t.id];
      return '<div class="term' + (open ? '' : ' ahead') + (ui.flashTerm === t.id ? ' flash' : '') + '" id="t-' + t.id + '"><dt>' + esc(t.t) + '</dt><dd>' +
        (open ? esc(t.d) : '<span class="enc" aria-hidden="true">' + scramble(t.d.slice(0, 34)) + '</span><br><button class="linkbtn" data-ahead="' + t.id + '">Read ahead</button><span class="muted" style="font-size:12px">  or finish ' + t.from + '</span>') +
        '</dd><dd class="src">from <button class="linkbtn" data-open="' + t.from + '">' + t.from + ' ' + esc(NODE[t.from].t) + '</button></dd></div>';
    }).join('') + '</dl>';
  } else if (ui.codexTab === 'commands') {
    COMMANDS.forEach(([g, list]) => {
      const rows = list.filter(([c, d]) => !q || c.toLowerCase().includes(q) || d.toLowerCase().includes(q)); if (!rows.length) return;
      h += '<div class="cmdg"><h3 class="sub">' + esc(g) + '</h3><table class="cmdt"><tbody>' + rows.map(([c, d, f]) =>
        '<tr><td><code>' + esc(c) + '</code></td><td>' + esc(d) + '<br><span class="muted" style="font-size:11px">' + f + ' ' + esc(NODE[f].t) + '</span></td><td style="text-align:right"><button class="copy" data-copy="' + esc(c) + '" aria-label="Copy ' + esc(c) + '">Copy</button></td></tr>').join('') + '</tbody></table></div>';
    });
  } else h += '<p class="lead">Read before Field power, and before the first solder.</p><dl style="margin:0">' + SAFETY.map(([t, d]) => '<div class="term"><dt>' + esc(t) + '</dt><dd>' + esc(d) + '</dd></div>').join('') + '</dl>';
  return h;
}

/* ---------- tutor ---------- */
function tutorFor(id) {
  if (TUTOR[id]) return TUTOR[id];
  const n = NODE[id], steps = n.learn.map(x => ({ say: x }));
  if (n.cmd) steps.push({ t: 'Commands for this lesson', say: n.cmd.map(([c, d]) => '`' + c + '`: ' + d).join('\n') });
  if (n.code) { const at = n.learn.findIndex(x => /below/i.test(x)); if (at >= 0) steps[at].code = n.code; else steps.push({ t: 'The code', say: 'Here it is. Read it line by line before you run it; Ask Claude can explain any line.', code: n.code }); }
  steps.push({ t: 'Your mission', say: n.mission, why: n.why, mission: true });
  const gear = (n.needs || []).map(partById).filter(Boolean).map(p => p.name);
  return { auto: true, gear: gear.length ? gear : null, steps };
}
const plainText = x => String(x == null ? '' : x).replace(/`/g, '');
function claudePrompt(id, k) {
  const n = NODE[id], T = tutorFor(id), s = T.steps[k];
  const what = s.do ? [].concat(s.do).map(plainText).join(' ') : plainText([].concat(s.say)[0]);
  return 'I\'m a beginner building a cyberdeck, working with ' + (TUTOR_CTX[n.b] || 'my cyberdeck parts') + '. I\'m on lesson ' + n.id + ' "' + n.t + '", step ' + (k + 1) + ' of ' + T.steps.length + (s.t ? ': "' + s.t + '"' : '') + '.\n\n' +
    'The step says: ' + what.slice(0, 700) + '\n\n' +
    'Please tutor me: ask what I\'ve tried, or give me one hint at a time and explain the why. Only give me the full answer if I ask for it.\n\nWhere I\'m stuck: ';
}
const codeBox = (code, key) => '<div class="code"><button class="copy" data-copyt="' + key + '">Copy</button><pre><code>' + esc(code) + '</code></pre></div>';
const paras = x => [].concat(x || []).map(t => '<p>' + fmt(t).replace(/\n/g, '<br>') + '</p>').join('');
function tutorHTML(id) {
  const n = NODE[id], T = tutorFor(id), st = ui.tut || { step: 0, hints: 0, shown: false, picks: {} }, N = T.steps.length, k = Math.min(st.step, N - 1), s = T.steps[k];
  const d = isDone(id), lock = d ? null : nodeLock(n);
  let h = '<div class="sh-head"><span class="big">' + n.id + '</span><div><div class="sh-br">Tutor   ' + esc(BR[n.b].name) + '   step ' + (k + 1) + ' of ' + N + '</div><h2 id="sh-title" class="vt">' + esc(n.t) + '</h2></div><button class="x" data-close aria-label="Close tutor">×</button></div><div class="sh-body tut">';
  h += '<div class="tprog" role="list">' + T.steps.map((x, i) => '<button role="listitem" class="tp' + (i < k ? ' past' : i === k ? ' on' : '') + '" data-tgo="' + i + '" aria-label="Step ' + (i + 1) + (x.t ? ': ' + esc(x.t) : '') + '"' + (i === k ? ' aria-current="step"' : '') + '></button>').join('') + '</div>';
  if (VOICE.canSpeak() || VOICE.canListen()) h += '<div class="tvoice">' + (VOICE.canSpeak() ? '<button class="chip" data-tspeak aria-pressed="' + !!DEV.speak + '">Read aloud</button>' : '') + (VOICE.canListen() ? '<button class="chip" data-tlisten aria-pressed="' + VOICE.listening() + '">Voice commands</button>' : '') + '</div>' +
    (VOICE.listening() ? '<p class="tlisten" role="status"><span class="dot" aria-hidden="true"></span>Listening. Say next, back, repeat, hint, answer, option 1 to 4, or stop listening.</p>' : '');
  if (T.auto && k === 0) h += '<p class="tnote">The full walkthrough for this lesson comes when you reach its phase. For now the tutor takes the lesson one point at a time, and Ask Claude on any step gets you a hand.</p>';
  if (k === 0 && T.gear) h += '<div class="tgear"><h4>Get these out</h4><ul>' + T.gear.map(g => '<li>' + fmt(g) + '</li>').join('') + '</ul></div>';
  h += '<h3 class="tt vt">' + esc(s.t || 'Step ' + (k + 1)) + '</h3>';
  if (s.fig) h += '<figure class="tfig">' + TF.fig(s.fig) + (s.cap ? '<figcaption>' + fmt(s.cap) + '</figcaption>' : '') + '</figure>';
  h += '<div class="tsay">' + paras(s.say) + '</div>';
  if (s.why) h += '<p class="twhy"><b>Why it matters:</b> ' + fmt(s.why) + '</p>';
  if (s.do) { const dl = [].concat(s.do); h += '<div class="tdo"><h4>Your turn</h4>' + (dl.length > 1 ? '<ol>' + dl.map(x => '<li>' + fmt(x) + '</li>').join('') + '</ol>' : '<p>' + fmt(dl[0]) + '</p>') + '</div>'; }
  if (s.code) h += codeBox(s.code, id + ':' + k + ':code');
  if (s.mission) h += '<div class="mission"><h3>Mission</h3><p>' + fmt(n.mission) + '</p><p class="donewhen">Done when: ' + fmt(n.done) + '</p></div>';
  (s.ask || []).forEach((q, qi) => {
    const picks = st.picks[qi] || [], last = picks[picks.length - 1];
    h += '<div class="tq"><p class="tqq"><span class="tql">Check</span> ' + fmt(q.q) + '</p><div class="topts">' + q.opts.map((o, oi) => {
      const p = picks.includes(oi), c = p ? (o[1] === true ? ' ok' : o[1] === false ? ' no' : ' fix') : '';
      return '<button class="topt' + c + '" data-tpick="' + qi + ':' + oi + '" aria-pressed="' + p + '">' + fmt(o[0]) + '</button>';
    }).join('') + '</div>';
    if (last != null) { const o = q.opts[last]; h += '<p class="tfb ' + (o[1] === true ? 'ok' : o[1] === false ? 'no' : 'fix') + '" role="status">' + (o[1] === false ? '<b>Not quite.</b> ' : o[1] === null ? '<b>Try this:</b> ' : '') + fmt(o[2]) + '</p>'; }
    h += '</div>';
  });
  const H = s.hints || [];
  if (H.length || s.show || s.showCode) {
    h += '<div class="thints">';
    H.slice(0, st.hints).forEach((x, i) => { h += '<p class="thint"><b>Hint ' + (i + 1) + '</b> ' + fmt(x) + '</p>'; });
    if (st.shown) h += '<div class="tshow"><h4>Answer</h4>' + (s.show ? '<p>' + fmt(s.show) + '</p>' : '') + (s.showCode ? codeBox(s.showCode, id + ':' + k + ':showCode') : '') + '</div>';
    if (st.hints < H.length) h += '<button class="btn ghost" data-thint>' + (st.hints ? 'Another hint' : 'Stuck? Get a hint') + ' (' + (st.hints + 1) + ' of ' + H.length + ')</button>';
    else if ((s.show || s.showCode) && !st.shown) h += '<button class="btn ghost" data-tshow>Show me the answer</button>';
    h += '</div>';
  }
  h += '<div class="task"><a class="btn ghost" href="https://claude.ai/new?q=' + encodeURIComponent(claudePrompt(id, k)) + '" target="_blank" rel="noopener" data-askclaude="' + id + ':' + k + '">Ask Claude about this step</a><span class="muted">Opens Claude with this step filled in. Add what\'s going wrong at the end.</span></div>';
  h += '<div class="tnav">' + (k > 0 ? '<button class="btn ghost" data-tgo="' + (k - 1) + '">Back</button>' : '<button class="btn ghost" data-open="' + id + '">Lesson page</button>');
  if (k < N - 1) h += '<button class="btn primary" data-tgo="' + (k + 1) + '">Next: ' + esc(T.steps[k + 1].t || 'step ' + (k + 2)) + '</button>';
  else if (d) h += '<span class="okline">[x] ' + id + ' complete</span>';
  else if (lock) h += '<span class="warn">' + esc(lock.text) + '</span>';
  else h += '<button class="btn primary" data-complete="' + id + '">Mark ' + id + ' complete</button>';
  h += '</div>';
  if (k === N - 1 && !s.mission) h += '<p class="donewhen">Done when: ' + fmt(n.done) + '</p>';
  return h + '</div>';
}
function openTutor(id, step) {
  const T = tutorFor(id), saved = S.tu[id] || 0, N = T.steps.length;
  const start = step != null ? step : (isDone(id) && saved >= N - 1 ? 0 : saved);
  ui.tut = { id, step: Math.max(0, Math.min(start, N - 1)), hints: 0, shown: false, picks: {} };
  openSheet('tutor', id);
  if (talkBack()) VOICE.say(stepSpeech(id, ui.tut.step));
}
function tutorGo(i) {
  const st = ui.tut; if (!st) return;
  const N = tutorFor(st.id).steps.length; i = Math.max(0, Math.min(i, N - 1));
  ui.tut = { id: st.id, step: i, hints: 0, shown: false, picks: {} };
  if (i > (S.tu[st.id] || 0)) { put('tu', st.id, i); commit(); } else render();
  $('#sheet').scrollTop = 0;
  if (talkBack()) VOICE.say(stepSpeech(st.id, i)); else VOICE.hush();
}
const talkBack = () => DEV.speak || VOICE.listening();
function tutorStep() { const st = ui.tut; return st ? tutorFor(st.id).steps[st.step] : null; }
function tutorPick(qi, oi) {
  const st = ui.tut, s = tutorStep(), q = s && s.ask && s.ask[qi], o = q && q.opts[oi]; if (!o) return;
  st.picks[qi] = (st.picks[qi] || []).filter(x => x !== oi).concat(oi);
  if (o[1] === true) { SFX.done(); HAP.done(); }
  render(); const box = document.querySelectorAll('#sheet .tq')[qi]; if (box) { const f = box.querySelector('.tfb'); if (f) f.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  if (talkBack()) VOICE.say((o[1] === false ? 'Not quite. ' : o[1] === null ? 'Try this. ' : '') + o[2]);
}
function tutorHint() {
  const st = ui.tut, s = tutorStep(); if (!s) return;
  const H = s.hints || [];
  if (st.hints < H.length) { st.hints++; render(); if (talkBack()) VOICE.say('Hint ' + st.hints + '. ' + H[st.hints - 1]); return; }
  if (talkBack()) VOICE.say(s.show || s.showCode ? 'That\'s all the hints. Say answer to see the answer.' : 'There\'s no hint on this step. Say repeat to hear it again, or tap Ask Claude.');
}
function tutorAnswer() {
  const st = ui.tut, s = tutorStep(); if (!s) return;
  if (!s.show && !s.showCode) { if (talkBack()) VOICE.say('This step has no hidden answer. Say hint, or repeat.'); return; }
  if (st.hints < (s.hints || []).length) { st.hints++; render(); if (talkBack()) VOICE.say('Try this hint first. Hint ' + st.hints + '. ' + s.hints[st.hints - 1]); return; }
  st.shown = true; render(); if (talkBack()) VOICE.say('Here\'s the answer. ' + (s.show || '') + (s.showCode ? ' The code is on screen.' : ''));
}

/* ---------- tutor voice: read aloud and voice commands ---------- */
function speakable(t) {
  return String(t == null ? '' : t).replace(/`/g, '').replace(/\(\.\.\.\)/g, '')
    .replace(/\b1\s?kΩ/g, 'one kilo-ohm').replace(/(\d)\s?kΩ(?= [a-z])/g, '$1 kilo-ohm').replace(/(\d)\s?kΩ/g, '$1 kilo-ohms').replace(/(\d)\s?Ω(?= [a-z])/g, '$1 ohm').replace(/(\d)\s?Ω/g, '$1 ohms').replace(/Ω/g, 'ohms')
    .replace(/(\d)\s?mA\b/g, '$1 milliamps').replace(/(\d)\s?ms\b/g, '$1 milliseconds').replace(/(\d)\s?V\b/g, '$1 volts')
    .replace(/\(\+\)/g, '(plus)').replace(/\(−\)/g, '(minus)').replace(/×/g, ' times ').replace(/÷/g, ' divided by ').replace(/±/g, ' plus or minus ').replace(/−/g, ' minus ')
    .replace(/\bGND\b/g, 'ground').replace(/\bUNO\b/g, 'Uno').replace(/\bCOM(\d)/g, 'com $1').replace(/\b([a-j])(\d{1,2})\b/g, '$1 $2')
    .replace(/==/g, ' equals ').replace(/;/g, ',').replace(/\s+/g, ' ').trim();
}
function stepSpeech(id, k) {
  const T = tutorFor(id), s = T.steps[k], out = ['Step ' + (k + 1) + ' of ' + T.steps.length + '. ' + (s.t || '') + '.'];
  if (k === 0 && T.gear) out.push('Get these out: ' + T.gear.join(', ') + '.');
  [].concat(s.say || []).forEach(x => out.push(x));
  if (s.why) out.push('Why it matters: ' + s.why);
  if (s.do) { const dl = [].concat(s.do); out.push('Your turn.'); dl.forEach((x, i) => out.push((dl.length > 1 ? (i + 1) + '. ' : '') + x)); }
  if (s.code) out.push('The code is on screen.');
  if (s.mission) out.push('Mission: ' + NODE[id].mission);
  (s.ask || []).forEach(q => { out.push('Check. ' + q.q); q.opts.forEach((o, oi) => out.push('Option ' + (oi + 1) + ': ' + o[0] + '.')); });
  return out.join(' ');
}
const NUMW = { one: 1, won: 1, first: 1, 1: 1, two: 2, to: 2, too: 2, second: 2, 2: 2, three: 3, tree: 3, third: 3, 3: 3, four: 4, for: 4, fourth: 4, 4: 4 };
function parseCmd(raw) {
  const t = ' ' + String(raw || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  if (/ (stop listening|stop voice|voice off|go to sleep) /.test(t)) return { c: 'sleep' };
  const m = / (?:option|number|pick|choose|answer is) (\w+) /.exec(t);
  if (m && NUMW[m[1]]) return { c: 'opt', n: NUMW[m[1]] };
  if (/^ (one|two|three|four|1|2|3|4) $/.test(t)) return { c: 'opt', n: NUMW[t.trim()] };
  if (/ (go back|back|previous) /.test(t)) return { c: 'back' };
  if (/ (next|continue|go on|got it) /.test(t)) return { c: 'next' };
  if (/ (repeat|again|say that|read it|read that) /.test(t)) return { c: 'repeat' };
  if (/ (hint|clue|help|stuck) /.test(t)) return { c: 'hint' };
  if (/ (answer|show me) /.test(t)) return { c: 'answer' };
  if (/ mark (it )?(complete|done) /.test(t)) return { c: 'complete' };
  if (/ (quiet|stop|shush|pause|shut up) /.test(t)) return { c: 'hush' };
  return null;
}
function runVoice(c) {
  const st = ui.tut; if (!st || ui.lesson !== '__tutor') { VOICE.stop(); return; }
  const T = tutorFor(st.id), s = T.steps[st.step], last = st.step >= T.steps.length - 1;
  HAP.tap();
  if (c.c === 'sleep') { VOICE.stop(); render(); VOICE.say('Voice commands off.'); return; }
  if (c.c === 'next') { if (last) VOICE.say('That was the last step. Say mark complete when you\'re done.'); else tutorGo(st.step + 1); return; }
  if (c.c === 'back') { if (st.step === 0) VOICE.say('This is the first step.'); else tutorGo(st.step - 1); return; }
  if (c.c === 'repeat') return VOICE.say(stepSpeech(st.id, st.step));
  if (c.c === 'hush') return VOICE.hush();
  if (c.c === 'hint') return tutorHint();
  if (c.c === 'answer') return tutorAnswer();
  if (c.c === 'opt') {
    const qs = s.ask || [], qi = qs.findIndex((q, i) => !(st.picks[i] || []).some(o => q.opts[o][1] === true));
    if (qi < 0) return VOICE.say(qs.length ? 'You\'ve answered the checks on this step. Say next.' : 'There\'s no question on this step.');
    if (c.n > qs[qi].opts.length) return VOICE.say('There are only ' + qs[qi].opts.length + ' options.');
    return tutorPick(qi, c.n - 1);
  }
  if (c.c === 'complete') {
    if (last && !isDone(st.id) && !nodeLock(NODE[st.id])) { complete(st.id); VOICE.say(st.id + ' complete. Nice work.'); }
    else { const lk = nodeLock(NODE[st.id]); VOICE.say(isDone(st.id) ? 'This lesson is already complete.' : !last ? 'Get to the last step first.' : lk ? lk.text + ', so this one can\'t be marked yet.' : 'Get to the last step first.'); }
  }
}
const VOICE = (() => {
  const TTS = () => (NATIVE && Cap.TextToSpeech) || null, SR = () => (NATIVE && Cap.SpeechRecognition) || null;
  const WSR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canSpeak = () => !!(TTS() || (!NATIVE && 'speechSynthesis' in window));
  const canListen = () => !!(SR() || (!NATIVE && WSR));
  let gen = 0, speaking = false, on = false, active = false, handled = false, lastCmd = 0, wrec = null, dog = null, hooked = false;
  function earsOff() {
    if (!active) return; active = false;
    try { if (SR()) SR().stop().catch(() => {}); else if (wrec) wrec.abort(); } catch (e) {}
  }
  function earsOn() {
    if (!on || speaking || active || document.visibilityState !== 'visible') return;
    if (Date.now() - lastCmd > 120000) { stop(); render(); toast('Voice commands off after two quiet minutes'); return; }
    active = true; handled = false;
    if (SR()) { SR().start({ language: 'en-US', maxResults: 3, partialResults: true, popup: false }).catch(() => { active = false; }); return; }
    if (!wrec) {
      wrec = new WSR(); wrec.lang = 'en-US'; wrec.continuous = true; wrec.interimResults = true; wrec.maxAlternatives = 3;
      wrec.onresult = e => { const r = e.results[e.results.length - 1]; heard(Array.from(r).map(a => a.transcript)); };
      wrec.onend = () => { active = false; if (on) setTimeout(earsOn, 300); };
      wrec.onerror = () => { active = false; };
    }
    try { wrec.start(); } catch (e) { active = false; }
  }
  function heard(list) {
    if (handled || !on || speaking) return;
    for (const m of list) { const c = parseCmd(m); if (c) { handled = true; lastCmd = Date.now(); earsOff(); runVoice(c); return; } }
  }
  async function say(text) {
    text = speakable(text); if (!text || !canSpeak()) return;
    const my = ++gen; speaking = true; earsOff();
    try {
      if (TTS()) await TTS().speak({ text, lang: 'en-US', rate: 1.0, pitch: 1.0, volume: 1.0, queueStrategy: 0 });
      else await new Promise(res => {
        const done = () => { clearTimeout(tm); res(); }, tm = setTimeout(done, Math.max(4000, text.length * 90));
        try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.onend = u.onerror = done; speechSynthesis.speak(u); } catch (e) { done(); }
      });
    } catch (e) {}
    if (my === gen) { speaking = false; if (on) setTimeout(earsOn, 250); }
  }
  function hush() {
    gen++; speaking = false;
    try { if (TTS()) TTS().stop().catch(() => {}); else if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) {}
    if (on) setTimeout(earsOn, 250);
  }
  async function start() {
    if (!canListen()) { toast('Voice commands aren\'t available here.'); return false; }
    if (SR()) {
      try {
        const av = await SR().available(); if (!av || !av.available) { toast('Voice commands need Google speech services on the phone.'); return false; }
        let p = await SR().checkPermissions(); if (p.speechRecognition !== 'granted') p = await SR().requestPermissions();
        if (p.speechRecognition !== 'granted') { toast('Allow the microphone for Deck Ops to use voice commands.'); return false; }
        if (!hooked) {
          hooked = true;
          SR().addListener('partialResults', d => heard((d && d.matches) || []));
          SR().addListener('listeningState', d => { if (d && d.status === 'stopped') { active = false; if (on) setTimeout(earsOn, 300); } });
        }
      } catch (e) { toast('Couldn\'t start voice commands.'); return false; }
    }
    on = true; lastCmd = Date.now();
    clearInterval(dog);
    dog = setInterval(async () => {
      if (!on) return;
      if (SR() && active && !speaking) { try { const r = await SR().isListening(); if (r && r.listening === false) active = false; } catch (e) {} }
      earsOn();
    }, 2500);
    earsOn(); return true;
  }
  function stop() { on = false; clearInterval(dog); earsOff(); }
  return { say, hush, start, stop, canSpeak, canListen, listening: () => on, heard };
})();

/* ---------- sheets: lesson, photo, sys ---------- */
function lessonHTML(id) {
  const n = NODE[id], d = isDone(id), lock = d ? null : nodeLock(n), wait = d ? [] : waitingOn(n), ph = phaseById(n.phase);
  const sibs = NODES.filter(x => x.b === n.b), i = sibs.findIndex(x => x.id === id);
  let h = '<div class="sh-head"><span class="big">' + n.id + '</span><div><div class="sh-br">' + esc(BR[n.b].name) + '   phase ' + ph.id + ' ' + esc(ph.name) + '   ' + minsLabel(n.mins) + '   +' + n.xp + ' xp</div><h2 id="sh-title" class="vt">' + esc(n.t) + '</h2></div><button class="x" data-close aria-label="Close lesson">×</button></div><div class="sh-body">';
  if (lock) h += '<p class="warn">' + esc(lock.text) + '. Read ahead freely; you can mark it complete once it opens.</p>';
  if (wait.length) h += '<p class="warn">Waiting on ' + esc(wait.map(p => p.name + etaLabel(p)).join('; ')) + '. Mark the part arrived in the quartermaster when it lands.</p>';
  const tsaved = S.tu[id], tN = tutorFor(id).steps.length;
  h += '<div class="tcta"><button class="btn primary" data-tutor="' + id + '">' + (tsaved && !d ? 'Back to the tutor' : 'Walk me through it') + '</button><span class="muted">' + (tsaved && !d ? 'step ' + (tsaved + 1) + ' of ' + tN : TUTOR[id] ? tN + ' steps, hints before answers' : 'one point at a time') + '</span></div>';
  h += '<p class="lead">' + fmt(n.why) + '</p><ul class="learn">' + n.learn.map(x => '<li>' + fmt(x) + '</li>').join('') + '</ul>';
  if (n.cmd) h += '<table class="cmdt"><tbody>' + n.cmd.map(([c, ds]) => '<tr><td><code>' + esc(c) + '</code></td><td>' + esc(ds) + '</td><td style="text-align:right"><button class="copy" data-copy="' + esc(c) + '" aria-label="Copy ' + esc(c) + '">Copy</button></td></tr>').join('') + '</tbody></table>';
  if (n.code) h += '<div class="code"><button class="copy" data-copycode="' + n.id + '">Copy</button><pre><code>' + esc(n.code) + '</code></pre></div>';
  if (n.links) h += '<p class="links">' + n.links.map(([l, u]) => '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(l) + '</a>').join('') + '</p>';
  h += '<div class="mission"><h3>Mission</h3><p>' + fmt(n.mission) + '</p><p class="donewhen">Done when: ' + fmt(n.done) + '</p></div><div class="sh-actions">' +
    (d ? '<span class="okline">[x] Completed ' + esc(fmtDate(S.done[id])) + '</span><button class="btn ghost" data-undo="' + id + '">Undo</button>' : '<button class="btn primary" data-complete="' + id + '"' + (lock ? ' disabled' : '') + '>Mark complete</button>') +
    '<button class="btn ghost" data-logfor="' + id + '">Log this</button></div>';
  if (n.terms.length) h += '<h3 class="sub">Codex terms</h3><div>' + n.terms.map(t => '<button class="chip" data-term="' + t + '">' + esc(TERM[t].t) + '</button>').join('') + '</div>';
  return h + '<div class="sh-nav">' + (i > 0 ? '<button class="btn ghost" data-open="' + sibs[i - 1].id + '">Previous: ' + sibs[i - 1].id + ' ' + esc(sibs[i - 1].t) + '</button>' : '<span></span>') +
    (i < sibs.length - 1 ? '<button class="btn ghost" data-open="' + sibs[i + 1].id + '">Next: ' + sibs[i + 1].id + ' ' + esc(sibs[i + 1].t) + '</button>' : '') + '</div></div>';
}
function tog(key, label, desc, on) {
  return '<div class="tog"><span><span class="tl">' + esc(label) + '</span>' + (desc ? '<span class="td">' + esc(desc) + '</span>' : '') + '</span><button class="sw" role="switch" aria-checked="' + !!on + '" aria-label="' + esc(label) + '" data-tog="' + key + '"></button></div>';
}
function sysHTML() {
  const sc = S.sched;
  let h = '<div class="sh-head"><span></span><div><div class="sh-br">Deck Ops ' + APP_VERSION + (NATIVE ? '   android app' : '   web app') + '</div><h2 id="sh-title" class="vt">Settings</h2></div><button class="x" data-close aria-label="Close settings">×</button></div><div class="sh-body">';
  h += '<div class="set"><h3>Look</h3><div>' + THEMES.map(([k, l]) => '<button class="chip" data-theme="' + k + '" aria-pressed="' + (DEV.theme === k) + '">' + l + '</button>').join('') + '</div></div>';
  h += '<div class="set"><h3>Sound and feel</h3>' + tog('sound', 'Terminal sounds', 'Key clicks, boot beep, completion chirp', DEV.sound) + tog('haptics', 'Vibration', 'A tap on keys, a buzz on completion', DEV.haptics) + (VOICE.canSpeak() ? tog('speak', 'Tutor reads aloud', 'Reads each tutor step in your phone\'s voice', DEV.speak) : '') + '</div>';
  h += '<div class="set"><h3>Reminders</h3>';
  if (!REM.ok()) h += '<p class="muted">Reminders run in the Android app. The deck night schedule below still syncs to it.</p>';
  else if (ui.notif !== 'granted') h += '<p class="warn">Notifications are off for Deck Ops.</p><div class="row" style="margin-bottom:10px"><button class="btn primary" data-asknotif>Allow notifications</button></div>';
  h += tog('night', 'Weekly deck night', 'With the next lesson in the notification', sc.on) +
    '<div class="row" style="margin:8px 0 12px"><label class="f" style="display:flex;gap:8px;align-items:center">Day <select data-sched="weekday">' + WEEKDAYS.map((w, i) => '<option value="' + (i + 1) + '"' + (sc.weekday === i + 1 ? ' selected' : '') + '>' + w + '</option>').join('') + '</select></label>' +
    '<label class="f" style="display:flex;gap:8px;align-items:center">Time <input type="time" data-sched="time" value="' + String(sc.hour).padStart(2, '0') + ':' + String(sc.minute).padStart(2, '0') + '"></label></div>' +
    tog('remParts', 'Parts due', '8 am on a part\'s ETA', DEV.remParts) + tog('remUpd', 'Monthly update check', '1st of the month, 7 pm, once the deck is running', DEV.remUpd);
  if (REM.ok() && ui.notif === 'granted') h += '<div class="row" style="margin-top:10px"><button class="btn ghost" data-testnotif>Send a test</button></div>';
  h += '</div>';
  h += '<div class="set"><h3>Sync</h3>';
  h += '<p class="kv">Status: <b>' + esc(ui.sync === 'synced' ? 'synced ' + ago(DEV.lastSync) : ui.sync === 'nosync' ? 'not set up' : ui.sync) + '</b>' + (DEV.syncErr ? '<br><span class="warn">' + esc(DEV.syncErr) + '</span>' : '') + '</p>';
  h += '<form class="form" id="syncForm"><div class="two"><label class="f">GitHub user<input name="owner" value="' + esc(DEV.owner) + '" autocapitalize="off" autocomplete="off" spellcheck="false"></label><label class="f">Data repository<input name="repo" value="' + esc(DEV.repo) + '" autocapitalize="off" autocomplete="off" spellcheck="false"></label></div>' +
    '<label class="f">Access key<input name="token" type="password" value="' + esc(DEV.token) + '" placeholder="github_pat_…" autocapitalize="off" autocomplete="off" spellcheck="false"></label>' +
    '<div class="row"><button class="btn primary">Save and sync</button>' + (ghReady() ? '<button type="button" class="btn ghost" data-syncnow>Sync now</button>' : '') + '</div></form>';
  h += '<details style="margin-top:12px"><summary class="linkbtn">How to make the access key</summary><ol class="steps"><li>On github.com, open your profile picture, then Settings, then Developer settings, then Personal access tokens, then Fine-grained tokens.</li><li>Generate new token. Name it deck-ops. Expiration: 1 year.</li><li>Repository access: Only select repositories, then pick ' + esc(DEV.repo) + '.</li><li>Permissions, Repository: Contents, Read and write. Leave the rest.</li><li>Generate, copy it, paste it above. Do the same on each device; the key never leaves the device it\'s on.</li></ol></details></div>';
  h += '<div class="set"><h3>Data</h3><p>Bring progress over from the Claude tracker: tap Copy JSON there, then paste below. A full backup from this app also works.</p>' +
    '<label class="sr" for="imp">Paste JSON</label><textarea id="imp" placeholder="Paste JSON here" style="min-height:80px"></textarea>' +
    '<div class="row" style="margin-top:8px"><button class="btn ghost" data-import>Import</button><button class="btn ghost" data-backup>Copy full backup</button><button class="btn ghost" data-copyjson>Copy quest JSON</button></div><p class="kv" style="margin-top:8px">Quest JSON: completed lessons, dates and xp, tagged Scholar, for the 5-year quest app.</p>' + (ui.importMsg ? '<p class="kv" style="margin-top:8px">' + esc(ui.importMsg) + '</p>' : '') + '</div>';
  h += '<div class="set"><h3>Version</h3><p class="kv">Deck Ops <b>' + APP_VERSION + '</b>' + (ui.update ? '. Version <b>' + esc(ui.update) + '</b> is ready.' : '') + '</p><div class="row">' +
    (NATIVE ? (ui.update ? '<a class="btn primary" href="' + APK_URL + '">Download ' + esc(ui.update) + '</a>' : '') + '<button class="btn ghost" data-checkupd>Check for updates</button>' : '<span class="muted">The web app updates itself.</span>') + '</div></div>';
  return h + '</div>';
}
function openSheet(kind, id) {
  if (kind !== 'tutor') { VOICE.stop(); VOICE.hush(); }
  if (!ui.lesson) ui.lastFocus = document.activeElement;
  ui.lesson = kind === 'lesson' ? id : '__' + kind; ui.sheetArg = id;
  const sh = $('#sheet'); sh.hidden = false; sh.innerHTML = sheetHTML(); sh.scrollTop = 0; hydratePhotos(sh);
  requestAnimationFrame(() => { sh.classList.add('on'); $('#scrim').classList.add('on'); const x = sh.querySelector('[data-close]'); if (x) x.focus({ preventScroll: true }); });
  const want = kind === 'lesson' ? 'node-' + id.toLowerCase() : kind === 'tutor' ? 'tutor-' + id.toLowerCase() : kind === 'sys' ? 'sys' : null;
  if (want && location.hash.slice(1) !== want) { history.pushState(null, '', '#' + want); ui.pushed = true; }
}
function sheetHTML() {
  if (ui.lesson === '__sys') return sysHTML();
  if (ui.lesson === '__tutor') return NODE[ui.sheetArg] ? tutorHTML(ui.sheetArg) : '';
  if (ui.lesson === '__photo') return '<div class="sh-head"><span></span><h2 id="sh-title" class="vt">Photo</h2><button class="x" data-close aria-label="Close photo">×</button></div><div class="sh-body"><img class="photo-full" data-pid="' + esc(ui.sheetArg) + '" alt=""></div>';
  return NODE[ui.lesson] ? lessonHTML(ui.lesson) : '';
}
const openLesson = id => NODE[id] && openSheet('lesson', id);
function closeSheet(fromHistory) {
  if (!ui.lesson) return;
  if (ui.lesson === '__tutor') { VOICE.stop(); VOICE.hush(); }
  const hadHash = /^(node-|tutor-|sys$)/.test(location.hash.slice(1));
  ui.lesson = null;
  const sh = $('#sheet'); sh.classList.remove('on'); $('#scrim').classList.remove('on');
  setTimeout(() => { if (!ui.lesson) { sh.hidden = true; sh.innerHTML = ''; } }, 240);
  if (!fromHistory && hadHash) { if (ui.pushed) history.back(); else history.replaceState(null, '', '#' + ui.view); }
  ui.pushed = false;
  if (ui.lastFocus && document.contains(ui.lastFocus)) ui.lastFocus.focus({ preventScroll: true });
}

/* ---------- render ---------- */
function render() {
  renderStatus(); renderKeys();
  const v = $('#view'), y = window.scrollY, active = document.activeElement;
  const fn = { ops: viewOps, route: viewRoute, skills: viewSkills, parts: viewParts, log: viewLog, codex: viewCodex }[ui.view] || viewOps;
  const keep = active && active.closest && active.closest('#view') ? (active.getAttribute('data-q') != null ? '[data-q]' : active.getAttribute('data-draft') ? '[data-draft="' + active.getAttribute('data-draft') + '"]' : null) : null;
  const selStart = keep && active.selectionStart != null ? active.selectionStart : null;
  v.innerHTML = fn(); window.scrollTo(0, y); hydratePhotos(v);
  if (keep) { const el = v.querySelector(keep); if (el) { el.focus({ preventScroll: true }); if (selStart != null && el.setSelectionRange) try { el.setSelectionRange(selStart, selStart); } catch (e) {} } }
  const shEl = $('#sheet'), typingInSheet = shEl.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  if (ui.lesson && ui.lesson !== '__photo' && !typingInSheet) { const sh = $('#sheet'), st = sh.scrollTop, imp = sh.querySelector('#imp'), impV = imp ? imp.value : null; sh.innerHTML = sheetHTML(); sh.scrollTop = st; if (impV) { const i2 = sh.querySelector('#imp'); if (i2) i2.value = impV; } }
}
function applyTheme() {
  document.documentElement.setAttribute('data-theme', DEV.theme);
  const t = THEMES.find(x => x[0] === DEV.theme) || THEMES[0];
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', t[2]);
}
function go(v) {
  if (ui.lesson) closeSheet(true);
  ui.view = v; ui.confirm = null; ui.pushed = false;
  if (location.hash.slice(1) !== v) history.pushState(null, '', '#' + v);
  render(); window.scrollTo(0, 0); $('#view').focus({ preventScroll: true });
}
function readHash() {
  const h = location.hash.replace('#', '').toLowerCase();
  if (h.startsWith('node-')) {
    const id = h.slice(5).toUpperCase();
    if (NODE[id]) { if (!['skills', 'route', 'ops'].includes(ui.view)) ui.view = 'skills'; ui.branch = NODE[id].b; render(); if (ui.lesson !== id) { ui.lesson = null; openSheet('lesson', id); } return; }
  }
  if (h.startsWith('tutor-')) {
    const id = h.slice(6).toUpperCase();
    if (NODE[id]) { if (!['skills', 'route', 'ops'].includes(ui.view)) ui.view = 'skills'; ui.branch = NODE[id].b; render(); if (!(ui.lesson === '__tutor' && ui.sheetArg === id)) { ui.lesson = null; openTutor(id); } return; }
  }
  if (h === 'sys') { render(); if (ui.lesson !== '__sys') { ui.lesson = null; openSheet('sys'); } return; }
  if (ui.lesson) closeSheet(true);
  if (VIEWS.some(x => x[0] === h)) ui.view = h;
  render();
}

/* ---------- actions ---------- */
function complete(id) {
  const before = PHASES.map(phaseState);
  put('done', id, todayISO());
  const after = PHASES.map(phaseState);
  let msg = id + ' complete, +' + NODE[id].xp + ' xp';
  PHASES.forEach((p, i) => {
    if (before[i] !== 'cleared' && after[i] === 'cleared') msg = 'Phase ' + p.id + ' ' + p.name + ' cleared';
    else if (before[i] === 'locked' && after[i] !== 'locked') msg += '. Phase ' + p.id + ' ' + p.name + ' is open';
  });
  SFX.done(); HAP.done(); commit(msg);
}
function newDraft(node) {
  ui.editing = null;
  ui.draft = { date: todayISO(), t: node ? NODE[node].id + ' ' + NODE[node].t : '', body: '', tags: node ? [BR_TAG[NODE[node].b]] : [], node: node || '', freq: '', mode: 'FM', photo: null };
}
function questExport() {
  const skills = NODES.filter(n => isDone(n.id)).map(n => ({ id: n.id, branch: BR[n.b].name, title: n.t, xp: n.xp, completedAt: S.done[n.id] }));
  const phases = PHASES.map(p => { const st = phaseState(p); return { id: p.id, name: p.name, status: st, clearedAt: st === 'cleared' ? p.obj.map(o => S.done[o]).sort().pop() : null }; });
  const b = budget(null);
  return { source: 'deck-ops', schema: 1, exportedAt: new Date().toISOString(), discipline: 'Scholar', project: 'Cyberdeck', started: S.started, xp: xpTotal(),
    lessonsDone: skills.length, lessonsTotal: NODES.length, phases, skills, budget: { currency: 'CAD', planned: Math.round(b.planned * 100) / 100, spent: Math.round(b.spent * 100) / 100 }, logEntries: liveLog().length };
}
function doImport(text) {
  let j; try { j = JSON.parse(text); } catch (e) { return 'That isn\'t valid JSON. Copy it again and paste the whole thing.'; }
  if (j && j.kind === 'deckops-backup' && j.state) {
    S = mergeState(S, normalize(j.state)); LOG = mergeLog(LOG, Array.isArray(j.log) ? j.log : []); saveLog(); commit();
    return 'Backup merged.';
  }
  if (j && j.source === 'deck-ops' && Array.isArray(j.skills)) {
    let n = 0; j.skills.forEach(s => { if (NODE[s.id] && !isDone(s.id)) { put('done', s.id, s.completedAt || todayISO()); n++; } });
    if (j.started && j.started < S.started) put('started', null, j.started);
    commit(); return n + ' lesson' + (n === 1 ? '' : 's') + ' imported. Re-tap any part statuses; the old export doesn\'t carry them.';
  }
  return 'That JSON isn\'t from Deck Ops.';
}

document.addEventListener('click', async ev => {
  const t = ev.target.closest('button, [data-phase], a');
  if (!t) { if (ev.target.id === 'scrim') closeSheet(); return; }
  if (t.tagName === 'BUTTON' && !t.disabled && !t.hasAttribute('data-complete')) { SFX.click(); HAP.tap(); }
  const a = k => t.getAttribute(k);
  if (a('data-go') != null) return go(a('data-go'));
  if (a('data-open') != null) return openLesson(a('data-open'));
  if (a('data-close') != null) return closeSheet();
  if (a('data-sys') != null) { REM.check().then(() => { if (ui.lesson === '__sys') render(); }); return openSheet('sys'); }
  if (a('data-phase') != null) { ui.phase = Number(a('data-phase')); render(); const g = document.querySelector('.blk[data-phase="' + ui.phase + '"]'); if (g) g.focus({ preventScroll: true }); return; }
  if (a('data-routeto') != null) { ui.phase = Number(a('data-routeto')); return go('route'); }
  if (a('data-branchto') != null) { ui.branch = a('data-branchto'); return go('skills'); }
  if (a('data-branch') != null) { ui.branch = a('data-branch'); return render(); }
  if (a('data-complete') != null) return complete(a('data-complete'));
  if (a('data-tutor') != null) return openTutor(a('data-tutor'));
  if (a('data-tgo') != null) return tutorGo(Number(a('data-tgo')));
  if (a('data-tpick') != null && ui.tut) { const [qi, oi] = a('data-tpick').split(':').map(Number); return tutorPick(qi, oi); }
  if (a('data-thint') != null && ui.tut) return tutorHint();
  if (a('data-tshow') != null && ui.tut) return tutorAnswer();
  if (a('data-tspeak') != null && ui.tut) { DEV.speak = !DEV.speak; saveDev(); render(); if (DEV.speak) VOICE.say(stepSpeech(ui.tut.id, ui.tut.step)); else VOICE.hush(); return; }
  if (a('data-tlisten') != null && ui.tut) {
    if (VOICE.listening()) { VOICE.stop(); render(); return; }
    const ok = await VOICE.start(); render();
    if (ok) VOICE.say('Listening. Say next, back, repeat, hint, or answer.');
    return;
  }
  if (a('data-copyt') != null) { const [id, k, f] = a('data-copyt').split(':'), s = tutorFor(id).steps[Number(k)]; return copyText(s[f], 'Code copied'); }
  if (a('data-askclaude') != null) { const [id, k] = a('data-askclaude').split(':'); try { navigator.clipboard.writeText(claudePrompt(id, Number(k))).catch(() => {}); } catch (e) {} return; }
  if (a('data-undo') != null) { put('done', a('data-undo'), null); return commit(a('data-undo') + ' marked not done'); }
  if (a('data-copy') != null) return copyText(a('data-copy'));
  if (a('data-copycode') != null) return copyText(NODE[a('data-copycode')].code, 'Code copied');
  if (a('data-term') != null) {
    const id = a('data-term'); ui.codexTab = 'terms'; ui.q = ''; ui.flashTerm = id; go('codex');
    const el = document.getElementById('t-' + id); if (el) el.scrollIntoView({ block: 'center' });
    setTimeout(() => { ui.flashTerm = null; const e2 = document.getElementById('t-' + id); if (e2) e2.classList.remove('flash'); }, 1600); return;
  }
  if (a('data-safety') != null) { ui.codexTab = 'safety'; return go('codex'); }
  if (a('data-ctab') != null) { ui.codexTab = a('data-ctab'); ui.q = ''; return render(); }
  if (a('data-ahead') != null) { put('ahead', a('data-ahead'), true); return commit(); }
  if (a('data-status') != null) {
    const id = a('data-status'), p = partById(id); if (!p) return;
    const next = STATUSES[(STATUSES.indexOf(p.status) + 1) % STATUSES.length];
    if (p.custom) { const c = Object.assign({}, S.custom[id], { status: next }); if (next !== 'wanted' && c.paid == null && c.price != null) c.paid = c.price; put('custom', id, c); }
    else { const o = Object.assign({}, S.parts[id], { status: next }); if (next !== 'wanted' && o.paid == null && p.price != null) o.paid = p.price; put('parts', id, o); }
    return commit((p.short || p.name.split(',')[0]) + ': ' + next);
  }
  if (a('data-delpart') != null) { put('custom', a('data-delpart'), null); return commit('Part removed'); }
  if (a('data-newlog') != null) { newDraft(null); if (ui.view !== 'log') return go('log'); return render(); }
  if (a('data-logfor') != null) { const id = a('data-logfor'); closeSheet(true); newDraft(id); return go('log'); }
  if (a('data-logtag') != null) { ui.logTag = a('data-logtag'); return render(); }
  if (a('data-dtag') != null) { const tg = a('data-dtag'), d = ui.draft; d.tags = d.tags.includes(tg) ? d.tags.filter(x => x !== tg) : d.tags.concat(tg); return render(); }
  if (a('data-cancellog') != null) { ui.draft = null; ui.editing = null; return render(); }
  if (a('data-dropphoto') != null) { ui.draft.photo = null; return render(); }
  if (a('data-snap') != null) {
    ui.uploading = true; render();
    try { const blob = await takePhoto(); ui.draft.photo = await attachPhoto(blob); toast('Photo attached'); }
    catch (e) { if (!/cancel/i.test(String(e && e.message))) toast('Couldn\'t get that photo. Try again.'); }
    ui.uploading = false; return render();
  }
  if (a('data-editlog') != null) {
    const e = LOG.find(x => x.id === a('data-editlog')); if (!e) return;
    ui.editing = e.id; ui.draft = { date: e.date || todayISO(), t: e.t || '', body: e.body || '', tags: (e.tags || []).slice(), node: e.node || '', freq: e.freq || '', mode: e.mode || 'FM', photo: e.photo || null };
    render(); window.scrollTo(0, 0); return;
  }
  if (a('data-askdel') != null) { ui.confirm = a('data-askdel'); return render(); }
  if (a('data-keep') != null) { ui.confirm = null; return render(); }
  if (a('data-dellog') != null) {
    const id = a('data-dellog'), e = LOG.find(x => x.id === id); ui.confirm = null;
    if (e) { if (e.photo) IDB.del(e.photo).catch(() => {}); Object.keys(e).forEach(k => { if (!['id', 'created'].includes(k)) delete e[k]; }); e.del = true; e.u = Date.now(); }
    saveLog(); commit('Entry deleted'); return;
  }
  if (a('data-photo') != null) return openSheet('photo', a('data-photo'));
  if (a('data-copyjson') != null) return copyText(JSON.stringify(questExport(), null, 2), 'Quest JSON copied');
  if (a('data-theme') != null) { DEV.theme = a('data-theme'); saveDev(); applyTheme(); return render(); }
  if (a('data-tog') != null) {
    const k = a('data-tog');
    if (k === 'night') put('sched', null, Object.assign({}, S.sched, { on: !S.sched.on }));
    else { DEV[k] = !DEV[k]; saveDev(); }
    if (k === 'night' || k === 'remParts' || k === 'remUpd') { if (REM.ok() && ui.notif !== 'granted') await REM.ask(); }
    return commit();
  }
  if (a('data-intro') != null) { DEV.introSeen = true; saveDev(); return render(); }
  if (a('data-asknotif') != null) return REM.ask();
  if (a('data-testnotif') != null) return REM.test();
  if (a('data-syncnow') != null) return syncNow(true);
  if (a('data-checkupd') != null) return checkUpdate(true);
  if (a('data-backup') != null) return copyText(JSON.stringify({ kind: 'deckops-backup', v: 2, exportedAt: new Date().toISOString(), state: S, log: LOG }), 'Full backup copied');
  if (a('data-import') != null) { const ta = $('#imp'); ui.importMsg = doImport(ta ? ta.value : ''); if (ta) ta.value = ''; return render(); }
});

document.addEventListener('keydown', ev => {
  const g = ev.target.closest && ev.target.closest('.blk');
  if (g && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); g.dispatchEvent(new MouseEvent('click', { bubbles: true })); return; }
  if (ev.key === 'Escape' && ui.lesson) { ev.preventDefault(); return closeSheet(); }
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName) || ev.altKey || ev.ctrlKey || ev.metaKey) return;
  const m = /^F([1-6])$/.exec(ev.key) || /^([1-6])$/.exec(ev.key);
  if (m) { ev.preventDefault(); go(VIEWS[Number(m[1]) - 1][0]); }
});
document.addEventListener('input', ev => {
  const el = ev.target;
  if (el.hasAttribute('data-q')) { ui.q = el.value; render(); return; }
  const k = el.getAttribute('data-draft');
  if (k && ui.draft) { ui.draft[k] = el.value; if (k === 'node' && el.value && !ui.draft.t) { ui.draft.t = el.value + ' ' + NODE[el.value].t; render(); } }
});
document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.hasAttribute('data-paid')) {
    const id = el.getAttribute('data-paid'), v = el.value === '' ? null : Math.max(0, Number(el.value));
    if (S.custom[id]) put('custom', id, Object.assign({}, S.custom[id], { paid: v })); else put('parts', id, Object.assign({}, S.parts[id], { paid: v }));
    return commit();
  }
  if (el.hasAttribute('data-eta')) {
    const id = el.getAttribute('data-eta');
    if (S.custom[id]) put('custom', id, Object.assign({}, S.custom[id], { eta: el.value })); else put('parts', id, Object.assign({}, S.parts[id], { eta: el.value }));
    return commit(el.value ? 'ETA set. You\'ll get a reminder that morning.' : null);
  }
  if (el.hasAttribute('data-sched')) {
    const k = el.getAttribute('data-sched'), sc = Object.assign({}, S.sched);
    if (k === 'weekday') sc.weekday = Number(el.value);
    if (k === 'time' && /^\d\d:\d\d$/.test(el.value)) { sc.hour = Number(el.value.slice(0, 2)); sc.minute = Number(el.value.slice(3)); }
    put('sched', null, sc); return commit('Deck night: ' + WEEKDAYS[sc.weekday - 1] + 's at ' + hhmm(sc.hour, sc.minute));
  }
});
document.addEventListener('submit', async ev => {
  ev.preventDefault();
  const f = ev.target;
  if (f.id === 'addPart') {
    const fd = new FormData(f), name = String(fd.get('name') || '').trim(); if (!name) return;
    const url = String(fd.get('url') || '').trim(), id = 'c' + uid();
    put('custom', id, { id, name, phase: Number(fd.get('phase')), price: fd.get('price') === '' ? null : Number(fd.get('price')), where: String(fd.get('where') || '').trim(), url: /^https?:\/\//.test(url) ? url : '', status: 'wanted', paid: null, eta: '' });
    return commit('Part added');
  }
  if (f.id === 'logForm' && ui.draft) {
    const d = ui.draft; if (!d.t.trim()) { toast('Give the entry a title.'); return; }
    const prev = ui.editing ? LOG.find(x => x.id === ui.editing) : null;
    const entry = { id: prev ? prev.id : 'l' + uid(), date: d.date || todayISO(), t: d.t.trim().slice(0, 140), body: d.body.slice(0, 8000), tags: d.tags, node: d.node || null,
      freq: d.tags.includes('Signal') ? d.freq.trim() : '', mode: d.tags.includes('Signal') ? d.mode : '', photo: d.photo || null, created: prev ? prev.created : Date.now(), u: Date.now() };
    LOG = LOG.filter(x => x.id !== entry.id).concat(entry); saveLog();
    ui.draft = null; ui.editing = null; commit('Entry saved'); return;
  }
  if (f.id === 'syncForm') {
    const fd = new FormData(f);
    DEV.owner = String(fd.get('owner') || '').trim(); DEV.repo = String(fd.get('repo') || '').trim(); DEV.token = String(fd.get('token') || '').trim();
    saveDev(); render(); syncNow(true);
  }
});

window.addEventListener('popstate', readHash);
window.addEventListener('hashchange', readHash);
window.addEventListener('online', () => syncNow());
window.addEventListener('offline', () => { ui.sync = ghReady() ? 'offline' : 'nosync'; renderStatus(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { render(); syncNow(); } else if (VOICE.listening()) { VOICE.stop(); VOICE.hush(); } });
let rt = null;
window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (ui.view === 'route' && ui.layout !== (window.innerWidth >= 760 ? 'wide' : 'tall')) render(); }, 150); });

/* ---------- native hooks ---------- */
if (NATIVE) {
  try {
    Cap.App.addListener('backButton', ({ canGoBack }) => {
      if (ui.lesson) return closeSheet();
      if (ui.view !== 'ops') return go('ops');
      Cap.App.minimizeApp ? Cap.App.minimizeApp() : Cap.App.exitApp();
    });
    Cap.App.addListener('resume', () => { render(); syncNow(); REM.resched(); });
  } catch (e) {}
  try {
    Cap.LocalNotifications.addListener('localNotificationActionPerformed', a => {
      const g = a && a.notification && a.notification.extra && a.notification.extra.go;
      if (g) location.hash = g;
    });
  } catch (e) {}
}

/* ---------- boot ---------- */
function boot() {
  let seen = false; try { seen = sessionStorage.getItem('deckops.boot') === '1'; sessionStorage.setItem('deckops.boot', '1'); } catch (e) {}
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (seen || reduce) return;
  const el = $('#boot'), tx = $('#bootText');
  const lines = ['deck-ops ' + APP_VERSION, 'phosphor warm-up ........ ok', 'lessons loaded .......... ' + NODES.length, 'route plotted ........... ' + PHASES.length + ' phases', ghReady() ? 'uplink .................. ' + DEV.repo : 'uplink .................. this device', 'ready'];
  el.hidden = false; let i = 0;
  const done = () => { el.classList.add('out'); setTimeout(() => { el.hidden = true; }, 380); };
  const step = () => { tx.textContent = lines.slice(0, ++i).join('\n') + (i < lines.length ? '\n_' : ''); if (i < lines.length) setTimeout(step, 150); else { SFX.boot(); setTimeout(done, 380); } };
  el.addEventListener('click', done, { once: true });
  step();
}

if (!NATIVE && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
applyTheme();
ui.sync = ghReady() ? (navigator.onLine ? 'syncing' : 'offline') : 'nosync';
readHash();
boot();
setTimeout(() => { syncNow(); checkUpdate(false); REM.resched(); }, 900);
})();
