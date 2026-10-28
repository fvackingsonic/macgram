// Музыка macgram: нота в шапке → стеклянная капсула, когда играет трек; панель с поиском, чартами,
// историей, исполнителями и альбомами (каталог Deezer); страница трека — видео YouTube вместо обложки;
// когда страница закрыта — маленькое окошко с видео в углу (его можно перетаскивать).
import { html, useEffect, useLayoutEffect, useRef, useState } from '../lib.js';
import { S, changed, useTick, setPref } from '../store.js';
import { duration } from '../format.js';
import {
  MU, setQuery, openArtist, openAlbum, loadCharts, play, next, prev, toggle, seek, setVolume, setRepeat, setShuffle, stop, hideMini,
  playing, position, neighbor, togglePanel, go, back, home, openOnYouTube, attachFrame, pendingVideo,
} from '../music.js';

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
  volLo: (s = 15) => SV(s, html`<path d="M5 9.5v5h3.5l4.5 3.8V5.7L8.5 9.5z"/>`),
  volHi: (s = 15) => SV(s, html`<path d="M4 9.5v5h3.5l4.5 3.8V5.7L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>`),
  expand: (s = 15) => SV(s, html`<path d="M14 4.5h5.5V10M10 19.5H4.5V14M19.5 4.5 13.5 10.5M4.5 19.5l6-6"/>`),
  yt: (s = 14) => SV(s, html`<rect x="3" y="6" width="18" height="12" rx="3.5"/><path d="M10.5 9.6v4.8l4-2.4z" fill="currentColor"/>`),
};

// Стекло как у пузырей в чате: под элементом — размытая копия обоев ровно с этого места (как у
// пузырей, без backdrop-filter), а цвет текста подстраивается под яркость фона (светлый/тёмный).
export function bakeGlass(el) {
  if (!el?.isConnected) return;
  const root = document.documentElement;
  if (!root.classList.contains('wall-baked') || root.classList.contains('lite')) { el.removeAttribute('data-lg'); return; }
  const w = document.querySelector('.window > .wallpaper')?.getBoundingClientRect();
  if (!w) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--wbx', `${Math.round(w.left - r.left)}px`);
  el.style.setProperty('--wby', `${Math.round(w.top - r.top)}px`);
  const L = window.__lgLum;
  if (L && w.width && w.height) {
    const x0 = Math.max(0, Math.floor((r.left - w.left) / w.width * L.gw)), x1 = Math.min(L.gw - 1, Math.floor((r.right - w.left) / w.width * L.gw));
    const y0 = Math.max(0, Math.floor((r.top - w.top) / w.height * L.gh)), y1 = Math.min(L.gh - 1, Math.floor((r.bottom - w.top) / w.height * L.gh));
    let sum = 0, n = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { sum += L.d[y * L.gw + x]; n++; }
    if (n) el.dataset.lg = sum / n < .55 ? 'd' : 'l';
  }
}
// следить за местом элемента: после появления, анимаций и при изменении окна
function useBake(ref) {
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const run = () => bakeGlass(ref.current);
    run();
    const t1 = setTimeout(run, 80), t2 = setTimeout(run, 520);
    el.addEventListener('animationend', run);
    window.addEventListener('resize', run);
    return () => { clearTimeout(t1); clearTimeout(t2); el.removeEventListener('animationend', run); window.removeEventListener('resize', run); };
  });
}

function Cover({ src, size = 40, round = 8, cls = '' }) {
  return html`<span class=${`mu-cover ${cls}`} style=${size ? `width:${size}px;height:${size}px;border-radius:${round}px` : `border-radius:${round}px`}>
    ${src ? html`<img src=${src} alt="" loading="lazy" draggable="false"/>` : IC.note(size ? Math.round(size * .42) : 44)}</span>`;
}
const Eq = ({ on }) => html`<span class=${`mu-eq ${on ? 'on' : ''}`}><i/><i/><i/></span>`;
const fmtN = n => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.0', '')} млн` : n >= 1e3 ? `${Math.round(n / 1e3)} тыс.` : String(n || 0));

