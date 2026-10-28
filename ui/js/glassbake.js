// Стекло как Liquid Glass в iOS 26 — без backdrop-filter (в WebView2 он моргал и пропадал после прокрутки).
//
// Пузыри: под каждым — слой с копией обоев ровно с этого места (--bp) и линзой по краям (--lens).
// Панели (шапка, кнопки, закреп, поле ввода): под каждой — «зеркало» (.lg-mirror): та же копия обоев
// плюс копии сообщений, которые сейчас проходят под панелью. Зеркало размыто и преломляется линзой,
// поэтому сквозь шапку видно ленту, как сквозь стекло в iOS. Всё это обычные слои с обычным filter —
// ничего не пропадает и не моргает.
const PAD = 14;
const BUBBLES = ['.bubble:not(.media):not(.sticker):not(.round):not(.jumbo)', '.bubble.media.with-caption', '.with-comments']
  .map(s => `.messages .msg-row ${s}`).join(', ');
const PANELS = '.chat-top .glass, .composer-wrap .glass, .top-bars .glass, .scroll-down.glass.show';
const ROWS = '.msg-row, .service, .unread-sep, .thread-start, .loader-top, .main-empty';
// Линза: ширина «фаски» и сила преломления у самого края (px).
const LENS = { p: { bezel: 18, max: 16 }, b: { bezel: 14, max: 10 } };

let raf = 0, defs = null, nLens = 0;
const lensCache = new Map();

// Карта смещения под точный размер и радиус: у края сильное смещение внутрь, к середине фаски — ноль.
// Красный канал — по горизонтали, зелёный — по вертикали (128 — без смещения).
function lensMap(W, H, w, h, r, bezel, max, S) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  new Uint32Array(d.buffer).fill(0xff808080); // всё «без смещения»; считаем только полосу у края
  const cx = W / 2, cy = H / 2, hx = w / 2 - r, hy = h / 2 - r;
  const band = Math.ceil(PAD + Math.max(bezel, r) + 1);
  const px1 = (x, y) => {
    const i = (y * W + x) * 4;
    const px = x + .5 - cx, py = y + .5 - cy, qx = Math.abs(px) - hx, qy = Math.abs(py) - hy;
    let dist, nx, ny;
    if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy); dist = l - r; nx = qx / l; ny = qy / l; }
    else if (qx > qy) { dist = qx - r; nx = 1; ny = 0; }
    else { dist = qy - r; nx = 0; ny = 1; }
    if (!(dist < 0 && dist > -bezel)) return;
    const t = 1 + dist / bezel, m = max * (t * t * (3 - 2 * t) * .35 + t * t * t * .65);
    d[i] = Math.round(127.5 - nx * Math.sign(px) * m / S * 255);
    d[i + 1] = Math.round(127.5 - ny * Math.sign(py) * m / S * 255);
  };
  for (let y = 0; y < H; y++) {
    if (y < band || y >= H - band) { for (let x = 0; x < W; x++) px1(x, y); continue; }
    for (let x = 0; x < Math.min(band, W); x++) px1(x, y);
    for (let x = Math.max(band, W - band); x < W; x++) px1(x, y);
  }
  g.putImageData(img, 0, 0);
  return c;
}

