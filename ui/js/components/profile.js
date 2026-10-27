import { html, useEffect, useState } from '../lib.js';
import { S, changed, isMuted, chatTitle, chatUser, isSaved, isChannel, showHud, download, fileUrl } from '../store.js';
import { send, shell } from '../td.js';
import { Icon } from '../icons.js';
import { userStatus, count, renderFormatted, duration } from '../format.js';
import { fileOf } from '../store.js';
import { useRef } from '../lib.js';
import { Avatar, Spinner } from './common.js';

// Панель профиля справа — как в Telegram для macOS.
export function ProfilePanel({ chat }) {
  const [info, setInfo] = useState(null);
  const [media, setMedia] = useState(null);
  const user = chatUser(chat);
  const t = chat.type['@type'];

  useEffect(() => {
    setInfo(null); setMedia(null);
    let req = null;
    if (user) req = { '@type': 'getUserFullInfo', user_id: user.id };
    else if (t === 'chatTypeSupergroup') req = { '@type': 'getSupergroupFullInfo', supergroup_id: chat.type.supergroup_id };
    else if (t === 'chatTypeBasicGroup') req = { '@type': 'getBasicGroupFullInfo', basic_group_id: chat.type.basic_group_id };
    if (req) send(req).then(setInfo).catch(() => setInfo({}));
    send({ '@type': 'searchChatMessages', chat_id: chat.id, query: '', from_message_id: 0, offset: 0, limit: 60, filter: { '@type': 'searchMessagesFilterPhotoAndVideo' } })
      .then(r => setMedia(r.messages || [])).catch(() => setMedia([]));
  }, [chat.id]);

  const muted = isMuted(chat);
  const toggleMute = () => send({ '@type': 'setChatNotificationSettings', chat_id: chat.id, notification_settings: { ...(chat.notification_settings || {}), '@type': 'chatNotificationSettings', use_default_mute_for: false, mute_for: muted ? 0 : 2147483647 } })
    .catch(e => showHud(e.message));

  const sg = t === 'chatTypeSupergroup' ? S.supergroups.get(chat.type.supergroup_id) : null;
  const bg = t === 'chatTypeBasicGroup' ? S.basicGroups.get(chat.type.basic_group_id) : null;
  const username = user?.usernames?.active_usernames?.[0] || sg?.usernames?.active_usernames?.[0];
  const about = user ? info?.bio : info?.description;
  const statusLine = isSaved(chat) ? '' : user ? userStatus(user)
    : sg ? count(sg.member_count || info?.member_count || 0, isChannel(chat) ? 'подписчик' : 'участник', isChannel(chat) ? 'подписчика' : 'участника', isChannel(chat) ? 'подписчиков' : 'участников')
      : bg ? count(bg.member_count, 'участник', 'участника', 'участников') : '';
  const copy = (text, what) => navigator.clipboard.writeText(text).then(() => showHud(`${what} скопирован`));

  return html`<aside class="profile-panel">
    <div class="pp-head">
      <span class="pp-title">${user ? 'Информация' : isChannel(chat) ? 'О канале' : 'О группе'}</span>
      <button class="icon-btn gray" title="Закрыть" onClick=${() => { S.profile = false; changed(); }}>${Icon.close(15)}</button>
    </div>
    <div class="pp-body">
      <div class="profile">
        <${Avatar} chat=${chat} size=${100}/>
        <div class="pname">${chatTitle(chat)}</div>
        <div class=${`psub ${statusLine === 'в сети' ? 'online' : ''}`}>${statusLine}</div>
      </div>
      <div class="pp-actions">
        <button onClick=${toggleMute}><span>${Icon.muted(20)}</span>${muted ? 'Вкл. звук' : 'Без звука'}</button>
        ${username && html`<button onClick=${() => shell.openUrl(`https://t.me/${username}`)}><span>${Icon.reply(20)}</span>Ссылка</button>`}
      </div>
      <div class="group">
        ${user?.phone_number && html`<button class="item two" onClick=${() => copy(`+${user.phone_number}`, 'Номер')}><div><div>+${user.phone_number}</div><small>телефон</small></div></button>`}
        ${username && html`<button class="item two" onClick=${() => copy(`@${username}`, 'Username')}><div><div>@${username}</div><small>имя пользователя</small></div></button>`}
        ${about?.text && html`<div class="item two"><div class="selectable" style="white-space:pre-wrap"><div>${renderFormatted(about, url => shell.openUrl(url))}</div><small>${user ? 'о себе' : 'описание'}</small></div></div>`}
        ${typeof about === 'string' && about && html`<div class="item two"><div class="selectable" style="white-space:pre-wrap"><div>${about}</div><small>описание</small></div></div>`}
        ${!info && html`<div class="item" style="justify-content:center;color:var(--gray-text)"><${Spinner}/></div>`}
        ${info && !user?.phone_number && !username && !about && html`<div class="item" style="color:var(--gray-text)">Нет дополнительной информации</div>`}
      </div>
      <div class="pp-section">Фото и видео</div>
      ${media === null ? html`<div style="display:grid;place-items:center;padding:16px;color:var(--gray-text)"><${Spinner}/></div>`
        : !media.length ? html`<div class="empty" style="padding:12px">Пока нет</div>`
          : html`<div class="media-grid">${media.map(m => html`<${MediaThumb} key=${m.id} msg=${m}/>`)}</div>`}
    </div>
  </aside>`;
}

