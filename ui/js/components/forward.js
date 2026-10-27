// Пересылка сообщений и режим выбора нескольких сообщений.
import { html, useState, useEffect, useRef } from '../lib.js';
import { S, changed, sortedChats, chatTitle, showHud, deleteMessages, openModal, closeModal, chatUser } from '../store.js';
import { send } from '../td.js';
import { Icon } from '../icons.js';
import { count } from '../format.js';
import { Avatar } from './common.js';

export function openForward(fromChatId, ids) {
  S.forward = { fromChatId, ids: [...ids].sort((a, b) => a - b), out: false };
  changed();
}
function closeForward() {
  if (!S.forward) return;
  S.forward.out = true; changed();
  setTimeout(() => { S.forward = null; changed(); }, 180);
}

async function forwardTo(chatId) {
  const f = S.forward;
  closeForward();
  try {
    await send({ '@type': 'forwardMessages', chat_id: chatId, from_chat_id: f.fromChatId, message_ids: f.ids, options: null, send_copy: false, remove_caption: false });
    showHud(f.ids.length > 1 ? `Переслано: ${f.ids.length}` : 'Сообщение переслано');
    if (S.selection) { S.selection = null; changed(); }
  } catch (e) { showHud(e.message || 'Не удалось переслать'); }
}

export function ForwardDialog() {
  const f = S.forward;
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);
  const ref = useRef();
  useEffect(() => { if (f && !f.out) { setQ(''); setFound(null); setTimeout(() => ref.current?.focus(), 50); } }, [!!f]);
  useEffect(() => {
    if (!q.trim()) { setFound(null); return; }
    const t = setTimeout(() => send({ '@type': 'searchChats', query: q, limit: 50 }).then(r => setFound(r.chat_ids)).catch(() => setFound([])), 150);
    return () => clearTimeout(t);
  }, [q]);
  if (!f) return null;
  const chats = found ? found.map(id => S.chats.get(id)).filter(Boolean) : sortedChats('main').map(x => x.chat);
  const saved = S.chats.get(S.myId);
  return html`<div class=${`veil ${f.out ? 'out' : ''}`} onMouseDown=${e => e.target === e.currentTarget && closeForward()} onKeyDown=${e => e.key === 'Escape' && closeForward()}>
    <div class="sheet picker-sheet">
      <div class="sd-title">Переслать ${f.ids.length > 1 ? count(f.ids.length, 'сообщение', 'сообщения', 'сообщений') : 'сообщение'}</div>
      <label class="search active" style="margin-bottom:8px">${Icon.search()}<input ref=${ref} placeholder="Поиск" value=${q} onInput=${e => setQ(e.target.value)}/></label>
      <div class="picker-list">
        ${!found && saved && html`<button class="picker-row" onClick=${() => forwardTo(saved.id)}><${Avatar} chat=${saved} size=${36}/><span>Избранное</span></button>`}
        ${chats.filter(c => c.id !== S.myId || found).map(c => html`<button class="picker-row" key=${c.id} onClick=${() => forwardTo(c.id)}>
          <${Avatar} chat=${c} size=${36}/><span>${chatTitle(c)}</span></button>`)}
        ${found && !chats.length && html`<div class="empty">Ничего не найдено</div>`}
      </div>
      <div class="sd-btns"><span style="flex:1"/><button class="btn second" onClick=${closeForward}>Отмена</button></div>
    </div>
  </div>`;
}

// ── режим выбора ──
export function startSelection(chatId, id) { S.selection = { chatId, ids: new Set([id]) }; changed(); }
export function toggleSelected(id) {
  const sel = S.selection; if (!sel) return;
  if (sel.ids.has(id)) sel.ids.delete(id); else sel.ids.add(id);
  if (!sel.ids.size) S.selection = null;
  changed();
}

export function SelectionBar({ chat }) {
  const sel = S.selection;
  if (!sel || sel.chatId !== chat.id) return null;
  const n = sel.ids.size;
  const del = () => {
    const ids = [...sel.ids];
    const msgs = ids.map(id => S.history.get(chat.id)?.byId.get(id)).filter(Boolean);
    const allMine = msgs.every(m => m.is_outgoing);
    let revoke = true;
    const user = chatUser(chat);
    openModal({
      icon: html`<div style="display:flex;justify-content:center;color:var(--red)">${Icon.trash(34)}</div>`,
      title: `Удалить ${count(n, 'сообщение', 'сообщения', 'сообщений')}?`,
      text: 'Это действие нельзя отменить.',
      body: user && allMine && chat.id !== S.myId ? html`<label class="check-line"><input type="checkbox" checked onChange=${e => { revoke = e.target.checked; }}/>Удалить также для ${user.first_name}</label>` : null,
      buttons: [
        { label: 'Удалить', kind: 'danger', action: () => { closeModal(); deleteMessages(chat.id, ids, revoke).then(() => { S.selection = null; changed(); }).catch(e => showHud(e.message)); } },
        { label: 'Отмена', kind: 'second', action: closeModal },
      ],
    });
  };
  return html`<div class="composer-wrap">
    <div class="glass selection-bar">
      <button class="sel-btn" onClick=${() => { S.selection = null; changed(); }}>Отмена</button>
      <span class="sel-count">${count(n, 'сообщение', 'сообщения', 'сообщений')}</span>
      <button class="sel-btn" title="Переслать" onClick=${() => openForward(chat.id, [...sel.ids])}>${Icon.menu('Icon_MessageActionPanelForward')} Переслать</button>
      <button class="sel-btn danger" title="Удалить" onClick=${del}>${Icon.menu('Icon_MessageActionPanelDelete')} Удалить</button>
    </div>
  </div>`;
}
