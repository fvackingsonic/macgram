// Обои чата на весь фон окна — те же, что выбраны в аккаунте Telegram (узор + градиент).
import { html, useEffect, useState } from '../lib.js';
import { S, changed, download, fileUrl, palette, setPref } from '../store.js';
import { send, onUpdate } from '../td.js';

const hex = n => `#${(n >>> 0 & 0xffffff).toString(16).padStart(6, '0')}`;
// Стандартные обои Telegram (узор «Telegram» и четырёхцветный градиент).
const DEFAULT_SLUG = 'fqv01SQemVIBAAAApND8LDRUhRU';
const DEFAULT_LIGHT = [0xdbddbb, 0x6ba587, 0xd5d88d, 0x88b884];
const DEFAULT_DARK = [0x1b2836, 0x121a22, 0x1d2a37, 0x111820];

onUpdate(u => {
  if (u['@type'] === 'updateDefaultBackground' || u['@type'] === 'updateSelectedBackground') {
    S.backgrounds = { ...(S.backgrounds || {}), [u.for_dark_theme ? 'dark' : 'light']: u.background || null };
    changed();
  }
  if (u['@type'] === 'updateAuthorizationState' && u.authorization_state['@type'] === 'authorizationStateReady') {
    send({ '@type': 'searchBackground', name: DEFAULT_SLUG }).then(bg => { S.defaultPattern = bg; changed(); }).catch(() => {});
  }
});

export function fillCss(fill, fallback) {
  if (!fill) return freeform(fallback);
  switch (fill['@type']) {
    case 'backgroundFillSolid': return hex(fill.color);
    case 'backgroundFillGradient': return `linear-gradient(${fill.rotation_angle || 0}deg, ${hex(fill.top_color)}, ${hex(fill.bottom_color)})`;
    case 'backgroundFillFreeformGradient': return freeform(fill.colors);
    default: return freeform(fallback);
  }
}
// Приближение «свободного» градиента Telegram: цвета в точках (0.8,0.1) (0.35,0.25) (0.2,0.9) (0.65,0.75).
function freeform(colors) {
  const c = colors.map(hex);
  const pts = ['80% 10%', '35% 25%', '20% 90%', '65% 75%'];
  const layers = c.slice(0, 4).map((col, i) => `radial-gradient(circle at ${pts[i]}, ${col} 0%, ${col}00 65%)`);
  return `${layers.join(', ')}, linear-gradient(160deg, ${c[0]}, ${c[c.length - 1]})`;
}

const patternCache = new Map(); // fileId -> objectURL
function usePattern(file) {
  const [url, setUrl] = useState(file ? patternCache.get(file.id) || '' : '');
  useEffect(() => { if (file) download(file, 1); }, [file?.id]);
  const src = file ? fileUrl(file) : '';
  useEffect(() => {
    if (!file || !src || patternCache.has(file.id)) { if (file && patternCache.has(file.id)) setUrl(patternCache.get(file.id)); return; }
    fetch(src).then(r => r.arrayBuffer()).then(async buf => {
      const b = new Uint8Array(buf, 0, 2);
      let blob = new Blob([buf]);
      if (b[0] === 0x1f && b[1] === 0x8b) blob = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
      const u = URL.createObjectURL(new Blob([await blob.arrayBuffer()], { type: 'image/svg+xml' }));
      patternCache.set(file.id, u); setUrl(u);
    }).catch(() => {});
  }, [src]);
  return url;
}

// ── главный цвет фона для «Цвета под фон» ──
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l * 100];
  const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}
// Самый «заметный» оттенок: пиксели делим на 24 корзины по оттенку с весом насыщенности.
function dominant(pixels) {
  const bins = Array.from({ length: 24 }, () => ({ w: 0, x: 0, y: 0, s: 0, l: 0 }));
  let tl = 0, tw = 0;
  for (const [r, g, b] of pixels) {
    const [h, s, l] = rgbToHsl(r, g, b);
    tl += l; tw++;
    const w = (s / 100) * (1 - Math.abs(l - 50) / 60) + .02;
    const bin = bins[Math.floor(h / 15) % 24];
    bin.w += w; bin.x += Math.cos(h * Math.PI / 180) * w; bin.y += Math.sin(h * Math.PI / 180) * w; bin.s += s * w; bin.l += l * w;
  }
  const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
  if (!best.w) return null;
  const h = (Math.atan2(best.y, best.x) * 180 / Math.PI + 360) % 360;
  return { h, s: best.s / best.w, l: tl / tw };
}
const tintCache = new Map();
async function computeTint(bg) {
  if (tintCache.has(bg.id)) return tintCache.get(bg.id);
  const t = bg.type;
  let res = null;
  const fill = t?.fill;
  if (fill) {
    const cols = fill.colors || (fill.color != null ? [fill.color] : [fill.top_color, fill.bottom_color]);
    res = dominant(cols.filter(c => c != null).map(c => [(c >> 16) & 255, (c >> 8) & 255, c & 255]));
  } else if (t?.['@type'] === 'backgroundTypeWallpaper') {
    const f = bg.document?.thumbnail?.file || bg.document?.document;
    if (!f) return null;
    download(f, 1);
    for (let i = 0; i < 40 && !fileUrl(f); i++) await new Promise(r => setTimeout(r, 250));
    const url = fileUrl(f);
    if (!url) return null;
    try {
      const bmp = await createImageBitmap(await (await fetch(url)).blob());
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const g = c.getContext('2d'); g.drawImage(bmp, 0, 0, 32, 32);
      const d = g.getImageData(0, 0, 32, 32).data, px = [];
      for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
      res = dominant(px);
    } catch { res = null; }
  }
  tintCache.set(bg.id, res);
  return res;
}

