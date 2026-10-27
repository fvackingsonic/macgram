// Анимированные стикеры Telegram (.tgs = Lottie в gzip). Проигрываются через lottie (canvas).
import { html, useEffect, useRef, useState } from '../lib.js';
import { download, fileUrl } from '../store.js';

let lottieLoading = null;
export function loadLottie() {
  if (window.lottie) return Promise.resolve(window.lottie);
  if (!lottieLoading) {
    lottieLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/lottie/lottie_canvas.min.js';
      s.onload = () => resolve(window.lottie);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return lottieLoading;
}

const cache = new Map(); // url -> Promise<json>
function loadJson(url) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then(async r => {
      const buf = await r.arrayBuffer();
      const head = new Uint8Array(buf, 0, 2);
      let text;
      if (head[0] === 0x1f && head[1] === 0x8b) {
        const ds = new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip')));
        text = await ds.text();
      } else text = new TextDecoder().decode(buf);
      return JSON.parse(text);
    }));
    if (cache.size > 300) cache.delete(cache.keys().next().value);
  }
  return cache.get(url);
}

// Видимые на экране анимации играют, остальные стоят — экономим процессор.
const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const e of entries) {
    const a = e.target.__anim;
    if (!a) continue;
    if (e.isIntersecting && e.target.__autoplay) a.play(); else a.pause();
  }
}) : null;

// Первый кадр стикера как картинка: в панели стикеров показываем его вместо живой анимации,
// живую создаём только под курсором. Кадры рисуются по очереди, в свободное время.
const snaps = new Map(); // url -> Promise<dataURL>
const queue = [];
let busy = false;
const idle = cb => (window.requestIdleCallback ? requestIdleCallback(cb, { timeout: 300 }) : setTimeout(cb, 16));
function pump() {
  if (busy || !queue.length) return;
  busy = true;
  const { url, size, resolve } = queue.shift();
  idle(async () => {
    try {
      const [lottie, data] = await Promise.all([loadLottie(), loadJson(url)]);
      const box = document.createElement('div');
      const px = Math.round(size * Math.min(2, devicePixelRatio || 1));
      box.style.cssText = `position:fixed;left:-9999px;top:0;width:${px}px;height:${px}px`;
      document.body.appendChild(box);
      const a = lottie.loadAnimation({ container: box, renderer: 'canvas', loop: false, autoplay: false, animationData: data, rendererSettings: { clearCanvas: true, preserveAspectRatio: 'xMidYMid meet' } });
      a.goToAndStop(0, true);
      const c = box.querySelector('canvas');
      resolve(c ? c.toDataURL('image/webp', 0.9) : '');
      a.destroy(); box.remove();
    } catch { resolve(''); }
    busy = false; pump();
  });
}
function snapshot(url, size) {
  if (!snaps.has(url)) {
    snaps.set(url, new Promise(resolve => { queue.push({ url, size, resolve }); pump(); }));
    if (snaps.size > 400) snaps.delete(snaps.keys().next().value);
  }
  return snaps.get(url);
}
export function TgsStill({ url, size, alt }) {
  const [src, setSrc] = useState('');
  useEffect(() => { let dead = false; if (url) snapshot(url, size).then(s => !dead && setSrc(s)); return () => { dead = true; }; }, [url]);
  return src ? html`<img src=${src} alt=${alt || ''} draggable="false" style=${`width:${size}px;height:${size}px`}/>` : html`<span class="tgs-fallback" style=${`font-size:${size * 0.55}px`}>${alt || ''}</span>`;
}

export function Tgs({ file, size = 160, autoplay = true, loop = true, fallback = '', hover = false }) {
  const ref = useRef();
  useEffect(() => { if (file) download(file, 2); }, [file?.id]);
  const url = file ? fileUrl(file) : '';
  useEffect(() => {
    if (!url) return;
    let anim, dead = false;
    const el = ref.current;
    Promise.all([loadLottie(), loadJson(url)]).then(([lottie, data]) => {
      if (dead || !el) return;
      anim = lottie.loadAnimation({ container: el, renderer: 'canvas', loop, autoplay: false, animationData: data, rendererSettings: { clearCanvas: true, progressiveLoad: true, preserveAspectRatio: 'xMidYMid meet' } });
      // Кадры только с родной частотой стикера (30/60), а не на каждом обновлении экрана.
      anim.setSubframe(false);
      el.__anim = anim;
      el.__autoplay = autoplay && !hover;
      if (io) io.observe(el); else if (autoplay && !hover) anim.play();
      if (!autoplay || hover) anim.goToAndStop(0, true);
    }).catch(() => {});
    return () => { dead = true; if (io && el) io.unobserve(el); anim?.destroy(); if (el) el.__anim = null; };
  }, [url]);
  const enter = () => { if (hover) ref.current?.__anim?.play(); };
  const leave = () => { if (hover) ref.current?.__anim?.goToAndStop(0, true); };
  return html`<div class="tgs" ref=${ref} style=${`width:${size}px;height:${size}px`} onMouseEnter=${enter} onMouseLeave=${leave}>
    ${!url && fallback && html`<span class="tgs-fallback" style=${`font-size:${size * 0.6}px`}>${fallback}</span>`}
  </div>`;
}

// Кнопка «играть/пауза» плеера: та же Lottie-анимация превращения, что в Telegram для macOS
// (playlist_play_pause / playlist_pause_play), перекрашенная в цвет текста темы.
function recolor(data, rgb) {
  const d = JSON.parse(JSON.stringify(data));
  const walk = o => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== 'object') return;
    if ((o.ty === 'fl' || o.ty === 'st') && o.c && Array.isArray(o.c.k) && typeof o.c.k[0] === 'number') o.c.k = [...rgb, 1];
    for (const k in o) if (typeof o[k] === 'object') walk(o[k]);
  };
  walk(d);
  return d;
}
const cssRgb = el => {
  const m = getComputedStyle(el).color.match(/[\d.]+/g) || [0, 0, 0];
  return m.slice(0, 3).map(x => Number(x) / 255);
};
export function PlayPauseAnim({ playing, size = 34, tone = '' }) {
  const ref = useRef();
  const st = useRef({ anim: null, last: null });
  useEffect(() => {
    let dead = false;
    import('../play-anim.js').then(async m => {
      const lottie = await loadLottie();
      if (dead || !ref.current) return;
      const el = ref.current;
      const key = playing ? 'PLAY_TO_PAUSE' : 'PAUSE_TO_PLAY';
      const color = cssRgb(el);
      st.current.anim?.destroy();
      const anim = lottie.loadAnimation({ container: el, renderer: 'canvas', loop: false, autoplay: false, animationData: recolor(m[key], color), rendererSettings: { clearCanvas: true } });
      anim.setSubframe(true);
      st.current.anim = anim;
      // Анимируем только смену состояния; при первом показе и смене темы — сразу последний кадр.
      if (st.current.last === null || st.current.last === playing) anim.goToAndStop(anim.totalFrames - 1, true);
      else anim.goToAndPlay(0, true);
      st.current.last = playing;
    });
    return () => { dead = true; };
  }, [playing, tone]);
  useEffect(() => () => st.current.anim?.destroy(), []);
  return html`<div class="pp-anim" ref=${ref} style=${`width:${size}px;height:${size}px`}/>`;
}
