import { MenuAnim, animNameOf } from './tgs.js';
import { menuBubble, popIn } from '../mac-anim.js';
import { MENU_ANIMS } from '../menu-anims.js';
import { html, useEffect, useRef, useState } from '../lib.js';
import { S, download, fileUrl, chatTitle, isSaved, closeMenu, closeModal } from '../store.js';
import { initials, peerIndex, avatarGradient } from '../format.js';
import { Icon } from '../icons.js';
import { shell } from '../td.js';

export function Avatar({ chat, user, size = 48, online = false }) {
  const id = chat?.id ?? user?.id;
  const photo = chat?.photo?.small ?? user?.profile_photo?.small;
  useEffect(() => { if (photo) download(photo, 3); }, [photo?.id]);
  // Точка «в сети» появляется пружинкой (scale 0.1 → 1, 0.3 с), как activeImage в ChatListRowView.
  const wrap = useRef(); const wasOnline = useRef(online);
  useEffect(() => { if (online && !wasOnline.current) popIn(wrap.current?.querySelector('.online-dot'), .1, 300); wasOnline.current = online; }, [online]);
  const [bad, setBad] = useState('');
  const url = photo ? fileUrl(photo) : '';
  const title = chat ? chatTitle(chat) : [user?.first_name, user?.last_name].filter(Boolean).join(' ');
  const idx = peerIndex(id, chat?.accent_color_id ?? user?.accent_color_id);
  const mini = chat?.photo?.minithumbnail?.data ?? user?.profile_photo?.minithumbnail?.data;
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;background:${avatarGradient(idx)}`;
  let inner;
  if (chat && isSaved(chat)) inner = Icon.bookmark(Math.round(size * 0.46));
  else if (url && bad !== url) inner = html`<img decoding="async" src=${url} alt="" draggable="false" onError=${() => setBad(url)}/>`;
  else if (mini) inner = html`<img decoding="async" src=${`data:image/jpeg;base64,${mini}`} style="filter:blur(3px);transform:scale(1.1)" alt=""/>`;
  else inner = initials(title);
  return html`<div class="av-wrap" ref=${wrap}><div class="avatar" style=${style}>${inner}</div>${online && html`<i class="online-dot"/>`}</div>`;
}

export function Traffic() {
  return html`<div class="traffic">
    <button class="close" title="Закрыть" onClick=${() => shell.close()}>${Icon.tlClose()}</button>
    <button class="min" title="Свернуть" onClick=${() => shell.minimize()}>${Icon.tlMin()}</button>
    <button class="max" title="Развернуть" onClick=${() => shell.toggleMaximize()}>${Icon.tlMax()}</button>
  </div>`;
}

// Перетаскивание окна за «пустые» места шапки (как строка заголовка в macOS).
export function dragHandlers() {
  return {
    onMouseDown: e => {
      if (e.button !== 0 || e.target.closest('button, input, textarea, a, .no-drag')) return;
      if (e.detail === 2) shell.toggleMaximize(); else shell.startDrag();
    },
  };
}

export const Spinner = () => html`<div class="spinner"/>`;
export const TypingDots = () => html`<span class="typing-dots"><i/><i/><i/></span>`;

const menuIcon = icon => {
  const name = animNameOf(icon);
  return name && MENU_ANIMS.has(name) ? html`<${MenuAnim} key=${name} name=${name}/>` : icon;
};
export function ContextMenu() {
  const ref = useRef();
  const m = S.menu;
  useEffect(() => {
    if (!m) return;
    const off = e => { if (!ref.current?.contains(e.target)) closeMenu(); };
    const esc = e => e.key === 'Escape' && closeMenu();
    setTimeout(() => window.addEventListener('mousedown', off), 0);
    window.addEventListener('keydown', esc);
    window.addEventListener('blur', closeMenu);
    return () => { window.removeEventListener('mousedown', off); window.removeEventListener('keydown', esc); window.removeEventListener('blur', closeMenu); };
  }, [m]);
  useEffect(() => {
    const el = ref.current; if (!el || !m) return;
    const r = el.getBoundingClientRect();
    let x = m.x, y = m.y, origin = ['left', 'top'];
    if (x + r.width > innerWidth - 6) { x = Math.max(6, x - r.width); origin[0] = 'right'; }
    if (y + r.height > innerHeight - 6) { y = Math.max(6, y - r.height); origin[1] = 'bottom'; }
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, visibility: 'visible' });
    // «Пузырь» из точки клика, как AppMenu в macOS.
    menuBubble(el, Math.max(0, Math.min(r.width, m.x - x)), Math.max(0, Math.min(r.height, m.y - y)));
  }, [m]);
  if (!m) return null;
  return html`<div class="ctx" ref=${ref} style=${`left:${m.x}px;top:${m.y}px;visibility:hidden`} onContextMenu=${e => e.preventDefault()}>
    ${m.items.map(it => it === '-' ? html`<hr/>` : it.reactions ? html`<div class="ctx-reactions">${it.reactions.map((r, i) => html`
      <button class=${it.chosen?.has(r) ? 'on' : ''} style=${`animation-delay:${i * 18}ms`} onClick=${() => { closeMenu(); it.pick(r); }}>${r}</button>`)}</div>` : html`
      <button class=${it.danger ? 'danger' : ''} onClick=${() => { closeMenu(); it.action(); }}>${menuIcon(it.icon)}${it.label}</button>`)}
  </div>`;
}

export function Hud() {
  const h = S.hud;
  if (!h) return null;
  return html`<div key=${h.id} class=${`hud ${h.out ? 'out' : ''}`}>${h.text}</div>`;
}

export function Modal() {
  const m = S.modal;
  useEffect(() => {
    if (!m) return;
    const k = e => { if (e.key === 'Escape') closeModal(); if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') m.buttons?.[0]?.action?.(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [m]);
  if (!m) return null;
  return html`<div class=${`veil ${m.out ? 'out' : ''}`} onMouseDown=${e => e.target === e.currentTarget && closeModal()}>
    <div class="sheet">
      ${m.icon}
      <h3>${m.title}</h3>
      ${m.text && html`<p>${m.text}</p>`}
      ${m.body}
      <div class="btns">
        ${m.buttons.map(b => html`<button class=${`btn ${b.kind || ''}`} onClick=${() => b.action()}>${b.label}</button>`)}
      </div>
    </div>
  </div>`;
}
