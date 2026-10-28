// Плеер Spotify в macgram: нота в шапке → стеклянная капсула, когда Spotify играет; панель с
// «Сейчас играет», вашей библиотекой, поиском, исполнителями, альбомами и плейлистами.
// Музыка из Telegram сюда не попадает — она играет, как раньше, в полосе под шапкой чата.
import { html, useEffect, useRef, useState } from '../lib.js';
import { S, changed, useTick, setPref, openMenu, showHud } from '../store.js';
import { duration } from '../format.js';
import { Icon } from '../icons.js';
import {
  SP, REDIRECT, toggle, back, home, setQuery, ctl, close, capsuleVisible, position, setVolume, getVolume, connect, disconnect, loggedIn,
  loadHome, playTrack, openArtist, openAlbum, openPlaylist, openLiked, moreLiked, openInSpotify, imgOf, artistsOf, api, go,
} from '../spotify.js';

const SV = (s, body, fill) => html`<svg width=${s} height=${s} viewBox="0 0 24 24" fill=${fill ? 'currentColor' : 'none'} stroke=${fill ? 'none' : 'currentColor'} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const IC = {
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
  heart: (s = 16) => SV(s, html`<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>`, true),
  ext: (s = 14) => SV(s, html`<path d="M14 4.5h5.5V10M19.5 4.5 11 13M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>`),
  spotify: (s = 18) => SV(s, html`<circle cx="12" cy="12" r="9.5"/><path d="M7 9.4c3.6-1.1 7.4-.8 10.4.9M7.6 12.6c2.9-.8 5.9-.5 8.3.8M8.3 15.6c2.2-.6 4.4-.4 6.2.6"/>`),
  more: (s = 18) => SV(s, html`<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>`, true),
};

function Cover({ src, size = 40, round = 8, cls = '' }) {
  return html`<span class=${`mu-cover ${cls}`} style=${size ? `width:${size}px;height:${size}px;border-radius:${round}px` : `border-radius:${round}px`}>
    ${src ? html`<img src=${src} alt="" loading="lazy" draggable="false"/>` : IC.note(size ? Math.round(size * .42) : 56)}</span>`;
}
const Eq = ({ on }) => html`<span class=${`mu-eq ${on ? 'on' : ''}`}><i/><i/><i/></span>`;

