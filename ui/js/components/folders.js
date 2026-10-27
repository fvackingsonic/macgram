// Папки с чатами — как в Telegram для macOS: «Настройки → Папки», создание и изменение папки,
// выбор чатов и типов чатов, рекомендуемые папки, порядок перетаскиванием, «Добавить в папку».
import { html, useState, useEffect, useRef } from '../lib.js';
import { S, changed, showHud, openModal, closeModal, sortedChats, chatTitle, openMenu, chatUser } from '../store.js';
import { send } from '../td.js';
import { Icon } from '../icons.js';
import { MI } from '../mac-icons.js';
import { count } from '../format.js';
import { Avatar, Spinner } from './common.js';

const INCLUDE_TYPES = [
  ['include_contacts', 'Контакты', 'Icon_FilterPrivateChats'],
  ['include_non_contacts', 'Не контакты', 'Icon_FilterNonContacts'],
  ['include_groups', 'Группы', 'Icon_FilterGroups'],
  ['include_channels', 'Каналы', 'Icon_FilterChannels'],
  ['include_bots', 'Боты', 'Icon_FilterBots'],
];
const EXCLUDE_TYPES = [
  ['exclude_muted', 'Без уведомлений', 'Icon_FilterMuted'],
  ['exclude_read', 'Прочитанные', 'Icon_FilterRead'],
  ['exclude_archived', 'Архив', 'Icon_FilterArchive'],
];
const TYPE_COLORS = { include_contacts: '#007aff', include_non_contacts: '#34c759', include_groups: '#ff9500', include_channels: '#ff2d55', include_bots: '#5ac8fa', exclude_muted: '#ff3b30', exclude_read: '#34c759', exclude_archived: '#5856d6' };

const nameOf = f => f?.name?.text?.text ?? f?.title ?? '';
export const emptyFolder = (title = '') => ({
  '@type': 'chatFolder', name: { '@type': 'chatFolderName', text: { '@type': 'formattedText', text: title, entities: [] }, animate_custom_emoji: false },
  icon: null, color_id: -1, is_shareable: false, pinned_chat_ids: [], included_chat_ids: [], excluded_chat_ids: [],
  exclude_muted: false, exclude_read: false, exclude_archived: false,
  include_contacts: false, include_non_contacts: false, include_bots: false, include_groups: false, include_channels: false,
});
const go = page => { S.settingsPage = page; changed(); };

// Открыть редактор папки (id = null — новая папка). Можно вызвать из любого места — переключит на «Настройки».
export async function editFolder(id, preset) {
  S.tab = 'settings';
  S.folderEdit = { id, folder: null, loading: id != null };
  go('folder-edit');
  if (id == null) { S.folderEdit.folder = preset || emptyFolder(); changed(); return; }
  try {
    const f = await send({ '@type': 'getChatFolder', chat_folder_id: id });
    if (S.folderEdit?.id === id) { S.folderEdit.folder = { ...emptyFolder(), ...f }; S.folderEdit.loading = false; changed(); }
  } catch (e) { showHud(e.message); go('folders'); }
}

export function confirmDeleteFolder(id, title, after) {
  openModal({
    icon: html`<div style="display:flex;justify-content:center;color:var(--red)">${Icon.trash(36)}</div>`,
    title: 'Удалить папку?',
    text: `Папка «${title}» будет удалена. Чаты из неё останутся в списке «Все чаты».`,
    buttons: [
      { label: 'Удалить', kind: 'danger', action: () => { closeModal(); send({ '@type': 'deleteChatFolder', chat_folder_id: id, leave_chat_ids: [] }).then(() => { showHud('Папка удалена'); after?.(); }).catch(e => showHud(e.message)); } },
      { label: 'Отмена', kind: 'second', action: closeModal },
    ],
  });
}