let budget = 0;
function radiusFor(el, w, h) {
  const q = w > 120 ? 4 : 2;
  w = Math.round(w / q) * q; h = Math.round(h / 2) * 2;
  if (!w || !h) return null;
  if (el.__lgSz !== `${w}x${h}`) {
    el.__lgSz = `${w}x${h}`;
    const cs = getComputedStyle(el);
    const rad = v => Math.round(Math.min(v.endsWith('%') ? Math.min(w, h) * parseFloat(v) / 100 : parseFloat(v) || 0, w / 2, h / 2));
    const rr = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(rad);
    el.__lgR = Math.max(...rr);
    el.style.setProperty('--lg-rr', rr.map(x => `${x}px`).join(' '));
    el.style.setProperty('--lg-r', `${el.__lgR}px`);
  }
  return [w, h];
}
function lensFor(el, kind, w0, h0) {
  const sz = radiusFor(el, w0, h0);
  if (!sz) return;
  const [w, h] = sz;
  const r = el.__lgR, W = w + PAD * 2, H = h + PAD * 2;
  const key = `${kind}${W}x${H}r${r}`;
  if (el.__lensKey === key) return;
  let e = lensCache.get(key);
  if (!e) {
    if (budget <= 0) { raf || (raf = requestAnimationFrame(update)); return; } // не больше одной новой карты за кадр
    budget--;
    defs = defs?.isConnected ? defs : document.getElementById('lg-defs');
    if (!defs) return;
    if (lensCache.size > 320) {
      for (const f of defs.querySelectorAll('filter[id^="lg-m"]')) f.remove();
      for (const x of lensCache.values()) if (x.url) URL.revokeObjectURL(x.url);
      lensCache.clear();
      for (const x of document.querySelectorAll('[style*="--lens"]')) { x.style.removeProperty('--lens'); x.__lensKey = ''; }
    }
    const P = LENS[kind], bezel = Math.max(4, Math.min(P.bezel, Math.min(w, h) / 2 - 2)), max = Math.min(P.max, bezel * .85), S = Math.ceil(max * 2 + 2);
    e = { id: `lg-m${++nLens}`, ready: false, url: '' };
    lensCache.set(key, e);
    // PNG кодируется в фоне (toBlob), фильтр подключаем, когда карта готова
    lensMap(W, H, w, h, r, bezel, max, S).toBlob(b => {
      if (!b || lensCache.get(key) !== e) return;
      e.url = URL.createObjectURL(b);
      const f = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
      f.id = e.id;
      for (const [k, v] of [['x', 0], ['y', 0], ['width', W], ['height', H], ['filterUnits', 'userSpaceOnUse'], ['primitiveUnits', 'userSpaceOnUse'], ['color-interpolation-filters', 'sRGB']]) f.setAttribute(k, v);
      f.innerHTML = `<feImage href="${e.url}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" result="map"/>`
        + `<feDisplacementMap in="SourceGraphic" in2="map" scale="${S}" xChannelSelector="R" yChannelSelector="G"/>`;
      defs.appendChild(f);
      e.ready = true;
      glassUpdate();
    }, 'image/png');
  }
  if (!e.ready) return;
  el.style.setProperty('--lens', `url(#${e.id})`);
  el.__lensKey = key;
}

// ── зеркало под панелью ──
function cloneRow(row) {
  const c = row.cloneNode(true);
  c.classList.remove('fresh', 'highlight', 'selecting', 'selected');
  c.removeAttribute('data-mid');
  for (const el of c.querySelectorAll('[id]')) el.removeAttribute('id');
  for (const v of c.querySelectorAll('video')) {
    const d = document.createElement('div');
    d.className = v.className;
    d.style.cssText = `${v.style.cssText};background:#111 center/cover no-repeat${v.poster ? ` url("${v.poster}")` : ''}`;
    v.replaceWith(d);
  }
  c.setAttribute('aria-hidden', 'true');
  c.inert = true;
  c.style.cssText = 'position:absolute;left:0;top:0;margin:0;box-sizing:border-box';
  return c;
}
function dropMirror(p) {
  if (p.__lgMirror) { p.__lgMirror.remove(); p.__lgMirror = null; p.__lgClones = null; }
  if (p.__lgFeed) { p.__lgFeed.remove(); p.__lgFeed = null; }
}
function scrollerOf(p) {
  if (p.__lgSc?.isConnected) return p.__lgSc;
  p.__lgSc = p.closest('.chat')?.querySelector(':scope > .messages') || null;
  return p.__lgSc;
}

// Яркость фона под элементом (по карте из wallpaper.js): 'd' — тёмное место (светлый текст), 'l' — светлое.
function toneAt(o, r) {
  const L = window.__lgLum;
  if (!L || !o.width || !o.height) return '';
  const x0 = Math.max(0, Math.floor((r.left - o.left) / o.width * L.gw)), x1 = Math.min(L.gw - 1, Math.floor((r.right - o.left) / o.width * L.gw));
  const y0 = Math.max(0, Math.floor((r.top - o.top) / o.height * L.gh)), y1 = Math.min(L.gh - 1, Math.floor((r.bottom - o.top) / o.height * L.gh));
  let sum = 0, n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { sum += L.d[y * L.gw + x]; n++; }
  return n ? sum / n : '';
}
function setTone(el, lum) {
  if (lum === '') { if (el.__tone) { el.removeAttribute('data-lg'); el.__tone = ''; } return; }
  // с запасом, чтобы цвет текста не «дёргался» на границе
  const t = el.__tone === 'd' ? (lum > .6 ? 'l' : 'd') : el.__tone === 'l' ? (lum < .5 ? 'd' : 'l') : (lum < .55 ? 'd' : 'l');
  if (t !== el.__tone) { el.__tone = t; el.setAttribute('data-lg', t); }
}