function Ring({ size }) {
  useTick();
  const r = size / 2 - 1.5, c = 2 * Math.PI * r, d = SP.now?.dur || 0;
  const v = d ? Math.min(1, position() / d) : 0;
  return html`<svg class="mc-ring" width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`}>
    <circle cx=${size / 2} cy=${size / 2} r=${r} class="mc-ring-bg"/>
    <circle cx=${size / 2} cy=${size / 2} r=${r} class="mc-ring-fg" stroke-dasharray=${c} stroke-dashoffset=${c * (1 - v)}/></svg>`;
}

// Нота / капсула в шапке. Капсулу можно тянуть, как стеклянные кнопки (effects.js).
export function MusicChip() {
  const on = SP.open && !SP.closing;
  if (!capsuleVisible()) return html`<button class=${`glass circle music-btn no-drag ${on ? 'active' : ''}`} title="Spotify" onClick=${e => { e.stopPropagation(); toggle(); }}>${IC.note(22)}</button>`;
  const n = SP.now;
  return html`<div class=${`glass music-cap no-drag ${on ? 'active' : ''}`} role="button" title="Spotify" onClick=${e => { e.stopPropagation(); toggle(); }}>
    <span class="mc-art"><${Cover} src=${SP.thumb} size=${32} round=${16}/><${Ring} size=${38}/></span>
    <span class="mc-txt"><b>${n.title || 'Spotify'}</b><small>${n.artist || ''}</small></span>
    <button class="mc-btn" title=${n.playing ? 'Пауза' : 'Играть'} onClick=${e => { e.stopPropagation(); ctl('toggle'); }}>${n.playing ? IC.pause(16) : IC.play(16)}</button>
    <button class="mc-x" title="Закрыть трек" onClick=${e => { e.stopPropagation(); close(); }}>${IC.close(9)}</button>
  </div>`;
}

const isNow = t => SP.now && t && (t.name || '').toLowerCase() === (SP.now.title || '').toLowerCase();
function TrackRow({ t, ctx, i, num }) {
  const cur = isNow(t);
  return html`<div class=${`mu-row ${cur ? 'cur' : ''}`} style=${i != null && i < 14 ? `animation-delay:${i * 16}ms` : ''} onClick=${() => playTrack(t, ctx)}>
    ${num != null ? html`<span class="mu-num">${cur ? html`<${Eq} on=${SP.now.playing}/>` : num}</span>`
      : html`<span class="mu-row-art"><${Cover} src=${imgOf(t.album?.images, 64)} size=${40} round=${6}/>${cur && html`<${Eq} on=${SP.now.playing}/>`}</span>`}
    <span class="mu-row-txt"><b>${t.name}</b><small>${t.explicit ? html`<i class="mu-e">E</i>` : ''}${artistsOf(t)}</small></span>
    <span class="mu-row-dur">${t.duration_ms ? duration(Math.round(t.duration_ms / 1000)) : ''}</span>
  </div>`;
}
const Sec = ({ title, children, action }) => html`<div class="mu-sec"><div class="mu-sec-h"><span>${title}</span>${action}</div>${children}</div>`;
const Loading = () => html`<div class="mu-load"><i/><i/><i/></div>`;
const Empty = ({ text }) => html`<div class="mu-empty">${text}</div>`;
const Tile = ({ img, title, sub, round = 10, onClick }) => html`<button class="mu-album" onClick=${onClick} title=${title}>
  <${Cover} src=${img} size=${96} round=${round}/><b>${title}</b><small>${sub}</small></button>`;
const year = d => (d || '').slice(0, 4);
const AlbumTile = ({ al }) => html`<${Tile} img=${imgOf(al.images, 300)} title=${al.name} sub=${[year(al.release_date), al.album_type === 'single' ? 'Сингл' : al.album_type === 'compilation' ? 'Сборник' : 'Альбом'].filter(Boolean).join(' · ')} onClick=${() => openAlbum(al)}/>`;
const PlTile = ({ pl }) => html`<${Tile} img=${imgOf(pl.images, 300)} title=${pl.name} sub=${pl.owner?.display_name || `${pl.tracks?.total ?? ''} тр.`} onClick=${() => openPlaylist(pl)}/>`;
const ArtistChip = ({ a }) => html`<button class="mu-artist" onClick=${() => openArtist(a)}><${Cover} src=${imgOf(a.images, 160)} size=${64} round=${32}/><span>${a.name}</span></button>`;

// Ползунок времени — тянется мышью.
function Seek() {
  useTick();
  const n = SP.now;
  const [drag, setDrag] = useState(null);
  const d = n?.dur || 0, v = drag ?? (d ? Math.min(1, position() / d) : 0);
  const pos = e => { const r = e.currentTarget.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
  const can = n?.canSeek !== false && d > 0;
  return html`<div class="mu-seek">
    <div class=${`mu-seek-bar ${drag != null ? 'drag' : ''} ${can ? '' : 'off'}`}
      onPointerDown=${e => { if (!can) return; e.currentTarget.setPointerCapture(e.pointerId); setDrag(pos(e)); }}
      onPointerMove=${e => { if (drag != null) setDrag(pos(e)); }}
      onPointerUp=${e => { if (drag != null) { ctl('seek', pos(e) * d); setDrag(null); } }}>
      <i class="mu-seek-fill" style=${`transform:scaleX(${v})`}/><i class="mu-seek-knob" style=${`left:${v * 100}%`}/>
    </div>
    <div class="mu-seek-t"><span>${duration(Math.floor(v * d))}</span><span>-${duration(Math.max(0, Math.floor(d - v * d)))}</span></div>
  </div>`;
}

function Controls({ big }) {
  const n = SP.now;
  const rep = n?.repeat;
  return html`<div class=${`mu-ctl ${big ? 'big' : ''}`}>
    ${n?.shuffle != null ? html`<button class=${`mu-ic ${n.shuffle ? 'on' : ''}`} title="Перемешать" onClick=${() => ctl('shuffle', n.shuffle ? 0 : 1)}>${IC.shuffle(18)}</button>` : html`<span class="mu-ic"/>`}
    <button class="mu-ic big" title="Назад" disabled=${n?.canPrev === false} onClick=${() => ctl('prev')}><span style="display:inline-flex;transform:scaleX(-1)">${IC.next(22)}</span></button>
    <button class="mu-play" title=${n?.playing ? 'Пауза' : 'Играть'} onClick=${() => ctl('toggle')}>${n?.playing ? IC.pause(22) : IC.play(22)}</button>
    <button class="mu-ic big" title="Вперёд" disabled=${n?.canNext === false} onClick=${() => ctl('next')}>${IC.next(22)}</button>
    ${rep != null ? html`<button class=${`mu-ic ${rep ? 'on' : ''}`} title=${rep === 2 ? 'Повтор трека' : rep === 1 ? 'Повтор' : 'Повтор выключен'} onClick=${() => ctl('repeat', (rep + 1) % 3)}>
      ${IC.repeat(18)}${rep === 2 && html`<i class="mu-one">1</i>`}</button>` : html`<span class="mu-ic"/>`}
  </div>`;
}

function Volume() {
  const v = SP.vol;
  if (v == null) return html`<div class="mu-vol off">${IC.vol(15)}<span>Громкость появится, когда Spotify заиграет</span></div>`;
  return html`<label class="mu-vol" onWheel=${e => { e.preventDefault(); setVolume(Math.max(0, Math.min(1, v - Math.sign(e.deltaY) * .05))); }}>
    ${IC.vol(15)}<input type="range" min="0" max="1" step="0.01" value=${v} style=${`--v:${v * 100}%`} onInput=${e => setVolume(Number(e.target.value))}/>
    <span class="mu-vol-n">${Math.round(v * 100)}</span></label>`;
}

// Маленькая карточка «сейчас играет» на главной — по щелчку открывается страница трека.
function NowCard() {
  const n = SP.now;
  if (!n) return html`<div class="mu-hint">${IC.spotify(20)}<span>Включите музыку в Spotify — здесь появится то, что играет, и управление.</span>
    <button class="mu-mini" onClick=${() => openInSpotify('spotify:')}>Открыть Spotify</button></div>`;
  return html`<div class="mu-nowcard" onClick=${() => go({ kind: 'track' })}>
    ${SP.thumb && html`<div class="mu-now-bg" style=${`background-image:url("${SP.thumb}")`}/>`}
    <${Cover} src=${SP.thumb} size=${52} round=${9}/>
    <span class="mu-row-txt"><b>${n.title}</b><small>${n.artist}</small></span>
    <button class="mu-ic" onClick=${e => { e.stopPropagation(); ctl('toggle'); }}>${n.playing ? IC.pause(18) : IC.play(18)}</button>
    <button class="mu-ic" disabled=${n.canNext === false} onClick=${e => { e.stopPropagation(); ctl('next'); }}>${IC.next(18)}</button>
  </div>`;
}

// Страница трека: большая обложка, время, управление, громкость Spotify.
function TrackView() {
  const n = SP.now, p = SP.pending;
  const img = p?.img || SP.thumb;
  const title = p?.name || n?.title || 'Ничего не играет';
  const artists = p?.artists || null;
  const findArtist = async name => {
    if (!loggedIn()) { openInSpotify(`spotify:search:${encodeURIComponent(name)}`); return; }
    try { const r = await api(`search?${new URLSearchParams({ q: name, type: 'artist', limit: '1' })}`); const a = r.artists?.items?.[0]; if (a) openArtist(a); } catch (e) { showHud(e.message); }
  };
  useEffect(() => { getVolume(); }, []);
  return html`<div class="mu-view mu-track">
    ${img && html`<div class="mu-track-bg" style=${`background-image:url("${img}")`}/>`}
    <div class="mu-track-art"><${Cover} src=${img} size=${0} round=${14} cls=${`fill ${n?.playing ? 'playing' : ''}`}/></div>
    <div class="mu-track-info">
      <b>${title}</b>
      <div class="mu-artists-line">${artists ? artists.map((a, i) => html`${i ? ', ' : ''}<button class="mu-link" onClick=${() => openArtist(a)}>${a.name}</button>`)
        : n?.artist ? html`<button class="mu-link" onClick=${() => findArtist(n.artist.split(/,|&| feat\.? /i)[0].trim())}>${n.artist}</button>` : ''}</div>
      ${(p?.album?.name || n?.album) && html`<small>${p?.album?.name || n.album}</small>`}
    </div>
    ${p && html`<div class="mu-wait">Открываю в Spotify…</div>`}
    <${Seek}/>
    <${Controls} big=${true}/>
    <${Volume}/>
    <div class="mu-track-actions">
      <button class="mu-chipbtn" onClick=${() => openInSpotify('spotify:')}>${IC.ext(13)} Открыть Spotify</button>
      <button class="mu-chipbtn" onClick=${() => { close(); back(); }}>${IC.close(11)} Закрыть трек</button>
    </div>
  </div>`;
}

function ConnectCard() {
  const [id, setId] = useState(S.prefs.spotifyClientId || '');
  const copy = () => { navigator.clipboard?.writeText(REDIRECT).then(() => showHud('Адрес скопирован')).catch(() => {}); };
  return html`<div class="mu-connect">
    <div class="mu-connect-h">${IC.spotify(26)}<div><b>Подключите Spotify</b><small>Поиск, ваши плейлисты, «Любимые треки», исполнители и альбомы. Нужно один раз.</small></div></div>
    <ol>
      <li>Откройте <button class="mu-link" onClick=${() => openInSpotify('https://developer.spotify.com/dashboard')}>developer.spotify.com/dashboard</button> и войдите своим аккаунтом Spotify.</li>
      <li>Нажмите <b>Create app</b>. Название и описание — любые (например, macgram).</li>
      <li>В поле <b>Redirect URIs</b> добавьте адрес <button class="mu-code" onClick=${copy} title="Скопировать">${REDIRECT}</button>, отметьте <b>Web API</b> и сохраните.</li>
      <li>Скопируйте <b>Client ID</b> из настроек приложения и вставьте сюда:</li>
    </ol>
    <div class="mu-connect-row">
      <input placeholder="Client ID" value=${id} onInput=${e => setId(e.target.value)} spellcheck="false" maxlength="40"/>
      <button class="mu-pill" disabled=${SP.connecting || id.trim().length < 32} onClick=${() => connect(id)}>${SP.connecting ? 'Жду браузер…' : 'Войти'}</button>
    </div>
    <small class="mu-connect-note">Ключ и вход хранятся только на этом компьютере. Подписка Premium не нужна: без неё треки включаются в приложении Spotify.</small>
  </div>`;
}

function HomeView() {
  const h = SP.home;
  return html`<div class="mu-view">
    <${NowCard}/>
    ${!loggedIn() ? html`<${ConnectCard}/>` : !h || h.loading ? html`<${Loading}/>` : h.err ? html`<${Empty} text=${h.err}/>` : html`
      <div class="mu-quick">
        <button class="mu-liked" onClick=${openLiked}><span class="mu-liked-ic">${IC.heart(18)}</span><span><b>Любимые треки</b><small>${h.likedTotal || 0} тр.</small></span></button>
      </div>
      ${h.recent?.length > 0 && html`<${Sec} title="Недавно слушали">${h.recent.map((t, i) => html`<${TrackRow} key=${t.id} t=${t} i=${i}/>`)}</${Sec}>`}
      ${h.playlists?.length > 0 && html`<${Sec} title="Ваши плейлисты"><div class="mu-albums">${h.playlists.map(pl => html`<${PlTile} key=${pl.id} pl=${pl}/>`)}</div></${Sec}>`}
      ${h.liked?.length > 0 && html`<${Sec} title="Любимые треки" action=${html`<button class="mu-mini" onClick=${openLiked}>Все</button>`}>${h.liked.slice(0, 8).map((t, i) => html`<${TrackRow} key=${t.id} t=${t} i=${i} ctx="spotify:collection:tracks"/>`)}</${Sec}>`}`}
  </div>`;
}

function SearchView() {
  const s = SP.search || {};
  if (s.err) return html`<${Empty} text=${s.err}/>`;
  if (s.loading && !s.tracks) return html`<${Loading}/>`;
  return html`<div class="mu-view">
    ${s.artists?.length > 0 && html`<${Sec} title="Исполнители"><div class="mu-artists">${s.artists.slice(0, 8).map(a => html`<${ArtistChip} key=${a.id} a=${a}/>`)}</div></${Sec}>`}
    <${Sec} title="Треки">${s.tracks?.length ? s.tracks.map((t, i) => html`<${TrackRow} key=${t.id} t=${t} i=${i}/>`) : html`<${Empty} text="Ничего не нашлось"/>`}</${Sec}>
    ${s.albums?.length > 0 && html`<${Sec} title="Альбомы"><div class="mu-albums">${s.albums.map(al => html`<${AlbumTile} key=${al.id} al=${al}/>`)}</div></${Sec}>`}
    ${s.playlists?.length > 0 && html`<${Sec} title="Плейлисты"><div class="mu-albums">${s.playlists.map(pl => html`<${PlTile} key=${pl.id} pl=${pl}/>`)}</div></${Sec}>`}
  </div>`;
}

function Hero({ img, round = 12, title, sub, children }) {
  return html`<div class="mu-hero">
    ${img && html`<div class="mu-hero-bg" style=${`background-image:url("${img}")`}/>`}
    <${Cover} src=${img} size=${round > 40 ? 84 : 96} round=${round}/>
    <div class="mu-hero-txt"><b>${title}</b>${sub && html`<small>${sub}</small>`}${children}</div>
  </div>`;
}
const fmtN = n => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.0', '')} млн` : n >= 1e3 ? `${Math.round(n / 1e3)} тыс.` : String(n || 0));