// «Добавить в папку» / «Убрать из папки» для чата — меню с галочками, как в macOS.
export function addToFolderMenu(x, y, chat) {
  if (!S.folders.length) {
    openMenu(x, y, [{ label: 'Создать папку…', icon: MI('menu_folder', 18), action: () => editFolder(null, { ...emptyFolder(), included_chat_ids: [chat.id] }) }]);
    return;
  }
  const inF = id => chat.positions?.some(p => p.list?.['@type'] === 'chatListFolder' && p.list.chat_folder_id === id && p.order !== '0');
  openMenu(x, y, [
    ...S.folders.map(f => ({
      label: f.title, icon: inF(f.id) ? Icon.check(13) : MI('menu_folder', 18),
      action: () => toggleChatInFolder(chat.id, f.id, !inF(f.id)),
    })),
    '-',
    { label: 'Новая папка…', icon: MI('menu_add_to_folder', 18), action: () => editFolder(null, { ...emptyFolder(), included_chat_ids: [chat.id] }) },
  ]);
}
async function toggleChatInFolder(chatId, folderId, add) {
  try {
    const f = await send({ '@type': 'getChatFolder', chat_folder_id: folderId });
    const inc = new Set(f.included_chat_ids || []), exc = new Set(f.excluded_chat_ids || []), pin = new Set(f.pinned_chat_ids || []);
    if (add) { inc.add(chatId); exc.delete(chatId); } else { inc.delete(chatId); pin.delete(chatId); exc.add(chatId); }
    // Если чат попадал в папку только по типу — исключаем явно; если был только в списке — просто убираем.
    if (!add) {
      const byType = f.include_contacts || f.include_non_contacts || f.include_groups || f.include_channels || f.include_bots;
      if (!byType) exc.delete(chatId);
    }
    await send({ '@type': 'editChatFolder', chat_folder_id: folderId, folder: { ...f, '@type': 'chatFolder', included_chat_ids: [...inc], excluded_chat_ids: [...exc], pinned_chat_ids: [...pin] } });
    showHud(add ? 'Добавлено в папку' : 'Убрано из папки');
  } catch (e) { showHud(e.message?.includes('LIMIT') ? 'Достигнут лимит чатов в папке' : e.message); }
}

function Page({ title, back = null, right, children }) {
  return html`<div class="list settings-page" key=${title}>
    <div class="sp-head"><button class="sp-back" onClick=${() => go(back)}>${Icon.back(13)}<span class="sp-back-text">${back === 'folders' ? 'Папки' : 'Настройки'}</span></button><span class="sp-title">${title}</span>${right}</div>
    ${children}
  </div>`;
}

