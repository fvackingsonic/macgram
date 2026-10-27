// Управление группой и каналом из профиля — как в Telegram для macOS: участники, администраторы,
// разрешения, изменение названия и описания, пригласительная ссылка, добавление участников.
import { html, useState, useEffect, useRef } from '../lib.js';
import { S, changed, showHud, openMenu, openModal, closeModal, chatTitle, isChannel, openPrivate, selectChat, loadContacts } from '../store.js';
import { send } from '../td.js';
import { Icon } from '../icons.js';
import { MI } from '../mac-icons.js';
import { userName, userStatus, count } from '../format.js';
import { Avatar, Spinner } from './common.js';

// Мои права в чате.
export function myRights(chat) {
  const t = chat.type?.['@type'];
  const g = t === 'chatTypeSupergroup' ? S.supergroups.get(chat.type.supergroup_id) : t === 'chatTypeBasicGroup' ? S.basicGroups.get(chat.type.basic_group_id) : null;
  const st = g?.status;
  const owner = st?.['@type'] === 'chatMemberStatusCreator';
  const admin = st?.['@type'] === 'chatMemberStatusAdministrator';
  const r = admin ? st.rights || {} : {};
  const perm = chat.permissions || {};
  return {
    owner, admin: owner || admin,
    info: owner || r.can_change_info || (!isChannel(chat) && t === 'chatTypeBasicGroup' && perm.can_change_info),
    restrict: owner || r.can_restrict_members,
    invite: owner || r.can_invite_users || (!isChannel(chat) && perm.can_invite_users),
    promote: owner || r.can_promote_members,
    member: !!st && !['chatMemberStatusLeft', 'chatMemberStatusBanned'].includes(st['@type']),
  };
}

const roleOf = st => st?.['@type'] === 'chatMemberStatusCreator' ? (st.custom_title || 'владелец')
  : st?.['@type'] === 'chatMemberStatusAdministrator' ? (st.custom_title || 'админ') : '';

export function leaveChat(chat, after) {
  const ch = isChannel(chat);
  openModal({
    icon: html`<div style="display:flex;justify-content:center;color:var(--red)">${MI('menu_leave', 36)}</div>`,
    title: ch ? 'Покинуть канал?' : 'Покинуть группу?',
    text: `Вы выйдете из «${chatTitle(chat)}».`,
    buttons: [
      { label: 'Покинуть', kind: 'danger', action: () => { closeModal(); send({ '@type': 'leaveChat', chat_id: chat.id }).then(() => { showHud('Вы покинули чат'); after?.(); selectChat(null); }).catch(e => showHud(e.message)); } },
      { label: 'Отмена', kind: 'second', action: closeModal },
    ],
  });
}

export function copyInvite(chat, info, refresh) {
  const link = info?.invite_link?.invite_link;
  if (link) { navigator.clipboard.writeText(link).then(() => showHud('Ссылка скопирована')); return; }
  send({ '@type': 'replacePrimaryChatInviteLink', chat_id: chat.id })
    .then(l => { navigator.clipboard.writeText(l.invite_link); showHud('Ссылка создана и скопирована'); refresh?.(); }).catch(e => showHud(e.message));
}
export function resetInvite(chat, refresh) {
  openModal({
    title: 'Сбросить ссылку?', text: 'Старая ссылка перестанет работать, будет создана новая.',
    buttons: [
      { label: 'Сбросить', kind: 'danger', action: () => { closeModal(); send({ '@type': 'replacePrimaryChatInviteLink', chat_id: chat.id }).then(l => { navigator.clipboard.writeText(l.invite_link); showHud('Новая ссылка скопирована'); refresh?.(); }).catch(e => showHud(e.message)); } },
      { label: 'Отмена', kind: 'second', action: closeModal },
    ],
  });
}

// ── подэкран профиля ──
const TITLES = { members: 'Участники', subscribers: 'Подписчики', admins: 'Администраторы', perms: 'Разрешения', edit: 'Изменить', add: 'Добавить участников' };
export function GroupSub({ kind, chat, info, onBack, onChanged }) {
  const ch = isChannel(chat);
  const title = kind === 'members' && ch ? 'Подписчики' : kind === 'edit' ? (ch ? 'Изменить канал' : 'Изменить группу') : TITLES[kind];
  return html`<div class="ps-sub">
    <div class="ps-sub-head">
      <button class="glass circle" title="Назад" onClick=${onBack}>${Icon.back(16)}</button>
      <div class="ps-sub-title">${title}</div>
    </div>
    <div class="ps-sub-body">
      ${kind === 'members' || kind === 'admins' ? html`<${Members} chat=${chat} info=${info} admins=${kind === 'admins'} onChanged=${onChanged}/>`
        : kind === 'perms' ? html`<${Permissions} chat=${chat}/>`
          : kind === 'edit' ? html`<${EditInfo} chat=${chat} info=${info} onDone=${() => { onChanged?.(); onBack(); }}/>`
            : kind === 'add' ? html`<${AddMembers} chat=${chat} onDone=${() => { onChanged?.(); onBack(); }}/>` : null}
    </div>
  </div>`;
}

