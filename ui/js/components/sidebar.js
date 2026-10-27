import { html, useRef, useLayoutEffect, useState, useEffect } from '../lib.js';
import {
  S, changed, sortedChats, selectChat, chatTitle, chatUser, isSaved, isGroup, isChannel, senderName, typingText,
  search, loadContacts, isMuted, openPrivate, openMenu, openModal, closeModal, setPref, logOut, showHud, position,
} from '../store.js';
import { send } from '../td.js';
import { Icon } from '../icons.js';
import { listTime, contentSummary, userStatus, userName } from '../format.js';
import { Avatar, Traffic, TypingDots, Spinner, dragHandlers } from './common.js';

const CONN = {
  connectionStateWaitingForNetwork: 'Ожидание сети…',
  connectionStateConnectingToProxy: 'Подключение к прокси…',
  connectionStateConnecting: 'Соединение…',
  connectionStateUpdating: 'Обновление…',
};


export function Sidebar() {
  const conn = CONN[S.connection];
  return html`<aside class="sidebar">
    <div class="sidebar-top" ...${dragHandlers()}>
      <${Traffic}/>
      ${conn && html`<div class="conn-state"><${Spinner}/>${conn}</div>`}
    </div>
    ${S.tab === 'chats' && html`<${ChatsPane}/>`}
    ${S.tab === 'contacts' && html`<${ContactsPane}/>`}
    ${S.tab === 'calls' && html`<${CallsPane}/>`}
    ${S.tab === 'settings' && html`<${SettingsPane}/>`}
    <${TabBar}/>
  </aside>`;
}

// ── вкладки внизу ──
const TABS = [
  { id: 'contacts', icon: Icon.contacts, title: 'Контакты' },
  { id: 'calls', icon: Icon.calls, title: 'Звонки' },
  { id: 'chats', icon: Icon.chats, title: 'Чаты' },
  { id: 'settings', icon: Icon.settings, title: 'Настройки' },
];
function TabBar() {
  const [lifted, setLifted] = useState(false);
  const idx = TABS.findIndex(t => t.id === S.tab);
  const unread = [...S.chats.values()].reduce((n, c) => n + (position(c, 'main') && !isMuted(c) && c.unread_count > 0 ? 1 : 0), 0);
  const pick = id => {
    if (id === S.tab && id === 'chats') document.querySelector('.list')?.scrollTo({ top: 0, behavior: 'smooth' });
    S.tab = id;
    if (id === 'contacts' && !S.contacts) loadContacts();
    changed();
  };
  useEffect(() => { const up = () => setLifted(false); window.addEventListener('mouseup', up); return () => window.removeEventListener('mouseup', up); }, []);
  const sel = `width:calc((100% - 8px) / ${TABS.length});transform:translateX(${idx * 100}%) ${lifted ? 'scale(1.12, 1.3)' : ''}`;
  return html`<nav class=${`tabbar ${lifted ? 'lifted' : ''}`} onMouseDown=${() => setLifted(true)}>
    <div class="tab-sel" style=${sel}/>
    ${TABS.map(t => html`<button class=${`tab ${S.tab === t.id ? 'on' : ''}`} title=${t.title} onClick=${() => pick(t.id)}>
      ${t.icon()}
      ${t.id === 'chats' && unread > 0 && html`<span class="badge">${unread > 99 ? '99+' : unread}</span>`}
    </button>`)}
  </nav>`;
}

// ── чаты ──
function ChatsPane() {
  const timer = useRef();
  const [q, setQ] = useState(S.searchQuery);
  const onInput = e => {
    setQ(e.target.value);
    clearTimeout(timer.current);
    const v = e.target.value;
    timer.current = setTimeout(() => search(v), 220);
  };
  const clear = () => { setQ(''); search(''); };
  return html`
    <div class="search-row">
      <label class="search">
        ${Icon.search()}
        <input placeholder="Поиск" value=${q} onInput=${onInput} onKeyDown=${e => e.key === 'Escape' && clear()}/>
        ${q && html`<button class="no-drag" style="color:var(--gray-icon)" onClick=${clear}>${Icon.close(13)}</button>`}
      </label>
      <button class="icon-btn" title="Новое сообщение" onClick=${() => { S.tab = 'contacts'; if (!S.contacts) loadContacts(); changed(); }}>${Icon.compose()}</button>
    </div>
    ${S.searchResults ? html`<${SearchResults}/>` : html`<${Folders}/><${ChatList} key=${S.folder}/>`}`;
}

