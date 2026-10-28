// «Запечённое» стекло: под каждым стеклянным пузырём рисуется размытая копия фона, сдвинутая так,
// чтобы совпасть с обоями позади. Сдвиг считаем сами (на кадр, только для видимых пузырей) —
// background-attachment: fixed в WebView2 срабатывал не во всех местах ленты.
const SEL = '.msg-row .bubble:not(.media):not(.sticker):not(.round):not(.jumbo), .msg-row .bubble.media.with-caption, .msg-row .with-comments, '
  + '.chat-top .glass, .composer-wrap .glass, .top-bars .glass, .scroll-down.glass';
let raf = 0;
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