function Members({ chat, info, admins, onChanged }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [total, setTotal] = useState(0);
  const [ver, setVer] = useState(0);
  const rights = myRights(chat);
  const sg = chat.type['@type'] === 'chatTypeSupergroup';
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      try {
        let members;
        if (sg) {
          const filter = admins ? { '@type': 'supergroupMembersFilterAdministrators' }
            : q.trim() ? { '@type': 'supergroupMembersFilterSearch', query: q.trim() } : { '@type': 'supergroupMembersFilterRecent' };
          const r = await send({ '@type': 'getSupergroupMembers', supergroup_id: chat.type.supergroup_id, filter, offset: 0, limit: 200 });
          members = r.members || []; if (alive) setTotal(r.total_count || members.length);
        } else {
          const full = ver || !info?.members ? await send({ '@type': 'getBasicGroupFullInfo', basic_group_id: chat.type.basic_group_id }) : info;
          members = (full.members || []).filter(m => !admins || roleOf(m.status));
          if (q.trim()) members = members.filter(m => userName(S.users.get(m.member_id?.user_id)).toLowerCase().includes(q.trim().toLowerCase()));
          if (alive) setTotal(members.length);
        }
        // создатель и админы — сверху, как в macOS
        const rank = m => m.status?.['@type'] === 'chatMemberStatusCreator' ? 0 : m.status?.['@type'] === 'chatMemberStatusAdministrator' ? 1 : 2;
        if (alive) setList(members.slice().sort((a, b) => rank(a) - rank(b)));
      } catch (e) { if (alive) { setList([]); showHud(e.message?.includes('ADMIN') || e.message?.includes('RIGHT') ? 'Список доступен только администраторам' : e.message); } }
    }, q ? 250 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q, ver, admins]);
  const refresh = () => { setVer(v => v + 1); onChanged?.(); };
  const menu = (e, m) => {
    e.preventDefault();
    const uid = m.member_id?.user_id;
    const isMe = uid === S.myId;
    const st = m.status?.['@type'];
    const items = [];
    if (uid && !isMe) items.push({ label: 'Написать', icon: Icon.menu('menu_message'), action: () => openPrivate(uid) });
    if (rights.promote && uid && !isMe && st === 'chatMemberStatusMember' && sg) items.push({ label: 'Назначить администратором', icon: MI('menu_add_member', 18), action: () => promote(m, true) });
    if (rights.promote && uid && !isMe && st === 'chatMemberStatusAdministrator' && m.status.can_be_edited) items.push({ label: 'Разжаловать', icon: Icon.menu('menu_leave'), action: () => promote(m, false) });
    if (rights.restrict && !isMe && st !== 'chatMemberStatusCreator' && (st !== 'chatMemberStatusAdministrator' || m.status.can_be_edited)) {
      items.push('-');
      items.push({ label: isChannel(chat) ? 'Удалить из канала' : 'Удалить из группы', icon: Icon.trash(), danger: true, action: () => remove(m) });
    }
    if (items.length) openMenu(e.clientX, e.clientY, items);
  };
  const promote = (m, on) => send({ '@type': 'setChatMemberStatus', chat_id: chat.id, member_id: m.member_id, status: on
    ? { '@type': 'chatMemberStatusAdministrator', custom_title: '', can_be_edited: true, rights: { '@type': 'chatAdministratorRights', can_manage_chat: true, can_change_info: true, can_post_messages: isChannel(chat), can_edit_messages: isChannel(chat), can_delete_messages: true, can_invite_users: true, can_restrict_members: true, can_pin_messages: true, can_manage_topics: true, can_promote_members: false, can_manage_video_chats: true, can_post_stories: false, can_edit_stories: false, can_delete_stories: false, is_anonymous: false } }
    : { '@type': 'chatMemberStatusMember', member_until_date: 0 } })
    .then(() => { showHud(on ? 'Назначен администратором' : 'Права администратора сняты'); refresh(); }).catch(e => showHud(e.message));
  const remove = m => {
    const u = S.users.get(m.member_id?.user_id);
    openModal({
      title: 'Удалить участника?', text: `${u ? userName(u) : 'Участник'} будет удалён из «${chatTitle(chat)}».`,
      buttons: [
        { label: 'Удалить', kind: 'danger', action: () => { closeModal(); send({ '@type': 'banChatMember', chat_id: chat.id, member_id: m.member_id, banned_until_date: 0, revoke_messages: false })
          .then(() => sg ? send({ '@type': 'setChatMemberStatus', chat_id: chat.id, member_id: m.member_id, status: { '@type': 'chatMemberStatusLeft' } }).catch(() => {}) : null)
          .then(() => { showHud('Участник удалён'); refresh(); }).catch(e => showHud(e.message)); } },
        { label: 'Отмена', kind: 'second', action: closeModal },
      ],
    });
  };
  return html`
    ${!admins && html`<label class="search active ps-sub-search">${Icon.search()}<input placeholder="Поиск участников" value=${q} onInput=${e => setQ(e.target.value)}/></label>`}
    ${!admins && rights.invite && !q && html`<div class="ps-card"><button class="ps-row ps-row-ic" onClick=${() => onChanged?.('add')}>
      <span class="ps-ic" style="color:var(--accent)">${MI('menu_add_member', 20)}</span><div style="flex:1;color:var(--accent)">${isChannel(chat) ? 'Добавить подписчиков' : 'Добавить участников'}</div></button></div>`}
    ${list === null ? html`<div style="display:grid;place-items:center;padding:24px"><${Spinner}/></div>`
      : !list.length ? html`<div style="display:flex;justify-content:center;padding:20px"><span class="service-pill">${q ? 'Никого не найдено' : 'Список пуст'}</span></div>`
        : html`${total > list.length && !q && html`<div class="pane-sec" style="margin:4px 6px">${count(total, 'участник', 'участника', 'участников')}, показаны последние ${list.length}</div>`}
          <div class="ps-card">${list.map(m => {
            const u = m.member_id?.user_id ? S.users.get(m.member_id.user_id) : null;
            const c = m.member_id?.chat_id ? S.chats.get(m.member_id.chat_id) : null;
            const role = roleOf(m.status);
            const online = u?.status?.['@type'] === 'userStatusOnline';
            return html`<button class="ps-row member-row" key=${JSON.stringify(m.member_id)} onClick=${() => u && u.id !== S.myId && openPrivate(u.id)} onContextMenu=${e => menu(e, m)}>
              <${Avatar} user=${u} chat=${c} size=${36}/>
              <div class="mr-body"><div class="mr-name">${u ? (u.id === S.myId ? 'Вы' : userName(u)) : c ? chatTitle(c) : '—'}</div>
                <div class=${`mr-sub ${online ? 'online' : ''}`}>${u ? (u.type?.['@type'] === 'userTypeBot' ? 'бот' : userStatus(u)) : ''}</div></div>
              ${role && html`<span class="mr-role">${role}</span>`}
            </button>`;
          })}</div>`}`;
}