// ── «Настройки → Папки» ──
export function FoldersSettings() {
  const [rec, setRec] = useState(null);
  const [drag, setDrag] = useState(null); // { from, over }
  useEffect(() => { send({ '@type': 'getRecommendedChatFolders' }).then(r => setRec(r.chat_folders || [])).catch(() => setRec([])); }, [S.folders.length]);
  const addRec = r => send({ '@type': 'createChatFolder', folder: r.folder }).then(() => showHud(`Папка «${nameOf(r.folder)}» создана`)).catch(e => showHud(e.message?.includes('LIMIT') ? 'Достигнут лимит папок' : e.message));
  const drop = to => {
    if (!drag || drag.from === to) { setDrag(null); return; }
    const ids = S.folders.map(f => f.id);
    const [x] = ids.splice(drag.from, 1); ids.splice(to, 0, x);
    S.folders = ids.map(id => S.folders.find(f => f.id === id)); changed();
    send({ '@type': 'reorderChatFolders', chat_folder_ids: ids, main_chat_list_position: 0 }).catch(e => showHud(e.message));
    setDrag(null);
  };
  return html`<${Page} title="Папки">
    <div class="folders-hero">${MI('Icon_SettingsFilters', 48)}<div>Создавайте папки для разных групп чатов и быстро переключайтесь между ними.</div></div>
    <div class="group">
      <${Row} icon=${html`<span class="fl-add">${Icon.plus(13)}</span>`} label="Создать папку" accent onClick=${() => editFolder(null)}/>
    </div>
    ${S.folders.length > 0 && html`<div class="pane-sec">Мои папки</div>
    <div class="group">
      ${S.folders.map((f, i) => html`<div key=${f.id} class=${`item fl-row ${drag?.over === i && drag.from !== i ? (drag.from < i ? 'drop-after' : 'drop-before') : ''} ${drag?.from === i ? 'dragging' : ''}`}
          draggable="true" onDragStart=${e => { e.dataTransfer.effectAllowed = 'move'; setDrag({ from: i, over: i }); }}
          onDragOver=${e => { e.preventDefault(); if (drag && drag.over !== i) setDrag({ ...drag, over: i }); }} onDrop=${e => { e.preventDefault(); drop(i); }} onDragEnd=${() => setDrag(null)}
          onClick=${() => editFolder(f.id)}>
        <span class="fl-grip" title="Перетащите, чтобы изменить порядок">≡</span>
        ${MI('menu_folder', 18)}
        <span class="lbl">${f.title}<small>${folderSummary(f.id)}</small></span>
        <button class="fl-del" title="Удалить папку" onClick=${e => { e.stopPropagation(); confirmDeleteFolder(f.id, f.title); }}>${Icon.trash(16)}</button>
        <span class="chev">${Icon.chevron(11)}</span>
      </div>`)}
    </div>
    <div class="sp-hint" style="padding:0 18px">Перетащите папку, чтобы изменить порядок. Правый клик по папке над списком чатов — тоже изменить или удалить.</div>`}
    ${rec === null ? html`<div style="display:grid;place-items:center;padding:18px"><${Spinner}/></div>` : rec.length > 0 && html`<div class="pane-sec">Рекомендуемые папки</div>
    <div class="group">
      ${rec.map(r => html`<div class="item" key=${nameOf(r.folder)}>
        ${MI('menu_folder', 18)}
        <span class="lbl">${nameOf(r.folder)}<small>${r.description}</small></span>
        <button class="sel-btn" onClick=${() => addRec(r)}>Добавить</button>
      </div>`)}
    </div>`}
  </${Page}>`;
}

function folderSummary(id) {
  const n = sortedChats(`f${id}`).length;
  return n ? count(n, 'чат', 'чата', 'чатов') : 'нет чатов';
}

function Row({ icon, label, onClick, accent, danger }) {
  return html`<button class=${`item ${danger ? 'danger' : ''} ${accent ? 'accent' : ''}`} onClick=${onClick}>${icon}<span class="lbl">${label}</span></button>`;
}

const TypeIcon = (key, icon) => html`<span class="ic fl-type" style=${`background:${TYPE_COLORS[key]}`}>${MI(icon, 18)}</span>`;

