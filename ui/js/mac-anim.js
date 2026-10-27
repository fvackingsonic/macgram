// Механика анимаций Telegram для macOS (TGUIKit), перенесённая на веб.
// Кривые посчитаны из тех же параметров пружин, что в исходниках:
//  • MenuBubbleSpring.open (ω=20, ζ=0.84) — появление контекстного меню «пузырём» из точки клика;
//  • makeSpringBounceAnimation (m=5, k=900, c=88) — «пружинящие» появления (значки, счётчики);
//  • .spring (m=3, k=1000, c=500) — переходы между экранами, без перелёта.
import { html, useLayoutEffect, useRef } from './lib.js';
import { S } from './store.js';

export const MENU_CURVE = 'linear(0, 0.0478, 0.158, 0.2938, 0.4321, 0.5598, 0.6703, 0.7616, 0.8339, 0.8892, 0.9301, 0.9594, 0.9794, 0.9925, 1.0006, 1.0051, 1.0072, 1.0077, 1.0074, 1.0065, 1.0055, 1.0044, 1.0034, 1.0026, 1)';
export const MENU_TIME = 408;
export const BOUNCE_CURVE = 'linear(0, 0.051, 0.1736, 0.3299, 0.4929, 0.6446, 0.7749, 0.879, 0.9567, 1.0102, 1.0433, 1.0602, 1.0652, 1.0622, 1.0544, 1.0443, 1.0337, 1.0237, 1.0151, 1.0082, 1.0031, 0.9995, 0.9973, 0.9961, 0.9957, 0.9959, 0.9964, 0.9971, 0.9978, 0.9984, 1)';
export const SPRING_CURVE = 'cubic-bezier(.22, .9, .3, 1)';
const supportsLinear = (() => { try { return CSS.supports('animation-timing-function', 'linear(0, 1)'); } catch { return false; } })();
const ease = c => supportsLinear || !c.startsWith('linear') ? c : 'cubic-bezier(.2, 1.25, .35, 1)';

export const reduced = () => S.prefs.glass === false || matchMedia('(prefers-reduced-motion: reduce)').matches;

// Контекстное меню: растёт из точки клика с 0.42 до 1, сначала круглое («пилюля»),
// к концу — радиус 18; прозрачность по smoothstep на первых 35% раскрытия.
export function menuBubble(el, ox, oy) {
  if (!el?.animate || reduced()) return;
  const r = el.getBoundingClientRect();
  const pill = Math.floor(Math.min(r.width, r.height) / 2);
  el.style.transformOrigin = `${ox}px ${oy}px`;
  el.animate([{ transform: 'scale(.42)', borderRadius: `${pill}px` }, { transform: 'scale(1)', borderRadius: '18px' }],
    { duration: MENU_TIME, easing: ease(MENU_CURVE) });
  el.animate([{ opacity: 0 }, { opacity: 1, offset: .15 }, { opacity: 1 }], { duration: MENU_TIME, easing: 'linear' });
}

// Появление значка: масштаб 0.1 → 1 пружиной с перелётом за 0.4 с, прозрачность за 0.2 с.
export function popIn(el, from = .1, duration = 400) {
  if (!el?.animate || reduced()) return;
  el.animate([{ transform: `scale(${from})` }, { transform: 'scale(1)' }], { duration, easing: ease(BOUNCE_CURVE) });
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
}

// Новое сообщение внизу ленты (TableAnimationInterface): лента плавно поднимается на высоту
// нового сообщения за 0.2 с (easeOut), само сообщение проявляется за 0.2 с.
export function insertAtBottom(row) {
  if (!row?.animate || reduced()) return;
  const scroller = row.closest('.messages');
  const inner = scroller?.querySelector('.messages-inner');
  if (!inner || scroller.scrollTop < -4) return; // не у низа — ничего не двигаем
  const h = row.getBoundingClientRect().height;
  if (!h || h > scroller.clientHeight) return;
  inner.animate([{ transform: `translateY(${h}px)` }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(0, 0, .58, 1)' });
  row.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'linear' });
}

// Счётчик как DynamicCounterTextView: изменившиеся цифры уезжают вверх/вниз (0.4 с, spring),
// новые въезжают с другой стороны; появление счётчика — «пружинка».
export function Counter({ value, show = true, cls = 'badge', style = '' }) {
  const ref = useRef();
  const prev = useRef(null);
  const text = String(value);
  useLayoutEffect(() => {
    const el = ref.current; const old = prev.current; prev.current = { text, show, num: Number(String(value).replace(/\D/g, '')) || 0 };
    if (!el || reduced()) return;
    if (old === null) return;                 // первый показ — без анимации (как при загрузке списка)
    if (!old.show && show) { popIn(el); return; }
    if (!show) return;
    if (old.text === text) return;
    const up = prev.current.num >= old.num;
    const digits = el.querySelectorAll('.cd');
    const a = old.text.padStart(text.length, ' '), b = text.padStart(old.text.length, ' ');
    const off = b.length - text.length;
    digits.forEach((d, i) => {
      if (a[i + off] === b[i + off]) return;
      d.animate([{ transform: `translateY(${up ? 70 : -70}%)`, opacity: 0, filter: 'blur(1px)' }, { transform: 'none', opacity: 1, filter: 'none' }],
        { duration: 400, easing: SPRING_CURVE });
      const ghost = document.createElement('span');
      ghost.className = 'cd cd-ghost';
      ghost.textContent = a[i + off] === ' ' ? '' : a[i + off];
      d.appendChild(ghost);
      ghost.animate([{ transform: 'none', opacity: 1 }, { transform: `translateY(${up ? -70 : 70}%)`, opacity: 0 }], { duration: 300, easing: SPRING_CURVE })
        .onfinish = () => ghost.remove();
    });
  }, [text, show]);
  return html`<span class=${`${cls}${show ? '' : ' cd-hidden'}`} ref=${ref} style=${style}>${[...text].map((ch, i) => html`<span class="cd" key=${text.length - i}>${ch}</span>`)}</span>`;
}
