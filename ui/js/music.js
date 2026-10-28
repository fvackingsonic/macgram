// Музыка macgram (кнопка с нотой): каталог — открытый Deezer (поиск, исполнители, альбомы, чарты,
// обложки), звук — полный трек из ваших чатов и каналов Telegram (без видео). Если трека в Telegram
// нет — играет 30-секундный отрывок Deezer.
import { S, changed, tick, setPref, download, fileUrl, fileOf } from './store.js';
import { send } from './td.js';

const T = window.__TAURI__;
export const MU = S.mu = {
  open: false, closing: false, stack: [], view: { kind: 'home' }, q: '', search: null, charts: null,
  queue: [], qi: -1, cur: null, mode: '', state: '', pos: 0, dur: 0, at: 0, err: '', from: 0, fromMsg: 0,
  vol: S.prefs.musicVol ?? 80, repeat: 0, shuffle: false, mine: null, loadNote: '', loadPct: 0,
};

// ── каталог Deezer (через Rust: catalog_get dz/…, без ключей) ──
const cache = new Map();
function get(query) {
  if (cache.has(query)) return cache.get(query);
  const p = (T ? T.core.invoke('catalog_get', { query }) : window.__mockCatalog ? Promise.resolve(window.__mockCatalog(query)) : Promise.reject(new Error('Каталог работает в программе для Windows')))
    .then(j => { if (j?.error) throw new Error(j.error.message || 'Каталог недоступен'); return j; });
  p.catch(() => cache.delete(query));
  cache.set(query, p);
  return p;
}
const dz = path => get(`dz/${path}`);
const big = o => o?.cover_big || o?.cover_medium || o?.picture_big || o?.picture_medium || '';
export const artistOf = a => a && ({ id: a.id, name: a.name, img: a.picture_big || a.picture_medium || '', fans: a.nb_fan || 0 });
const TYPES = { single: 'Сингл', ep: 'EP', compile: 'Сборник' };
export const albumOf = (al, artist) => al && ({ id: al.id, title: al.title, img: big(al), small: al.cover_medium || al.cover_small || big(al), year: (al.release_date || '').slice(0, 4),
  type: TYPES[al.record_type] || 'Альбом', single: al.record_type === 'single' || al.record_type === 'ep', count: al.nb_tracks, artist: artistOf(al.artist || artist) });
export const trackOf = (t, album, i) => t && ({ id: t.id, title: t.title_short || t.title, version: t.title_version || '', dur: t.duration || 0, explicit: !!t.explicit_lyrics,
  preview: t.preview || '', artist: artistOf(t.artist), album: album || albumOf(t.album), n: t.track_position || (i != null ? i + 1 : 0) });

export function loadCharts() {
  if (MU.charts) return;
  MU.charts = { loading: true };
  dz('chart/0/tracks?limit=25').then(r => { MU.charts = { tracks: (r.data || []).map(x => trackOf(x)) }; changed(); })
    .catch(e => { MU.charts = { tracks: [], err: e.message }; changed(); });
}

let searchT = 0, seq = 0;
export function setQuery(q) {
  MU.q = q;
  clearTimeout(searchT);
  if (!q.trim()) { MU.search = null; if (MU.view.kind === 'search') { MU.view = { kind: 'home' }; MU.stack = []; } changed(); return; }
  if (MU.view.kind !== 'search') { MU.stack = []; MU.view = { kind: 'search' }; }
  MU.search = { ...(MU.search || {}), loading: true };
  changed();
  searchT = setTimeout(() => {
    const n = ++seq, e = encodeURIComponent(q.trim());
    Promise.allSettled([dz(`search?q=${e}&limit=15`), dz(`search/artist?q=${e}&limit=8`), dz(`search/album?q=${e}&limit=12`)]).then(([t, a, al]) => {
      if (n !== seq) return;
      if (t.status === 'rejected' && a.status === 'rejected') { MU.search = { err: String(t.reason?.message || t.reason) }; changed(); return; }
      MU.search = { tracks: (t.value?.data || []).map(x => trackOf(x)), artists: (a.value?.data || []).map(artistOf), albums: (al.value?.data || []).map(x => albumOf(x)) };
      changed();
    });
  }, 300);
}