function ArtistView({ v }) {
  const a = v.artist;
  const [all, setAll] = useState(false);
  const top = v.top || [];
  const albums = (v.albums || []).filter(x => x.album_type !== 'single'), singles = (v.albums || []).filter(x => x.album_type === 'single');
  return html`<div class="mu-view">
    <${Hero} img=${imgOf(a?.images, 300)} round=${48} title=${a?.name || v.name} sub=${a ? [`${fmtN(a.followers?.total)} подписчиков`, a.genres?.[0]].filter(Boolean).join(' · ') : ''}>
      ${top.length > 0 && html`<button class="mu-pill" onClick=${() => playTrack(top[0], `spotify:artist:${v.id}`)}>${IC.play(13)} Слушать</button>`}
    </${Hero}>
    <${Sec} title="Популярное">${v.top == null ? html`<${Loading}/>` : top.length ? (all ? top : top.slice(0, 5)).map((t, i) => html`<${TrackRow} key=${t.id} t=${t} i=${i} num=${i + 1}/>`) : html`<${Empty} text="Нет данных"/>`}
      ${top.length > 5 && html`<button class="mu-more" onClick=${() => setAll(!all)}>${all ? 'Свернуть' : 'Показать все'}</button>`}</${Sec}>
    ${v.albums == null ? html`<${Loading}/>` : html`
      ${albums.length > 0 && html`<${Sec} title="Альбомы"><div class="mu-albums grid">${albums.map(al => html`<${AlbumTile} key=${al.id} al=${al}/>`)}</div></${Sec}>`}
      ${singles.length > 0 && html`<${Sec} title="Синглы и EP"><div class="mu-albums">${singles.map(al => html`<${AlbumTile} key=${al.id} al=${al}/>`)}</div></${Sec}>`}`}
  </div>`;
}
function AlbumView({ v }) {
  const al = v.album;
  return html`<div class="mu-view">
    <${Hero} img=${imgOf(al.images, 300)} title=${al.name} sub=${[year(al.release_date), al.total_tracks ? `${al.total_tracks} тр.` : ''].filter(Boolean).join(' · ')}>
      <div class="mu-artists-line">${(al.artists || []).map((a, i) => html`${i ? ', ' : ''}<button class="mu-link" onClick=${() => openArtist(a)}>${a.name}</button>`)}</div>
      ${v.tracks?.length > 0 && html`<button class="mu-pill" onClick=${() => playTrack(v.tracks[0], al.uri)}>${IC.play(13)} Слушать</button>`}
    </${Hero}>
    <${Sec} title="Треки">${v.tracks == null ? html`<${Loading}/>` : v.tracks.length ? v.tracks.map((t, i) => html`<${TrackRow} key=${t.id} t=${t} i=${i} num=${t.track_number} ctx=${al.uri}/>`) : html`<${Empty} text="Список треков недоступен"/>`}</${Sec}>
  </div>`;
}
function PlaylistView({ v }) {
  const pl = v.pl;
  return html`<div class="mu-view">
    <${Hero} img=${imgOf(pl.images, 300)} title=${pl.name} sub=${[pl.owner?.display_name, pl.tracks?.total != null ? `${pl.tracks.total} тр.` : ''].filter(Boolean).join(' · ')}>
      ${v.tracks?.length > 0 && html`<button class="mu-pill" onClick=${() => playTrack(v.tracks[0], pl.uri)}>${IC.play(13)} Слушать</button>`}
    </${Hero}>
    <${Sec} title="Треки">${v.tracks == null ? html`<${Loading}/>` : v.tracks.length ? v.tracks.map((t, i) => html`<${TrackRow} key=${`${t.id}${i}`} t=${t} i=${i} ctx=${pl.uri}/>`) : html`<${Empty} text=${v.err || 'Плейлист пуст'}/>`}</${Sec}>
  </div>`;
}
function LikedView({ v }) {
  return html`<div class="mu-view">
    <div class="mu-hero liked"><span class="mu-liked-ic big">${IC.heart(34)}</span><div class="mu-hero-txt"><b>Любимые треки</b><small>${v.total ?? ''} тр.</small>
      ${v.tracks?.length > 0 && html`<button class="mu-pill" onClick=${() => playTrack(v.tracks[0], 'spotify:collection:tracks')}>${IC.play(13)} Слушать</button>`}</div></div>
    ${v.tracks == null ? html`<${Loading}/>` : v.tracks.map((t, i) => html`<${TrackRow} key=${`${t.id}${i}`} t=${t} i=${i} ctx="spotify:collection:tracks"/>`)}
    ${v.next && html`<button class="mu-more" onClick=${() => moreLiked(v)}>${v.loading ? 'Загружаю…' : 'Ещё'}</button>`}
  </div>`;
}