// ── создание / изменение папки ──
export function FolderEdit() {
  const ed = S.folderEdit;
  const f = ed?.folder;
  const [busy, setBusy] = useState(false);
  const nameRef = useRef();
  useEffect(() => { if (f && ed.id == null) setTimeout(() => nameRef.current?.focus(), 80); }, [!!f]);
  if (!ed) return html`<${FoldersSettings}/>`;
  const set = patch => { ed.folder = { ...ed.folder, ...patch }; ed.dirty = true; changed(); };
  const title = nameOf(f);
  const save = async () => {
    if (!title.trim()) { showHud('Введите название папки'); nameRef.current?.focus(); return; }
    const anyType = INCLUDE_TYPES.some(([k]) => f[k]);
    if (!anyType && !f.included_chat_ids.length) { showHud('Добавьте в папку хотя бы один чат или тип чатов'); return; }
    setBusy(true);
    try {
      const folder = { ...f, '@type': 'chatFolder', name: { '@type': 'chatFolderName', text: { '@type': 'formattedText', text: title.trim(), entities: [] }, animate_custom_emoji: false } };
      if (ed.id == null) await send({ '@type': 'createChatFolder', folder });
      else await send({ '@type': 'editChatFolder', chat_folder_id: ed.id, folder });
      showHud(ed.id == null ? 'Папка создана' : 'Папка сохранена');
      S.folderEdit = null; go('folders');
    } catch (e) { showHud(e.message?.includes('LIMIT') ? 'Достигнут лимит папок или чатов в папке' : e.message); }
    setBusy(false);
  };
  const chatRow = (id, list) => {
    const c = S.chats.get(id);
    return html`<div class="item fl-chat" key=${id}>
      ${c ? html`<${Avatar} chat=${c} size=${28}/>` : html`<span class="ic" style="background:var(--gray-icon)"/>`}
      <span class="lbl">${c ? chatTitle(c) : `Чат ${id}`}</span>
      <button class="fl-del" title="Убрать" onClick=${() => set({ [list]: f[list].filter(x => x !== id), ...(list === 'included_chat_ids' ? { pinned_chat_ids: f.pinned_chat_ids.filter(x => x !== id) } : {}) })}>${Icon.close(14)}</button>
    </div>`;
  };
  const typeRow = ([k, label, icon]) => f[k] && html`<div class="item fl-chat" key=${k}>
    ${TypeIcon(k, icon)}<span class="lbl">${label}</span>
    <button class="fl-del" title="Убрать" onClick=${() => set({ [k]: false })}>${Icon.close(14)}</button>
  </div>`;
  return html`<${Page} title=${ed.id == null ? 'Новая папка' : 'Папка'} back="folders"
      right=${html`<button class="sp-done" disabled=${busy || !f} onClick=${save}>${busy ? html`<${Spinner}/>` : ed.id == null ? 'Создать' : 'Готово'}</button>`}>
    ${!f ? html`<div style="display:grid;place-items:center;padding:30px"><${Spinner}/></div>` : html`
    <div class="pane-sec">Название папки</div>
    <div class="group"><div class="item"><input ref=${nameRef} class="fl-name" maxlength="12" placeholder="Название" value=${title}
      onInput=${e => set({ name: { '@type': 'chatFolderName', text: { '@type': 'formattedText', text: e.target.value, entities: [] }, animate_custom_emoji: false } })}
      onKeyDown=${e => e.key === 'Enter' && save()}/><span class="val">${12 - title.length}</span></div></div>

    <div class="pane-sec">Включённые чаты</div>
    <div class="group">
      <${Row} icon=${html`<span class="fl-add">${Icon.plus(13)}</span>`} label="Добавить чаты" accent onClick=${() => openPicker('include')}/>
      ${INCLUDE_TYPES.map(typeRow)}
      ${f.included_chat_ids.map(id => chatRow(id, 'included_chat_ids'))}
    </div>
    <div class="sp-hint" style="padding:0 18px">Выберите чаты или типы чатов, которые будут в этой папке.</div>

    <div class="pane-sec">Исключённые чаты</div>
    <div class="group">
      <${Row} icon=${html`<span class="fl-add">${Icon.plus(13)}</span>`} label="Исключить чаты" accent onClick=${() => openPicker('exclude')}/>
      ${EXCLUDE_TYPES.map(typeRow)}
      ${f.excluded_chat_ids.map(id => chatRow(id, 'excluded_chat_ids'))}
    </div>
    <div class="sp-hint" style="padding:0 18px">Эти чаты не будут показываться в папке.</div>

    ${ed.id != null && html`<div class="group" style="margin-top:14px">
      <${Row} icon=${html`<span class="ic" style="background:var(--red)">${MI('menu_delete', 15)}</span>`} label="Удалить папку" danger onClick=${() => confirmDeleteFolder(ed.id, title, () => { S.folderEdit = null; go('folders'); })}/>
    </div>`}`}
  </${Page}>`;
}

