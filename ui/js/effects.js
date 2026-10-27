// Анимации в духе Liquid Glass из Telegram для macOS.
import { S, selectChat } from './store.js';

const reduce = () => S.prefs.glass === false || matchMedia('(prefers-reduced-motion: reduce)').matches;

// 1. Стеклянные кнопки «тянутся» за курсором при нажатии и пружинят обратно.
const STRETCHY = '.glass.circle, .chat-header.glass, .pinned-bar, .archive-btn, .ps-actions button, .story-av';
let drag = null;
document.addEventListener('pointerdown', e => {
  if (e.button !== 0 || reduce()) return;
  const el = e.target.closest(STRETCHY);
  if (!el) return;
  drag = { el, x: e.clientX, y: e.clientY, r: el.getBoundingClientRect() };
  el.style.transition = 'transform .12s cubic-bezier(.2,.9,.3,1)';
  el.style.transform = 'scale(1.06)';
}, true);
document.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  // резиновое сопротивление: чем дальше, тем меньше смещение
  const rub = v => Math.sign(v) * Math.min(10, Math.sqrt(Math.abs(v)) * 1.6);
  const tx = rub(dx), ty = rub(dy);
  const sx = 1.06 + Math.min(.08, Math.abs(dx) / 600), sy = 1.06 + Math.min(.08, Math.abs(dy) / 600);
  drag.el.style.transition = 'transform .06s linear';
  drag.el.style.transform = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;
}, true);
const release = () => {
  if (!drag) return;
  const el = drag.el; drag = null;
  el.style.transition = 'transform .45s cubic-bezier(.2,1.4,.35,1)';
  el.style.transform = '';
  setTimeout(() => { if (!drag || drag.el !== el) el.style.transition = ''; }, 460);
};
document.addEventListener('pointerup', release, true);
document.addEventListener('pointercancel', release, true);
window.addEventListener('blur', release);

// 2. Свайп вправо двумя пальцами по тачпаду закрывает чат: он уезжает вправо и размывается.
let swipe = 0, swipeTimer = null, closing = false;
document.addEventListener('wheel', e => {
  if (closing || !S.currentChatId || S.profile) return;
  const area = e.target.closest('.chat');
  if (!area) return;
  if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.5) return;
  swipe = Math.max(0, swipe - e.deltaX);
  const k = Math.min(1, swipe / 180);
  area.style.transition = 'none';
  area.style.transform = `translateX(${swipe * 0.6}px)`;
  area.style.filter = reduce() ? '' : `blur(${k * 6}px)`;
  area.style.opacity = String(1 - k * 0.5);
  clearTimeout(swipeTimer);
  if (swipe > 180) {
    closing = true;
    area.style.transition = 'transform .25s ease-out, opacity .25s, filter .25s';
    area.style.transform = 'translateX(60%)'; area.style.opacity = '0';
    setTimeout(() => { selectChat(null); swipe = 0; closing = false; }, 230);
    return;
  }
  swipeTimer = setTimeout(() => {
    swipe = 0;
    area.style.transition = 'transform .4s cubic-bezier(.2,1.2,.35,1), opacity .3s, filter .3s';
    area.style.transform = ''; area.style.filter = ''; area.style.opacity = '';
  }, 140);
}, { passive: true });
