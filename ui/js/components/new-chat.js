// Создание группы, канала и секретного чата.
import { html, useState, useEffect, useRef } from '../lib.js';
import { S, changed, selectChat, showHud, loadContacts, openMenu } from '../store.js';
import { send } from '../td.js';
import { Icon } from '../icons.js';
import { MI } from '../mac-icons.js';
import { userName, count } from '../format.js';
import { Avatar, Spinner } from './common.js';

export function composeMenu(e) {
  const r = e.currentTarget.getBoundingClientRect();
  openMenu(r.left - 150, r.bottom + 6, [
    { label: 'Новое сообщение', icon: MI('menu_message', 18), action: () => { S.tab = 'contacts'; if (!S.contacts) loadContacts(); changed(); } },
    { label: 'Новая группа', icon: MI('menu_create_group', 18), action: () => openNew('group') },
    { label: 'Новый канал', icon: MI('menu_channel', 18), action: () => openNew('channel') },
  ]);
}
export function openNew(kind) { if (!S.contacts) loadContacts(); S.newChat = { kind, step: kind === 'group' ? 'members' : 'info', members: new Set(), out: false }; changed(); }
function close() { if (!S.newChat) return; S.newChat.out = true; changed(); setTimeout(() => { S.newChat = null; changed(); }, 180); }

export async function startSecretChat(userId) {
  try {
    const chat = await send({ '@type': 'createNewSecretChat', user_id: userId });
    S.chats.set(chat.id, { ...(S.chats.get(chat.id) || {}), ...chat }); S.chatsVer++;
    S.tab = 'chats'; selectChat(chat.id);
    showHud('Секретный чат создан');
  } catch (e) { showHud(e.message); }
}

export function NewChatDialog() {
  const d = S.newChat;
  const [q, setQ] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef();
  useEffect(() => { if (d && !d.out) { setQ(''); setTitle(''); setDesc(''); } }, [!!d]);
  useEffect(() => { setTimeout(() => ref.current?.focus(), 60); }, [d?.step]);
  if (!d) return null;
  const users = (S.contacts || []).map(id => S.users.get(id)).filter(Boolean)
    .filter(u => !q || userName(u).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => userName(a).localeCompare(userName(b), 'ru'));
  const toggle = id => { if (d.members.has(id)) d.members.delete(id); else d.members.add(id); changed(); };
  const create = async () => {
    setBusy(true);
    try {
      let r;
      if (d.kind === 'group') r = await send({ '@type': 'createNewBasicGroupChat', user_ids: [...d.members], title: title.trim(), message_auto_delete_time: 0 });
      else r = await send({ '@type': 'createNewSupergroupChat', title: title.trim(), is_forum: false, is_channel: true, description: desc.trim(), location: null, message_auto_delete_time: 0, for_import: false });
      const chatId = r.chat_id ?? r.id;
      close(); S.tab = 'chats'; changed();
      setTimeout(() => selectChat(chatId), 200);
      showHud(d.kind === 'group' ? 'Группа создана' : 'Канал создан');
    } catch (e) { showHud(e.message); }
    setBusy(false);
  };
  const isGroup = d.kind === 'group';
  return html`<div class=${`veil ${d.out ? 'out' : ''}`} onMouseDown=${e => e.target === e.currentTarget && close()} onKeyDown=${e => e.key === 'Escape' && close()}>
    <div class="sheet picker-sheet">
      ${d.step === 'members' ? html`
        <div class="sd-title">Новая группа · ${d.members.size ? count(d.members.size, 'участник', 'участника', 'участников') : 'выберите участников'}</div>
        <label class="search active" style="margin-bottom:8px">${Icon.search()}<input ref=${ref} placeholder="Поиск контактов" value=${q} onInput=${e => setQ(e.target.value)}/></label>
        <div class="picker-list">
          ${S.contacts === null && html`<div class="empty"><${Spinner}/></div>`}
          ${users.map(u => html`<button class=${`picker-row check ${d.members.has(u.id) ? 'on' : ''}`} key=${u.id} onClick=${() => toggle(u.id)}>
            <${Avatar} user=${u} size=${36}/><span style="flex:1">${userName(u)}</span><span class=${`sel-check static ${d.members.has(u.id) ? 'on' : ''}`}>${d.members.has(u.id) && Icon.check(12)}</span></button>`)}
        </div>
        <div class="sd-btns"><span style="flex:1"/><button class="btn second" onClick=${close}>Отмена</button>
          <button class="btn" disabled=${!d.members.size} onClick=${() => { d.step = 'info'; changed(); }}>Далее</button></div>`
      : html`
        <div class="sd-title">${isGroup ? 'Название группы' : 'Новый канал'}</div>
        <div class="sp-field"><label>Название</label><div class="sp-input"><input ref=${ref} value=${title} maxlength="128" onInput=${e => setTitle(e.target.value)} onKeyDown=${e => e.key === 'Enter' && title.trim() && create()}/></div></div>
        ${!isGroup && html`<div class="sp-field"><label>Описание (необязательно)</label><div class="sp-input"><input value=${desc} maxlength="255" onInput=${e => setDesc(e.target.value)}/></div>
          <div class="sp-hint">Канал можно сделать публичным позже в настройках канала в Telegram.</div></div>`}
        <div class="sd-btns">
          ${isGroup && html`<button class="btn second" onClick=${() => { d.step = 'members'; changed(); }}>Назад</button>`}
          <span style="flex:1"/><button class="btn second" onClick=${close}>Отмена</button>
          <button class="btn" disabled=${busy || !title.trim()} onClick=${create}>${busy ? html`<${Spinner}/>` : 'Создать'}</button></div>`}
    </div>
  </div>`;
}
