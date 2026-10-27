// Истории: ряд кружков над поиском и полноэкранный просмотр.
import { html, useEffect, useState, useRef } from '../lib.js';
import { S, changed, download, fileUrl, chatTitle, isSaved, showHud } from '../store.js';
import { send, onUpdate } from '../td.js';
import { Icon } from '../icons.js';
import { MI } from '../mac-icons.js';
import { listTime } from '../format.js';
import { Avatar, Spinner } from './common.js';

onUpdate(u => {
  if (u['@type'] === 'updateChatActiveStories') {
    const a = u.active_stories;
    if (a.stories?.length) S.stories.set(a.chat_id, a); else S.stories.delete(a.chat_id);
    changed();
  }
  if (u['@type'] === 'updateAuthorizationState' && u.authorization_state['@type'] === 'authorizationStateReady') {
    (async () => {
      for (let i = 0; i < 10; i++) {
        try { await send({ '@type': 'loadActiveStories', story_list: { '@type': 'storyListMain' } }); } catch { break; }
      }
    })();
  }
});

const unread = a => a.stories.some(s => s.story_id > (a.max_read_story_id || 0));
export function storyChats() {
  const list = [...S.stories.values()].filter(a => a.list?.['@type'] === 'storyListMain' || isSaved(S.chats.get(a.chat_id)));
  list.sort((a, b) => {
    if (a.chat_id === S.myId) return -1;
    if (b.chat_id === S.myId) return 1;
    const ua = unread(a), ub = unread(b);
    if (ua !== ub) return ua ? -1 : 1;
    return BigInt(b.order || 0) > BigInt(a.order || 0) ? 1 : -1;
  });
  return list;
}

export function StoriesRow() {
  const list = storyChats();
  if (!list.length) return null;
  return html`<div class="stories-row">
    ${list.map(a => {
      const chat = S.chats.get(a.chat_id);
      if (!chat) return null;
      const name = isSaved(chat) ? 'Моя история' : chatTitle(chat).split(' ')[0];
      return html`<button class="story-av" key=${a.chat_id} onClick=${() => openStories(a.chat_id)}>
        <span class=${`story-ring ${unread(a) ? 'unread' : ''} ${a.stories.some(s => s.is_for_close_friends) ? 'close' : ''}`}><${Avatar} chat=${chat} size=${50}/></span>
        <span class="story-name">${name}</span>
      </button>`;
    })}
  </div>`;
}

export function openStories(chatId) {
  const a = S.stories.get(chatId);
  if (!a) return;
  const firstUnread = a.stories.findIndex(s => s.story_id > (a.max_read_story_id || 0));
  S.storyView = { chatId, index: firstUnread >= 0 ? firstUnread : 0 };
  changed();
}

function closeStories() { S.storyView = null; changed(); }
function step(d) {
  const v = S.storyView; if (!v) return;
  const a = S.stories.get(v.chatId);
  const n = v.index + d;
  if (a && n >= 0 && n < a.stories.length) { v.index = n; changed(); return; }
  const order = storyChats().map(x => x.chat_id);
  const ci = order.indexOf(v.chatId) + (d > 0 ? 1 : -1);
  if (ci >= 0 && ci < order.length) { const na = S.stories.get(order[ci]); S.storyView = { chatId: order[ci], index: d > 0 ? 0 : na.stories.length - 1 }; changed(); }
  else closeStories();
}

// Тихое сохранение настройки (без перерисовки всего окна) — для ползунка громкости.
function savePref(k, v) { S.prefs[k] = v; try { localStorage.setItem('prefs', JSON.stringify(S.prefs)); } catch {} }

const storyReq = (type, chatId, id) => ({ '@type': type, story_poster_chat_id: chatId, story_sender_chat_id: chatId, story_id: id });

