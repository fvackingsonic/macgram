// Плеер Spotify (кнопка с нотой). Что играет и управление — через Windows (работает и без Premium),
// библиотека и поиск — Spotify Web API после входа (OAuth PKCE, свой Client ID пользователя).
import { S, changed, tick, showHud, setPref } from './store.js';

const T = window.__TAURI__;
const PORT = 43821;
export const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = 'user-read-private user-library-read user-library-modify playlist-read-private playlist-read-collaborative user-read-playback-state user-modify-playback-state user-read-currently-playing user-read-recently-played user-top-read';
const LS = 'mg.spotify';

export const SP = S.spot = {
  open: false, closing: false, stack: [], view: { kind: 'home' }, q: '', search: null,
  now: null, thumb: '', key: '', vol: null, hiddenKey: '', me: null, home: null, connecting: false, pending: null,
};

// ── Windows: что играет ──
const invoke = (cmd, args) => (T ? T.core.invoke(cmd, args) : window.__mockSpotify ? Promise.resolve(window.__mockSpotify(cmd, args)) : Promise.reject(new Error('Плеер Spotify работает в программе для Windows')));
let pollT = 0, lastPoll = 0;
async function poll() {
  clearTimeout(pollT);
  lastPoll = Date.now();
  try {
    const n = await invoke('spotify_now', { have: SP.key });
    if (n?.found) {
      if (n.thumb) SP.thumb = n.thumb;
      if (n.key !== SP.key) { SP.key = n.key; if (!n.thumb) SP.thumb = ''; if (SP.pending && sameTrack(SP.pending, n)) SP.pending = null; remember(n); }
      SP.now = { ...n, at: performance.now() };
    } else { SP.now = null; SP.key = ''; SP.thumb = ''; }
  } catch { SP.now = null; }
  changed();
  schedule();
}
function schedule() {
  clearTimeout(pollT);
  // чаще — пока открыта панель или играет; реже — когда окно свёрнуто или Spotify молчит
  const ms = document.hidden ? 15000 : SP.open ? 1000 : SP.now?.playing ? 2000 : 5000;
  pollT = setTimeout(poll, ms);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastPoll > 1500) poll(); else schedule(); });
setTimeout(poll, 1500);
const sameTrack = (t, n) => (t.name || '').toLowerCase() === (n.title || '').toLowerCase();

// Позиция между опросами — по часам, кольцо и ползунок идут плавно.
export function position() {
  const n = SP.now;
  if (!n) return 0;
  const p = n.playing ? n.pos + (performance.now() - n.at) / 1000 : n.pos;
  return Math.min(p, n.dur || p);
}
setInterval(() => { if (SP.now?.playing) tick(); }, 500);

export async function ctl(action, value = 0) {
  if (SP.now) {
    if (action === 'toggle') { SP.now.pos = position(); SP.now.at = performance.now(); SP.now.playing = !SP.now.playing; }
    if (action === 'seek') { SP.now.pos = value; SP.now.at = performance.now(); }
    if (action === 'shuffle') SP.now.shuffle = value > .5;
    if (action === 'repeat') SP.now.repeat = value;
    changed(); tick();
  }
  try { await invoke('spotify_ctl', { action, value }); } catch (e) { showHud(String(e?.message || e)); }
  setTimeout(poll, action === 'next' || action === 'prev' ? 450 : 250);
}
export function close() {
  // «Закрыть трек»: пауза, вместо капсулы снова нота (пока музыку не включат снова)
  SP.hiddenKey = SP.key;
  if (SP.now?.playing) ctl('pause'); else changed();
}
export const capsuleVisible = () => !!SP.now && !(SP.hiddenKey === SP.key && !SP.now.playing);

let volT = 0;
export function getVolume() { invoke('spotify_volume', { value: -1 }).then(v => { SP.vol = v; changed(); }).catch(() => {}); }
export function setVolume(v) {
  SP.vol = v; changed();
  clearTimeout(volT);
  volT = setTimeout(() => invoke('spotify_volume', { value: v }).catch(() => {}), 40);
}

// ── вход в Spotify ──
const saved = () => { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch { return null; } };
const save = t => { try { t ? localStorage.setItem(LS, JSON.stringify(t)) : localStorage.removeItem(LS); } catch {} };
export const loggedIn = () => !!window.__mockSpotifyApi || !!saved()?.refresh;
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rand = n => b64url(crypto.getRandomValues(new Uint8Array(n)));