const TITLES = { artist: 'Исполнитель', album: 'Альбом', playlist: 'Плейлист', liked: 'Любимые', track: 'Сейчас играет' };

// Панель: открывается из ноты, закрывается щелчком мимо или Esc. Угол слева снизу — изменить размер.
export function MusicPanel() {
  const ref = useRef();
  const inputRef = useRef();
  const [size, setSize] = useState(null);
  useEffect(() => {
    if (!SP.open) return;
    const off = e => { if (!ref.current?.contains(e.target) && !e.target.closest?.('.music-btn, .music-cap, .ctx')) toggle(false); };
    const esc = e => { if (e.key === 'Escape' && !S.modal) { e.stopPropagation(); if (SP.stack.length) back(); else toggle(false); } };
    window.addEventListener('mousedown', off);
    window.addEventListener('keydown', esc, true);
    return () => { window.removeEventListener('mousedown', off); window.removeEventListener('keydown', esc, true); };
  }, [SP.open]);
  if (!SP.open) return null;
  const v = SP.view;
  const w = size?.w ?? S.prefs.musicW ?? 360, h = size?.h ?? S.prefs.musicH ?? 560;
  const grip = e => {
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY, w0 = w, h0 = h;
    let cur = { w: w0, h: h0 };
    const mv = ev => { cur = { w: Math.round(Math.max(300, Math.min(620, w0 - (ev.clientX - x0)))), h: Math.round(Math.max(340, Math.min(innerHeight - 90, h0 + (ev.clientY - y0)))) }; setSize(cur); };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); setPref('musicW', cur.w); setPref('musicH', cur.h); setSize(null); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const more = e => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(r.right - 210, r.bottom + 4, [
      { label: 'Открыть Spotify', icon: Icon.menu('menu_play'), action: () => openInSpotify('spotify:') },
      ...(loggedIn() ? [{ label: 'Обновить', icon: Icon.menu('menu_select_all'), action: () => loadHome() }, { label: 'Отключить Spotify', icon: Icon.menu('menu_leave'), action: disconnect }] : []),
    ]);
  };
  const sub = v.kind !== 'home' && v.kind !== 'search';
  return html`<div class=${`music-panel ${SP.closing ? 'out' : ''} ${w < 340 ? 'narrow' : w > 460 ? 'wide' : ''}`} ref=${ref} style=${`width:${w}px;max-height:min(${h}px, calc(100% - var(--gap) * 2 - 64px))${size ? `;height:${h}px` : ''}`}>
    <div class="mu-head">
      ${sub ? html`<button class="mu-back" onClick=${back}>${IC.back(16)}<span>Назад</span></button><b class="mu-head-t">${TITLES[v.kind] || ''}</b><span style="width:64px"/>`
        : html`<label class=${`mu-search ${loggedIn() ? '' : 'off'}`}>${IC.search(14)}<input ref=${inputRef} placeholder=${loggedIn() ? 'Поиск в Spotify' : 'Поиск — после входа в Spotify'} disabled=${!loggedIn()} value=${SP.q} onInput=${e => setQuery(e.target.value)}/>
            ${SP.q && html`<button class="mu-clear" onClick=${() => { home(); inputRef.current?.focus(); }}>${IC.close(10)}</button>`}</label>
          <button class="mu-ic" title="Ещё" onClick=${more}>${IC.more(18)}</button>`}
    </div>
    <div class="mu-body" key=${v.kind + (v.id || '')}>
      ${v.kind === 'search' ? html`<${SearchView}/>` : v.kind === 'artist' ? html`<${ArtistView} v=${v}/>` : v.kind === 'album' ? html`<${AlbumView} v=${v}/>`
        : v.kind === 'playlist' ? html`<${PlaylistView} v=${v}/>` : v.kind === 'liked' ? html`<${LikedView} v=${v}/>` : v.kind === 'track' ? html`<${TrackView}/>` : html`<${HomeView}/>`}
    </div>
    <i class="mu-grip" title="Изменить размер" onPointerDown=${grip}/>
  </div>`;
}
