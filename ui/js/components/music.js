// Мини-плеер macgram: кнопка с нотой / стеклянная капсула в шапке и компактная панель
// (сейчас играет, очередь, поиск, исполнитель с дискографией, альбом).
import { html, useEffect, useRef, useState } from '../lib.js';
import { S, changed, useTick, useFile, download, fileUrl, selectChat, jumpTo, chatTitle } from '../store.js';
import { duration } from '../format.js';
import { player, progress } from '../player.js';
import { M, audioOf, toggleMusic, back, home, setQuery, openArtist, openAlbum, playCatalogTrack, loadHome } from '../music.js';

// ── иконки (линии как у остальных иконок macgram) ──
const SV = (s, body, fill) => html`<svg width=${s} height=${s} viewBox="0 0 24 24" fill=${fill ? 'currentColor' : 'none'} stroke=${fill ? 'none' : 'currentColor'} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const IC = {
  note: (s = 22) => SV(s, html`<path d="M9 17.5V6.2l10-2.2v11.3"/><circle cx="6.6" cy="17.6" r="2.6"/><circle cx="16.6" cy="15.4" r="2.6"/><path d="M9 9.6l10-2.2"/>`),
  play: (s = 18) => SV(s, html`<path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2z"/>`, true),
  pause: (s = 18) => SV(s, html`<rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/>`, true),
  next: (s = 20) => SV(s, html`<path d="M4.5 6.3v11.4a.7.7 0 0 0 1.1.6l8.2-5.7a.7.7 0 0 0 0-1.2L5.6 5.7a.7.7 0 0 0-1.1.6zM13 6.3v11.4a.7.7 0 0 0 1.1.6l8.2-5.7a.7.7 0 0 0 0-1.2l-8.2-5.7a.7.7 0 0 0-1.1.6z"/>`, true),
  shuffle: (s = 18) => SV(s, html`<path d="M3.5 7h3.2c2.7 0 4.2 1.4 5.3 5s2.6 5 5.3 5h3.2M17.5 4.5 20.5 7l-3 2.5M17.5 14.5l3 2.5-3 2.5M3.5 17h3.2c1.3 0 2.3-.4 3-1.1M14 8.1c.7-.7 1.7-1.1 3-1.1h3.5"/>`),
  repeat: (s = 18) => SV(s, html`<path d="M4.5 11V9.5A2.5 2.5 0 0 1 7 7h12.5M17 4.5 19.5 7 17 9.5M19.5 13v1.5A2.5 2.5 0 0 1 17 17H4.5M7 19.5 4.5 17 7 14.5"/>`),
  back: (s = 18) => SV(s, html`<path d="M14.5 5.5 8 12l6.5 6.5"/>`),
  search: (s = 15) => SV(s, html`<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20"/>`),
  close: (s = 14) => SV(s, html`<path d="M6 6l12 12M18 6 6 18"/>`),
  vol: (s = 16) => SV(s, html`<path d="M4 9.5v5h3.5l4.5 3.8V5.7L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>`),
  chat: (s = 14) => SV(s, html`<path d="M5 18.5 4 21l3.2-1.3A8.5 8.5 0 1 0 5 18.5z"/>`),
};

// Обложка: файл Telegram (качается тихо, с низким приоритетом) или картинка каталога.
function Cover({ file, src, size = 40, round = 8, cls = '' }) {
  const f = useFile(file);
  useEffect(() => { if (file) download(file, 2); }, [file?.id]);
  const url = src || (f ? fileUrl(f) : '');
  return html`<span class=${`mu-cover ${cls}`} style=${`width:${size}px;height:${size}px;border-radius:${round}px`}>
    ${url ? html`<img src=${url} alt="" loading="lazy" draggable="false"/>` : IC.note(Math.round(size * .45))}</span>`;
}

const isAudio = () => S.player?.kind === 'audio';
const Eq = ({ on }) => html`<span class=${`mu-eq ${on ? 'on' : ''}`}><i/><i/><i/></span>`;

