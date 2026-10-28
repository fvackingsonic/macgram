// Анимации в духе Liquid Glass из Telegram для macOS.
import { S, selectChat } from './store.js';

const reduce = () => S.prefs.glass === false || matchMedia('(prefers-reduced-motion: reduce)').matches;

// 1. Стеклянные кнопки как «жидкое стекло» в новом Telegram для macOS: зажатая кнопка
// тянется за курсором (с резиновым сопротивлением), вытягивается в сторону рывка и
// немного увеличивается; отпустили — пружиной возвращается на место с лёгким перелётом.
const STRETCHY = '.glass.circle, .chat-header.glass, .pinned-bar, .archive-btn, .ps-actions button, .story-av';
let drag = null;
const springs = new Map(); // el -> состояние пружины
function springFor(el) {
  let st = springs.get(el);
  if (!st) { st = { x: 0, y: 0, vx: 0, vy: 0, s: 1, vs: 0, tx: 0, ty: 0, ts: 1, raf: 0 }; springs.set(el, st); }
  return st;
}
function run(el) {
  const st = springFor(el);
  if (st.raf) return;
  const small = el.offsetWidth < 80; // круглые кнопки тянутся сильнее, широкие плашки — едва
  const step = () => {
    const k = 0.16, d = 0.74;               // мягкая пружина с небольшим перелётом
    st.vx = (st.vx + (st.tx - st.x) * k) * d;
    st.vy = (st.vy + (st.ty - st.y) * k) * d;
    st.vs = (st.vs + (st.ts - st.s) * k) * d;
    st.x += st.vx; st.y += st.vy; st.s += st.vs;
    // вытягивание вдоль направления смещения
    const dist = Math.hypot(st.x, st.y);
    const stretch = Math.min(small ? .16 : .04, dist / (small ? 70 : 400));
    const ang = Math.atan2(st.y, st.x) * 180 / Math.PI;
    const idle = dist < .05 && Math.abs(st.s - 1) < .001;
    const sx = st.s * (1 + stretch), sy = st.s * (1 - stretch * .55);
    el.style.transform = idle ? ''
      : `translate(${st.x.toFixed(2)}px, ${st.y.toFixed(2)}px) rotate(${ang}deg) scale(${sx.toFixed(4)}, ${sy.toFixed(4)}) rotate(${-ang}deg)`;
    // Стекло движется, а то, что видно сквозь него (фон и сообщения), стоит на месте, как в iOS:
    // внутренним слоям — обратное преобразование.
    el.__lgT = idle ? null : [st.x, st.y];
    el.__lgInvT = idle ? '' : `rotate(${ang}deg) scale(${(1 / sx).toFixed(5)}, ${(1 / sy).toFixed(5)}) rotate(${-ang}deg) translate(${(-st.x).toFixed(2)}px, ${(-st.y).toFixed(2)}px)`;
    el.__lgInv();
    const still = Math.abs(st.vx) + Math.abs(st.vy) + Math.abs(st.vs) < .01 && Math.abs(st.tx - st.x) + Math.abs(st.ty - st.y) < .05 && Math.abs(st.ts - st.s) < .001;
    if (still && !(drag && drag.el === el)) { st.raf = 0; el.style.transform = ''; el.style.willChange = ''; el.style.transition = ''; el.__lgT = null; el.__lgInvT = ''; el.__lgInv(); springs.delete(el); return; }
    st.raf = requestAnimationFrame(step);
  };
  el.__lgInv ||= () => {
    for (const c of el.querySelectorAll(':scope > .lg-mirror > .lg-mi, :scope > .lg-feed > .lg-finv')) {
      c.style.transform = el.__lgInvT || '';
      c.style.transition = el.__lgInvT ? 'none' : '';
    }
  };
  el.style.willChange = 'transform';
  el.style.transition = 'none';
  st.raf = requestAnimationFrame(step);
}
document.addEventListener('pointerdown', e => {
  if (e.button !== 0 || reduce()) return;
  const el = e.target.closest(STRETCHY);
  if (!el) return;
  drag = { el, x: e.clientX, y: e.clientY, small: el.offsetWidth < 80 };
  const st = springFor(el);
  st.ts = drag.small ? 1.1 : 1.02;
  run(el);
}, true);
document.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  // резиновое сопротивление: чем дальше тянешь, тем меньше прибавка
  const lim = drag.small ? 18 : 6;
  const rub = v => Math.sign(v) * lim * (1 - 1 / (Math.abs(v) / (lim * 1.6) + 1));
  const st = springFor(drag.el);
  st.tx = rub(dx); st.ty = rub(dy);
  run(drag.el);
}, true);
const release = () => {
  if (!drag) return;
  const st = springFor(drag.el);
  st.tx = 0; st.ty = 0; st.ts = 1;
  run(drag.el);
  drag = null;
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