async function liveTint(url, kind) {
  if (!url) return null;
  try {
    const blob = await (await fetch(url)).blob();
    let src;
    if (kind === 'video') {
      const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(blob);
      await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = no; setTimeout(no, 8000); });
      v.currentTime = Math.min(1, (v.duration || 2) / 2);
      await new Promise(ok => { v.onseeked = ok; setTimeout(ok, 1500); });
      src = v;
    } else src = await createImageBitmap(blob);
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'); g.drawImage(src, 0, 0, 32, 32);
    const d = g.getImageData(0, 0, 32, 32).data, px = [];
    for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
    if (src.src) URL.revokeObjectURL(src.src);
    return dominant(px);
  } catch { return null; }
}

// Поля вокруг вписанной картинки — спокойный цвет самой картинки (а не её копия).
function marginColor() {
  const t = S.wallTint;
  if (!t) return '#111';
  return `hsl(${Math.round(t.h)} ${Math.round(Math.min(45, t.s * .7))}% ${Math.round(Math.max(8, Math.min(40, t.l * .45)))}%)`;
}

// ── «запечённое» стекло: размытая копия фона для стеклянных пузырей ──
// Пузыри рисуют её как фиксированный фон (background-attachment: fixed) — выглядит как размытие
// того, что под пузырём, но без backdrop-filter, который в WebView2 «моргал» и пропадал при прокрутке.
let bakedUrl = '';
async function bakeWall(url, fit, extraBlur) {
  const W = innerWidth, H = innerHeight, k = .5;
  const bmp = await createImageBitmap(await (await fetch(url)).blob());
  const iw = bmp.width, ih = bmp.height;
  const sc = fit === 'contain' ? Math.min(W / iw, H / ih) : fit === 'width' ? W / iw : fit === 'center' ? 1 : Math.max(W / iw, H / ih);
  const dw = iw * sc, dh = ih * sc, dx = (W - dw) / 2, dy = fit === 'width' ? 0 : (H - dh) / 2;
  const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k);
  const g = c.getContext('2d');
  g.fillStyle = fit === 'cover' ? '#000' : marginColor(); g.fillRect(0, 0, c.width, c.height);
  g.filter = `blur(${(extraBlur ? 12 : 1.6) * k}px) saturate(1.6) brightness(1.1)`;
  g.drawImage(bmp, dx * k - 2, dy * k - 2, dw * k + 4, dh * k + 4);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .88));
  return blob ? URL.createObjectURL(blob) : '';
}
function setBaked(u) {
  const root = document.documentElement;
  if (bakedUrl) URL.revokeObjectURL(bakedUrl);
  bakedUrl = u;
  if (u) { root.style.setProperty('--wall-blur', `url("${u}")`); root.classList.add('wall-baked'); }
  else { root.style.removeProperty('--wall-blur'); root.classList.remove('wall-baked'); }
}

