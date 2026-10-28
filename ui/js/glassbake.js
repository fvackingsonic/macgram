// «Запечённое» стекло: под каждым стеклянным пузырём рисуется размытая копия фона, сдвинутая так,
// чтобы совпасть с обоями позади. Сдвиг считаем сами (на кадр, только для видимых пузырей) —
// background-attachment: fixed в WebView2 срабатывал не во всех местах ленты.
const SEL = '.msg-row .bubble:not(.media):not(.sticker):not(.round):not(.jumbo), .msg-row .bubble.media.with-caption, .msg-row .with-comments, '
  + '.chat-top .glass, .composer-wrap .glass, .top-bars .glass, .scroll-down.glass';
const PANELS = '.chat-top .glass, .composer-wrap .glass, .top-bars .glass, .scroll-down.glass';
let raf = 0, lensN = 0, mapUri = '';
function lensFor(el) {
  const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
  if (!w || !h) return;
  const key = `${w}x${h}`;
  if (el.__lensKey === key) return;
  if (!mapUri) mapUri = document.querySelector('#lg-lens feImage')?.getAttribute('href') || '';
  if (!mapUri) return;
  const defs = document.querySelector('#lg-lens')?.parentNode;
  let f = el.__lens;
  if (!f) {
    f = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    f.id = `lg-p${++lensN}`;
    f.setAttribute('x', '0'); f.setAttribute('y', '0'); f.setAttribute('filterUnits', 'userSpaceOnUse'); f.setAttribute('color-interpolation-filters', 'sRGB');
    f.innerHTML = `<feImage href="${mapUri}" x="0" y="0" preserveAspectRatio="none" result="map"/><feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="G"/>`;
    defs.appendChild(f); el.__lens = f;
    el.style.setProperty('--lens', `url(#${f.id})`);
  }
  f.setAttribute('width', w); f.setAttribute('height', h);
  const img = f.firstElementChild; img.setAttribute('width', w); img.setAttribute('height', h);
  f.lastElementChild.setAttribute('scale', String(Math.min(40, Math.max(14, Math.min(w, h) * .7))));
  el.__lensKey = key;
}
// убираем фильтры панелей, которых уже нет на экране
setInterval(() => { for (const f of document.querySelectorAll('filter[id^="lg-p"]')) { const el = document.querySelector(`[style*="${f.id})"]`); if (!el) f.remove(); } }, 30000);
function update() {
  raf = 0;
  const root = document.documentElement;
  if (!root.classList.contains('wall-baked')) return;
  const wall = document.querySelector('.window > .wallpaper');
  if (!wall) return;
  const o = wall.getBoundingClientRect();
  root.style.setProperty('--wall-w', `${o.width}px`);
  root.style.setProperty('--wall-h', `${o.height}px`);
  const H = innerHeight;
  // Линза для панелей: свой SVG-фильтр под точный размер каждой панели (равномерно по осям, как в iOS).
  for (const el of document.querySelectorAll(PANELS)) lensFor(el);
  for (const el of document.querySelectorAll(SEL)) {
    const r = el.getBoundingClientRect();
    if (r.bottom < -50 || r.top > H + 50 || !r.width) continue;
    const v = `${Math.round(o.left - r.left)}px ${Math.round(o.top - r.top)}px`;
    if (el.__bp !== v) { el.__bp = v; el.style.setProperty('--bp', v); }
  }
}
export function glassUpdate() { if (!raf) raf = requestAnimationFrame(update); }
document.addEventListener('scroll', glassUpdate, { capture: true, passive: true });
window.addEventListener('resize', glassUpdate);
new MutationObserver(glassUpdate).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
// переходы (профиль, ветка, анимация новых сообщений) — досчитываем ещё пару кадров
document.addEventListener('transitionend', glassUpdate, true);
document.addEventListener('animationend', glassUpdate, true);