const PERMS = [
  ['can_send_basic_messages', 'Отправка сообщений'],
  ['can_send_photos', 'Фото'],
  ['can_send_videos', 'Видео'],
  ['can_send_other_messages', 'Стикеры и GIF'],
  ['can_send_audios', 'Музыка'],
  ['can_send_documents', 'Файлы'],
  ['can_send_voice_notes', 'Голосовые сообщения'],
  ['can_send_video_notes', 'Видеосообщения'],
  ['can_add_link_previews', 'Предпросмотр ссылок'],
  ['can_send_polls', 'Опросы'],
  ['can_invite_users', 'Добавление участников'],
  ['can_pin_messages', 'Закрепление сообщений'],
  ['can_change_info', 'Изменение профиля группы'],
  ['can_create_topics', 'Создание тем'],
];
function Permissions({ chat }) {
  const c = S.chats.get(chat.id) || chat;
  const p = c.permissions || {};
  const forum = chat.type['@type'] === 'chatTypeSupergroup' && S.supergroups.get(chat.type.supergroup_id)?.is_forum;
  const toggle = (k, v) => {
    const next = { '@type': 'chatPermissions' };
    for (const [key] of PERMS) next[key] = !!p[key];
    next.can_react_to_messages = p.can_react_to_messages !== false;
    next.can_edit_tag = !!p.can_edit_tag;
    next[k] = v;
    // без права отправлять сообщения медиа тоже недоступны — как в официальных клиентах
    if (k === 'can_send_basic_messages' && !v) for (const key of ['can_send_photos', 'can_send_videos', 'can_send_other_messages', 'can_send_audios', 'can_send_documents', 'can_send_voice_notes', 'can_send_video_notes', 'can_add_link_previews', 'can_send_polls']) next[key] = false;
    if (k !== 'can_send_basic_messages' && v && k.startsWith('can_send') || k === 'can_add_link_previews' && v) next.can_send_basic_messages = true;
    const cur = S.chats.get(chat.id); if (cur) { S.chats.set(chat.id, { ...cur, permissions: next }); changed(); }
    send({ '@type': 'setChatPermissions', chat_id: chat.id, permissions: next }).catch(e => { showHud(e.message); if (cur) { S.chats.set(chat.id, cur); changed(); } });
  };
  return html`<div class="pane-sec" style="margin:4px 6px">Что могут участники группы</div>
    <div class="ps-card">${PERMS.filter(([k]) => k !== 'can_create_topics' || forum).map(([k, label]) => html`<button class="ps-row" key=${k} onClick=${() => toggle(k, !p[k])}>
      <div>${label}</div><span class=${`switch ${p[k] ? 'on' : ''}`}><i/></span></button>`)}</div>
    <div class="sp-hint" style="padding:6px 8px">Администраторы могут всё независимо от этих настроек.</div>`;
}