export function openArtist(a) {
  const v = { kind: 'artist', id: a.id, name: a.name, artist: a.img ? a : null, top: null, albums: null };
  go(v);
  const id = a.id ? Promise.resolve(a.id) : dz(`search/artist?q=${encodeURIComponent(a.name)}&limit=1`).then(r => r.data?.[0]?.id);
  id.then(aid => {
    if (!aid) { v.top = []; v.albums = []; changed(); return; }
    v.id = aid;
    dz(`artist/${aid}`).then(r => { v.artist = artistOf(r); changed(); }).catch(() => {});
    dz(`artist/${aid}/top?limit=10`).then(r => { v.top = (r.data || []).map(x => trackOf(x)); changed(); }).catch(() => { v.top = []; changed(); });
    dz(`artist/${aid}/albums?limit=80`).then(r => {
      const seen = new Set();
      v.albums = (r.data || []).map(x => albumOf(x, { id: aid, name: v.name })).filter(x => !seen.has(x.title.toLowerCase()) && seen.add(x.title.toLowerCase()))
        .sort((x, y) => (y.year || '').localeCompare(x.year || ''));
      changed();
    }).catch(() => { v.albums = []; changed(); });
  }).catch(() => { v.top = []; v.albums = []; changed(); });
}
export function openAlbum(al) {
  const v = { kind: 'album', id: al.id, album: al, tracks: null };
  go(v);
  dz(`album/${al.id}`).then(r => {
    v.album = albumOf(r);
    v.tracks = (r.tracks?.data || []).map((t, i) => trackOf(t, v.album, i));
    changed();
  }).catch(() => { v.tracks = []; changed(); });
}

// ── история «Недавно играло» ──
const HK = 'mg.music.hist';
MU.hist = (() => { try { return JSON.parse(localStorage.getItem(HK) || '[]'); } catch { return []; } })();
function remember(t) {
  MU.hist = [t, ...MU.hist.filter(h => h.id !== t.id)].slice(0, 30);
  try { localStorage.setItem(HK, JSON.stringify(MU.hist)); } catch {}
}