function Folders() {
  const ref = useRef();
  const [ind, setInd] = useState(null);
  const items = [{ key: 'main', title: 'Все чаты' }, ...S.folders.map(f => ({ key: `f${f.id}`, title: f.title }))];
  useLayoutEffect(() => {
    const el = ref.current?.querySelector('.folder.on');
    if (el) setInd({ x: el.offsetLeft + 6, w: el.offsetWidth - 12 });
  }, [S.folder, S.folders.length]);
  if (!S.folders.length) return null;
  const unreadIn = key => sortedChats(key).filter(({ chat }) => chat.unread_count > 0 && !isMuted(chat)).length;
  return html`<div class="folders" ref=${ref}>
    ${items.map(f => {
      const n = f.key === 'main' ? 0 : unreadIn(f.key);
      return html`<button class=${`folder ${S.folder === f.key ? 'on' : ''}`} onClick=${() => { S.folder = f.key; changed(); }}>
        ${f.title}${n > 0 && html`<span class="badge">${n}</span>`}
      </button>`;
    })}
    ${ind && html`<i class="folder-ind" style=${`width:${ind.w}px;transform:translateX(${ind.x}px)`}/>`}
  </div>`;
}

function ChatList() {
  const list = sortedChats(S.folder);
  const ready = S.auth?.['@type'] === 'authorizationStateReady';
  if (!list.length) return html`<div class="list">${ready ? html`<div class="empty">${S.folder === 'main' ? 'Загрузка чатов…' : 'В этой папке пока нет чатов'}</div>` : null}</div>`;
  return html`<div class="list list-anim">
    ${list.map(({ chat, pinned }) => html`<${ChatRow} key=${chat.id} chat=${chat} pinned=${pinned}/>`)}
  </div>`;
}

function SearchResults() {
  const ids = S.searchResults || [];
  return html`<div class="list list-anim">
    ${!ids.length && html`<div class="empty">Ничего не найдено</div>`}
    ${ids.map(id => S.chats.get(id)).filter(Boolean).map(c => html`<${ChatRow} key=${c.id} chat=${c} compact/>`)}
  </div>`;
}

function preview(chat) {
  const typing = typingText(chat.id);
  if (typing) return html`<span class="typing"><${TypingDots}/>${typing}</span>`;
  const draft = chat.draft_message?.input_message_text?.text?.text;
  if (draft && chat.id !== S.currentChatId) return html`<span class="draft">Черновик: </span>${draft}`;
  const m = chat.last_message;
  if (!m) return '';
  const text = contentSummary(m.content, id => userName(S.users.get(id)));
  let who = null;
  if (m.is_outgoing && !isSaved(chat) && !isChannel(chat)) who = 'Вы';
  else if (isGroup(chat)) who = senderName(m.sender_id).split(' ')[0];
  return html`${who && html`<span class="who">${who}: </span>`}${text}`;
}

function ChatRow({ chat, pinned, compact }) {
  const on = S.currentChatId === chat.id;
  const user = chatUser(chat);
  const online = user && user.id !== S.myId && user.status?.['@type'] === 'userStatusOnline' && user.type?.['@type'] !== 'userTypeBot';
  const m = chat.last_message;
  const out = m?.is_outgoing && !isSaved(chat);
  const read = out && m.id <= (chat.last_read_outbox_message_id || 0);
  const muted = isMuted(chat);
  const verified = chat.type?.['@type'] === 'chatTypeSupergroup' ? S.supergroups.get(chat.type.supergroup_id)?.verification_status?.is_verified || S.supergroups.get(chat.type.supergroup_id)?.is_verified : user?.verification_status?.is_verified || user?.is_verified;
  const unread = chat.unread_count || (chat.is_marked_as_unread ? 1 : 0);

  const onContext = e => {
    e.preventDefault();
    openMenu(e.clientX, e.clientY, [
      { label: pinned ? 'Открепить' : 'Закрепить', icon: Icon.pin(), action: () => send({ '@type': 'toggleChatIsPinned', chat_list: { '@type': 'chatListMain' }, chat_id: chat.id, is_pinned: !pinned }).catch(err => showHud(err.message)) },
      { label: muted ? 'Включить уведомления' : 'Выключить уведомления', icon: Icon.muted(15), action: () => send({ '@type': 'setChatNotificationSettings', chat_id: chat.id, notification_settings: { ...(chat.notification_settings || {}), '@type': 'chatNotificationSettings', use_default_mute_for: false, mute_for: muted ? 0 : 2147483647 } }).catch(err => showHud(err.message)) },
      unread
        ? { label: 'Отметить как прочитанное', icon: Icon.check(15), action: () => m && send({ '@type': 'viewMessages', chat_id: chat.id, message_ids: [m.id], force_read: true }).then(() => chat.is_marked_as_unread && send({ '@type': 'toggleChatIsMarkedAsUnread', chat_id: chat.id, is_marked_as_unread: false })).catch(() => {}) }
        : { label: 'Отметить как непрочитанное', icon: Icon.chats(15), action: () => send({ '@type': 'toggleChatIsMarkedAsUnread', chat_id: chat.id, is_marked_as_unread: true }).catch(() => {}) },
    ]);
  };

  return html`<div class=${`row ${on ? 'on' : ''}`} onMouseDown=${e => e.button === 0 && selectChat(chat.id)} onContextMenu=${onContext}>
    <${Avatar} chat=${chat} size=${50} online=${online}/>
    <div class="body">
      <div class="line">
        <div class="name"><span>${chatTitle(chat)}</span>${verified && Icon.verified(14)}${muted && html`<span class="muted-ic">${Icon.muted()}</span>`}</div>
        ${!compact && html`<div class="time">
          ${out && html`<span class="check">${m.sending_state ? Icon.clock() : read ? Icon.checks(13) : Icon.check(13)}</span>`}
          ${listTime(m?.date)}
        </div>`}
      </div>
      <div class="line">
        <div class="preview">${compact ? (user ? userStatus(user) : '') : preview(chat)}</div>
        ${!compact && html`<div class="meta">
          ${chat.unread_mention_count > 0 && html`<span class="badge mention">@</span>`}
          ${unread > 0 ? html`<span class=${`badge ${muted ? 'muted' : ''}`}>${chat.unread_count > 0 ? (unread > 999 ? `${Math.floor(unread / 1000)}K` : unread) : ''}</span>`
            : pinned && html`<span class="pin">${Icon.pin()}</span>`}
        </div>`}
      </div>
    </div>
    <i class="row-sep"/>
  </div>`;
}