function EditInfo({ chat, info, onDone }) {
  const [title, setTitle] = useState(chat.title || '');
  const [desc, setDesc] = useState(info?.description || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!title.trim()) { showHud('Введите название'); return; }
    setBusy(true);
    try {
      if (title.trim() !== chat.title) await send({ '@type': 'setChatTitle', chat_id: chat.id, title: title.trim() });
      if (desc !== (info?.description || '')) await send({ '@type': 'setChatDescription', chat_id: chat.id, description: desc });
      showHud('Сохранено'); onDone();
    } catch (e) { showHud(e.message); }
    setBusy(false);
  };
  return html`<div class="ps-card ps-form">
      <label>Название</label><div class="sp-input"><input value=${title} maxlength="128" onInput=${e => setTitle(e.target.value)} onKeyDown=${e => e.key === 'Enter' && save()}/></div>
      <label>Описание</label><div class="sp-input"><textarea rows="4" maxlength="255" value=${desc} onInput=${e => setDesc(e.target.value)}/></div>
      <div class="sp-hint">${255 - desc.length} символов осталось</div>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn second" onClick=${onDone}>Отмена</button><button class="btn" disabled=${busy} onClick=${save}>${busy ? html`<${Spinner}/>` : 'Сохранить'}</button></div>`;
}

function AddMembers({ chat, onDone }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!S.contacts) loadContacts(); }, []);
  const users = (S.contacts || []).map(id => S.users.get(id)).filter(Boolean)
    .filter(u => !q || userName(u).toLowerCase().includes(q.toLowerCase())).sort((a, b) => userName(a).localeCompare(userName(b), 'ru'));
  const toggle = id => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setSel(n); };
  const add = async () => {
    setBusy(true);
    try {
      const ids = [...sel];
      let failed = [];
      if (chat.type['@type'] === 'chatTypeBasicGroup') {
        for (const id of ids) { const r = await send({ '@type': 'addChatMember', chat_id: chat.id, user_id: id, forward_limit: 100 }); failed.push(...(r.failed_to_add_members || [])); }
      } else {
        const r = await send({ '@type': 'addChatMembers', chat_id: chat.id, user_ids: ids }); failed = r.failed_to_add_members || [];
      }
      showHud(failed.length ? `Не удалось добавить: ${failed.length} (настройки приватности)` : count(ids.length, 'участник добавлен', 'участника добавлено', 'участников добавлено'));
      onDone();
    } catch (e) { showHud(e.message); }
    setBusy(false);
  };
  return html`<label class="search active ps-sub-search">${Icon.search()}<input placeholder="Поиск контактов" value=${q} onInput=${e => setQ(e.target.value)}/></label>
    <div class="ps-card">
      ${S.contacts === null && html`<div class="ps-row" style="justify-content:center"><${Spinner}/></div>`}
      ${users.map(u => html`<button class="ps-row member-row" key=${u.id} onClick=${() => toggle(u.id)}>
        <${Avatar} user=${u} size=${36}/><div class="mr-body"><div class="mr-name">${userName(u)}</div><div class="mr-sub">${userStatus(u)}</div></div>
        <span class=${`sel-check static ${sel.has(u.id) ? 'on' : ''}`}>${sel.has(u.id) && Icon.check(12)}</span></button>`)}
    </div>
    <div class="ps-sub-foot"><button class="btn" disabled=${!sel.size || busy} onClick=${add}>${busy ? html`<${Spinner}/>` : sel.size ? `Добавить (${sel.size})` : 'Выберите контакты'}</button></div>`;
}
