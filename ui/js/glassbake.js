// «Запечённое» стекло: под каждым стеклянным пузырём рисуется размытая копия фона, сдвинутая так,
// чтобы совпасть с обоями позади. Сдвиг считаем сами (на кадр, только для видимых пузырей) —
// background-attachment: fixed в WebView2 срабатывал не во всех местах ленты.
const SEL = '.msg-row .bubble:not(.media):not(.sticker):not(.round):not(.jumbo), .msg-row .bubble.media.with-caption, .msg-row .with-comments, '
  + '.chat-top .glass, .composer-wrap .glass, .top-bars .glass, .scroll-down.glass';
const PANELS = '.chat-top .glass, .composer-wrap .glass, .top-bars .glass, .scroll-down.glass';
const PAD = 14;
let raf = 0, mapUri = '';
// Линза как в 0.7.14 (iOS 26): свой SVG-фильтр под точный размер элемента. Фильтры одного размера
// общие (размер округляем до 4px), так что их немного и они не пересоздаются при прокрутке.
const lensCache = new Map();
function lensFor(el, scale) {
  // слой со стеклом больше элемента на PAD с каждой стороны — линзе есть откуда брать картинку у краёв
  const w = Math.round((el.offsetWidth + PAD * 2) / 4) * 4, h = Math.round((el.offsetHeight + PAD * 2) / 4) * 4;
  if (!w || !h) return;
  const key = `${w}x${h}x${scale}`;
  if (el.__lensKey === key) return;
  let id = lensCache.get(key);
  if (!id) {
    if (!mapUri) mapUri = document.querySelector('#lg-lens feImage')?.getAttribute('href') || '';
    const defs = document.querySelector('#lg-lens')?.parentNode;
    if (!mapUri || !defs) return;
    id = `lg-k${lensCache.size + 1}`;
    const f = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    f.id = id;
    for (const [k, v] of [['x', 0], ['y', 0], ['width', w], ['height', h], ['filterUnits', 'userSpaceOnUse'], ['color-interpolation-filters', 'sRGB']]) f.setAttribute(k, v);
    f.innerHTML = `<feImage href="${mapUri}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/><feDisplacementMap in="SourceGraphic" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/>`;
    defs.appendChild(f);
    lensCache.set(key, id);
  }
  el.style.setProperty('--lens', `url(#${id})`);
  el.__lensKey = key;
}
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
  for (const el of document.querySelectorAll(PANELS)) lensFor(el, 48);
  for (const el of document.querySelectorAll(SEL)) {
    const r = el.getBoundingClientRect();
    if (r.bottom < -50 || r.top > H + 50 || !r.width) continue;
    if (!el.matches(PANELS)) lensFor(el, 36);
    const v = `${Math.round(o.left - r.left + PAD)}px ${Math.round(o.top - r.top + PAD)}px`;
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