export function Wallpaper({ main }) {
  const dark = palette() === 'night';
  const plain = palette() === 'day' && !S.backgrounds?.light;
  const own = S.backgrounds?.[dark ? 'dark' : 'light'];
  const def = S.defaultPattern;
  const bg = own || def;
  const type = bg?.type;
  const isPattern = type?.['@type'] === 'backgroundTypePattern';
  const isPhoto = type?.['@type'] === 'backgroundTypeWallpaper';
  const fallback = dark ? DEFAULT_DARK : DEFAULT_LIGHT;
  // Для стандартных обоев берём фирменные цвета, для своих — цвета из аккаунта.
  const fill = own ? (type?.fill || null) : null;
  const pattern = usePattern(isPattern ? bg.document?.document : null);
  const photoFile = isPhoto ? bg.document?.document : null;
  useEffect(() => { if (photoFile) download(photoFile, 1); }, [photoFile?.id]);
  const photoUrl = photoFile ? fileUrl(photoFile) : '';
  const intensity = Math.abs(own && isPattern ? type.intensity : 50) / 100;
  const inverted = dark || (own && isPattern && type.is_inverted);
  const base = plain ? 'var(--chat-bg)' : type?.['@type'] === 'backgroundTypeFill' ? fillCss(type.fill, fallback) : fillCss(fill, fallback);

  // Цвета под фон — только для своего фона из аккаунта.
  const live = S.prefs.liveWall;
  const liveUrl = live?.path ? (window.__TAURI__?.core?.convertFileSrc?.(live.path) || '') : '';
  const tintKey = live?.path ? `live:${live.path}` : own ? `${own.id}:${dark}` : '';
  useEffect(() => {
    let alive = true;
    if (live?.path) {
      liveTint(liveUrl, live.kind).then(t => { if (!alive) return; S.wallTint = t; if (S.pendingTint && t) { S.pendingTint = false; setPref('tint', t); } changed(); });
      return () => { alive = false; };
    }
    if (!own) { if (S.wallTint) { S.wallTint = null; changed(); } return; }
    computeTint(own).then(t => { if (!alive) return; S.wallTint = t; if (S.pendingTint && t) { S.pendingTint = false; setPref('tint', t); } changed(); });
    return () => { alive = false; };
  }, [tintKey]);
  // Живой фон (GIF / видео) — свой, хранится на этом компьютере.
  // Как вписать картинку в окно: «Заполнить» обрезает края, «Целиком»/«По ширине»/«Как есть» — без
  // увеличения, а пустые поля закрашены спокойным цветом самой картинки.
  const fit = S.prefs.wallFit || 'cover';
  const fitCss = { cover: 'center/cover', contain: 'center/contain', width: 'center top/100% auto', center: 'center/auto' }[fit] || 'center/cover';
  const objFit = { cover: 'cover', contain: 'contain', width: 'cover', center: 'none' }[fit] || 'cover';
  const fitted = isPhoto && photoUrl && fit !== 'cover';
  const bakeKey = main && !liveUrl && isPhoto && photoUrl ? `${photoUrl}|${fit}|${!!type.is_blurred}|${S.wallTint?.h ?? ''}` : '';
  useEffect(() => {
    if (!main) return;
    if (!bakeKey) { setBaked(''); S.glassBake = liveUrl ? 'живой фон' : isPhoto ? 'фон ещё грузится' : 'не фон-картинка'; return; }
    let alive = true, t = 0;
    const run = () => bakeWall(photoUrl, fit, type.is_blurred).then(u => { if (alive) { setBaked(u); S.glassBake = u ? 'ok' : 'пустой результат'; } else if (u) URL.revokeObjectURL(u); }).catch(e => { if (alive) { setBaked(''); S.glassBake = String(e?.message || e); } });
    run();
    const onResize = () => { clearTimeout(t); t = setTimeout(run, 250); };
    window.addEventListener('resize', onResize);
    return () => { alive = false; clearTimeout(t); window.removeEventListener('resize', onResize); };
  }, [bakeKey]);
  if (liveUrl) return html`<div class="wallpaper live" style=${`background:${fit !== 'cover' ? marginColor() : dark ? '#000' : '#888'}`}>
    ${live.kind === 'video' ? html`<video src=${liveUrl} autoplay loop muted playsinline disablepictureinpicture style=${`object-fit:${objFit}`}/>` : html`<img src=${liveUrl} alt="" style=${`object-fit:${objFit}`}/>`}
    ${live.blur && html`<div class="wp-blur"/>`}
    ${dark && html`<div class="wp-dim"/>`}
  </div>`;
  return html`<div class="wallpaper" style=${`background:${isPhoto && photoUrl ? (fitted ? marginColor() : `center/cover no-repeat url("${photoUrl}")`) : base}`}>
    ${fitted && html`<div class="wp-img" style=${`background:${fitCss} no-repeat url("${photoUrl}")`}/>`}
    ${isPhoto && type.is_blurred && html`<div class="wp-blur"/>`}
    ${!plain && isPattern && pattern && html`<div class="wp-pattern" style=${`-webkit-mask-image:url("${pattern}");mask-image:url("${pattern}");background:${inverted ? '#fff' : '#000'};opacity:${inverted ? intensity * 0.12 : intensity * 0.32}`}/>`}
  </div>`;
}