const BUB = ['.bubble:not(.media):not(.sticker):not(.round):not(.jumbo)', '.bubble.media.with-caption', '.with-comments'].join(', ');
// строки ленты (сверху вниз), пересекающие полосу [top, bottom] по высоте
function rowsIn(sc, top, bottom, R) {
  const list = sc.__lgRows || (sc.__lgRows = [...sc.querySelectorAll(ROWS)]);
  let lo = 0, hi = list.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (R(list[mid]).bottom < top) lo = mid + 1; else hi = mid; }
  const out = [];
  for (let i = lo; i < list.length; i++) {
    const rr = R(list[i]);
    if (rr.top > bottom) break;
    if (rr.height) out.push([list[i], rr]);
  }
  return out;
}
const live = new Set();
// Прокрутку ленты стекло повторяет само, без кода на каждом кадре: копия обоев в пузыре и копии
// сообщений под панелями двигаются CSS-анимацией, привязанной к прокрутке (scroll-timeline) — её
// считает видеокарта, синхронно с лентой. Код только расставляет постоянные сдвиги, когда что-то
// появляется или меняется. Прогресс 0 — scrollTop 0, прогресс 1 — край прокрутки (у ленты
// column-reverse scrollTop отрицательный), поэтому положение = значение при scrollTop 0 + scrollTop.
const TL = typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline: --lg-sc');
if (TL) document.documentElement.classList.add('lg-tl');
const near = (a, b) => a != null && Math.abs(a - b) < .5;
function update() {
  raf = 0; budget = 2;
  const root = document.documentElement;
  const on = root.classList.contains('wall-baked');
  if (!on || root.classList.contains('lite')) { for (const p of live) dropMirror(p); live.clear(); return; }
  const wall = document.querySelector('.window > .wallpaper');
  if (!wall) return;
  const o = wall.getBoundingClientRect();
  const ww = `${o.width}px`, wh = `${o.height}px`;
  if (root.__lgW !== ww) { root.__lgW = ww; root.style.setProperty('--wall-w', ww); }
  if (root.__lgH !== wh) { root.__lgH = wh; root.style.setProperty('--wall-h', wh); }
  const H = innerHeight;
  const rect = new Map();
  const R = el => { let r = rect.get(el); if (!r) { r = el.getBoundingClientRect(); rect.set(el, r); } return r; };
  const scrolls = new Map(); // лента -> [scrollTop, размах прокрутки со знаком]
  const ST = sc => {
    let v = scrolls.get(sc);
    if (!v) {
      const max = sc.scrollHeight - sc.clientHeight;
      const rev = sc.__lgRev ?? (sc.__lgRev = getComputedStyle(sc).flexDirection === 'column-reverse');
      v = [TL ? sc.scrollTop : 0, rev ? -max : max];
      scrolls.set(sc, v);
    }
    return v;
  };

  // 1) чтение: где пузыри и панели, какие строки ленты под панелями
  const bubbles = [];
  if (root.classList.contains('glass-bubbles')) {
    for (const sc of document.querySelectorAll('.messages')) {
      const sr = R(sc);
      if (!sr.height) continue;
      // с запасом: пузырь готов заранее, ещё до того, как прокрутка его покажет
      const top = Math.max(sr.top, 0) - 450, bottom = Math.min(sr.bottom, H) + 450;
      const st = ST(sc)[0];
      for (const [row] of rowsIn(sc, top, bottom, R)) {
        if (!row.classList.contains('msg-row')) continue;
        if (!row.__lgB || row.__lgBV !== row.__lgV) { row.__lgB = [...row.querySelectorAll(BUB)]; row.__lgBV = row.__lgV; }
        for (const el of row.__lgB) {
          if (el.parentElement?.classList.contains('with-comments')) continue;
          const r = R(el);
          if (r.bottom < top || r.top > bottom || !r.width) continue;
          bubbles.push([el, r, st]);
        }
      }
    }
  }
  const panels = [];
  const seen = new Set();
  for (const p of document.querySelectorAll(PANELS)) {
    if (p.classList.contains('send-btn') && p.classList.contains('ready')) continue;
    // копии сообщений под панелью (там есть свои .glass — кнопка «Поделиться» у постов) — не панели.
    if (p.closest('.lg-feed, .lg-mirror')) continue;
    if (p.classList.contains('mu-glass')) continue; // кнопка музыки — стекло как у пузырей (components/music.js)
    const rb = R(p);
    if (!rb.width) continue;
    seen.add(p);
    // Кнопку можно тянуть и увеличивать (effects.js, :hover) — считаем по её месту без сдвига и
    // увеличения: центр рамки минус сдвиг пальцем, размеры — без transform. Всё под стеклом стоит на
    // месте, а внутренние слои получают обратное преобразование (effects.js и CSS).
    const lw = p.offsetWidth || rb.width, lh = p.offsetHeight || rb.height, t = p.__lgT;
    const cx = (rb.left + rb.right) / 2 - (t ? t[0] : 0), cy = (rb.top + rb.bottom) / 2 - (t ? t[1] : 0);
    const r = { left: cx - lw / 2, top: cy - lh / 2, right: cx + lw / 2, bottom: cy + lh / 2, width: lw, height: lh };
    const sc = scrollerOf(p);
    const rows = [];
    let st = 0;
    if (sc) {
      st = ST(sc)[0];
      const top = r.top - PAD - 320, bottom = r.bottom + PAD + 320;
      for (const x of rowsIn(sc, top, bottom, R)) if (x[1].right > r.left - PAD && x[1].left < r.right + PAD) rows.push(x);
      let seps = sc.__lgSeps;
      if (!seps) seps = sc.__lgSeps = [...sc.querySelectorAll('.date-sep')];
      for (const s of seps) { const rr = R(s); if (rr.height && rr.bottom >= top && rr.top <= bottom) rows.push([s, rr]); }
    }
    panels.push([p, r, rows, lw, lh, st, sc]);
  }

  // 2) запись (только то, что изменилось)
  for (const sc of scrolls.keys()) {
    const chat = sc.parentElement, kk = scrolls.get(sc)[1];
    if (chat && !near(chat.__lgK, kk)) { chat.__lgK = kk; chat.style.setProperty('--lg-k', `${kk}px`); }
  }
  for (const [el, r, st] of bubbles) {
    setTone(el, toneAt(o, r));
    let bg = el.__lgBg;
    if (!bg || bg.parentNode !== el) {
      bg = document.createElement('i');
      bg.className = 'lg-bg';
      bg.setAttribute('aria-hidden', 'true');
      bg.appendChild(document.createElement('i')).className = 'lg-img';
      el.appendChild(bg);
      el.__lgBg = bg; el.__lgX = el.__lgY = null;
    }
    // сдвиг копии обоев при scrollTop = 0; дальше её ведёт прокрутка
    const x = o.left - r.left, y = o.top - r.top - st;
    if (!near(el.__lgX, x) || !near(el.__lgY, y)) {
      el.__lgX = x; el.__lgY = y;
      bg.firstChild.style.cssText = `--x:${Math.round(x)}px;--y:${Math.round(y)}px`;
    }
  }
  for (const p of live) if (!seen.has(p)) dropMirror(p);
  live.clear();
  for (const [p, r, rows, lw, lh, st, sc] of panels) {
    live.add(p);
    lensFor(p, 'p', lw, lh);
    setTone(p, toneAt(o, r));
    const v = `${Math.round(o.left - r.left + PAD)}px ${Math.round(o.top - r.top + PAD)}px`;
    if (p.__bp !== v) { p.__bp = v; p.style.setProperty('--bp', v); }
    let m = p.__lgMirror, f = p.__lgFeed;
    if (!m || m.parentNode !== p || !f || f.parentNode !== p) {
      dropMirror(p);
      m = document.createElement('div');
      m.className = 'lg-mirror';
      m.setAttribute('aria-hidden', 'true');
      m.appendChild(document.createElement('div')).className = 'lg-mi';
      f = document.createElement('div');
      f.className = 'lg-feed';
      f.setAttribute('aria-hidden', 'true');
      const inv = f.appendChild(document.createElement('div'));
      inv.className = 'lg-finv';
      const fin = inv.appendChild(document.createElement('div'));
      fin.className = 'lg-fin';
      // текст копий — как в ленте, а не как в панели
      if (sc) {
        const cs = getComputedStyle(sc);
        for (const key of ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color', 'text-align', 'white-space'])
          fin.style.setProperty(key, cs.getPropertyValue(key));
      }
      p.append(m, f);
      p.__lgMirror = m; p.__lgFeed = f; p.__lgClones = new Map();
      p.__lgInv?.(); // кнопку сейчас тянут — сразу поставить обратный сдвиг новым слоям
    }
    const fin = f.firstChild.firstChild;
    const clones = p.__lgClones, want = new Set(rows.map(x => x[0]));
    for (const [row, cl] of clones) if (!want.has(row) || !row.isConnected) { cl.remove(); clones.delete(row); }
    // место копии — при scrollTop = 0 (дальше слой с копиями двигает прокрутка)
    const mx = r.left - PAD, my = r.top - PAD;
    for (const [row, rr] of rows) {
      let cl = clones.get(row);
      if (!cl || cl.__v !== row.__lgV) {
        const n = cloneRow(row);
        if (cl) cl.replaceWith(n); else fin.appendChild(n);
        cl = n; cl.__v = row.__lgV; cl.__k = ''; clones.set(row, cl);
      }
      const kx = Math.round((rr.left - mx) * 2) / 2, ky = Math.round((rr.top - my + st) * 2) / 2;
      const key = `${kx},${ky},${rr.width},${rr.height}`;
      if (cl.__k !== key) {
        cl.__k = key;
        cl.style.transform = `translate(${kx}px,${ky}px)`;
        cl.style.width = `${rr.width}px`; cl.style.height = `${rr.height}px`;
      }
    }
  }
}

export function glassUpdate() { if (!raf) raf = requestAnimationFrame(update); }
// прокрутка списка чатов, настроек и т. п. стекло ленты не двигает
// Со scroll-timeline при прокрутке код нужен только чтобы заранее подготовить новые пузыри и копии
// (с запасом в несколько сотен пикселей), поэтому не каждый кадр, а раз в 60 мс и в конце прокрутки.
let scrollT = 0;
const onScroll = () => {
  if (!TL) return glassUpdate();
  if (scrollT) return;
  scrollT = setTimeout(() => { scrollT = 0; glassUpdate(); }, 60);
};
document.addEventListener('scroll', e => { const t = e.target; if (t === document || !t.closest || !t.closest('.sidebar')) onScroll(); }, { capture: true, passive: true });
document.addEventListener('scrollend', e => { const t = e.target; if (t === document || !t.closest || !t.closest('.sidebar')) glassUpdate(); }, { capture: true, passive: true });
window.addEventListener('resize', glassUpdate);
// Изменения в ленте: строку под панелью копируем заново; свои копии (внутри .lg-mirror) не считаем.
new MutationObserver(recs => {
  let any = false;
  for (const rec of recs) {
    const t = rec.target.nodeType === 1 ? rec.target : rec.target.parentElement;
    // список чатов слева и полосы прокрутки на стекло ленты не влияют — не пересчитываем из-за них
    if (!t || t.closest('.lg-mirror, .lg-feed, .sidebar, .sb-track')) continue;
    if (rec.type === 'childList' && [...rec.addedNodes, ...rec.removedNodes].every(n => n.nodeType === 1 && (n.classList.contains('lg-mirror') || n.classList.contains('lg-feed') || n.classList.contains('lg-bg')))) continue;
    any = true;
    const sc = t.closest('.messages');
    if (sc) {
      if (rec.type === 'childList') { sc.__lgRows = null; sc.__lgSeps = null; }
      const row = t.closest(ROWS) || t.closest('.date-sep');
      if (row) row.__lgV = (row.__lgV || 0) + 1;
    }
  }
  if (any) glassUpdate();
}).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'src'] });
// переходы (профиль, ветка, анимация новых сообщений) — досчитываем ещё пару кадров
const outsideChat = e => e.target?.closest?.('.sidebar, .lg-feed');
document.addEventListener('transitionend', e => outsideChat(e) || glassUpdate(), true);
document.addEventListener('animationend', e => outsideChat(e) || glassUpdate(), true);
document.addEventListener('load', glassUpdate, true);
