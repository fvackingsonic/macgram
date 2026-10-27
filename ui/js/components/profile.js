import { html, useEffect, useState } from '../lib.js';
import { S, changed, chatTitle, chatUser, isSaved, isChannel, showHud, download, fileUrl } from '../store.js';
import { send, shell } from '../td.js';
import { Icon } from '../icons.js';
import { userStatus, count, renderFormatted } from '../format.js';
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

  const muted = (chat.notification_settings?.mute_for || 0) > 0;
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
  return html`<div class=${`viewer ${closing ? 'out' : ''}`} onClick=${close}>
    ${url ? html`<img src=${url} alt="" onClick=${e => e.stopPropagation()}/>`
      : mini ? html`<img src=${`data:image/jpeg;base64,${mini}`} style=${`filter:blur(10px);width:${Math.min(best?.width || 600, innerWidth * .8)}px`} alt=""/>` : html`<${Spinner}/>`}
    <button class="viewer-close" onClick=${close}>${Icon.close(18)}</button>
  </div>`;
}
