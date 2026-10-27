// Полоса прокрутки как в macOS: тонкая, поверх содержимого, появляется при прокрутке или
// наведении к краю, при наведении на неё становится толще; за неё можно тянуть мышью.
// Работает и для лент с column-reverse (лента сообщений), где scrollTop отрицательный.
export function attachScrollbar(el, { top = 6, bottom = 6, right = 2 } = {}) {
  if (!el || el.__sb) return () => {};
  const host = el.parentElement;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  el.classList.add('sb-hidden-native');
  const track = document.createElement('div');
  track.className = 'sb-track';
  const thumb = document.createElement('div');
  thumb.className = 'sb-thumb';
  track.appendChild(thumb);
  host.appendChild(track);
  const reverse = () => getComputedStyle(el).flexDirection === 'column-reverse';
  let hideT = 0, dragging = false, raf = 0;

  const layout = () => {
    raf = 0;
    const r = el.getBoundingClientRect(), hr = host.getBoundingClientRect();
    const t = r.top - hr.top + top, h = r.height - top - bottom;
    track.style.top = `${t}px`; track.style.height = `${Math.max(0, h)}px`;
    track.style.right = `${hr.right - r.right + right}px`;
    const range = el.scrollHeight - el.clientHeight;
    if (range <= 2 || h < 40) { track.style.display = 'none'; return; }
    track.style.display = '';
    const th = Math.max(36, h * el.clientHeight / el.scrollHeight);
    const fromTop = reverse() ? range + el.scrollTop : el.scrollTop;
    const y = (h - th) * Math.min(1, Math.max(0, fromTop / range));
    thumb.style.height = `${th}px`;
    thumb.style.transform = `translateY(${y}px)`;
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(layout); };
  const show = () => {
    track.classList.add('on'); schedule();
    clearTimeout(hideT);
    hideT = setTimeout(() => { if (!dragging && !track.matches(':hover')) track.classList.remove('on'); }, 1100);
  };
  const onScroll = () => show();
  const onMove = e => { const r = el.getBoundingClientRect(); if (r.right - e.clientX < 18) show(); };
  el.addEventListener('scroll', onScroll, { passive: true });
  el.addEventListener('mousemove', onMove, { passive: true });
  track.addEventListener('mouseenter', show);
  track.addEventListener('mouseleave', show);

  thumb.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    dragging = true; track.classList.add('drag');
    thumb.setPointerCapture(e.pointerId);
    const y0 = e.clientY, s0 = el.scrollTop;
    const h = track.clientHeight, th = thumb.clientHeight, range = el.scrollHeight - el.clientHeight;
    const k = range / Math.max(1, h - th);
    const move = ev => { el.scrollTop = s0 + (ev.clientY - y0) * k; };
    const up = () => { dragging = false; track.classList.remove('drag'); thumb.removeEventListener('pointermove', move); thumb.removeEventListener('pointerup', up); show(); };
    thumb.addEventListener('pointermove', move); thumb.addEventListener('pointerup', up);
  });
  // клик по дорожке — прокрутка на страницу в ту сторону
  track.addEventListener('pointerdown', e => {
    if (e.target !== track) return;
    const r = thumb.getBoundingClientRect();
    el.scrollBy({ top: (e.clientY < r.top ? -1 : 1) * el.clientHeight * .9, behavior: 'smooth' });
  });

  const ro = new ResizeObserver(schedule);
  ro.observe(el);
  if (el.firstElementChild) ro.observe(el.firstElementChild);
  schedule();
  el.__sb = true;
  return () => { ro.disconnect(); el.removeEventListener('scroll', onScroll); el.removeEventListener('mousemove', onMove); track.remove(); el.__sb = false; clearTimeout(hideT); };
}

// Подключаем ко всем прокручиваемым областям автоматически (и к тем, что появятся позже).
const RULES = [
  ['.messages', { top: 66, bottom: 70 }],
  ['.list', { top: 4, bottom: 70 }],
  ['.ps-scroll', { top: 10, bottom: 10 }],
  ['.ps-sub-body', { top: 4, bottom: 10 }],
  ['.forum-list', { top: 66, bottom: 10 }],
  ['.mp-body', { top: 2, bottom: 2 }],
  ['.pp-body', { top: 4, bottom: 4 }],
  ['.picker-list', { top: 2, bottom: 2 }],
];
const alive = new Map();
function scan() {
  for (const [sel, opt] of RULES) for (const el of document.querySelectorAll(sel)) {
    if (!alive.has(el)) alive.set(el, attachScrollbar(el, opt));
  }
  for (const [el, off] of alive) if (!el.isConnected) { off(); alive.delete(el); }
}
let queued = false;
new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; scan(); }); } })
  .observe(document.documentElement, { childList: true, subtree: true });