// ── где играть: Telegram (полный трек из ваших чатов и каналов, без видео) ──
const norm = s => (s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const BAD = /\b(live|remix|sped|slowed|reverb|nightcore|karaoke|instrumental|cover|8d|акустик|ремикс|кавер)\b/;
const audioOf = m => (m?.content?.['@type'] === 'messageAudio' ? m.content.audio : null);
async function searchTg(query, limit = 50) {
  const r = await send({ '@type': 'searchMessages', chat_list: null, query, offset: '', limit, filter: { '@type': 'searchMessagesFilterAudio' }, chat_type_filter: null, min_date: 0, max_date: 0 });
  return (r.messages || []).filter(audioOf);
}
function score(m, t) {
  const a = audioOf(m);
  const title = norm(a.title || a.file_name), perf = norm(`${a.performer} ${a.file_name}`);
  const tt = norm(t.title).replace(/ (feat|ft|with|prod)\b.*$/, ''), ta = norm(t.artist?.name);
  if (!tt || !title.includes(tt)) return -1;
  let sc = 40;
  if (ta && perf.includes(ta)) sc += 30; else if (ta && title.includes(ta)) sc += 20;
  if (BAD.test(`${title} ${norm(a.file_name)}`) && !BAD.test(norm(`${t.title} ${t.version}`))) sc -= 35;
  if (a.duration && t.dur) sc -= Math.min(30, Math.abs(a.duration - t.dur) / 3);
  return sc;
}
const tgFound = new Map();
async function findTg(t) {
  if (t.tg) return t.tg;
  if (tgFound.has(t.id)) return tgFound.get(t.id);
  let best = null, bs = 45;
  for (const q of [`${t.artist?.name || ''} ${t.title}`.trim(), t.title]) {
    let list = [];
    try { list = await searchTg(q); } catch { continue; }
    for (const m of list) { const sc = score(m, t); if (sc > bs) { bs = sc; best = m; } }
    if (best && bs >= 70) break;
  }
  tgFound.set(t.id, best);
  return best;
}
// трек из Telegram в вид каталога (для списка «Музыка из ваших каналов»)
export function tgTrack(m) {
  const a = audioOf(m);
  return { id: `tg${m.chat_id}_${m.id}`, title: a.title || (a.file_name || 'Без названия').replace(/\.[a-z0-9]+$/i, ''), version: '', dur: a.duration || 0,
    artist: a.performer ? { name: a.performer } : null, album: { title: '', img: '', small: '', tgThumb: a.album_cover_thumbnail?.file || a.external_album_covers?.[0]?.file || null },
    tg: m, chat: m.chat_id };
}
export function loadMine() {
  if (MU.mine) return;
  MU.mine = { loading: true };
  searchTg('', 60).then(list => {
    const seen = new Set();
    MU.mine = { tracks: list.map(tgTrack).filter(t => { const k = norm(`${t.artist?.name} ${t.title}`); return !seen.has(k) && seen.add(k); }) };
    changed();
  }).catch(() => { MU.mine = { tracks: [] }; changed(); });
}

// ── воспроизведение ──
const audio = new Audio();
audio.preload = 'auto';
let waitT = 0;
audio.addEventListener('timeupdate', () => { MU.pos = audio.currentTime; MU.at = performance.now(); tick(); });
audio.addEventListener('loadedmetadata', () => { if (isFinite(audio.duration)) { MU.dur = audio.duration; changed(); } });
audio.addEventListener('play', () => { MU.state = 'playing'; window.dispatchEvent(new CustomEvent('mg-play', { detail: 'music' })); changed(); });
audio.addEventListener('pause', () => { if (MU.state !== 'ended' && MU.state !== 'loading') { MU.state = 'paused'; changed(); } });
audio.addEventListener('ended', () => { MU.state = 'ended'; ended(); });
audio.addEventListener('error', () => { if (MU.cur && MU.mode === 'tg' && MU.cur.preview) toPreview('Файл не открылся'); });
// заиграло голосовое или музыка в чате — плеер с нотой на паузу
window.addEventListener('mg-play', e => { if (e.detail !== 'music' && !audio.paused) audio.pause(); });

function startAudio(src) {
  audio.src = src; audio.volume = MU.vol / 100;
  audio.play().catch(() => { MU.state = 'paused'; changed(); });
}
function toPreview(why) {
  const t = MU.cur;
  if (!t) return;
  clearInterval(waitT);
  if (!t.preview) { MU.mode = ''; MU.state = 'paused'; MU.err = why || 'Этого трека нет в ваших чатах и каналах Telegram'; audio.pause(); changed(); return; }
  MU.mode = 'preview'; MU.err = `${why || 'Полной версии нет в ваших чатах и каналах'} — играет отрывок 30 с`;
  MU.pos = 0; MU.dur = 30; MU.state = 'loading';
  startAudio(t.preview);
  changed();
}

let playSeq = 0;
export async function play(t, list) {
  if (!t) return;
  if (list) { MU.queue = list; MU.qi = Math.max(0, list.findIndex(x => x.id === t.id)); }
  else { const i = MU.queue.findIndex(x => x.id === t.id); if (i >= 0) MU.qi = i; else { MU.queue = [t]; MU.qi = 0; } }
  const n = ++playSeq;
  clearInterval(waitT);
  audio.pause();
  MU.cur = t; MU.pos = 0; MU.dur = t.dur || 0; MU.at = performance.now(); MU.state = 'loading'; MU.err = ''; MU.mode = ''; MU.loadNote = 'Ищу трек в ваших каналах…';
  if (!String(t.id).startsWith('tg')) remember(t);
  if (MU.open && MU.view.kind !== 'track') go({ kind: 'track' });
  changed();
  let m = null;
  try { m = await findTg(t); } catch {}
  if (n !== playSeq) return;
  if (!m) { toPreview(); return; }
  // обложка: если у трека нет своей — берём из Telegram
  if (!t.album?.img && !t.album?.tgThumb) { const a = audioOf(m); t.album = { ...(t.album || {}), tgThumb: a.album_cover_thumbnail?.file || a.external_album_covers?.[0]?.file || null }; }
  MU.mode = 'tg'; MU.from = m.chat_id; MU.fromMsg = m.id; MU.loadNote = 'Загружаю из Telegram…';
  const file = audioOf(m).audio;
  download(file, 32);
  changed();
  const ready = () => {
    if (n !== playSeq) { clearInterval(waitT); return; }
    const url = fileUrl(file);
    if (!url) { const f = fileOf(file); MU.loadPct = f?.size ? Math.round((f.local?.downloaded_size || 0) / f.size * 100) : 0; tick(); return; }
    clearInterval(waitT); MU.loadNote = '';
    startAudio(url);
  };
  waitT = setInterval(ready, 250);
  ready();
}

function ended() {
  if (MU.repeat === 2) { seek(0); audio.play().catch(() => {}); return; }
  const nx = neighbor(1);
  if (nx) play(nx); else { MU.state = 'paused'; MU.pos = 0; changed(); }
}
export function neighbor(dir) {
  const q = MU.queue;
  if (!q.length) return null;
  if (MU.shuffle && dir > 0 && q.length > 1) { let i; do i = Math.floor(Math.random() * q.length); while (i === MU.qi); return q[i]; }
  const i = MU.qi + dir;
  return q[i] || (MU.repeat === 1 ? q[dir > 0 ? 0 : q.length - 1] : null);
}
export const next = () => { const t = neighbor(1); if (t) play(t); };
export function prev() { if (position() > 3) { seek(0); return; } const t = neighbor(-1); if (t) play(t); else seek(0); }
export function toggle() {
  if (!MU.cur) return;
  if (MU.state === 'loading') return;
  if (!MU.mode) { play(MU.cur); return; }
  if (audio.paused) { if (MU.state === 'ended') audio.currentTime = 0; audio.play().catch(() => {}); } else audio.pause();
}
export function pause() { audio.pause(); }
export function seek(sec) { MU.pos = sec; MU.at = performance.now(); if (MU.mode) audio.currentTime = sec; tick(); }
let volT = 0;
export function setVolume(v) {
  MU.vol = Math.round(Math.max(0, Math.min(100, v)));
  audio.volume = MU.vol / 100;
  clearTimeout(volT); volT = setTimeout(() => setPref('musicVol', MU.vol), 400);
  changed();
}
export const setRepeat = r => { MU.repeat = r; changed(); };
export const setShuffle = on => { MU.shuffle = on; changed(); };
// «Закрыть трек»: остановить и вернуть ноту
export function stop() {
  playSeq++; clearInterval(waitT);
  audio.pause(); audio.removeAttribute('src');
  MU.cur = null; MU.mode = ''; MU.state = ''; MU.err = '';
  if (MU.view.kind === 'track') back();
  changed();
}
export const playing = () => MU.state === 'playing' || MU.state === 'loading';
export function position() {
  const p = MU.state === 'playing' ? MU.pos + (performance.now() - MU.at) / 1000 : MU.pos;
  return Math.max(0, Math.min(p, MU.dur || p));
}
setInterval(() => { if (MU.state === 'playing') tick(); }, 500);

// ── панель ──
export function togglePanel(force, view) {
  const open = force ?? !(MU.open && !MU.closing);
  if (open) {
    MU.open = true; MU.closing = false;
    if (view) { MU.stack = []; MU.view = view; }
    loadCharts(); loadMine();
  } else if (MU.open) { MU.closing = true; setTimeout(() => { if (MU.closing) { MU.open = false; MU.closing = false; changed(); } }, 200); }
  changed();
}
export function go(view) { MU.stack.push(MU.view); MU.view = view; changed(); }
export function back() { MU.view = MU.stack.pop() || { kind: 'home' }; changed(); }
export function home() { MU.stack = []; MU.view = { kind: 'home' }; MU.q = ''; MU.search = null; changed(); }
