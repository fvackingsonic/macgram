// Музыка macgram (кнопка с нотой): каталог — открытый Deezer (поиск, исполнители, альбомы, чарты,
// обложки), звук — полный трек из ваших чатов и каналов Telegram (без видео). Если трека в Telegram
// нет — играет 30-секундный отрывок Deezer.
import { S, changed, tick, setPref, download, fileUrl, fileOf, showHud } from './store.js';
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
// у новых релизов Deezer иногда ещё нет картинки — адрес вида …/cover//250x250… (пустой), такой не берём
const okImg = u => (u && !/\/(cover|artist)\/\//.test(u) ? u : '');
const big = o => okImg(o?.cover_big || o?.cover_medium || o?.picture_big || o?.picture_medium);
export const artistOf = a => a && ({ id: a.id, name: a.name, img: okImg(a.picture_big || a.picture_medium), fans: a.nb_fan || 0 });
const TYPES = { single: 'Сингл', ep: 'EP', compile: 'Сборник' };
export const albumOf = (al, artist) => al && ({ id: al.id, title: al.title, img: big(al), small: okImg(al.cover_medium || al.cover_small) || big(al), year: (al.release_date || '').slice(0, 4),
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
const BAD = /(^|\s)(live|remix|sped|slowed|reverb|nightcore|karaoke|instrumental|cover|8d|acapella|bass boosted|акустик\S*|ремикс|кавер|минус)(\s|$)/;
const audioOf = m => (m?.content?.['@type'] === 'messageAudio' ? m.content.audio : null);
async function searchTg(query, limit = 50) {
  const r = await send({ '@type': 'searchMessages', chat_list: null, query, offset: '', limit, filter: { '@type': 'searchMessagesFilterAudio' }, chat_type_filter: null, min_date: 0, max_date: 0 });
  return (r.messages || []).filter(audioOf);
}
// Оценка кандидата: название обязательно; исполнитель, длительность (точно до пары секунд), без
// ремиксов/live/sped up, качество файла (битрейт), альбом в подписи/имени файла.
function score(m, t) {
  const a = audioOf(m);
  const title = norm(a.title || a.file_name), perf = norm(`${a.performer} ${a.file_name}`);
  const tt = norm(t.title).replace(/ (feat|ft|with|prod)\b.*$/, ''), ta = norm(t.artist?.name);
  if (!tt || !title.includes(tt)) return -1;
  let sc = 40;
  if (ta && perf.includes(ta)) sc += 30; else if (ta && title.includes(ta)) sc += 20;
  if (BAD.test(`${title} ${norm(a.file_name)}`) && !BAD.test(norm(`${t.title} ${t.version}`))) sc -= 35;
  if (a.duration && t.dur) { const d = Math.abs(a.duration - t.dur); sc += d <= 2 ? 12 : d <= 5 ? 4 : -Math.min(35, d / 2); }
  const kbps = a.audio?.size && a.duration ? a.audio.size * 8 / a.duration / 1000 : 0;
  if (kbps >= 250) sc += 4; else if (kbps && kbps < 120) sc -= 6;
  const al = norm(t.album?.title);
  if (al && al.length > 2 && norm(`${m.content.caption?.text || ''} ${a.file_name}`).includes(al)) sc += 5;
  return sc;
}

// ── сверка обложки: «отпечаток» картинки 8×8 (dHash), сравниваем число отличающихся битов ──
const hashCache = new Map();
function loadImg(src) {
  return new Promise((ok, no) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = no; i.src = src; setTimeout(no, 8000); });
}
async function dhash(src) {
  if (!src) return null;
  if (hashCache.has(src)) return hashCache.get(src);
  const p = (async () => {
    let img;
    try { img = await loadImg(src); } catch { return null; }
    const c = document.createElement('canvas'); c.width = 9; c.height = 8;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, 9, 8);
    let d; try { d = g.getImageData(0, 0, 9, 8).data; } catch { return null; } // картинку не дали прочитать — не сверяем
    const L = i => d[i * 4] * .299 + d[i * 4 + 1] * .587 + d[i * 4 + 2] * .114, bits = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits.push(L(y * 9 + x) > L(y * 9 + x + 1) ? 1 : 0);
    return bits;
  })();
  hashCache.set(src, p);
  return p;
}
const dist = (a, b) => a.reduce((n, v, i) => n + (v !== b[i]), 0);
// обложка каталога (через Rust, чтобы картинку можно было прочитать) и мини-обложка из Telegram
async function catalogCoverHash(t) {
  const u = t.album?.small || t.album?.img;
  if (!u) return null;
  if (!T) return dhash(u);
  try { return await dhash(await T.core.invoke('image_data', { url: u })); } catch { return null; }
}
const tgCoverHash = m => { const mt = audioOf(m)?.album_cover_minithumbnail; return mt?.data ? dhash(`data:image/jpeg;base64,${mt.data}`) : Promise.resolve(null); };

// ── поиск в Telegram: ваши чаты → публичные каналы ──
async function chatAudios(chatId, query) {
  const r = await send({ '@type': 'searchChatMessages', chat_id: chatId, query, from_message_id: 0, offset: 0, limit: 30, filter: { '@type': 'searchMessagesFilterAudio' } });
  return (r.messages || []).filter(audioOf);
}
async function publicCandidates(t) {
  const out = [], q = `${t.artist?.name || ''} ${t.title}`.trim();
  // 1) глобальный поиск по постам публичных каналов — только если сегодня он ещё бесплатный (звёзды не тратим)
  try {
    const lim = await send({ '@type': 'getPublicPostSearchLimits', query: q });
    if (lim?.is_current_query_free) {
      MU.loadNote = 'Ищу по всем каналам Telegram…'; changed();
      const r = await send({ '@type': 'searchPublicPosts', query: q, offset: '', limit: 50, star_count: 0 });
      out.push(...(r.messages || []).filter(audioOf));
    }
  } catch {}
  // 2) публичные каналы, похожие на исполнителя и на музыкальные, — ищем трек внутри них (вступать не нужно)
  MU.loadNote = 'Ищу в музыкальных каналах…'; changed();
  const ids = new Set();
  for (const pq of [t.artist?.name, `${t.artist?.name} music`, `${t.artist?.name} музыка`].filter(Boolean)) {
    try { const r = await send({ '@type': 'searchPublicChats', query: pq }); (r.chat_ids || []).slice(0, 5).forEach(id => ids.add(id)); } catch {}
    if (ids.size >= 10) break;
  }
  const lists = await Promise.allSettled([...ids].slice(0, 10).map(id => chatAudios(id, t.title)));
  for (const l of lists) if (l.status === 'fulfilled') out.push(...l.value);
  return out;
}
const FK = 'mg.music.found';
const found = (() => { try { return JSON.parse(localStorage.getItem(FK) || '{}'); } catch { return {}; } })();
const tgFound = new Map();
async function findTg(t) {
  if (t.tg) return t.tg;
  if (tgFound.has(t.id)) return tgFound.get(t.id);
  // трек из медиатеки, взятый из Telegram, — то же сообщение
  if (t.src) { try { const m = await send({ '@type': 'getMessage', chat_id: t.src.c, message_id: t.src.m }); if (audioOf(m)) { tgFound.set(t.id, m); return m; } } catch {} }
  // уже находили раньше — берём то же сообщение
  const f = found[t.id];
  if (f) { try { const m = await send({ '@type': 'getMessage', chat_id: f.c, message_id: f.m }); if (audioOf(m)) { tgFound.set(t.id, m); return m; } } catch {} }
  const cands = [];
  for (const q of [`${t.artist?.name || ''} ${t.title}`.trim(), t.title]) {
    try { cands.push(...await searchTg(q)); } catch {}
    if (cands.some(m => score(m, t) >= 80)) break;
  }
  let pub = false;
  if (!cands.some(m => score(m, t) >= 70)) { pub = true; cands.push(...await publicCandidates(t)); }
  // лучшие по названию/исполнителю/длительности — сверяем обложку
  const seen = new Set();
  const top = cands.map(m => ({ m, sc: score(m, t) })).filter(x => x.sc >= 45 && !seen.has(`${x.m.chat_id}_${x.m.id}`) && seen.add(`${x.m.chat_id}_${x.m.id}`))
    .sort((a, b) => b.sc - a.sc).slice(0, 8);
  if (top.length) {
    MU.loadNote = 'Сверяю обложку и длительность…'; changed();
    const ref = await catalogCoverHash(t);
    if (ref) for (const x of top) {
      const h = await tgCoverHash(x.m);
      if (!h) continue;
      const d = dist(ref, h);
      x.sc += d <= 10 ? 18 : d <= 18 ? 6 : -12; // та же обложка — почти наверняка тот же релиз
    }
    top.sort((a, b) => b.sc - a.sc);
  }
  const best = top[0] && top[0].sc >= (pub ? 60 : 50) ? top[0].m : null;
  tgFound.set(t.id, best);
  if (best) { found[t.id] = { c: best.chat_id, m: best.id }; try { localStorage.setItem(FK, JSON.stringify(found)); } catch {} }
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
  MU.mode = 'preview'; MU.err = `${why || 'Полная версия не нашлась ни в ваших чатах, ни в каналах Telegram'} — играет отрывок 30 с`;
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
  MU.cur = t; MU.pos = 0; MU.dur = t.dur || 0; MU.at = performance.now(); MU.state = 'loading'; MU.err = ''; MU.mode = ''; MU.loadNote = 'Ищу в ваших чатах и каналах…';
  if (!String(t.id).startsWith('tg')) remember(t);
  if (MU.open && MU.view.kind !== 'track') go({ kind: 'track' });
  changed();
  let m = null;
  try { m = await findTg(t); } catch {}
  if (n !== playSeq) return;
  if (!m) { toPreview(); return; }
  // обложка: если у трека нет своей — берём из Telegram
  if (!t.album?.tgThumb) { const a = audioOf(m); const th = a.album_cover_thumbnail?.file || a.external_album_covers?.[0]?.file || null; if (th) { t.album = { ...(t.album || {}), tgThumb: th }; changed(); } }
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

// ── медиатека: избранное и плейлисты (хранятся на этом компьютере) ──
const LK = 'mg.music.lib';
MU.lib = (() => { try { const v = JSON.parse(localStorage.getItem(LK) || 'null'); return v && Array.isArray(v.fav) ? v : null; } catch { return null; } })() || { fav: [], lists: [] };
const saveLib = () => { try { localStorage.setItem(LK, JSON.stringify(MU.lib)); } catch {} changed(); };
// в медиатеку кладём только нужное; трек из Telegram — ссылкой на сообщение
const slimFile = f => (f ? { id: f.id, size: f.size, expected_size: f.expected_size, local: { can_be_downloaded: true } } : null);
export const slim = t => ({ id: t.id, title: t.title, version: t.version || '', dur: t.dur || 0, explicit: !!t.explicit, preview: t.preview || '',
  artist: t.artist ? { id: t.artist.id, name: t.artist.name, img: t.artist.img || '' } : null,
  album: t.album ? { id: t.album.id, title: t.album.title || '', img: t.album.img || '', small: t.album.small || '', year: t.album.year || '', type: t.album.type || '', tgThumb: slimFile(t.album.tgThumb) } : null,
  src: t.tg ? { c: t.tg.chat_id, m: t.tg.id } : t.src || null });
export const isFav = t => !!t && MU.lib.fav.some(x => x.id === t.id);
export function toggleFav(t) {
  if (!t) return;
  if (isFav(t)) { MU.lib.fav = MU.lib.fav.filter(x => x.id !== t.id); showHud('Убрано из избранного'); }
  else { MU.lib.fav = [slim(t), ...MU.lib.fav]; showHud('Добавлено в избранное'); }
  saveLib();
}
export const listById = id => MU.lib.lists.find(l => l.id === id);
export function newList(name, t) {
  const l = { id: `p${Date.now().toString(36)}`, name: (name || '').trim() || 'Новый плейлист', tracks: t ? [slim(t)] : [], at: Date.now() };
  MU.lib.lists = [l, ...MU.lib.lists];
  saveLib();
  showHud(t ? `Добавлено в «${l.name}»` : `Плейлист «${l.name}» создан`);
  return l;
}
export function addToList(id, t) {
  const l = listById(id); if (!l || !t) return;
  if (l.tracks.some(x => x.id === t.id)) { showHud(`Уже есть в «${l.name}»`); return; }
  l.tracks = [...l.tracks, slim(t)];
  saveLib(); showHud(`Добавлено в «${l.name}»`);
}
export function removeFromList(id, t) { const l = listById(id); if (!l) return; l.tracks = l.tracks.filter(x => x.id !== t.id); saveLib(); }
export function renameList(id, name) { const l = listById(id); if (!l || !name.trim()) return; l.name = name.trim(); saveLib(); }
export function deleteList(id) { MU.lib.lists = MU.lib.lists.filter(l => l.id !== id); saveLib(); if (MU.view.kind === 'list' && MU.view.id === id) back(); }
export function moveInList(id, from, to) {
  const l = listById(id); if (!l || from === to) return;
  const a = [...l.tracks]; const [x] = a.splice(from, 1); a.splice(to, 0, x); l.tracks = a; saveLib();
}

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
