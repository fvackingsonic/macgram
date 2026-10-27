// Обои чата на весь фон окна — те же, что выбраны в аккаунте Telegram (узор + градиент).
import { html, useEffect, useState } from '../lib.js';
import { S, changed, download, fileUrl, palette } from '../store.js';
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

function fillCss(fill, fallback) {
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

export function Wallpaper() {
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

  return html`<div class="wallpaper" style=${`background:${isPhoto && photoUrl ? `center/cover no-repeat url("${photoUrl}")` : base}`}>
    ${isPhoto && type.is_blurred && html`<div class="wp-blur"/>`}
    ${!plain && isPattern && pattern && html`<div class="wp-pattern" style=${`-webkit-mask-image:url("${pattern}");mask-image:url("${pattern}");background:${inverted ? '#fff' : '#000'};opacity:${inverted ? intensity * 0.12 : intensity * 0.32}`}/>`}
  </div>`;
}
