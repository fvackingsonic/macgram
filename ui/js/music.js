// Музыка macgram (кнопка с нотой): каталог — открытый Deezer (поиск, исполнители, альбомы, чарты),
// звук — официальный встроенный плеер YouTube: видео играет вместо обложки на странице трека, а когда
// страница закрыта — в маленьком окошке (YouTube требует, чтобы плеер был виден, не меньше 200×200).
// Если полной версии на YouTube нет — играет 30-секундный отрывок Deezer.
import { S, changed, tick, showHud, setPref } from './store.js';

const T = window.__TAURI__;
export const MU = S.mu = {
  open: false, closing: false, stack: [], view: { kind: 'home' }, q: '', search: null, charts: null,
  queue: [], qi: -1, cur: null, mode: '', yt: '', state: '', pos: 0, dur: 0, at: 0, err: '',
  vol: S.prefs.musicVol ?? 80, repeat: 0, shuffle: false, mini: true, ready: false,
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

// ── YouTube: какой ролик играть (song.link находит этот трек на YouTube) ──
const YK = 'mg.music.yt';
const ytIds = (() => { try { return JSON.parse(localStorage.getItem(YK) || '{}'); } catch { return {}; } })();
async function ytFor(t) {
  if (t.id in ytIds) return ytIds[t.id];
  let id = '';
  try {
    const r = await get(`sl/links?url=${encodeURIComponent(`https://www.deezer.com/track/${t.id}`)}&userCountry=UA`);
    const L = r?.linksByPlatform || {};
    const url = L.youtube?.url || L.youtubeMusic?.url || '';
    id = (url.match(/[?&]v=([\w-]{11})/) || url.match(/youtu\.be\/([\w-]{11})/) || [])[1] || '';
  } catch { return ''; } // сеть/лимит — не запоминаем, попробуем в следующий раз
  ytIds[t.id] = id;
  try { localStorage.setItem(YK, JSON.stringify(ytIds)); } catch {}
  return id;
}

// ── воспроизведение ──
const audio = new Audio(); // 30-секундные отрывки Deezer
audio.preload = 'auto';
let frame = null;          // iframe YouTube (создаёт MusicVideoHost и регистрирует здесь)
let pendingYt = '', listenT = 0, watchdog = 0;
export function attachFrame(f) {
  frame = f;
  if (!f) return;
  f.addEventListener('load', () => {
    // протокол встроенного плеера YouTube: подписываемся на события, пока он не ответит
    clearInterval(listenT);
    let n = 0;
    listenT = setInterval(() => { if (MU.ready || ++n > 40) { clearInterval(listenT); return; } msg({ event: 'listening', id: 1, channel: 'widget' }); }, 250);
  });
}
const msg = o => { try { frame?.contentWindow?.postMessage(JSON.stringify(o), '*'); } catch {} };
const cmd = (func, args = []) => msg({ event: 'command', func, args, id: 1, channel: 'widget' });
window.addEventListener('message', e => {
  if (!frame || e.source !== frame.contentWindow || !/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin)) return;
  let d; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
  if (!d?.event) return;
  if (d.event === 'onReady' || d.event === 'initialDelivery') {
    if (!MU.ready) {
      MU.ready = true; cmd('addEventListener', ['onStateChange']); cmd('addEventListener', ['onError']); cmd('setVolume', [MU.vol]);
      // пока плеер грузился, выбрали другой трек
      if (MU.mode === 'yt' && MU.yt && frame.__vid !== MU.yt) { frame.__vid = MU.yt; cmd('loadVideoById', [MU.yt, 0]); }
    }
  }
  const info = d.info;
  if (d.event === 'infoDelivery' && info && typeof info === 'object') {
    if (typeof info.currentTime === 'number') { MU.pos = info.currentTime; MU.at = performance.now(); }
    if (typeof info.duration === 'number' && info.duration > 0) MU.dur = info.duration;
    if (typeof info.playerState === 'number') state(info.playerState);
    tick();
  }
  if (d.event === 'onStateChange') state(typeof info === 'number' ? info : info?.playerState);
  if (d.event === 'onError') { clearTimeout(watchdog); toPreview('YouTube не даёт включить это видео здесь'); }
});
function state(s) {
  if (MU.mode !== 'yt') return;
  const was = MU.state;
  if (s === 1) { MU.state = 'playing'; clearTimeout(watchdog); MU.err = ''; }
  else if (s === 2) MU.state = 'paused';
  else if (s === 3) MU.state = MU.state === 'paused' ? 'paused' : 'loading';
  else if (s === 0) { MU.state = 'ended'; ended(); }
  if (was !== MU.state) changed();
}

audio.addEventListener('timeupdate', () => { if (MU.mode === 'preview') { MU.pos = audio.currentTime; MU.at = performance.now(); tick(); } });
audio.addEventListener('loadedmetadata', () => { if (MU.mode === 'preview' && isFinite(audio.duration)) { MU.dur = audio.duration; changed(); } });
audio.addEventListener('play', () => { if (MU.mode === 'preview') { MU.state = 'playing'; changed(); } });
audio.addEventListener('pause', () => { if (MU.mode === 'preview' && MU.state !== 'ended') { MU.state = 'paused'; changed(); } });
audio.addEventListener('ended', () => { if (MU.mode === 'preview') { MU.state = 'ended'; ended(); } });

function toPreview(why) {
  const t = MU.cur;
  if (!t) return;
  cmd('stopVideo');
  if (!t.preview) { MU.mode = ''; MU.state = 'paused'; MU.err = why || 'Не нашлось на YouTube'; changed(); return; }
  MU.mode = 'preview'; MU.yt = ''; MU.err = why ? `${why} — играет отрывок 30 с` : 'Полной версии на YouTube нет — играет отрывок 30 с';
  MU.pos = 0; MU.dur = 30; MU.state = 'loading';
  audio.src = t.preview; audio.volume = MU.vol / 100; audio.play().catch(() => {});
  changed();
}

let playSeq = 0;
export async function play(t, list) {
  if (!t) return;
  if (list) { MU.queue = list; MU.qi = Math.max(0, list.findIndex(x => x.id === t.id)); }
  else { const i = MU.queue.findIndex(x => x.id === t.id); if (i >= 0) MU.qi = i; else { MU.queue = [t]; MU.qi = 0; } }
  const n = ++playSeq;
  audio.pause();
  MU.cur = t; MU.pos = 0; MU.dur = t.dur || 0; MU.at = performance.now(); MU.state = 'loading'; MU.err = ''; MU.mini = true;
  remember(t);
  if (MU.open && MU.view.kind !== 'track') go({ kind: 'track' });
  changed();
  const id = await ytFor(t);
  if (n !== playSeq) return;
  if (!id) { toPreview(); return; }
  MU.mode = 'yt'; MU.yt = id;
  clearTimeout(watchdog);
  // встроенный плеер не ответил — не ждём вечно, включаем отрывок
  watchdog = setTimeout(() => { if (n === playSeq && MU.mode === 'yt' && MU.state !== 'playing' && MU.state !== 'paused') toPreview('YouTube не отвечает'); }, 12000);
  if (frame && MU.ready) { frame.__vid = id; cmd('loadVideoById', [id, 0]); cmd('setVolume', [MU.vol]); }
  pendingYt = id;
  changed(); // MusicVideoHost создаст iframe с этим роликом
}
export const pendingVideo = () => pendingYt;

function ended() {
  if (MU.repeat === 2) { seek(0); resume(); return; }
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
function resume() { if (MU.mode === 'yt') cmd('playVideo'); else if (MU.mode === 'preview') audio.play().catch(() => {}); }
export function toggle() {
  if (!MU.cur) return;
  const playing = MU.state === 'playing' || MU.state === 'loading';
  if (MU.mode === 'yt') { cmd(playing ? 'pauseVideo' : 'playVideo'); MU.state = playing ? 'paused' : 'playing'; MU.pos = position(); MU.at = performance.now(); MU.mini = true; }
  else if (MU.mode === 'preview') { if (playing) audio.pause(); else { if (MU.state === 'ended') audio.currentTime = 0; audio.play().catch(() => {}); } }
  else play(MU.cur);
  changed();
}
export function pause() { if (MU.mode === 'yt') cmd('pauseVideo'); else audio.pause(); if (MU.state === 'playing' || MU.state === 'loading') MU.state = 'paused'; changed(); }
export function seek(sec) {
  MU.pos = sec; MU.at = performance.now();
  if (MU.mode === 'yt') cmd('seekTo', [sec, true]); else if (MU.mode === 'preview') audio.currentTime = sec;
  tick();
}
let volT = 0;
export function setVolume(v) {
  MU.vol = Math.round(Math.max(0, Math.min(100, v)));
  if (MU.mode === 'yt') cmd('setVolume', [MU.vol]); audio.volume = MU.vol / 100;
  clearTimeout(volT); volT = setTimeout(() => setPref('musicVol', MU.vol), 400);
  changed();
}
export const setRepeat = r => { MU.repeat = r; changed(); };
export const setShuffle = on => { MU.shuffle = on; changed(); };
// «Закрыть трек»: остановить и вернуть ноту
export function stop() {
  playSeq++; clearTimeout(watchdog);
  cmd('stopVideo'); audio.pause(); audio.removeAttribute('src');
  MU.cur = null; MU.mode = ''; MU.yt = ''; MU.state = ''; MU.err = '';
  if (MU.view.kind === 'track') back();
  changed();
}
// Мини-окошко скрыли — YouTube нельзя играть невидимым, поэтому пауза.
export function hideMini() { MU.mini = false; if (MU.mode === 'yt') pause(); else changed(); }
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
    loadCharts();
  } else if (MU.open) { MU.closing = true; setTimeout(() => { if (MU.closing) { MU.open = false; MU.closing = false; changed(); } }, 200); }
  changed();
}
export function go(view) { MU.stack.push(MU.view); MU.view = view; changed(); }
export function back() { MU.view = MU.stack.pop() || { kind: 'home' }; changed(); }
export function home() { MU.stack = []; MU.view = { kind: 'home' }; MU.q = ''; MU.search = null; changed(); }
export function openOnYouTube() {
  const t = MU.cur; if (!t) return;
  const url = MU.yt ? `https://www.youtube.com/watch?v=${MU.yt}` : `https://www.youtube.com/results?search_query=${encodeURIComponent(`${t.artist?.name || ''} ${t.title}`)}`;
  (T ? T.core.invoke('plugin:opener|open_url', { url }) : Promise.resolve(window.open(url, '_blank', 'noopener'))).catch(e => showHud(String(e?.message || e)));
}