export async function connect(clientId) {
  clientId = (clientId || '').trim();
  if (!/^[0-9a-f]{32}$/i.test(clientId)) { showHud('Client ID — это 32 буквы и цифры из настроек приложения Spotify'); return; }
  if (!T) { showHud('Вход работает в программе для Windows'); return; }
  setPref('spotifyClientId', clientId);
  SP.connecting = true; changed();
  try {
    const verifier = rand(48), state = rand(12);
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const wait = T.core.invoke('spotify_auth_wait', { port: PORT });
    const url = `https://accounts.spotify.com/authorize?${new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: REDIRECT, code_challenge_method: 'S256', code_challenge: challenge, state, scope: SCOPES })}`;
    await T.core.invoke('spotify_open', { uri: url });
    const q = new URLSearchParams(await wait);
    if (q.get('error')) throw new Error(q.get('error') === 'access_denied' ? 'Вход отменён' : `Spotify: ${q.get('error')}`);
    if (q.get('state') !== state) throw new Error('Ответ Spotify не совпал — попробуйте ещё раз');
    const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error_description || j.error || 'Spotify не выдал доступ');
    save({ access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in - 60) * 1000, client: clientId });
    SP.me = null; SP.home = null;
    showHud('Spotify подключён');
    loadHome();
  } catch (e) {
    const m = String(e?.message || e);
    showHud(/INVALID_CLIENT|invalid_client/i.test(m) ? 'Spotify не узнал Client ID — проверьте его' : /redirect/i.test(m) ? `Добавьте в приложении Spotify адрес ${REDIRECT}` : m);
  } finally { SP.connecting = false; changed(); }
}
export function disconnect() { save(null); SP.me = null; SP.home = null; home(); showHud('Spotify отключён'); }

