// Анимированные стикеры Telegram (.tgs = Lottie в gzip). Проигрываются через lottie (canvas).
import { html, useEffect, useRef } from '../lib.js';
import { download, fileUrl } from '../store.js';

let lottieLoading = null;
function loadLottie() {
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