function MediaThumb({ msg }) {
  const c = msg.content;
  const photo = c.photo;
  const thumbFile = photo ? [...photo.sizes].sort((a, b) => a.width - b.width).find(s => s.width >= 200)?.photo || photo.sizes[0]?.photo
    : c.video?.thumbnail?.format?.['@type'] === 'thumbnailFormatJpeg' ? c.video.thumbnail.file : null;
  useEffect(() => { if (thumbFile) download(thumbFile, 1); }, [thumbFile?.id]);
  const url = thumbFile ? fileUrl(thumbFile) : '';
  const mini = (photo || c.video)?.minithumbnail?.data;
  const open = () => { if (photo) { S.viewer = { photo }; changed(); } };
  return html`<button class="media-cell" onClick=${open}>
    ${mini && html`<img class="blur" src=${`data:image/jpeg;base64,${mini}`} alt=""/>`}
    ${url && html`<img src=${url} alt="" onError=${e => e.target.remove()}/>`}
    ${c.video && html`<span class="dur-badge" style="top:auto;bottom:4px;left:4px">▶</span>`}
  </button>`;
}

// Просмотр фото на весь окно.
export function Viewer() {
  const v = S.viewer;
  const [closing, setClosing] = useState(false);
  const best = v?.photo ? [...v.photo.sizes].sort((a, b) => b.width - a.width)[0] : null;
  useEffect(() => { if (best) download(best.photo, 32); }, [best?.photo.id]);
  useEffect(() => {
    if (!v) return;
    setClosing(false);
    const k = e => e.key === 'Escape' && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [v]);
  if (!v) return null;
  const close = () => { setClosing(true); setTimeout(() => { S.viewer = null; changed(); }, 180); };
  const url = (best && fileUrl(best.photo)) || v.url;
  const mini = v.photo?.minithumbnail?.data;
  if (v.video) return html`<div class=${`viewer ${closing ? 'out' : ''}`} onClick=${close}><${VideoPlayer} video=${v.video}/>
    <button class="viewer-close" onClick=${close}>${Icon.close(18)}</button></div>`;
  return html`<div class=${`viewer ${closing ? 'out' : ''}`} onClick=${close}>
    ${url ? html`<img src=${url} alt="" onClick=${e => e.stopPropagation()}/>`
      : mini ? html`<img src=${`data:image/jpeg;base64,${mini}`} style=${`filter:blur(10px);width:${Math.min(best?.width || 600, innerWidth * .8)}px`} alt=""/>` : html`<${Spinner}/>`}
    <button class="viewer-close" onClick=${close}>${Icon.close(18)}</button>
  </div>`;
}

// Видеоплеер со своими кнопками (в духе macOS: полупрозрачная панель снизу).
function VideoPlayer({ video }) {
  const ref = useRef();
  const wrap = useRef();
  const [st, setSt] = useState({ playing: false, t: 0, d: video.duration || 0, vol: 1, muted: false });
  const [idle, setIdle] = useState(false);
  const file = video.video;
  useEffect(() => { download(file, 32); }, [file.id]);
  const src = fileUrl(file);
  const f = fileOf(file);
  const pct = f?.size ? Math.round(100 * (f.local?.downloaded_size || 0) / f.size) : 0;
  const thumb = video.thumbnail?.format?.['@type'] === 'thumbnailFormatJpeg' ? fileUrl(video.thumbnail.file) : '';
  const mini = video.minithumbnail?.data;
  const [W, H] = (() => { const k = Math.min(innerWidth * .9 / (video.width || 16), innerHeight * .82 / (video.height || 9)); return [Math.round((video.width || 16) * k), Math.round((video.height || 9) * k)]; })();
  const v = () => ref.current;
  const toggle = () => { const el = v(); if (!el) return; el.paused ? el.play().catch(() => {}) : el.pause(); };
  const seek = e => { const el = v(); if (!el || !st.d) return; const r = e.currentTarget.getBoundingClientRect(); el.currentTime = Math.max(0, Math.min(st.d, (e.clientX - r.left) / r.width * st.d)); };
  const full = () => { if (document.fullscreenElement) document.exitFullscreen(); else wrap.current?.requestFullscreen?.(); };
  useEffect(() => {
    let t; const move = () => { setIdle(false); clearTimeout(t); t = setTimeout(() => setIdle(true), 2200); };
    const key = e => { if (e.key === ' ') { e.preventDefault(); toggle(); } if (e.key === 'ArrowRight' && v()) v().currentTime += 5; if (e.key === 'ArrowLeft' && v()) v().currentTime -= 5; if (e.key.toLowerCase() === 'f') full(); };
    window.addEventListener('mousemove', move); window.addEventListener('keydown', key); move();
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('keydown', key); clearTimeout(t); };
  }, []);
  return html`<div class=${`vplayer ${idle && st.playing ? 'idle' : ''}`} ref=${wrap} style=${`width:${W}px;height:${H}px`} onClick=${e => e.stopPropagation()}>
    ${!src && mini && html`<img class="vp-poster blur" src=${`data:image/jpeg;base64,${mini}`} alt=""/>`}
    ${!src && thumb && html`<img class="vp-poster" src=${thumb} alt=""/>`}
    ${src && html`<video ref=${ref} src=${src} autoplay playsinline onClick=${toggle} onDblClick=${full}
      onPlay=${() => setSt(s => ({ ...s, playing: true }))} onPause=${() => setSt(s => ({ ...s, playing: false }))}
      onTimeUpdate=${e => setSt(s => ({ ...s, t: e.target.currentTime }))}
      onLoadedMetadata=${e => setSt(s => ({ ...s, d: e.target.duration || s.d }))}/>`}
    ${!src && html`<div class="vp-loading"><svg width="56" height="56" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" fill="rgba(0,0,0,.5)"/>
      <circle cx="22" cy="22" r="16" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-dasharray=${`${Math.max(4, pct) * 1.005} 100.5`} transform="rotate(-90 22 22)" style="transition:stroke-dasharray .3s"/></svg><span>${pct}%</span></div>`}
    ${src && !st.playing && html`<button class="vp-big" onClick=${toggle}>${Icon.play(30)}</button>`}
    ${src && html`<div class="vp-bar">
      <button onClick=${toggle}>${st.playing ? Icon.pause(18) : Icon.play(18)}</button>
      <span class="vp-time">${duration(Math.floor(st.t))}</span>
      <div class="vp-track" onClick=${seek}><i style=${`width:${st.d ? st.t / st.d * 100 : 0}%`}/></div>
      <span class="vp-time">${duration(Math.floor(st.d))}</span>
      <button onClick=${() => { const el = v(); if (el) { el.muted = !el.muted; setSt(s => ({ ...s, muted: el.muted })); } }}>${st.muted ? Icon.muted(16) : Icon.volume(16)}</button>
      <input type="range" min="0" max="1" step="0.01" value=${st.muted ? 0 : st.vol} onInput=${e => { const el = v(); const x = Number(e.target.value); if (el) { el.volume = x; el.muted = x === 0; } setSt(s => ({ ...s, vol: x, muted: x === 0 })); }}/>
      <button onClick=${full} title="Во весь экран">${Icon.expand()}</button>
    </div>`}
  </div>`;
}