function Ring({ size }) {
  useTick();
  const r = size / 2 - 1.5, c = 2 * Math.PI * r;
  const v = MU.dur ? Math.min(1, position() / MU.dur) : 0;
  return html`<svg class="mc-ring" width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`}>
    <circle cx=${size / 2} cy=${size / 2} r=${r} class="mc-ring-bg"/>
    <circle cx=${size / 2} cy=${size / 2} r=${r} class="mc-ring-fg" stroke-dasharray=${c} stroke-dashoffset=${c * (1 - v)}/></svg>`;
}

// Нота / капсула в шапке (капсулу можно тянуть, как стеклянные кнопки — effects.js).
export function MusicChip() {
  const ref = useRef();
  useBake(ref);
  const on = MU.open && !MU.closing;
  const t = MU.cur;
  const g = 'mu-glass';
  if (!t) return html`<button ref=${ref} class=${`glass circle music-btn no-drag ${g} ${on ? 'active' : ''}`} title="Музыка" onClick=${e => { e.stopPropagation(); togglePanel(); }}>${IC.note(22)}</button>`;
  return html`<div ref=${ref} class=${`glass music-cap no-drag ${g} ${on ? 'active' : ''}`} role="button" title="Музыка" onClick=${e => { e.stopPropagation(); togglePanel(on ? false : true, on ? null : { kind: 'track' }); }}>
    <span class="mc-art"><${Cover} src=${t.album?.small} size=${32} round=${16}/><${Ring} size=${38}/></span>
    <span class="mc-txt"><b>${t.title}</b><small>${t.artist?.name || ''}</small></span>
    <button class="mc-btn" title=${playing() ? 'Пауза' : 'Играть'} onClick=${e => { e.stopPropagation(); toggle(); }}>${playing() ? IC.pause(16) : IC.play(16)}</button>
    <button class="mc-x" title="Закрыть трек" onClick=${e => { e.stopPropagation(); stop(); }}>${IC.close(9)}</button>
  </div>`;
}

function TrackRow({ t, list, i, num }) {
  const cur = MU.cur?.id === t.id;
  return html`<div class=${`mu-row ${cur ? 'cur' : ''}`} style=${i != null && i < 16 ? `animation-delay:${i * 14}ms` : ''} onClick=${() => (cur ? go({ kind: 'track' }) : play(t, list))}>
    ${num != null ? html`<span class="mu-num">${cur ? html`<${Eq} on=${playing()}/>` : num}</span>`
      : html`<span class="mu-row-art"><${Cover} src=${t.album?.small} size=${40} round=${7}/>${cur && html`<${Eq} on=${playing()}/>`}</span>`}
    <span class="mu-row-txt"><b>${t.title}${t.version ? html` <i class="mu-ver">${t.version}</i>` : ''}</b><small>${t.explicit ? html`<i class="mu-e">E</i>` : ''}${t.artist?.name || ''}</small></span>
    <span class="mu-row-dur">${t.dur ? duration(t.dur) : ''}</span>
  </div>`;
}
const Sec = ({ title, children, action }) => html`<div class="mu-sec"><div class="mu-sec-h"><span>${title}</span>${action}</div>${children}</div>`;
const Loading = () => html`<div class="mu-load"><i/><i/><i/></div>`;
const Empty = ({ text }) => html`<div class="mu-empty">${text}</div>`;
const AlbumTile = ({ al }) => html`<button class="mu-album" onClick=${() => openAlbum(al)} title=${al.title}>
  <${Cover} src=${al.img} size=${0} round=${10}/><b>${al.title}</b><small>${[al.year, al.type].filter(Boolean).join(' · ')}</small></button>`;
const ArtistChip = ({ a }) => html`<button class="mu-artist" onClick=${() => openArtist(a)}><${Cover} src=${a.img} size=${64} round=${32}/><span>${a.name}</span></button>`;

function Seek() {
  useTick();
  const [drag, setDrag] = useState(null);
  const d = MU.dur || 0, v = drag ?? (d ? Math.min(1, position() / d) : 0);
  const pos = e => { const r = e.currentTarget.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
  return html`<div class="mu-seek">
    <div class=${`mu-seek-bar ${drag != null ? 'drag' : ''}`}
      onPointerDown=${e => { if (!d) return; e.currentTarget.setPointerCapture(e.pointerId); setDrag(pos(e)); }}
      onPointerMove=${e => { if (drag != null) setDrag(pos(e)); }}
      onPointerUp=${e => { if (drag != null) { seek(pos(e) * d); setDrag(null); } }}>
      <i class="mu-seek-fill" style=${`transform:scaleX(${v})`}/><i class="mu-seek-knob" style=${`left:${v * 100}%`}/>
    </div>
    <div class="mu-seek-t"><span>${duration(Math.floor(v * d))}</span><span>-${duration(Math.max(0, Math.floor(d - v * d)))}</span></div>
  </div>`;
}
function Controls() {
  const rep = MU.repeat, on = playing();
  return html`<div class="mu-ctl">
    <button class=${`mu-ic ${MU.shuffle ? 'on' : ''}`} title="Перемешать" onClick=${() => setShuffle(!MU.shuffle)}>${IC.shuffle(18)}</button>
    <button class="mu-ic big" title="Назад" onClick=${prev}><span class="flip">${IC.next(24)}</span></button>
    <button class=${`mu-play ${on ? 'on' : ''}`} title=${on ? 'Пауза' : 'Играть'} onClick=${toggle}>${on ? IC.pause(24) : IC.play(24)}</button>
    <button class="mu-ic big" title="Вперёд" disabled=${!neighbor(1)} onClick=${next}>${IC.next(24)}</button>
    <button class=${`mu-ic ${rep ? 'on' : ''}`} title=${rep === 2 ? 'Повтор трека' : rep === 1 ? 'Повтор очереди' : 'Повтор выключен'} onClick=${() => setRepeat((rep + 1) % 3)}>
      ${IC.repeat(18)}${rep === 2 && html`<i class="mu-one">1</i>`}</button>
  </div>`;
}
function Volume() {
  const v = MU.vol;
  return html`<label class="mu-vol" onWheel=${e => { e.preventDefault(); setVolume(v - Math.sign(e.deltaY) * 5); }}>
    <button class="mu-vbtn" onClick=${e => { e.preventDefault(); setVolume(v ? 0 : 60); }}>${IC.volLo(15)}</button>
    <input type="range" min="0" max="100" step="1" value=${v} style=${`--v:${v}%`} onInput=${e => setVolume(Number(e.target.value))}/>
    ${IC.volHi(15)}</label>`;
}

// Место под видео на странице трека: само видео — в MusicVideoHost (iframe нельзя переносить в DOM,
// иначе он перезагрузится), он ложится ровно поверх этого места.
function VideoSlot() {
  const t = MU.cur;
  const yt = MU.mode === 'yt';
  return html`<div class=${`mu-vslot ${yt ? 'yt' : ''}`}>
    ${!yt && html`<div class="mu-vslot-bg" style=${t?.album?.img ? `background-image:url("${t.album.img}")` : ''}/>
      <${Cover} src=${t?.album?.img} size=${0} round=${12} cls=${`mu-vslot-art ${playing() ? 'playing' : ''}`}/>`}
    ${MU.state === 'loading' && !yt && html`<div class="mu-vslot-load"><${Loading}/></div>`}
  </div>`;
}

function TrackView() {
  const t = MU.cur;
  if (!t) return html`<div class="mu-view"><${Empty} text="Ничего не играет. Найдите трек поиском или выберите в «Популярном»."/></div>`;
  const q = MU.queue, rest = q.slice(MU.qi + 1, MU.qi + 31);
  return html`<div class="mu-view mu-track">
    <div class="mu-track-info">
      <b title=${t.title}>${t.title}${t.version ? html` <i class="mu-ver">${t.version}</i>` : ''}</b>
      <div class="mu-track-sub">
        ${t.artist && html`<button class="mu-link" onClick=${() => openArtist(t.artist)}>${t.artist.name}</button>`}
        ${t.album?.title && html`<span class="mu-dot">·</span><button class="mu-link sub" onClick=${() => openAlbum(t.album)}>${t.album.title}</button>`}
      </div>
    </div>
    ${MU.err && html`<div class="mu-note warn">${MU.err}</div>`}
    <${Seek}/>
    <${Controls}/>
    <${Volume}/>
    <div class="mu-track-actions">
      <button class="mu-chipbtn" onClick=${openOnYouTube}>${IC.yt(14)} На YouTube</button>
      <button class="mu-chipbtn" onClick=${stop}>${IC.close(11)} Закрыть трек</button>
    </div>
    ${rest.length > 0 && html`<${Sec} title="Далее">${rest.map((x, i) => html`<${TrackRow} key=${`${x.id}:${i}`} t=${x} i=${i}/>`)}</${Sec}>`}
  </div>`;
}

function NowCard() {
  const t = MU.cur;
  if (!t) return null;
  return html`<div class="mu-nowcard" onClick=${() => go({ kind: 'track' })}>
    ${t.album?.img && html`<div class="mu-now-bg" style=${`background-image:url("${t.album.img}")`}/>`}
    <${Cover} src=${t.album?.small} size=${48} round=${9}/>
    <span class="mu-row-txt"><b>${t.title}</b><small>${t.artist?.name || ''}</small></span>
    <button class="mu-ic" onClick=${e => { e.stopPropagation(); toggle(); }}>${playing() ? IC.pause(18) : IC.play(18)}</button>
    <button class="mu-ic" disabled=${!neighbor(1)} onClick=${e => { e.stopPropagation(); next(); }}>${IC.next(18)}</button>
  </div>`;
}

function HomeView() {
  useEffect(() => { loadCharts(); }, []);
  const ch = MU.charts, hist = MU.hist;
  return html`<div class="mu-view">
    <${NowCard}/>
    ${hist.length > 0 && html`<${Sec} title="Недавно играло">${hist.slice(0, 6).map((t, i) => html`<${TrackRow} key=${t.id} t=${t} list=${hist} i=${i}/>`)}</${Sec}>`}
    <${Sec} title="Популярное сейчас">${!ch || ch.loading ? html`<${Loading}/>` : ch.tracks.length ? ch.tracks.map((t, i) => html`<${TrackRow} key=${t.id} t=${t} list=${ch.tracks} i=${i} num=${i + 1}/>`)
      : html`<${Empty} text=${ch.err ? 'Каталог сейчас недоступен — проверьте интернет' : 'Пусто'}/>`}</${Sec}>
  </div>`;
}

function SearchView() {
  const s = MU.search || {};
  if (s.err) return html`<${Empty} text=${s.err}/>`;
  if (s.loading && !s.tracks) return html`<${Loading}/>`;
  return html`<div class="mu-view">
    ${s.artists?.length > 0 && html`<${Sec} title="Исполнители"><div class="mu-artists">${s.artists.map(a => html`<${ArtistChip} key=${a.id} a=${a}/>`)}</div></${Sec}>`}
    <${Sec} title="Треки">${s.tracks?.length ? s.tracks.map((t, i) => html`<${TrackRow} key=${t.id} t=${t} list=${s.tracks} i=${i}/>`) : html`<${Empty} text="Ничего не нашлось"/>`}</${Sec}>
    ${s.albums?.length > 0 && html`<${Sec} title="Альбомы"><div class="mu-albums">${s.albums.map(al => html`<${AlbumTile} key=${al.id} al=${al}/>`)}</div></${Sec}>`}
  </div>`;
}

function Hero({ img, round = 12, title, sub, children }) {
  return html`<div class="mu-hero">
    ${img && html`<div class="mu-hero-bg" style=${`background-image:url("${img}")`}/>`}
    <${Cover} src=${img} size=${88} round=${round}/>
    <div class="mu-hero-txt"><b>${title}</b>${sub && html`<small>${sub}</small>`}${children}</div>
  </div>`;
}
function ArtistView({ v }) {
  const a = v.artist;
  const [all, setAll] = useState(false);
  const top = v.top || [];
  const albums = (v.albums || []).filter(x => !x.single), singles = (v.albums || []).filter(x => x.single);
  return html`<div class="mu-view">
    <${Hero} img=${a?.img} round=${44} title=${a?.name || v.name} sub=${a?.fans ? `${fmtN(a.fans)} слушателей` : ''}>
      ${top.length > 0 && html`<button class="mu-pill" onClick=${() => play(top[0], top)}>${IC.play(13)} Слушать</button>`}
    </${Hero}>
    <${Sec} title="Популярное">${v.top == null ? html`<${Loading}/>` : top.length ? (all ? top : top.slice(0, 5)).map((t, i) => html`<${TrackRow} key=${t.id} t=${t} list=${top} i=${i} num=${i + 1}/>`) : html`<${Empty} text="Нет данных"/>`}
      ${top.length > 5 && html`<button class="mu-more" onClick=${() => setAll(!all)}>${all ? 'Свернуть' : 'Показать все'}</button>`}</${Sec}>
    ${v.albums == null ? html`<${Loading}/>` : html`
      ${albums.length > 0 && html`<${Sec} title="Альбомы"><div class="mu-albums grid">${albums.map(al => html`<${AlbumTile} key=${al.id} al=${al}/>`)}</div></${Sec}>`}
      ${singles.length > 0 && html`<${Sec} title="Синглы и EP"><div class="mu-albums">${singles.map(al => html`<${AlbumTile} key=${al.id} al=${al}/>`)}</div></${Sec}>`}`}
  </div>`;
}
function AlbumView({ v }) {
  const al = v.album;
  return html`<div class="mu-view">
    <${Hero} img=${al.img} title=${al.title} sub=${[al.year, al.type, al.count ? `${al.count} тр.` : ''].filter(Boolean).join(' · ')}>
      ${al.artist && html`<button class="mu-link" onClick=${() => openArtist(al.artist)}>${al.artist.name}</button>`}
      ${v.tracks?.length > 0 && html`<button class="mu-pill" onClick=${() => play(v.tracks[0], v.tracks)}>${IC.play(13)} Слушать</button>`}
    </${Hero}>
    <${Sec} title="Треки">${v.tracks == null ? html`<${Loading}/>` : v.tracks.length ? v.tracks.map((t, i) => html`<${TrackRow} key=${t.id} t=${t} list=${v.tracks} i=${i} num=${t.n || i + 1}/>`) : html`<${Empty} text="Список треков недоступен"/>`}</${Sec}>
  </div>`;
}

const TITLES = { artist: 'Исполнитель', album: 'Альбом', track: 'Сейчас играет' };

// Панель: открывается из ноты, закрывается щелчком мимо или Esc; угол слева снизу — изменить размер.
export function MusicPanel() {
  const ref = useRef();
  useBake(ref);
  const inputRef = useRef();
  const [size, setSize] = useState(null);
  useEffect(() => {
    if (!MU.open) return;
    const off = e => { if (!ref.current?.contains(e.target) && !e.target.closest?.('.music-btn, .music-cap, .mv-host, .ctx')) togglePanel(false); };
    const esc = e => { if (e.key === 'Escape' && !S.modal) { e.stopPropagation(); if (MU.stack.length) back(); else togglePanel(false); } };
    window.addEventListener('mousedown', off);
    window.addEventListener('keydown', esc, true);
    return () => { window.removeEventListener('mousedown', off); window.removeEventListener('keydown', esc, true); };
  }, [MU.open]);
  if (!MU.open) return null;
  const v = MU.view;
  const w = size?.w ?? Math.max(380, S.prefs.musicW ?? 380), h = size?.h ?? S.prefs.musicH ?? 600;
  const grip = e => {
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY, w0 = w, h0 = h;
    let cur = { w: w0, h: h0 };
    const mv = ev => { cur = { w: Math.round(Math.max(380, Math.min(640, w0 - (ev.clientX - x0)))), h: Math.round(Math.max(420, Math.min(innerHeight - 90, h0 + (ev.clientY - y0)))) }; setSize(cur); };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); setPref('musicW', cur.w); setPref('musicH', cur.h); setSize(null); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const sub = v.kind !== 'home' && v.kind !== 'search';
  return html`<div class=${`music-panel mu-glass ${MU.closing ? 'out' : ''} ${w > 470 ? 'wide' : ''} view-${v.kind}`} ref=${ref}
    style=${`width:${w}px;max-height:min(${h}px, calc(100% - var(--gap) * 2 - 64px))${size ? `;height:${h}px` : ''}`}>
    ${v.kind === 'track' && MU.cur?.album?.img && html`<div class="mu-ambient" style=${`background-image:url("${MU.cur.album.img}")`}/>`}
    <div class="mu-head">
      ${sub ? html`<button class="mu-back" onClick=${back}>${IC.back(16)}<span>Назад</span></button><b class="mu-head-t">${TITLES[v.kind] || ''}</b><span class="mu-head-pad"/>`
        : html`<label class="mu-search">${IC.search(14)}<input ref=${inputRef} placeholder="Треки, исполнители, альбомы" value=${MU.q} onInput=${e => setQuery(e.target.value)}/>
            ${MU.q && html`<button class="mu-clear" onClick=${() => { home(); inputRef.current?.focus(); }}>${IC.close(10)}</button>`}</label>`}
    </div>
    ${v.kind === 'track' && MU.cur && html`<${VideoSlot}/>`}
    <div class="mu-body" key=${v.kind + (v.id || '')}>
      ${v.kind === 'search' ? html`<${SearchView}/>` : v.kind === 'artist' ? html`<${ArtistView} v=${v}/>` : v.kind === 'album' ? html`<${AlbumView} v=${v}/>`
        : v.kind === 'track' ? html`<${TrackView}/>` : html`<${HomeView}/>`}
    </div>
    <i class="mu-grip" title="Изменить размер" onPointerDown=${grip}/>
  </div>`;
}

// ── видео YouTube: одно на всё приложение; лежит поверх места на странице трека или в мини-окошке ──
const MINI_W = 356, MINI_H = 200, BAR = 46;
const embed = id => `https://www.youtube-nocookie.com/embed/${id}?${new URLSearchParams({
  enablejsapi: '1', autoplay: '1', controls: '0', disablekb: '1', playsinline: '1', rel: '0', iv_load_policy: '3', fs: '0',
  origin: location.origin, widget_referrer: location.origin })}`;

let bakeT = 0;
const bakeLater = el => { clearTimeout(bakeT); bakeT = setTimeout(() => bakeGlass(el), 560); };
export function MusicVideoHost() {
  const host = useRef(), slotBox = useRef(), ifr = useRef(null), dragRef = useRef(null);
  const [pos, setPos] = useState(null);
  const yt = !!MU.cur && MU.mode === 'yt';
  const onTrack = MU.open && !MU.closing && MU.view.kind === 'track';
  const mini = yt && !onTrack && MU.mini;
  // iframe создаём один раз и не трогаем; когда трек закрыли — убираем
  useEffect(() => {
    if (yt && !ifr.current && pendingVideo()) {
      const f = document.createElement('iframe');
      f.src = embed(pendingVideo()); f.__vid = pendingVideo();
      f.allow = 'autoplay; encrypted-media; picture-in-picture';
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      f.title = 'YouTube';
      slotBox.current.appendChild(f);
      ifr.current = f; MU.ready = false; attachFrame(f);
    }
    if (!MU.cur && ifr.current) { ifr.current.remove(); ifr.current = null; attachFrame(null); MU.ready = false; }
  });
  // место: поверх .mu-vslot на странице трека или мини-окошко в углу
  useLayoutEffect(() => {
    const el = host.current; if (!el) return;
    let raf = 0, until = performance.now() + 520;
    const place = () => {
      const slot = onTrack && document.querySelector('.music-panel .mu-vslot');
      let r;
      if (slot && yt) { const b = slot.getBoundingClientRect(); r = { x: b.left, y: b.top, w: b.width, h: b.height, mode: 'slot' }; }
      else {
        const m = document.querySelector('.main')?.getBoundingClientRect() || { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
        const p = pos || S.prefs.musicMini;
        const panel = MU.open && document.querySelector('.music-panel')?.getBoundingClientRect();
        let x = p ? p.x : m.right - MINI_W - 18, y = p ? p.y : m.bottom - MINI_H - BAR - 86;
        if (!p && panel) x = Math.max(m.left + 12, panel.left - MINI_W - 14);
        x = Math.max(4, Math.min(innerWidth - MINI_W - 4, x)); y = Math.max(4, Math.min(innerHeight - MINI_H - BAR - 4, y));
        r = { x, y, w: MINI_W, h: MINI_H, mode: 'mini' };
      }
      el.style.transform = `translate(${Math.round(r.x)}px,${Math.round(r.y)}px)`;
      el.style.width = `${Math.round(r.w)}px`;
      el.style.setProperty('--vh', `${Math.round(r.h)}px`);
      el.dataset.mode = r.mode;
      if (r.mode === 'mini') { const bar = el.querySelector('.mv-bar'); if (bar) bakeLater(bar); }
      if (performance.now() < until) raf = requestAnimationFrame(place);
    };
    place();
    const onResize = () => { until = performance.now() + 50; place(); };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  });
  const startDrag = e => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const b = host.current.getBoundingClientRect(), dx = e.clientX - b.left, dy = e.clientY - b.top;
    host.current.classList.add('dragging');
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { dx, dy, last: null };
    const mv = ev => { const p = { x: ev.clientX - dx, y: ev.clientY - dy }; dragRef.current.last = p; setPos(p); };
    const up = () => { e.target.removeEventListener('pointermove', mv); e.target.removeEventListener('pointerup', up); host.current?.classList.remove('dragging'); if (dragRef.current.last) setPref('musicMini', dragRef.current.last); bakeLater(host.current?.querySelector('.mv-bar')); };
    e.target.addEventListener('pointermove', mv); e.target.addEventListener('pointerup', up);
  };
  const t = MU.cur;
  const visible = yt && (onTrack || mini);
  return html`<div class=${`mv-host ${visible ? 'on' : ''} ${mini ? 'mini' : ''}`} ref=${host} aria-hidden=${visible ? 'false' : 'true'}>
    <div class="mv-video" ref=${slotBox}/>
    ${t && html`<div class="mv-bar mu-glass" onPointerDown=${startDrag}>
      <span class="mv-txt"><b>${t.title}</b><small>${t.artist?.name || ''}</small></span>
      <button class="mv-btn" title=${playing() ? 'Пауза' : 'Играть'} onClick=${toggle}>${playing() ? IC.pause(16) : IC.play(16)}</button>
      <button class="mv-btn" title="Вперёд" disabled=${!neighbor(1)} onClick=${next}>${IC.next(16)}</button>
      <button class="mv-btn" title="Открыть плеер" onClick=${() => togglePanel(true, { kind: 'track' })}>${IC.expand(14)}</button>
      <button class="mv-btn" title="Скрыть (пауза)" onClick=${hideMini}>${IC.close(12)}</button>
    </div>`}
  </div>`;
}