// ── контакты ──
function ContactsPane() {
  const [q, setQ] = useState('');
  const users = (S.contacts || []).map(id => S.users.get(id)).filter(Boolean)
    .filter(u => !q || userName(u).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => {
      const ao = a.status?.['@type'] === 'userStatusOnline', bo = b.status?.['@type'] === 'userStatusOnline';
      return ao !== bo ? (ao ? -1 : 1) : userName(a).localeCompare(userName(b), 'ru');
    });
  return html`
    <div class="search-row">
      <label class="search">${Icon.search()}<input placeholder="Поиск контактов" value=${q} onInput=${e => setQ(e.target.value)}/></label>
    </div>
    <div class="list list-anim">
      ${S.contacts === null && html`<div class="empty"><${Spinner}/></div>`}
      ${S.contacts && !users.length && html`<div class="empty">Контактов нет</div>`}
      ${users.map(u => {
        const online = u.status?.['@type'] === 'userStatusOnline';
        return html`<div class="row" key=${u.id} onClick=${() => openPrivate(u.id)}>
          <${Avatar} user=${u} size=${50} online=${online}/>
          <div class="body"><div class="line"><div class="name"><span>${userName(u)}</span></div></div>
            <div class="line"><div class="preview" style=${online ? 'color:var(--accent)' : ''}>${userStatus(u)}</div></div></div>
          <i class="row-sep"/>
        </div>`;
      })}
    </div>`;
}

function CallsPane() {
  return html`<div class="pane-title">Звонки</div>
    <div class="list"><div class="empty">${Icon.calls(40)}<br/>Звонки появятся в одном из следующих этапов.</div></div>`;
}

// ── настройки ──
function SettingsPane() {
  const me = S.users.get(S.myId);
  const confirmLogout = () => openModal({
    icon: html`<div style="display:flex;justify-content:center;color:var(--red)">${Icon.logout(40)}</div>`,
    title: 'Выйти из аккаунта?',
    text: 'Локальная зашифрованная база будет удалена с этого компьютера.',
    buttons: [
      { label: 'Выйти', kind: 'danger', action: () => { closeModal(); logOut().catch(e => showHud(e.message)); } },
      { label: 'Отмена', kind: 'second', action: closeModal },
    ],
  });
  const seg = (key, opts) => html`<div class="seg">${opts.map(([v, l]) => html`
    <button class=${S.prefs[key] === v ? 'on' : ''} onClick=${() => setPref(key, v)}>${l}</button>`)}</div>`;
  return html`<div class="list list-anim">
    <div class="profile">
      ${me && html`<${Avatar} user=${me} size=${84}/>`}
      <div class="pname">${userName(me)}</div>
      <div class="psub">${me?.phone_number ? `+${me.phone_number}` : ''}${me?.usernames?.active_usernames?.[0] ? ` · @${me.usernames.active_usernames[0]}` : ''}</div>
    </div>
    <div class="group">
      <div class="item"><span class="ic" style="background:#5856d6">${Icon.moon(14)}</span><span class="lbl">Тема</span>
        ${seg('theme', [['auto', 'Авто'], ['light', 'Светлая'], ['dark', 'Тёмная']])}</div>
      <div class="item"><span class="ic" style="background:#ff9500">${Icon.textSize(14)}</span><span class="lbl">Текст</span>
        ${seg('fontSize', [[13, '13'], [14, '14'], [15, '15'], [16, '16']])}</div>
    </div>
    <div class="group">
      <div class="item"><span class="ic" style="background:#34c759">${Icon.lock(14)}</span><span class="lbl">Локальная база</span><span class="val">зашифрована</span></div>
      <div class="item"><span class="ic" style="background:#007aff">${Icon.key(14)}</span><span class="lbl">Ключи</span><span class="val">в Windows</span></div>
    </div>
    <div class="group">
      <button class="item danger" style="width:100%" onClick=${confirmLogout}><span class="ic" style="background:var(--red)">${Icon.logout(14)}</span><span class="lbl" style="text-align:left">Выйти</span></button>
    </div>
  </div>`;
}
