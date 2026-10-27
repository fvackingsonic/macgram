// Панель эмодзи / стикеров / GIF над полем ввода — как всплывающая панель в Telegram для macOS.
import { html, memo, useEffect, useRef, useState } from '../lib.js';
import { download, fileUrl, showHud, useFile } from '../store.js';
import { send } from '../td.js';
import { Icon } from '../icons.js';
import { EMOJI } from '../emoji-data.js';
import { Tgs, TgsStill } from './tgs.js';
import { MI } from '../mac-icons.js';
const CAT_ICON = { recent: 'Icon_EmojiTabRecent', people: 'Icon_EmojiTabSmiles', nature: 'Icon_EmojiTabNature', food: 'Icon_EmojiTabFood', activity: 'Icon_EmojiTabSports', travel: 'Icon_EmojiTabCar', objects: 'Icon_EmojiTabObjects', symbols: 'Icon_EmojiTabSymbols', flags: 'Icon_EmojiTabFlag' };

const RECENT_KEY = 'recentEmoji';
const recentEmoji = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };
const pushRecent = e => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([e, ...recentEmoji().filter(x => x !== e)].slice(0, 32))); } catch {} };

const remote = f => ({ '@type': 'inputFileRemote', id: f.remote.id });
async function sendSticker(chatId, st) {
  try {
    await send({ '@type': 'sendMessage', chat_id: chatId, input_message_content: { '@type': 'inputMessageSticker', sticker: { '@type': 'inputSticker', sticker: remote(st.sticker), width: st.width, height: st.height }, emoji: st.emoji || '' } });
  } catch (e) { showHud(e.message?.includes('CHAT_SEND_STICKERS_FORBIDDEN') ? 'В этом чате нельзя отправлять стикеры' : e.message); }
}
async function sendGif(chatId, a) {
  try {
    await send({ '@type': 'sendMessage', chat_id: chatId, input_message_content: { '@type': 'inputMessageAnimation', animation: { '@type': 'inputAnimation', animation: remote(a.animation), duration: a.duration, width: a.width, height: a.height }, caption: { '@type': 'formattedText', text: '', entities: [] } } });
  } catch (e) { showHud(e.message); }
}

// Видна ли ячейка (с запасом) внутри прокручиваемой панели. Один наблюдатель на панель.
function useVisible(ref, root, margin = '200px') {
  const [vis, setVis] = useState(false);
  useEffect(() => {
    if (vis || !ref.current) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); io.disconnect(); } }, { root: root?.current || null, rootMargin: margin });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [vis]);
  return vis;
}

// Панель не перерисовывается вместе со всем окном: колбэки берём из ref,
// а файлы стикеров/GIF обновляют только свою ячейку (useFile).
function MediaPanelView({ chatId, onEmoji, onClose }) {
  const cb = useRef({});
  cb.current = { onEmoji, onClose };
  const emoji = useRef(e => cb.current.onEmoji(e)).current;
  const close = useRef(() => cb.current.onClose()).current;
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('panelTab') || 'emoji'; } catch { return 'emoji'; } });
  const ref = useRef();
  useEffect(() => {
    const off = e => { if (!ref.current?.contains(e.target) && !e.target.closest('.emoji-btn')) close(); };
    const esc = e => e.key === 'Escape' && close();
    window.addEventListener('mousedown', off); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('mousedown', off); window.removeEventListener('keydown', esc); };
  }, []);
  const pick = t => { setTab(t); try { localStorage.setItem('panelTab', t); } catch {} };
  return html`<div class="media-panel" ref=${ref}>
    <div class="mp-tabs">
      ${[['emoji', 'Эмодзи', 'Icon_Entertainment_Emoji'], ['stickers', 'Стикеры', 'Icon_Entertainment_Stickers'], ['gifs', 'GIF', 'Icon_Entertainment_Gifs']].map(([id, t, ic]) => html`
        <button class=${tab === id ? 'on' : ''} title=${t} onClick=${() => pick(id)}>${MI(ic, 24)}</button>`)}
    </div>
    ${tab === 'emoji' && html`<${EmojiTab} onEmoji=${emoji}/>`}
    ${tab === 'stickers' && html`<${StickersTab} chatId=${chatId} onClose=${close}/>`}
    ${tab === 'gifs' && html`<${GifsTab} chatId=${chatId} onClose=${close}/>`}
  </div>`;
}
export const MediaPanel = memo(MediaPanelView, ['onEmoji', 'onClose']);