// Кольцо прогресса вокруг обложки в капсуле — отдельный маленький компонент, только он слушает ход трека.
function Ring({ size }) {
  useTick();
  const r = size / 2 - 1.5, c = 2 * Math.PI * r;
  return html`<svg class="mc-ring" width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`}>
    <circle cx=${size / 2} cy=${size / 2} r=${r} class="mc-ring-bg"/>
    <circle cx=${size / 2} cy=${size / 2} r=${r} class="mc-ring-fg" stroke-dasharray=${c} stroke-dashoffset=${c * (1 - progress())}/></svg>`;
}

// Кнопка в шапке: нота, а когда играет музыка — стеклянная капсула с обложкой, названием и паузой.
export function MusicChip() {
  const p = S.player;
  const on = M.open && !M.closing;
  if (!isAudio()) return html`<button class=${`glass circle music-btn ${on ? 'active' : ''}`} title="Музыка" onClick=${e => { e.stopPropagation(); toggleMusic(); }}>${IC.note(22)}</button>`;
  return html`<div class=${`glass music-cap ${on ? 'active' : ''}`} title="Музыка" onClick=${e => { e.stopPropagation(); toggleMusic(); }}>
    <span class="mc-art"><${Cover} file=${p.cover} size=${32} round=${16}/><${Ring} size=${38}/></span>
    <span class="mc-txt"><b>${p.title}</b><small>${p.performer || 'Неизвестный исполнитель'}</small></span>
    <button class="mc-btn" title=${p.playing ? 'Пауза' : 'Играть'} onClick=${e => { e.stopPropagation(); player.toggle(); }}>${p.playing ? IC.pause(16) : IC.play(16)}</button>
  </div>`;
}

function TrackRow({ m, queue, idx }) {
  const a = audioOf(m);
  const cur = S.player && S.player.chatId === m.chat_id && S.player.msgId === m.id;
  const chat = S.chats.get(m.chat_id);
  return html`<div class=${`mu-row ${cur ? 'cur' : ''}`} style=${idx != null && idx < 14 ? `animation-delay:${idx * 18}ms` : ''} onClick=${() => player.play(m, queue)}>
    <span class="mu-row-art"><${Cover} file=${a.album_cover_thumbnail?.file || a.external_album_covers?.[0]?.file} size=${38} round=${7}/>${cur && html`<${Eq} on=${S.player.playing}/>`}</span>
    <span class="mu-row-txt"><b>${a.title || a.file_name || 'Без названия'}</b><small>${a.performer || 'Неизвестный исполнитель'}${chat ? ` · ${chatTitle(chat)}` : ''}</small></span>
    <span class="mu-row-dur">${duration(a.duration || 0)}</span>
  </div>`;
}
function CatRow({ t, i }) {
  return html`<div class="mu-row" onClick=${() => playCatalogTrack(t)} title="Найти в Telegram и включить">
    ${i != null ? html`<span class="mu-num">${i}</span>` : html`<span class="mu-row-art"><${Cover} src=${t.img} size=${38} round=${7}/></span>`}
    <span class="mu-row-txt"><b>${t.trackName}</b><small>${i != null ? t.artistName : t.collectionName}</small></span>
    <span class="mu-row-dur">${t.ms ? duration(Math.round(t.ms / 1000)) : ''}</span>
  </div>`;
}
const Sec = ({ title, children, action }) => html`<div class="mu-sec"><div class="mu-sec-h"><span>${title}</span>${action}</div>${children}</div>`;
const Loading = () => html`<div class="mu-load"><i/><i/><i/></div>`;
const Empty = ({ text }) => html`<div class="mu-empty">${text}</div>`;

// Ползунок времени: тянется мышью, время показывает над пальцем.
function Seek() {
  useTick();
  const p = S.player;
  const [drag, setDrag] = useState(null);
  const d = p.duration || 0, v = drag ?? progress();
  const pos = e => { const r = e.currentTarget.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
  return html`<div class="mu-seek">
    <div class=${`mu-seek-bar ${drag != null ? 'drag' : ''}`}
      onPointerDown=${e => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(pos(e)); }}
      onPointerMove=${e => { if (drag != null) setDrag(pos(e)); }}
      onPointerUp=${e => { if (drag != null) { player.seek(pos(e)); setDrag(null); } }}>
      <i class="mu-seek-fill" style=${`transform:scaleX(${v})`}/><i class="mu-seek-knob" style=${`left:${v * 100}%`}/>
    </div>
    <div class="mu-seek-t"><span>${duration(Math.floor(v * d))}</span><span>-${duration(Math.max(0, Math.floor(d - v * d)))}</span></div>
  </div>`;
}

function NowPlaying() {
  const p = S.player;
  const rep = p.repeat || 'none';
  const nextRep = { none: 'all', all: 'one', one: 'none' }[rep];
  const coverFile = useFile(p.cover);
  const url = coverFile ? fileUrl(coverFile) : '';
  return html`<div class="mu-now">
    ${url && html`<div class="mu-now-bg" style=${`background-image:url("${url}")`}/>`}
    <div class="mu-now-top">
      <${Cover} file=${p.cover} size=${92} round=${12} cls="mu-now-art"/>
      <div class="mu-now-info">
        <b class="mu-now-title" title=${p.title}>${p.title}</b>
        <button class="mu-link" onClick=${() => p.performer && openArtist(p.performer)} disabled=${!p.performer}>${p.performer || 'Неизвестный исполнитель'}</button>
        <button class="mu-from" title="Открыть сообщение" onClick=${() => { toggleMusic(false); if (p.chatId !== S.currentChatId) selectChat(p.chatId); setTimeout(() => jumpTo(p.chatId, p.msgId), 300); }}>
          ${IC.chat(12)} ${S.chats.get(p.chatId) ? chatTitle(S.chats.get(p.chatId)) : 'Чат'}</button>
      </div>
    </div>
    <${Seek}/>
    <div class="mu-ctl">
      <button class=${`mu-ic ${p.shuffle ? 'on' : ''}`} title="Перемешать" onClick=${() => player.setShuffle(!p.shuffle)}>${IC.shuffle(18)}</button>
      <button class="mu-ic big" title="Назад" onClick=${player.prev}><span style="display:inline-flex;transform:scaleX(-1)">${IC.next(22)}</span></button>
      <button class="mu-play" title=${p.playing ? 'Пауза' : 'Играть'} onClick=${player.toggle}>${p.playing ? IC.pause(22) : IC.play(22)}</button>
      <button class="mu-ic big" title="Вперёд" disabled=${!player.neighbor(1)} onClick=${player.next}>${IC.next(22)}</button>
      <button class=${`mu-ic ${rep !== 'none' ? 'on' : ''}`} title=${rep === 'one' ? 'Повтор трека' : rep === 'all' ? 'Повтор очереди' : 'Повтор выключен'} onClick=${() => player.setRepeat(nextRep)}>
        ${IC.repeat(18)}${rep === 'one' && html`<i class="mu-one">1</i>`}</button>
    </div>
    <label class="mu-vol" onWheel=${e => { e.preventDefault(); player.setVolume(Math.max(0, Math.min(1, (p.volume ?? 1) - Math.sign(e.deltaY) * .05))); }}>
      ${IC.vol(15)}<input type="range" min="0" max="1" step="0.01" value=${p.volume ?? 1} style=${`--v:${(p.volume ?? 1) * 100}%`} onInput=${e => player.setVolume(Number(e.target.value))}/>
    </label>
  </div>`;
}

function HomeView() {
  const p = S.player;
  const q = isAudio() && p.queue?.length > 1 ? p.queue : null;
  const h = M.home;
  return html`<div class="mu-view">
    ${isAudio() && html`<${NowPlaying}/>`}
    ${q ? html`<${Sec} title="Очередь">${q.slice(0, 80).map((m, i) => html`<${TrackRow} key=${`${m.chat_id}:${m.id}`} m=${m} queue=${q} idx=${i}/>`)}</${Sec}>`
      : html`<${Sec} title="Музыка из ваших чатов" action=${html`<button class="mu-mini" onClick=${loadHome}>Обновить</button>`}>
        ${!h || h.loading ? html`<${Loading}/>` : h.list.length ? h.list.map((m, i) => html`<${TrackRow} key=${`${m.chat_id}:${m.id}`} m=${m} queue=${h.list} idx=${i}/>`)
          : html`<${Empty} text="В ваших чатах и каналах пока нет музыки. Найдите трек поиском сверху."/>`}</${Sec}>`}
  </div>`;
}

function SearchView() {
  const s = M.search || {};
  return html`<div class="mu-view">
    ${s.artists?.length > 0 && html`<${Sec} title="Исполнители"><div class="mu-artists">${s.artists.map(a => html`
      <button class="mu-artist" key=${a.id} onClick=${() => openArtist(a.name, a.id)}><${Cover} src=${a.img} size=${60} round=${30}/><span>${a.name}</span></button>`)}</div></${Sec}>`}
    <${Sec} title="Треки в Telegram">${s.loading && !s.tracks ? html`<${Loading}/>` : s.tracks?.length ? s.tracks.map((m, i) => html`<${TrackRow} key=${`${m.chat_id}:${m.id}`} m=${m} queue=${s.tracks} idx=${i}/>`)
      : html`<${Empty} text="В ваших чатах и каналах ничего не нашлось"/>`}</${Sec}>
    ${s.albums?.length > 0 && html`<${Sec} title="Альбомы"><div class="mu-albums">${s.albums.map(al => html`<${AlbumTile} key=${al.id} al=${al}/>`)}</div></${Sec}>`}
  </div>`;
}
const AlbumTile = ({ al }) => html`<button class="mu-album" onClick=${() => openAlbum(al)} title=${al.name}>
  <${Cover} src=${al.img} size=${96} round=${10}/><b>${al.name}</b><small>${al.year}${al.count ? ` · ${al.count} тр.` : ''}</small></button>`;

function ArtistView({ v }) {
  const head = v.info?.albums?.[0]?.img;
  const [all, setAll] = useState(false);
  const tracks = v.tracks || [];
  return html`<div class="mu-view">
    <div class="mu-hero">
      ${head && html`<div class="mu-hero-bg" style=${`background-image:url("${head}")`}/>`}
      <${Cover} src=${head ? head.replace('300x300', '200x200') : ''} size=${76} round=${38}/>
      <div class="mu-hero-txt"><b>${v.name}</b><small>${[v.info?.genre, v.info?.albums?.length ? `${v.info.albums.length} альб.` : ''].filter(Boolean).join(' · ') || 'Исполнитель'}</small>
        ${tracks.length > 0 && html`<button class="mu-pill" onClick=${() => player.play(tracks[0], tracks)}>${IC.play(13)} Слушать</button>`}</div>
    </div>
    <${Sec} title="В ваших чатах и каналах">${v.tracks == null ? html`<${Loading}/>` : tracks.length ? (all ? tracks : tracks.slice(0, 5)).map((m, i) => html`<${TrackRow} key=${`${m.chat_id}:${m.id}`} m=${m} queue=${tracks} idx=${i}/>`)
      : html`<${Empty} text="Треков этого исполнителя в ваших чатах нет"/>`}
      ${tracks.length > 5 && html`<button class="mu-more" onClick=${() => setAll(!all)}>${all ? 'Свернуть' : `Ещё ${tracks.length - 5}`}</button>`}</${Sec}>
    ${v.info == null ? html`<${Loading}/>` : html`
      ${v.info.songs?.length > 0 && html`<${Sec} title="Популярное">${v.info.songs.slice(0, 6).map(t => html`<${CatRow} key=${t.id} t=${t}/>`)}</${Sec}>`}
      ${v.info.albums?.length > 0 && html`<${Sec} title="Дискография"><div class="mu-albums grid">${v.info.albums.map(al => html`<${AlbumTile} key=${al.id} al=${al}/>`)}</div></${Sec}>`}
      ${!v.info.songs?.length && !v.info.albums?.length && html`<${Empty} text=${v.info.err ? 'Каталог сейчас недоступен' : 'В каталоге нет данных об этом исполнителе'}/>`}`}
  </div>`;
}

function AlbumView({ v }) {
  const al = v.album;
  return html`<div class="mu-view">
    <div class="mu-hero album">
      ${al.img && html`<div class="mu-hero-bg" style=${`background-image:url("${al.img}")`}/>`}
      <${Cover} src=${al.img} size=${96} round=${10}/>
      <div class="mu-hero-txt"><b>${al.name}</b>
        <button class="mu-link" onClick=${() => openArtist(al.artist, al.artistId)}>${al.artist}</button>
        <small>${[al.year, al.count ? `${al.count} треков` : ''].filter(Boolean).join(' · ')}</small></div>
    </div>
    <${Sec} title="Треки">${v.tracks == null ? html`<${Loading}/>` : v.tracks.length ? v.tracks.map(t => html`<${CatRow} key=${t.id} t=${t} i=${t.n}/>`) : html`<${Empty} text="Список треков недоступен"/>`}</${Sec}>
    <div class="mu-note">Нажмите на трек — macgram найдёт его в ваших чатах и каналах Telegram.</div>
  </div>`;
}

// Панель плеера: открывается из кнопки в шапке, закрывается щелчком мимо или Esc.
export function MusicPanel() {
  const ref = useRef();
  const inputRef = useRef();
  useEffect(() => {
    if (!M.open) return;
    const off = e => { if (!ref.current?.contains(e.target) && !e.target.closest?.('.music-btn, .music-cap, .ctx')) toggleMusic(false); };
    const esc = e => { if (e.key === 'Escape') { if (M.view.kind !== 'home' && M.stack.length) back(); else toggleMusic(false); } };
    window.addEventListener('mousedown', off);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('mousedown', off); window.removeEventListener('keydown', esc); };
  }, [M.open]);
  if (!M.open) return null;
  const v = M.view;
  const title = v.kind === 'artist' ? 'Исполнитель' : v.kind === 'album' ? 'Альбом' : '';
  return html`<div class=${`music-panel ${M.closing ? 'out' : ''}`} ref=${ref}>
    <div class="mu-head">
      ${v.kind === 'artist' || v.kind === 'album'
        ? html`<button class="mu-back" onClick=${back}>${IC.back(16)}<span>${M.stack.length && M.stack[M.stack.length - 1].kind !== 'home' ? 'Назад' : 'Музыка'}</span></button><b class="mu-head-t">${title}</b><span style="width:64px"/>`
        : html`<label class="mu-search">${IC.search(14)}<input ref=${inputRef} placeholder="Треки и исполнители" value=${M.q} onInput=${e => setQuery(e.target.value)}/>
            ${M.q && html`<button class="mu-clear" onClick=${() => { home(); inputRef.current?.focus(); }}>${IC.close(10)}</button>`}</label>`}
    </div>
    <div class="mu-body" key=${v.kind + (v.name || v.album?.id || '')}>
      ${v.kind === 'search' ? html`<${SearchView}/>` : v.kind === 'artist' ? html`<${ArtistView} v=${v}/>` : v.kind === 'album' ? html`<${AlbumView} v=${v}/>` : html`<${HomeView}/>`}
    </div>
  </div>`;
}
