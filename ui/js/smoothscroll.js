// Своя прокрутка колесом: одинаково плавно и с обычной мышью, и с игровой (1000–8000 Гц),
// и с тачпадом. Мелкие шаги (тачпад, «высокоточные» колёса) применяем сразу — их и так
// много; крупные «щелчки» колеса растягиваем на несколько кадров с замедлением, как в macOS.
import { S } from './store.js';

const SEL = '.messages, .list, .ps-scroll, .ps-sub-body, .forum-list, .mp-body, .pp-body, .picker-list, .upd-notes, .rkb-rows';
const state = new WeakMap();

function step(el) {
  const st = state.get(el);
  if (!st) return;
  const max = el.scrollHeight - el.clientHeight;
  const rev = st.rev;
  const lo = rev ? -max : 0, hi = rev ? 0 : max;
  const d = st.pending * 0.24;
  st.pending -= d;
  const next = Math.max(lo, Math.min(hi, el.scrollTop + d));
  el.scrollTop = next;
  if ((next === lo && st.pending < 0) || (next === hi && st.pending > 0) || Math.abs(st.pending) < 0.5) { st.pending = 0; st.raf = 0; return; }
  st.raf = requestAnimationFrame(() => step(el));
}

document.addEventListener('wheel', e => {
  if (S.prefs.smoothScroll === false || e.ctrlKey || e.defaultPrevented) return;
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // горизонтальные жесты — как раньше
  const el = e.target.closest?.(SEL);
  if (!el || el.scrollHeight <= el.clientHeight + 1) return;
  // вложенная прокручиваемая область (например, длинный код) — пусть крутится сама
  const inner = e.target.closest('pre, textarea, .upd-notes');
  if (inner && inner !== el && inner.scrollHeight > inner.clientHeight) return;
  e.preventDefault();
  let dy = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? el.clientHeight : 1);
  let st = state.get(el);
  if (!st) { st = { pending: 0, raf: 0, rev: getComputedStyle(el).flexDirection === 'column-reverse' }; state.set(el, st); }
  if (Math.abs(dy) < 40 && !st.raf) { el.scrollTop += dy; return; } // мелкий шаг — сразу
  // смена направления — гасим остаток, чтобы не было рывка «назад»
  if (Math.sign(dy) !== Math.sign(st.pending)) st.pending = 0;
  st.pending = Math.max(-3000, Math.min(3000, st.pending + dy));
  if (!st.raf) st.raf = requestAnimationFrame(() => step(el));
}, { passive: false, capture: true });

// Пока лента сообщений прокручивается, стеклу не нужна линза (см. app.css: html.is-scrolling).
let scrollT = 0;
document.addEventListener('scroll', e => {
  const t = e.target;
  if (!(t instanceof Element) || !t.classList.contains('messages')) return;
  const root = document.documentElement;
  if (!root.classList.contains('glass-bubbles') && !root.classList.contains('lg-panels')) return;
  if (!root.classList.contains('is-scrolling')) root.classList.add('is-scrolling');
  clearTimeout(scrollT);
  scrollT = setTimeout(() => root.classList.remove('is-scrolling'), 160);
}, { capture: true, passive: true });