export function StoryViewer() {
  const v = S.storyView;
  const [story, setStory] = useState(null);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(() => S.prefs.storyMuted === true);
  const [volume, setVolume] = useState(() => S.prefs.storyVolume ?? 1);
  const vid = useRef();
  const a = v ? S.stories.get(v.chatId) : null;
  const info = a?.stories[v.index];
  useEffect(() => {
    if (!info) return;
    setStory(null); setProgress(0); setUseMain(false);
    let dead = false;
    send({ ...storyReq('getStory', v.chatId, info.story_id), only_local: false })
      .then(s => { if (!dead) setStory(s); }).catch(e => { if (!dead) { showHud(e.message || 'История недоступна'); step(1); } });
    send(storyReq('openStory', v.chatId, info.story_id)).catch(() => {});
    return () => { dead = true; send(storyReq('closeStory', v.chatId, info.story_id)).catch(() => {}); };
  }, [v?.chatId, info?.story_id]);
  useEffect(() => {
    if (!v) return;
    const k = e => { if (e.key === 'Escape') closeStories(); if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); if (e.key === ' ') { e.preventDefault(); setPaused(p => !p); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [!!v]);
  const c = story?.content;
  const isVideo = c?.['@type'] === 'storyContentVideo';
  const photoSize = c?.photo ? [...c.photo.sizes].sort((x, y) => y.width - x.width)[0] : null;
  // Основное видео истории бывает в HEVC/AV1, которые Windows-движок (WebView2) не играет без
  // дополнений, — берём запасную версию в H.264 (alternative_video), если она есть.
  const [useMain, setUseMain] = useState(false);
  const vfile = isVideo ? ((!useMain && c.alternative_video?.video) || c.video.video) : null;
  const file = isVideo ? vfile : photoSize?.photo;
  useEffect(() => { if (file) download(file, 32); }, [file?.id]);
  const url = file ? fileUrl(file) : '';
  // Фото — 5 секунд, видео — по его длительности.
  useEffect(() => {
    if (!url || isVideo || paused) return;
    const t0 = Date.now() - progress * 5000;
    const t = setInterval(() => { const p = (Date.now() - t0) / 5000; if (p >= 1) { clearInterval(t); step(1); } else setProgress(p); }, 50);
    return () => clearInterval(t);
  }, [url, paused]);
  useEffect(() => { const el = vid.current; if (!el) return; paused ? el.pause() : el.play().catch(() => {}); }, [paused, url]);
  if (!v || !a) return null;
  // Громкость как в Telegram для macOS: наведите на динамик — появится ползунок, колёсико тоже работает.
  function applyVol(x) {
    x = Math.max(0, Math.min(1, x));
    setVolume(x); setMuted(x === 0);
    if (vid.current) { vid.current.volume = x; vid.current.muted = x === 0; }
    savePref('storyVolume', x); savePref('storyMuted', x === 0);
  }
  const chat = S.chats.get(v.chatId);
  const mini = (isVideo ? c.video : c?.photo)?.minithumbnail?.data;
  const caption = story?.caption?.text;
  return html`<div class="story-veil" onClick=${closeStories}>
    <div class="story-frame" onClick=${e => e.stopPropagation()} onMouseDown=${() => setPaused(true)} onMouseUp=${() => setPaused(false)}>
      ${mini && html`<img decoding="async" class="story-media blur" src=${`data:image/jpeg;base64,${mini}`} alt=""/>`}
      ${url && !isVideo && html`<img decoding="async" class="story-media" src=${url} alt=""/>`}
      ${url && isVideo && html`<video ref=${vid} class="story-media" key=${url} src=${url} autoplay playsinline muted=${muted || volume === 0}
        onLoadedMetadata=${e => { e.target.volume = volume; e.target.play().catch(() => { e.target.muted = true; setMuted(true); e.target.play().catch(() => {}); }); }}
        onError=${() => { if (!useMain && c.alternative_video) setUseMain(true); else showHud('Это видео не поддерживается на Windows'); }}
        onTimeUpdate=${e => setProgress(e.target.currentTime / (e.target.duration || 1))} onEnded=${() => step(1)}/>`}
      ${!url && html`<div class="story-loading"><${Spinner}/></div>`}
      <div class="story-top">
        <div class="story-bars">${a.stories.map((s, i) => html`<i><b style=${`width:${i < v.index ? 100 : i === v.index ? progress * 100 : 0}%`}/></i>`)}</div>
        <div class="story-head">
          <${Avatar} chat=${chat} size=${32}/>
          <div class="sh-text"><b>${isSaved(chat) ? 'Моя история' : chatTitle(chat)}</b><span>${listTime(info?.date)}</span></div>
          ${isVideo && html`<div class="story-vol" onWheel=${e => { e.preventDefault(); applyVol(volume - Math.sign(e.deltaY) * 0.05); }}>
            <button onClick=${() => { const m = !(muted || volume === 0); setMuted(m); if (!m && volume === 0) applyVol(.5); savePref('storyMuted', m); }}>${MI(muted || volume === 0 ? 'Icon_StoryMute' : 'Icon_StoryUnmute', 24)}</button>
            <div class="story-vol-pop"><input type="range" min="0" max="1" step="0.01" value=${muted ? 0 : volume} onInput=${e => applyVol(Number(e.target.value))}/></div>
          </div>`}
          <button onClick=${closeStories}>${MI('Icon_StoryClose', 24)}</button>
        </div>
      </div>
      ${caption && html`<div class="story-caption">${caption}</div>`}
      <button class="story-nav prev" onClick=${e => { e.stopPropagation(); step(-1); }}/>
      <button class="story-nav next" onClick=${e => { e.stopPropagation(); step(1); }}/>
    </div>
    <button class="story-arrow left" onClick=${e => { e.stopPropagation(); step(-1); }}>${MI('Icon_StoryChevron', 26, 'transform:rotate(180deg)')}</button>
    <button class="story-arrow right" onClick=${e => { e.stopPropagation(); step(1); }}>${MI('Icon_StoryChevron', 26)}</button>
  </div>`;
}
