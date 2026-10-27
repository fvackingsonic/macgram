import { html, useEffect, useState } from '../lib.js';
import { S, changed, isMuted, chatTitle, chatUser, isSaved, isChannel, showHud, download, fileUrl, openMenu } from '../store.js';
import { send, shell } from '../td.js';
import { Icon } from '../icons.js';
import { userStatus, count, renderFormatted, duration, avatarGradient, peerIndex } from '../format.js';
import { fileOf } from '../store.js';
import { useRef } from '../lib.js';
import { Avatar, Spinner, dragHandlers } from './common.js';
import { startSecretChat } from './new-chat.js';
import { openStories } from './stories.js';

// Экран профиля — как в новом Telegram для macOS: цветная шапка, 4 кнопки, карточка данных, вкладки медиа.
const TABS = [
  ['media', 'Медиа', 'searchMessagesFilterPhotoAndVideo'],
  ['files', 'Файлы', 'searchMessagesFilterDocument'],
  ['links', 'Ссылки', 'searchMessagesFilterUrl'],
  ['voice', 'Голосовые', 'searchMessagesFilterVoiceNote'],
  ['music', 'Музыка', 'searchMessagesFilterAudio'],
];

function heroColors(chat, user) {
  const id = user?.profile_accent_color_id ?? chat.profile_accent_color_id;
  const pc = typeof id === 'number' && id >= 0 ? S.profileColors?.[id] : null;
  const dark = document.documentElement.dataset.palette === 'night';
  const set = pc ? (dark ? pc.dark_theme_colors : pc.light_theme_colors) : null;
  const toHex = n => `#${(n >>> 0 & 0xffffff).toString(16).padStart(6, '0')}`;
  if (set?.background_colors?.length) return set.background_colors.map(toHex);
  const g = avatarGradient(peerIndex(chat.id, chat.accent_color_id)).match(/#[0-9a-f]{6}/gi);
  return g || ['#5ea3df', '#3a7bc8'];
}

export function ProfileScreen({ chat }) {
  const [info, setInfo] = useState(null);
  const [tab, setTab] = useState('media');
  const user = chatUser(chat);
  const t = chat.type['@type'];

  useEffect(() => {
    let req = null;
    if (user) req = { '@type': 'getUserFullInfo', user_id: user.id };
    else if (t === 'chatTypeSupergroup') req = { '@type': 'getSupergroupFullInfo', supergroup_id: chat.type.supergroup_id };
    else if (t === 'chatTypeBasicGroup') req = { '@type': 'getBasicGroupFullInfo', basic_group_id: chat.type.basic_group_id };
    if (req) send(req).then(setInfo).catch(() => setInfo({})); else setInfo({});
    const esc = e => { if (e.key === 'Escape' && !S.viewer && !S.menu) close(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [chat.id]);
  const close = () => { S.profile = false; changed(); };

  const muted = isMuted(chat);
  const toggleMute = () => send({ '@type': 'setChatNotificationSettings', chat_id: chat.id, notification_settings: { ...(chat.notification_settings || {}), '@type': 'chatNotificationSettings', use_default_mute_for: false, mute_for: muted ? 0 : 2147483647 } })
    .then(() => showHud(muted ? 'Уведомления включены' : 'Уведомления выключены')).catch(e => showHud(e.message));
  const more = e => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(r.left, r.bottom + 6, [
      { label: muted ? 'Включить уведомления' : 'Выключить уведомления', icon: Icon.muted(15), action: toggleMute },
      ...(username ? [{ label: 'Скопировать ссылку', icon: Icon.menu('menu_copy_link'), action: () => copy(`https://t.me/${username}`, 'Ссылка') }] : []),
      ...(user && !isSaved(chat) && chat.type['@type'] === 'chatTypePrivate' && user.type?.['@type'] !== 'userTypeBot' ? [{ label: 'Начать секретный чат', icon: Icon.menu('menu_secret_chat'), action: () => startSecretChat(user.id) }] : []),
      ...(S.stories.has(chat.id) ? [{ label: 'Смотреть истории', icon: Icon.menu('menu_play'), action: () => openStories(chat.id) }] : []),
    ]);
  };

  const sg = t === 'chatTypeSupergroup' ? S.supergroups.get(chat.type.supergroup_id) : null;
  const bg = t === 'chatTypeBasicGroup' ? S.basicGroups.get(chat.type.basic_group_id) : null;
  const username = user?.usernames?.active_usernames?.[0] || sg?.usernames?.active_usernames?.[0];
  const about = user ? info?.bio : info?.description;
  const aboutText = typeof about === 'string' ? about : about?.text;
  const bday = info?.birthdate;
  const statusLine = isSaved(chat) ? '' : user ? userStatus(user)
    : sg ? count(sg.member_count || info?.member_count || 0, isChannel(chat) ? 'подписчик' : 'участник', isChannel(chat) ? 'подписчика' : 'участника', isChannel(chat) ? 'подписчиков' : 'участников')
      : bg ? count(bg.member_count, 'участник', 'участника', 'участников') : '';
  const copy = (text, what) => navigator.clipboard.writeText(text).then(() => showHud(`${what} скопирован${what === 'Ссылка' ? 'а' : ''}`));
  const colors = heroColors(chat, user);
  const soon = what => () => showHud(`${what} — в следующих обновлениях`);
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  return html`<div class="pscreen">
    <div class="ps-scroll">
      <div class="ps-hero" style=${`background:radial-gradient(circle at 50% 35%, ${colors[0]}, ${colors[colors.length - 1]})`}>
        <div class="ps-top" ...${dragHandlers()}>
          <button class="glass circle" title="Назад" onClick=${close}>${Icon.back(18)}</button>
        </div>
        <div class="ps-avatar"><${Avatar} chat=${chat} size=${96}/></div>
        <div class="ps-name">${chatTitle(chat)}</div>
        <div class="ps-status">${statusLine}</div>
        <div class="ps-actions">
          <button onClick=${close}>${Icon.chats(22)}<span>Чат</span></button>
          ${user && !isSaved(chat) ? html`
            <button onClick=${soon('Звонки')}>${Icon.calls(21)}<span>Звонок</span></button>
            <button onClick=${soon('Видеозвонки')}>${Icon.video(22)}<span>Видео</span></button>`
            : html`<button onClick=${toggleMute}>${Icon.muted(22)}<span>${muted ? 'Вкл. звук' : 'Без звука'}</span></button>`}
          <button onClick=${more}>${Icon.more(22)}<span>Ещё</span></button>
        </div>
      </div>
      <div class="ps-body">
        <div class="ps-card">
          ${!info && html`<div class="ps-row" style="justify-content:center;color:var(--gray-text)"><${Spinner}/></div>`}
          ${username && html`<button class="ps-row" onClick=${() => copy(`@${username}`, 'Username')}><div><small>Имя пользователя</small><div>@${username}</div></div>${Icon.copy(17)}</button>`}
          ${user?.phone_number && html`<button class="ps-row" onClick=${() => copy(`+${user.phone_number}`, 'Номер')}><div><small>номер телефона</small><div>+${user.phone_number}</div></div>${Icon.copy(17)}</button>`}
          ${bday && html`<div class="ps-row"><div><small>день рождения</small><div>${bday.day} ${MONTHS[bday.month - 1]}${bday.year ? ` ${bday.year}` : ''}</div></div></div>`}
          ${aboutText && html`<div class="ps-row selectable"><div><small>${user ? 'о себе' : 'описание'}</small><div style="white-space:pre-wrap">${typeof about === 'string' ? about : renderFormatted(about, url => shell.openUrl(url))}</div></div></div>`}
          ${info && !username && !user?.phone_number && !aboutText && !bday && html`<div class="ps-row" style="color:var(--gray-text)">Нет дополнительной информации</div>`}
        </div>
        <div class="ps-card">
          <button class="ps-row" onClick=${toggleMute}><div><small>уведомления</small><div>${muted ? 'Выключены' : 'Включены'}</div></div><span class=${`switch ${muted ? '' : 'on'}`}><i/></span></button>
        </div>
        <div class="ps-tabs">${TABS.map(([id, label]) => html`<button class=${tab === id ? 'on' : ''} onClick=${() => setTab(id)}>${label}</button>`)}</div>
        <${SharedList} key=${`${chat.id}-${tab}`} chat=${chat} kind=${tab} filter=${TABS.find(x => x[0] === tab)[2]}/>
      </div>
    </div>
  </div>`;
}

function SharedList({ chat, kind, filter }) {
  const [list, setList] = useState(null);
  useEffect(() => {
    send({ '@type': 'searchChatMessages', chat_id: chat.id, query: '', from_message_id: 0, offset: 0, limit: 60, filter: { '@type': filter } })
      .then(r => setList(r.messages || [])).catch(() => setList([]));
  }, []);
  if (list === null) return html`<div style="display:grid;place-items:center;padding:24px;color:var(--gray-text)"><${Spinner}/></div>`;
  if (!list.length) return html`<div style="display:flex;justify-content:center;padding:20px"><span class="service-pill">Пока ничего нет</span></div>`;
  if (kind === 'media') return html`<div class="media-grid">${list.map(m => html`<${MediaThumb} key=${m.id} msg=${m}/>`)}</div>`;
  return html`<div class="ps-card">${list.map(m => {
    const c = m.content;
    const name = c.document?.file_name || c.audio?.title || c.audio?.file_name || (c.voice_note ? 'Голосовое сообщение' : '') || (c.text?.text || c.caption?.text || '').slice(0, 120);
    const sub = new Date(m.date * 1000).toLocaleDateString('ru-RU');
    return html`<div class="ps-row" key=${m.id}><div style="min-width:0"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div><small>${sub}</small></div></div>`;
  })}</div>`;
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
    ${src && !st.playing && html`<button class="vp-big" onClick=${toggle}>${Icon.play(26)}</button>`}
    ${src && html`<div class="vp-bar">
      <button onClick=${toggle}>${Icon.menu(st.playing ? 'Icon_VideoPlayer_Pause' : 'Icon_VideoPlayer_Play')}</button>
      <span class="vp-time">${duration(Math.floor(st.t))}</span>
      <div class="vp-track" onClick=${seek}><i style=${`width:${st.d ? st.t / st.d * 100 : 0}%`}/></div>
      <span class="vp-time">${duration(Math.floor(st.d))}</span>
      <button onClick=${() => { const el = v(); if (el) { el.muted = !el.muted; setSt(s => ({ ...s, muted: el.muted })); } }}>${Icon.menu(st.muted ? 'Icon_VideoPlayer_VolumeOff' : 'Icon_VideoPlayer_Volume')}</button>
      <input type="range" min="0" max="1" step="0.01" value=${st.muted ? 0 : st.vol} onInput=${e => { const el = v(); const x = Number(e.target.value); if (el) { el.volume = x; el.muted = x === 0; } setSt(s => ({ ...s, vol: x, muted: x === 0 })); }}/>
      <button onClick=${full} title="Во весь экран">${Icon.menu(document.fullscreenElement ? 'Icon_VideoPlayer_ExitFullScreen' : 'Icon_VideoPlayer_EnterFullScreen')}</button>
    </div>`}
  </div>`;
}
