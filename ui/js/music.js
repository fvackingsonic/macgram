// Мини-плеер: музыка из Telegram (аудио из ваших чатов и каналов) + каталог iTunes для страницы
// исполнителя (дискография, обложки альбомов). Каталог — только справка: играет всегда файл из Telegram.
import { S, changed, showHud } from './store.js';
import { send } from './td.js';
import { player } from './player.js';

export const M = S.music = { open: false, closing: false, stack: [], view: { kind: 'home' }, q: '', search: null, home: null };

export const audioOf = m => (m?.content?.['@type'] === 'messageAudio' ? m.content.audio : null);
const norm = s => (s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const enc = encodeURIComponent;

// ── Telegram ──
function uniq(msgs) {
  const seen = new Set();
  return msgs.filter(m => {
    const a = audioOf(m);
    if (!a) return false;
    const k = `${norm(a.performer)}|${norm(a.title || a.file_name)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
export async function searchTg(query, limit = 60) {
  const r = await send({ '@type': 'searchMessages', chat_list: null, query, offset: '', limit, filter: { '@type': 'searchMessagesFilterAudio' }, chat_type_filter: null, min_date: 0, max_date: 0 });
  return uniq(r.messages || []);
}
// Треки исполнителя из Telegram: имя исполнителя совпадает (или входит, например «A feat. B»).
export async function artistTracks(name) {
  const n = norm(name);
  const list = await searchTg(name, 100);
  return list.filter(m => norm(audioOf(m).performer).includes(n));
}
// Найти трек из каталога в Telegram и включить.
export async function playCatalogTrack(t) {
  showHud('Ищу трек в Telegram…');
  try {
    const list = await searchTg(`${t.artistName} ${t.trackName}`, 30);
    const ta = norm(t.artistName), tt = norm(t.trackName).replace(/ (feat|ft|prod)\b.*$/, '');
    const hit = list.find(m => { const a = audioOf(m); return norm(a.performer).includes(ta) && norm(a.title).includes(tt); })
      || list.find(m => norm(audioOf(m).title).includes(tt));
    if (!hit) { showHud('Этого трека нет в ваших чатах и каналах'); return; }
    player.play(hit, list.includes(hit) ? [hit] : null);
  } catch (e) { showHud(e.message || 'Не удалось найти трек'); }
}

// ── каталог (iTunes) ──
const cache = new Map();
export function catalog(q) {
  if (cache.has(q)) return cache.get(q);
  const T = window.__TAURI__;
  const p = (T ? T.core.invoke('catalog_get', { query: q }) : window.__mockCatalog ? Promise.resolve(window.__mockCatalog(q)) : Promise.reject(new Error('Каталог доступен в программе для Windows')))
    .catch(e => { cache.delete(q); throw e; });
  cache.set(q, p);
  return p;
}
export const art = (u, size = 300) => (u ? u.replace(/\/\d+x\d+(bb)?\.(jpg|png|webp)$/, `/${size}x${size}bb.jpg`) : '');
const year = d => (d ? String(d).slice(0, 4) : '');
// Исполнители и альбомы по запросу: у исполнителя в каталоге нет фото — берём обложку его альбома.
export async function catalogSearch(term) {
  const r = await catalog(`search?term=${enc(term)}&entity=album&limit=25`);
  const albums = (r.results || []).filter(x => x.wrapperType === 'collection');
  const artists = [];
  for (const a of albums) if (a.artistId && !artists.some(x => x.id === a.artistId)) artists.push({ id: a.artistId, name: a.artistName, img: art(a.artworkUrl100, 160), genre: a.primaryGenreName });
  return { artists: artists.slice(0, 6), albums: albums.slice(0, 12).map(albumOf) };
}
const albumOf = a => ({ id: a.collectionId, name: a.collectionName, artist: a.artistName, artistId: a.artistId, img: art(a.artworkUrl100, 300), year: year(a.releaseDate), count: a.trackCount });
export async function findArtist(name) {
  const r = await catalog(`search?term=${enc(name)}&entity=musicArtist&limit=8`);
  const list = (r.results || []).filter(x => x.wrapperType === 'artist');
  return list.find(x => norm(x.artistName) === norm(name)) || null;
}
export async function artistInfo(id) {
  const [al, so] = await Promise.all([catalog(`lookup?id=${id}&entity=album&limit=80`), catalog(`lookup?id=${id}&entity=song&limit=12`)]);
  const seen = new Set();
  const albums = (al.results || []).filter(x => x.wrapperType === 'collection' && !seen.has(norm(x.collectionName)) && seen.add(norm(x.collectionName)))
    .sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || '')).map(albumOf);
  const songs = (so.results || []).filter(x => x.wrapperType === 'track').map(trackOf);
  const head = (al.results || []).find(x => x.wrapperType === 'artist');
  return { albums, songs, genre: head?.primaryGenreName || '' };
}
const trackOf = t => ({ id: t.trackId, trackName: t.trackName, artistName: t.artistName, collectionName: t.collectionName, img: art(t.artworkUrl100, 120), ms: t.trackTimeMillis, n: t.trackNumber, disc: t.discNumber });
export async function albumInfo(id) {
  const r = await catalog(`lookup?id=${id}&entity=song`);
  const res = r.results || [];
  const head = res.find(x => x.wrapperType === 'collection');
  const tracks = res.filter(x => x.wrapperType === 'track').sort((a, b) => (a.discNumber - b.discNumber) || (a.trackNumber - b.trackNumber)).map(trackOf);
  return { album: head ? albumOf(head) : null, tracks };
}

// ── навигация панели ──
export function toggleMusic(force) {
  const open = force ?? !(M.open && !M.closing);
  if (open) { M.open = true; M.closing = false; if (!M.home) loadHome(); }
  else if (M.open) { M.closing = true; setTimeout(() => { if (M.closing) { M.open = false; M.closing = false; changed(); } }, 200); }
  changed();
}
export function go(view) { M.stack.push(M.view); M.view = view; changed(); }
export function back() { M.view = M.stack.pop() || { kind: 'home' }; changed(); }
export function home() { M.stack = []; M.view = { kind: 'home' }; M.q = ''; M.search = null; changed(); }

export function loadHome() {
  M.home = { loading: true, list: [] };
  searchTg('', 60).then(list => { M.home = { list }; changed(); }).catch(() => { M.home = { list: [], err: true }; changed(); });
}

let searchT = 0, searchSeq = 0;
export function setQuery(q) {
  M.q = q;
  clearTimeout(searchT);
  if (!q.trim()) { M.search = null; if (M.view.kind === 'search') M.view = { kind: 'home' }; changed(); return; }
  if (M.view.kind !== 'search') { M.stack = []; M.view = { kind: 'search' }; }
  M.search = { ...(M.search || {}), loading: true };
  changed();
  searchT = setTimeout(() => {
    const seq = ++searchSeq, term = q.trim();
    searchTg(term).then(tracks => { if (seq === searchSeq) { M.search = { ...M.search, tracks, loading: false }; changed(); } })
      .catch(() => { if (seq === searchSeq) { M.search = { ...M.search, tracks: [], loading: false }; changed(); } });
    catalogSearch(term).then(c => { if (seq === searchSeq) { M.search = { ...M.search, ...c }; changed(); } }).catch(() => {});
  }, 320);
}

export function openArtist(name, id) {
  const v = { kind: 'artist', name, id, tracks: null, info: null };
  go(v);
  artistTracks(name).then(t => { v.tracks = t; changed(); }).catch(() => { v.tracks = []; changed(); });
  (id ? Promise.resolve({ artistId: id }) : findArtist(name)).then(a => {
    if (!a) { v.info = { albums: [], songs: [] }; changed(); return; }
    v.id = a.artistId;
    return artistInfo(a.artistId).then(info => { v.info = info; changed(); });
  }).catch(() => { v.info = { albums: [], songs: [], err: true }; changed(); });
}
export function openAlbum(al) {
  const v = { kind: 'album', album: al, tracks: null };
  go(v);
  albumInfo(al.id).then(r => { v.tracks = r.tracks; if (r.album) v.album = { ...al, ...r.album }; changed(); }).catch(() => { v.tracks = []; changed(); });
}
