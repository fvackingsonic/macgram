// Панель эмодзи / стикеров / GIF над полем ввода — как всплывающая панель в Telegram для macOS.
import { html, useEffect, useRef, useState } from '../lib.js';
import { S, changed, download, fileUrl, showHud } from '../store.js';
import { send } from '../td.js';
import { Icon } from '../icons.js';
import { EMOJI } from '../emoji-data.js';
import { Tgs } from './tgs.js';

const RECENT_KEY = 'recentEmoji';
const recentEmoji = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };
const pushRecent = e => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([e, ...recentEmoji().filter(x => x !== e)].slice(0, 32))); } catch {} };

const remote = f => ({ '@type': 'inputFileRemote', id: f.remote.id });
async function sendSticker(chatId, st) {
  try {
    await send({ '@type': 'sendMessage', chat_id: chatId, input_message_content: { '@type': 'inputMessageSticker', sticker: remote(st.sticker), width: st.width, height: st.height, emoji: st.emoji || '' } });
  } catch (e) { showHud(e.message?.includes('CHAT_SEND_STICKERS_FORBIDDEN') ? 'В этом чате нельзя отправлять стикеры' : e.message); }
}
async function sendGif(chatId, a) {
  try {
    await send({ '@type': 'sendMessage', chat_id: chatId, input_message_content: { '@type': 'inputMessageAnimation', animation: remote(a.animation), duration: a.duration, width: a.width, height: a.height, caption: { '@type': 'formattedText', text: '', entities: [] } } });
  } catch (e) { showHud(e.message); }
}

export function MediaPanel({ chatId, onEmoji, onClose }) {
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('panelTab') || 'emoji'; } catch { return 'emoji'; } });
  const ref = useRef();
  useEffect(() => {
    const off = e => { if (!ref.current?.contains(e.target) && !e.target.closest('.emoji-btn')) onClose(); };
    const esc = e => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', off); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('mousedown', off); window.removeEventListener('keydown', esc); };
  }, []);
  const pick = t => { setTab(t); try { localStorage.setItem('panelTab', t); } catch {} };
  return html`<div class="media-panel" ref=${ref}>
    <div class="mp-tabs">
      ${[['emoji', 'Эмодзи'], ['stickers', 'Стикеры'], ['gifs', 'GIF']].map(([id, t]) => html`
        <button class=${tab === id ? 'on' : ''} onClick=${() => pick(id)}>${t}</button>`)}
    </div>
    ${tab === 'emoji' && html`<${EmojiTab} onEmoji=${onEmoji}/>`}
    ${tab === 'stickers' && html`<${StickersTab} chatId=${chatId} onClose=${onClose}/>`}
    ${tab === 'gifs' && html`<${GifsTab} chatId=${chatId} onClose=${onClose}/>`}
  </div>`;
}

function EmojiTab({ onEmoji }) {
  const body = useRef();
  const recent = recentEmoji();
  const cats = recent.length ? [{ id: 'recent', title: 'Недавние', icon: '🕘', list: recent }, ...EMOJI] : EMOJI;
  const jump = id => body.current?.querySelector(`[data-cat="${id}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  return html`
    <div class="mp-body" ref=${body}>
      ${cats.map(c => html`<div data-cat=${c.id}>
        <div class="mp-sec">${c.title}</div>
        <div class="emoji-grid">${c.list.map(e => html`<button onClick=${() => { pushRecent(e); onEmoji(e); }}>${e}</button>`)}</div>
      </div>`)}
    </div>
    <div class="mp-foot">${cats.map(c => html`<button title=${c.title} onClick=${() => jump(c.id)}>${c.icon}</button>`)}</div>`;
}

function StickerCell({ st, onSend }) {
  const fmt = st.format?.['@type'];
  const thumb = st.thumbnail;
  const thumbOk = thumb && thumb.format?.['@type'] !== 'thumbnailFormatTgs' && thumb.format?.['@type'] !== 'thumbnailFormatWebm';
  useEffect(() => { if (thumbOk) download(thumb.file, 1); else if (fmt !== 'stickerFormatTgs') download(st.sticker, 1); }, [st.sticker.id]);
  let inner;
  if (fmt === 'stickerFormatTgs') inner = html`<${Tgs} file=${st.sticker} size=${64} autoplay=${false} hover fallback=${st.emoji}/>`;
  else {
    const url = thumbOk ? fileUrl(thumb.file) : fmt === 'stickerFormatWebp' ? fileUrl(st.sticker) : '';
    inner = url ? html`<img src=${url} alt=${st.emoji} draggable="false"/>`
      : fmt === 'stickerFormatWebm' && fileUrl(st.sticker) ? html`<video src=${fileUrl(st.sticker)} muted loop playsinline onMouseEnter=${e => e.target.play()} onMouseLeave=${e => e.target.pause()}/>`
        : html`<span>${st.emoji}</span>`;
  }
  return html`<button class="st-cell" title=${st.emoji} onClick=${onSend}>${inner}</button>`;
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
      ? html`<${StickerCell} key=${st.sticker.id} st=${st} onSend=${() => { sendSticker(chatId, st); onClose(); }}/>`
      : html`<div class="st-cell ph" key=${i}/>`)}</div>
  </div>`;
}

function SetIcon({ set }) {
  const st = set.covers?.[0];
  const th = set.thumbnail;
  const thUrl = th && th.format?.['@type'] === 'thumbnailFormatWebp' ? fileUrl(th.file) : '';
  useEffect(() => { if (th && th.format?.['@type'] === 'thumbnailFormatWebp') download(th.file, 1); else if (st?.thumbnail) download(st.thumbnail.file, 1); }, [set.id]);
  const coverUrl = !thUrl && st?.thumbnail && st.thumbnail.format?.['@type'] === 'thumbnailFormatWebp' ? fileUrl(st.thumbnail.file) : '';
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

function GifCell({ a, onSend }) {
  const th = a.thumbnail;
  const thumbUrl = th && th.format?.['@type'] === 'thumbnailFormatJpeg' ? fileUrl(th.file) : '';
  const [hover, setHover] = useState(false);
  useEffect(() => { if (th) download(th.file, 1); }, [a.animation.id]);
  useEffect(() => { if (hover) download(a.animation, 2); }, [hover]);
  const src = hover ? fileUrl(a.animation) : '';
  const mini = a.minithumbnail?.data;
  return html`<button class="gif-cell" onMouseEnter=${() => setHover(true)} onMouseLeave=${() => setHover(false)} onClick=${onSend}>
    ${mini && html`<img class="blur" src=${`data:image/jpeg;base64,${mini}`} alt=""/>`}
    ${thumbUrl && html`<img src=${thumbUrl} alt=""/>`}
    ${src && html`<video src=${src} autoplay muted loop playsinline/>`}
  </button>`;
}

function GifsTab({ chatId, onClose }) {
  const [list, setList] = useState(null);
  useEffect(() => { send({ '@type': 'getSavedAnimations' }).then(r => setList(r.animations || [])).catch(() => setList([])); }, []);
  if (!list) return html`<div class="mp-body mp-center"><span class="spinner"/></div>`;
  if (!list.length) return html`<div class="mp-body mp-center">Сохранённых GIF пока нет</div>`;
  return html`<div class="mp-body"><div class="gif-grid">${list.map(a => html`<${GifCell} key=${a.animation.id} a=${a} onSend=${() => { sendGif(chatId, a); onClose(); }}/>`)}</div></div>`;
}