async function token() {
  const t = saved();
  if (!t?.refresh) throw new Error('Войдите в Spotify');
  if (t.access && Date.now() < t.exp) return t.access;
  const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: t.client }) });
  const j = await r.json();
  if (!r.ok) { if (j.error === 'invalid_grant') save(null); throw new Error('Войдите в Spotify снова'); }
  save({ ...t, access: j.access_token, refresh: j.refresh_token || t.refresh, exp: Date.now() + (j.expires_in - 60) * 1000 });
  return j.access_token;
}
const cache = new Map();
export async function api(path, { method = 'GET', body, fresh } = {}) {
  if (window.__mockSpotifyApi) return window.__mockSpotifyApi(path, method, body);
  const key = method === 'GET' ? path : '';
  if (key && !fresh && cache.has(key) && Date.now() - cache.get(key).t < 120000) return cache.get(key).v;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`https://api.spotify.com/v1/${path}`, { method, headers: { Authorization: `Bearer ${await token()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401 && attempt === 0) { const t = saved(); if (t) save({ ...t, exp: 0 }); continue; }
    if (r.status === 429) { await new Promise(ok => setTimeout(ok, Math.min(5, Number(r.headers.get('Retry-After')) || 1) * 1000)); continue; }
    if (r.status === 204) return null;
    const j = await r.json().catch(() => null);
    if (!r.ok) { const e = new Error(j?.error?.message || `Spotify: ошибка ${r.status}`); e.status = r.status; e.reason = j?.error?.reason; throw e; }
    if (key) cache.set(key, { t: Date.now(), v: j });
    return j;
  }
  throw new Error('Spotify не отвечает');
}

// ── без Premium: открытый каталог Deezer (поиск, исполнители, альбомы, чарты) ──
// Данные приводятся к виду Spotify, поэтому экраны одни и те же. Включить трек: song.link находит
// этот же трек в Spotify, и он открывается в приложении Spotify на компьютере.
export const free = () => !loggedIn();
const fcache = new Map();
function dz(path) {
  if (fcache.has(path)) return fcache.get(path);
  const p = invoke('catalog_get', { query: `dz/${path}` }).then(j => { if (j?.error) throw new Error(j.error.message || 'Каталог недоступен'); return j; });
  p.catch(() => fcache.delete(path));
  fcache.set(path, p);
  return p;
}
const dzImgs = (o, kind) => o ? [[`${kind}_xl`, 1000], [`${kind}_big`, 500], [`${kind}_medium`, 250], [`${kind}_small`, 56]].filter(([k]) => o[k]).map(([k, w]) => ({ url: o[k], width: w, height: w })) : [];
const dzArtist = a => a && ({ id: `dz${a.id}`, dz: a.id, name: a.name, images: dzImgs(a, 'picture'), followers: { total: a.nb_fan || 0 }, genres: [] });
const RT = { single: 'single', ep: 'single', compile: 'compilation' };
const dzAlbum = (al, artist) => al && ({ id: `dz${al.id}`, dz: al.id, name: al.title, images: dzImgs(al, 'cover'), release_date: al.release_date || '', total_tracks: al.nb_tracks,
  album_type: RT[al.record_type] || 'album', artists: [dzArtist(al.artist || artist)].filter(Boolean), uri: '' });
const dzTrack = (t, album, i) => t && ({ id: `dz${t.id}`, dz: t.id, name: t.title_short || t.title, duration_ms: (t.duration || 0) * 1000, explicit: !!t.explicit_lyrics,
  artists: [dzArtist(t.artist)].filter(Boolean), album: album || dzAlbum(t.album), track_number: t.track_position || (i != null ? i + 1 : undefined), uri: '', preview: t.preview });

function freeSearch(q) {
  const e = encodeURIComponent(q);
  return Promise.allSettled([dz(`search?q=${e}&limit=12`), dz(`search/artist?q=${e}&limit=8`), dz(`search/album?q=${e}&limit=12`)]).then(([t, a, al]) => {
    if (t.status === 'rejected' && a.status === 'rejected') throw t.reason;
    return { tracks: (t.value?.data || []).map(x => dzTrack(x)), artists: (a.value?.data || []).map(dzArtist), albums: (al.value?.data || []).map(x => dzAlbum(x)), playlists: [] };
  });
}
function freeArtist(v) {
  const id = String(v.id).replace(/^dz/, '');
  const run = id && /^\d+$/.test(id) ? Promise.resolve(id) : dz(`search/artist?q=${encodeURIComponent(v.name)}&limit=1`).then(r => r.data?.[0]?.id);
  run.then(aid => {
    if (!aid) { v.top = []; v.albums = []; changed(); return; }
    dz(`artist/${aid}`).then(r => { v.artist = dzArtist(r); changed(); }).catch(() => {});
    dz(`artist/${aid}/top?limit=10`).then(r => { v.top = (r.data || []).map(x => dzTrack(x)); changed(); }).catch(() => { v.top = []; changed(); });
    dz(`artist/${aid}/albums?limit=60`).then(r => {
      const seen = new Set(), a = { id: aid, name: v.name };
      v.albums = (r.data || []).map(x => dzAlbum(x, a)).filter(x => !seen.has(x.name.toLowerCase()) && seen.add(x.name.toLowerCase()))
        .sort((x, y) => (y.release_date || '').localeCompare(x.release_date || ''));
      changed();
    }).catch(() => { v.albums = []; changed(); });
  }).catch(() => { v.top = []; v.albums = []; changed(); });
}
function freeAlbum(v) {
  dz(`album/${String(v.id).replace(/^dz/, '')}`).then(r => {
    const al = dzAlbum(r);
    v.album = al;
    v.tracks = (r.tracks?.data || []).map((t, i) => dzTrack(t, al, i));
    changed();
  }).catch(() => { v.tracks = []; changed(); });
}
export function loadCharts() {
  if (SP.charts) return;
  SP.charts = { loading: true };
  dz('chart/0/tracks?limit=20').then(r => { SP.charts = { tracks: (r.data || []).map(x => dzTrack(x)) }; changed(); })
    .catch(() => { SP.charts = { tracks: [] }; changed(); });
}

// История: что играло в Spotify (видно через Windows) — список «Недавно играло» без входа.
const HK = 'mg.spotify.hist';
SP.hist = (() => { try { return JSON.parse(localStorage.getItem(HK) || '[]'); } catch { return []; } })();
const saveHist = () => { try { localStorage.setItem(HK, JSON.stringify(SP.hist.slice(0, 40))); } catch {} };
function remember(n) {
  if (!n.title) return;
  const k = `${n.artist}|${n.title}`.toLowerCase();
  const old = SP.hist.find(h => h.k === k);
  SP.hist = [{ k, name: n.title, artists: n.artist.split(/,\s*/).filter(Boolean).map(name => ({ name })), album: old?.album || { name: n.album || '', images: [] }, dz: old?.dz },
    ...SP.hist.filter(h => h.k !== k)].slice(0, 40);
  saveHist();
  coverFor(SP.hist[0]);
}
// обложку и номер трека в каталоге для истории находим один раз
function coverFor(h) {
  if (h.dz || h.miss) return;
  dz(`search?q=${encodeURIComponent(`artist:"${h.artists[0]?.name || ''}" track:"${h.name}"`)}&limit=1`).then(r => {
    const t = r.data?.[0];
    if (!t) { h.miss = true; saveHist(); return; }
    const x = dzTrack(t);
    h.dz = x.dz; h.id = x.id; h.album = x.album; h.duration_ms = x.duration_ms;
    h.artists = h.artists.map((a, i) => (i === 0 ? { ...a, id: x.artists[0]?.id } : a));
    saveHist(); changed();
  }).catch(() => {});
}
export function histTracks() { SP.hist.slice(0, 12).forEach(coverFor); return SP.hist; }

// Найти трек в Spotify (по треку из каталога) и открыть его в приложении Spotify.
async function spotifyUri(t) {
  let id = t.dz;
  if (!id) {
    const r = await dz(`search?q=${encodeURIComponent(`${t.artists?.[0]?.name || ''} ${t.name}`)}&limit=1`).catch(() => null);
    id = r?.data?.[0]?.id;
  }
  if (id) {
    try {
      const r = await invoke('catalog_get', { query: `sl/links?url=${encodeURIComponent(`https://www.deezer.com/track/${id}`)}&userCountry=UA` });
      const sp = r?.linksByPlatform?.spotify;
      const uri = sp?.nativeAppUriDesktop || (sp?.url || '').replace(/^https:\/\/open\.spotify\.com\/track\/([A-Za-z0-9]+).*$/, 'spotify:track:$1');
      if (/^spotify:track:[A-Za-z0-9]+$/.test(uri)) return uri;
    } catch {}
  }
  return `spotify:search:${encodeURIComponent(`${t.artists?.[0]?.name || ''} ${t.name}`.trim())}`;
}

// ── включить трек ──
// Premium — прямо командой Spotify; без Premium — открываем трек в приложении Spotify на этом компьютере.
export async function playTrack(t, context) {
  const pend = SP.pending = { name: t.name, artists: t.artists, img: imgOf(t.album?.images, 640), album: t.album };
  setTimeout(() => { if (SP.pending === pend) { SP.pending = null; changed(); } }, 9000);
  SP.hiddenKey = '';
  if (SP.view.kind !== 'track') go({ kind: 'track' }); else changed();
  try {
    if (free()) {
      const uri = await spotifyUri(t);
      await invoke('spotify_open', { uri });
      setTimeout(poll, 1500); setTimeout(poll, 3500);
      // Spotify иногда только открывает трек, не включая его — подскажем
      setTimeout(() => { if (SP.pending === pend) showHud(uri.startsWith('spotify:search:') ? 'Spotify открыл поиск — выберите трек там' : 'Трек открыт в Spotify — нажмите ▶, если он не заиграл'); }, 4500);
      return;
    }
    const me = await getMe();
    if (me?.product === 'premium') {
      const body = context && !context.startsWith('spotify:artist:') ? { context_uri: context, offset: { uri: t.uri } } : { uris: [t.uri] };
      try { await api('me/player/play', { method: 'PUT', body }); setTimeout(poll, 600); return; } catch (e) { if (e.status !== 404) throw e; }
    }
    await invoke('spotify_open', { uri: t.uri });
    setTimeout(poll, 1500); setTimeout(poll, 3500);
  } catch (e) { showHud(String(e?.message || e)); }
}
export async function getMe() {
  if (SP.me) return SP.me;
  try { SP.me = await api('me'); } catch { SP.me = null; }
  return SP.me;
}
export const imgOf = (imgs, want = 300) => {
  if (!imgs?.length) return '';
  const s = [...imgs].sort((a, b) => (a.width || 0) - (b.width || 0));
  return (s.find(i => (i.width || 640) >= want) || s[s.length - 1]).url;
};
export const artistsOf = t => (t?.artists || []).map(a => a.name).join(', ');

// ── навигация панели ──
export function toggle(force) {
  const open = force ?? !(SP.open && !SP.closing);
  if (open) {
    SP.open = true; SP.closing = false;
    poll(); getVolume();
    if (loggedIn() && !SP.home) loadHome();
    if (!loggedIn()) loadCharts();
  } else if (SP.open) { SP.closing = true; setTimeout(() => { if (SP.closing) { SP.open = false; SP.closing = false; changed(); } }, 200); }
  changed();
}
export function go(view) { SP.stack.push(SP.view); SP.view = view; changed(); }
export function back() { SP.view = SP.stack.pop() || { kind: 'home' }; changed(); }
export function home() { SP.stack = []; SP.view = { kind: 'home' }; SP.q = ''; SP.search = null; changed(); }

export function loadHome() {
  if (!loggedIn()) return;
  SP.home = { loading: true };
  changed();
  Promise.allSettled([api('me/tracks?limit=20'), api('me/playlists?limit=30'), api('me/player/recently-played?limit=20'), getMe()]).then(([liked, pls, recent]) => {
    const seen = new Set();
    SP.home = {
      liked: liked.value?.items?.map(i => i.track).filter(Boolean) || [], likedTotal: liked.value?.total || 0,
      playlists: pls.value?.items?.filter(Boolean) || [],
      recent: (recent.value?.items || []).map(i => i.track).filter(t => t && !seen.has(t.id) && seen.add(t.id)).slice(0, 8),
      err: [liked, pls].every(x => x.status === 'rejected') ? String(liked.reason?.message || '') : '',
    };
    changed();
  });
}

let searchT = 0, seq = 0;
export function setQuery(q) {
  SP.q = q;
  clearTimeout(searchT);
  if (!q.trim()) { SP.search = null; if (SP.view.kind === 'search') { SP.view = { kind: 'home' }; SP.stack = []; } changed(); return; }
  if (SP.view.kind !== 'search') { SP.stack = []; SP.view = { kind: 'search' }; }
  SP.search = { ...(SP.search || {}), loading: true };
  changed();
  searchT = setTimeout(() => {
    const n = ++seq;
    (free() ? freeSearch(q.trim()) : api(`search?${new URLSearchParams({ q: q.trim(), type: 'track,artist,album,playlist', limit: '10' })}`)
      .then(r => ({ tracks: r.tracks?.items?.filter(Boolean) || [], artists: r.artists?.items?.filter(Boolean) || [], albums: r.albums?.items?.filter(Boolean) || [], playlists: r.playlists?.items?.filter(Boolean) || [] })))
      .then(r => { if (n === seq) { SP.search = r; changed(); } })
      .catch(e => { if (n === seq) { SP.search = { err: String(e.message || e) }; changed(); } });
  }, 300);
}

export function openArtist(a) {
  const v = { kind: 'artist', id: a.id, name: a.name, artist: null, top: null, albums: null };
  go(v);
  if (free() || String(a.id || '').startsWith('dz') || !a.id) { freeArtist(v); return; }
  api(`artists/${a.id}`).then(r => { v.artist = r; changed(); }).catch(() => {});
  api(`artists/${a.id}/top-tracks?market=from_token`).then(r => { v.top = r.tracks || []; changed(); }).catch(() => { v.top = []; changed(); });
  api(`artists/${a.id}/albums?include_groups=album,single&limit=40`).then(r => {
    const seen = new Set();
    v.albums = (r.items || []).filter(x => x && !seen.has(x.name.toLowerCase()) && seen.add(x.name.toLowerCase()));
    changed();
  }).catch(() => { v.albums = []; changed(); });
}
export function openAlbum(al) {
  const v = { kind: 'album', id: al.id, album: al, tracks: null };
  go(v);
  if (free() || String(al.id).startsWith('dz')) { freeAlbum(v); return; }
  api(`albums/${al.id}`).then(r => { v.album = r; v.tracks = (r.tracks?.items || []).map(t => ({ ...t, album: { id: r.id, name: r.name, images: r.images, uri: r.uri } })); changed(); })
    .catch(() => { v.tracks = []; changed(); });
}
export function openPlaylist(pl) {
  const v = { kind: 'playlist', id: pl.id, pl, tracks: null };
  go(v);
  api(`playlists/${pl.id}/tracks?limit=100`).then(r => { v.tracks = (r.items || []).map(i => i.track).filter(t => t && t.type === 'track'); changed(); })
    .catch(e => { v.tracks = []; v.err = e.status === 403 || e.status === 404 ? 'Spotify не даёт открыть этот плейлист в сторонних программах' : String(e.message); changed(); });
}
export function openLiked() {
  const v = { kind: 'liked', tracks: null, next: 'me/tracks?limit=50' };
  go(v);
  moreLiked(v);
}
export function moreLiked(v) {
  if (!v.next || v.loading) return;
  v.loading = true;
  api(v.next.replace('https://api.spotify.com/v1/', '')).then(r => {
    v.tracks = [...(v.tracks || []), ...(r.items || []).map(i => i.track).filter(Boolean)];
    v.total = r.total; v.next = r.next; v.loading = false; changed();
  }).catch(() => { v.tracks ||= []; v.loading = false; changed(); });
}
export function openInSpotify(uri) {
  // обычные веб-ссылки (кабинет разработчика Spotify и т. п.) — просто в браузере
  if (/^https:\/\//.test(uri)) {
    (T ? T.core.invoke('plugin:opener|open_url', { url: uri }) : Promise.resolve(window.open(uri, '_blank', 'noopener'))).catch(e => showHud(String(e?.message || e)));
    return;
  }
  invoke('spotify_open', { uri }).catch(e => showHud(String(e?.message || e)));
}