// ── выбор чатов для папки ──
function openPicker(mode) {
  const f = S.folderEdit.folder;
  const list = mode === 'include' ? 'included_chat_ids' : 'excluded_chat_ids';
  const types = mode === 'include' ? INCLUDE_TYPES : EXCLUDE_TYPES;
  S.folderPick = { mode, list, types, ids: new Set(f[list]), flags: Object.fromEntries(types.map(([k]) => [k, !!f[k]])), out: false };
  changed();
}
function closePicker() { if (!S.folderPick) return; S.folderPick.out = true; changed(); setTimeout(() => { S.folderPick = null; changed(); }, 180); }

export function FolderChatsPicker() {
  const p = S.folderPick;
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);
  const ref = useRef();
  useEffect(() => { if (p && !p.out) { setQ(''); setFound(null); setTimeout(() => ref.current?.focus(), 60); } }, [!!p]);
  useEffect(() => {
    if (!q.trim()) { setFound(null); return; }
    const t = setTimeout(() => send({ '@type': 'searchChats', query: q, limit: 50 }).then(r => setFound(r.chat_ids)).catch(() => setFound([])), 150);
    return () => clearTimeout(t);
  }, [q]);
  if (!p) return null;
  const chats = found ? found.map(id => S.chats.get(id)).filter(Boolean) : sortedChats('main').map(x => x.chat);
  const toggle = id => { if (p.ids.has(id)) p.ids.delete(id); else p.ids.add(id); changed(); };
  const done = () => {
    const ed = S.folderEdit; if (!ed?.folder) { closePicker(); return; }
    const other = p.list === 'included_chat_ids' ? 'excluded_chat_ids' : 'included_chat_ids';
    const ids = [...p.ids];
    ed.folder = { ...ed.folder, ...p.flags, [p.list]: ids, [other]: ed.folder[other].filter(x => !p.ids.has(x)),
      pinned_chat_ids: p.list === 'included_chat_ids' ? ed.folder.pinned_chat_ids.filter(x => p.ids.has(x)) : ed.folder.pinned_chat_ids };
    ed.dirty = true;
    closePicker();
  };
  const n = p.ids.size + Object.values(p.flags).filter(Boolean).length;
  return html`<div class=${`veil ${p.out ? 'out' : ''}`} onMouseDown=${e => e.target === e.currentTarget && closePicker()} onKeyDown=${e => e.key === 'Escape' && closePicker()}>
    <div class="sheet picker-sheet">
      <div class="sd-title">${p.mode === 'include' ? 'Включить чаты' : 'Исключить чаты'}${n ? ` · ${n}` : ''}</div>
      <label class="search active" style="margin-bottom:8px">${Icon.search()}<input ref=${ref} placeholder="Поиск" value=${q} onInput=${e => setQ(e.target.value)}/></label>
      <div class="picker-list">
        ${!found && html`<div class="picker-sec">Типы чатов</div>
          ${p.types.map(([k, label, icon]) => html`<button class=${`picker-row check ${p.flags[k] ? 'on' : ''}`} key=${k} onClick=${() => { p.flags[k] = !p.flags[k]; changed(); }}>
            ${TypeIcon(k, icon)}<span style="flex:1">${label}</span><span class=${`sel-check static ${p.flags[k] ? 'on' : ''}`}>${p.flags[k] && Icon.check(12)}</span></button>`)}
          <div class="picker-sec">Чаты</div>`}
        ${chats.map(c => html`<button class=${`picker-row check ${p.ids.has(c.id) ? 'on' : ''}`} key=${c.id} onClick=${() => toggle(c.id)}>
          <${Avatar} chat=${c} size=${32}/><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.id === S.myId ? 'Избранное' : chatTitle(c)}</span>
          <span class=${`sel-check static ${p.ids.has(c.id) ? 'on' : ''}`}>${p.ids.has(c.id) && Icon.check(12)}</span></button>`)}
        ${found && !chats.length && html`<div class="empty">Ничего не найдено</div>`}
      </div>
      <div class="sd-btns"><span style="flex:1"/><button class="btn second" onClick=${closePicker}>Отмена</button><button class="btn" onClick=${done}>Готово</button></div>
    </div>
  </div>`;
}