// Раздел эмодзи рисуется, только когда до него докрутили; до этого — пустышка нужной высоты.
function EmojiSection({ c, root, eager }) {
  const ref = useRef();
  const vis = useVisible(ref, root, '400px') || eager;
  const rows = Math.ceil(c.list.length / 8);
  return html`<div data-cat=${c.id} ref=${ref}>
    <div class="mp-sec">${c.title}</div>
    ${vis ? html`<div class="emoji-grid">${c.list.map(e => html`<button data-e=${e}>${e}</button>`)}</div>`
      : html`<div style=${`height:${rows * 40}px`}/>`}
  </div>`;
}
function EmojiTab({ onEmoji }) {
  const body = useRef();
  const [recent] = useState(recentEmoji);
  const cats = recent.length ? [{ id: 'recent', title: 'Недавние', list: recent }, ...EMOJI] : EMOJI;
  const jump = id => body.current?.querySelector(`[data-cat="${id}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  // Один обработчик на всю сетку вместо тысячи.
  const click = e => { const b = e.target.closest('button[data-e]'); if (b) { pushRecent(b.dataset.e); onEmoji(b.dataset.e); } };
  return html`
    <div class="mp-body" ref=${body} onClick=${click}>
      ${cats.map((c, i) => html`<${EmojiSection} key=${c.id} c=${c} root=${body} eager=${i < 2}/>`)}
    </div>
    <div class="mp-foot">${cats.map(c => html`<button title=${c.title} onClick=${() => jump(c.id)}>${MI(CAT_ICON[c.id], 22)}</button>`)}</div>`;
}

function StickerCell({ st, onSend, root }) {
  const ref = useRef();
  const vis = useVisible(ref, root);
  const [hover, setHover] = useState(false);
  const fmt = st.format?.['@type'];
  const thumb = st.thumbnail;
  const thumbOk = thumb && thumb.format?.['@type'] === 'thumbnailFormatWebp';
  const tFile = useFile(thumbOk ? thumb.file : null);
  const sFile = useFile(st.sticker);
  useEffect(() => {
    if (!vis) return;
    if (thumbOk) download(thumb.file, 1);
    download(st.sticker, 1);
  }, [vis]);
  let inner = html`<span>${st.emoji}</span>`;
  if (vis) {
    const thumbUrl = thumbOk ? fileUrl(tFile) : '';
    const url = fileUrl(sFile);
    if (fmt === 'stickerFormatTgs') {
      inner = hover && url ? html`<${Tgs} file=${st.sticker} size=${60} autoplay=${true} fallback=${st.emoji}/>`
        : thumbUrl ? html`<img src=${thumbUrl} alt=${st.emoji} draggable="false"/>`
          : url ? html`<${TgsStill} url=${url} size=${60} alt=${st.emoji}/>` : inner;
    } else if (fmt === 'stickerFormatWebm') {
      inner = hover && url ? html`<video src=${url} muted loop autoplay playsinline/>`
        : thumbUrl ? html`<img src=${thumbUrl} alt=${st.emoji} draggable="false"/>` : inner;
    } else {
      const u = url || thumbUrl;
      if (u) inner = html`<img src=${u} alt=${st.emoji} draggable="false" decoding="async"/>`;
    }
  }
  return html`<button class="st-cell" ref=${ref} title=${st.emoji} onClick=${onSend}
    onMouseEnter=${() => setHover(true)} onMouseLeave=${() => setHover(false)}>${inner}</button>`;
}
function SetSection({ set, chatId, onClose, root }) {
  const ref = useRef();
  const [stickers, setStickers] = useState(set.stickers || null);
  useEffect(() => {
    if (stickers) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      send({ '@type': 'getStickerSet', set_id: set.id }).then(r => setStickers(r.stickers)).catch(() => setStickers([]));
    }, { root: root.current, rootMargin: '300px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [set.id]);
  return html`<div ref=${ref} data-set=${set.id}>
    <div class="mp-sec">${set.title}</div>
    <div class="st-grid">${(stickers || Array(Math.min(set.size || 10, 20)).fill(null)).map((st, i) => st
      ? html`<${StickerCell} key=${st.sticker.id} st=${st} root=${root} onSend=${() => { sendSticker(chatId, st); onClose(); }}/>`
      : html`<div class="st-cell ph" key=${i}/>`)}</div>
  </div>`;
}

function SetIcon({ set }) {
  const st = set.covers?.[0];
  const th = set.thumbnail;
  const thF = useFile(th?.file), cF = useFile(st?.thumbnail?.file);
  const thUrl = th && th.format?.['@type'] === 'thumbnailFormatWebp' ? fileUrl(thF) : '';
  useEffect(() => { if (th && th.format?.['@type'] === 'thumbnailFormatWebp') download(th.file, 1); else if (st?.thumbnail) download(st.thumbnail.file, 1); }, [set.id]);
  const coverUrl = !thUrl && st?.thumbnail && st.thumbnail.format?.['@type'] === 'thumbnailFormatWebp' ? fileUrl(cF) : '';
  return thUrl || coverUrl ? html`<img src=${thUrl || coverUrl} alt=""/>` : html`<span>${st?.emoji || '🙂'}</span>`;
}

function StickersTab({ chatId, onClose }) {
  const body = useRef();
  const [sets, setSets] = useState(null);
  const [recent, setRecent] = useState([]);
  useEffect(() => {
    send({ '@type': 'getInstalledStickerSets', sticker_type: { '@type': 'stickerTypeRegular' } }).then(r => setSets(r.sets || [])).catch(() => setSets([]));
    send({ '@type': 'getRecentStickers', is_attached: false }).then(r => setRecent(r.stickers || [])).catch(() => {});
  }, []);
  if (!sets) return html`<div class="mp-body mp-center"><span class="spinner"/></div>`;
  if (!sets.length && !recent.length) return html`<div class="mp-body mp-center">У вас пока нет стикеров</div>`;
  const jump = id => body.current?.querySelector(`[data-set="${id}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  return html`
    <div class="mp-body" ref=${body}>
      ${recent.length > 0 && html`<${SetSection} root=${body} chatId=${chatId} onClose=${onClose} set=${{ id: 'recent', title: 'Недавние', stickers: recent.slice(0, 20) }}/>`}
      ${sets.map(s => html`<${SetSection} key=${s.id} root=${body} chatId=${chatId} onClose=${onClose} set=${s}/>`)}
    </div>
    <div class="mp-foot">
      ${recent.length > 0 && html`<button title="Недавние" onClick=${() => jump('recent')}>${Icon.clock(18)}</button>`}
      ${sets.map(s => html`<button key=${s.id} title=${s.title} onClick=${() => jump(s.id)}><${SetIcon} set=${s}/></button>`)}
    </div>`;
}

function GifCell({ a, onSend, root }) {
  const ref = useRef();
  const vis = useVisible(ref, root, '300px');
  const th = a.thumbnail;
  const thF = useFile(th?.file), aF = useFile(a.animation);
  const [hover, setHover] = useState(false);
  useEffect(() => { if (vis && th) download(th.file, 1); }, [vis]);
  useEffect(() => { if (hover) download(a.animation, 2); }, [hover]);
  const thumbUrl = vis && th && th.format?.['@type'] === 'thumbnailFormatJpeg' ? fileUrl(thF) : '';
  const src = hover ? fileUrl(aF) : '';
  const mini = a.minithumbnail?.data;
  return html`<button class="gif-cell" ref=${ref} onMouseEnter=${() => setHover(true)} onMouseLeave=${() => setHover(false)} onClick=${onSend}>
    ${mini && !thumbUrl && html`<img class="blur" src=${`data:image/jpeg;base64,${mini}`} alt=""/>`}
    ${thumbUrl && html`<img src=${thumbUrl} alt="" decoding="async"/>`}
    ${src && html`<video src=${src} autoplay muted loop playsinline/>`}
  </button>`;
}

function GifsTab({ chatId, onClose }) {
  const body = useRef();
  const [list, setList] = useState(null);
  useEffect(() => { send({ '@type': 'getSavedAnimations' }).then(r => setList(r.animations || [])).catch(() => setList([])); }, []);
  if (!list) return html`<div class="mp-body mp-center"><span class="spinner"/></div>`;
  if (!list.length) return html`<div class="mp-body mp-center">Сохранённых GIF пока нет</div>`;
  return html`<div class="mp-body" ref=${body}><div class="gif-grid">${list.map(a => html`<${GifCell} key=${a.animation.id} a=${a} root=${body} onSend=${() => { sendGif(chatId, a); onClose(); }}/>`)}</div></div>`;
}
