import { useState, useEffect } from './lib.js';
import { send, onUpdate, shell } from './td.js';

// Всё состояние приложения в одном месте. Его наполняют обновления TDLib.
export const S = {
  auth: null,
  credsReady: null,
  myId: null,
  connection: 'connectionStateReady',
  users: new Map(),
  chats: new Map(),
  basicGroups: new Map(),
  supergroups: new Map(),
  files: new Map(),
  folders: [],
  folder: 'main',
  tab: 'chats',
  currentChatId: null,
  history: new Map(),   // chatId -> { list, byId, hasMore, loading }
  fresh: new Set(),     // id новых сообщений — для анимации появления
  typing: new Map(),    // chatId -> Map(senderKey -> {action, until})
  contacts: null,
  searchQuery: '',
  searchResults: null,
  reply: null,
  editing: null,
  menu: null,
  hud: null,
  modal: null,
  highlight: null,
  player: null,
  profile: false,
  viewer: null,
  prefs: loadPrefs(),
};

function loadPrefs() {
  try { return { theme: 'auto', fontSize: 14, ...JSON.parse(localStorage.getItem('prefs') || '{}') }; }
  catch { return { theme: 'auto', fontSize: 14 }; }
}
export function setPref(k, v) {
  S.prefs[k] = v;
  try { localStorage.setItem('prefs', JSON.stringify(S.prefs)); } catch {}
  applyPrefs();
  changed();
}
export function applyPrefs() {
  const root = document.documentElement;
  if (S.prefs.theme === 'auto') delete root.dataset.theme; else root.dataset.theme = S.prefs.theme;
  root.style.setProperty('--fs-msg', `${S.prefs.fontSize}px`);
}

// ── перерисовка ──
const subs = new Set();
let version = 0, queued = false;
export function changed() {
  version++;
  if (queued) return;
  queued = true;
  const run = () => { queued = false; for (const f of subs) f(version); };
  document.hidden ? setTimeout(run, 50) : requestAnimationFrame(run);
}
export function useStore() {
  const [, set] = useState(0);
  useEffect(() => { subs.add(set); return () => subs.delete(set); }, []);
  return S;
}

// ── вспомогательное ──
export const listKey = l => !l ? 'main' : l['@type'] === 'chatListMain' ? 'main' : l['@type'] === 'chatListArchive' ? 'archive' : `f${l.chat_folder_id}`;
export const listOf = key => key === 'main' ? { '@type': 'chatListMain' } : key === 'archive' ? { '@type': 'chatListArchive' } : { '@type': 'chatListFolder', chat_folder_id: Number(key.slice(1)) };
export const position = (chat, key) => chat.positions?.find(p => listKey(p.list) === key);

export function sortedChats(key) {
  const out = [];
  for (const c of S.chats.values()) {
    const p = position(c, key);
    if (p && p.order !== '0') out.push([BigInt(p.order), c, p.is_pinned]);
  }
  out.sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
  return out.map(([, c, pinned]) => ({ chat: c, pinned }));
}

export function chatUser(chat) {
  const t = chat?.type;
  return t && (t['@type'] === 'chatTypePrivate' || t['@type'] === 'chatTypeSecret') ? S.users.get(t.user_id) : null;
}
export const isSaved = chat => chat && chat.id === S.myId;
export const isChannel = chat => chat?.type?.['@type'] === 'chatTypeSupergroup' && chat.type.is_channel;
export const isGroup = chat => chat?.type?.['@type'] === 'chatTypeBasicGroup' || (chat?.type?.['@type'] === 'chatTypeSupergroup' && !chat.type.is_channel);

export function senderName(sender) {
  if (!sender) return '';
  if (sender['@type'] === 'messageSenderUser') {
    const u = S.users.get(sender.user_id);
    return u ? [u.first_name, u.last_name].filter(Boolean).join(' ') : '';
  }
  return S.chats.get(sender.chat_id)?.title || '';
}
export const senderId = s => s ? (s.user_id ?? s.chat_id) : 0;

export function chatTitle(chat) {
  if (!chat) return '';
  if (isSaved(chat)) return 'Избранное';
  return chat.title || 'Удалённый аккаунт';
}

export function fileOf(f) { return f ? (S.files.get(f.id) || f) : null; }
const requested = new Set();
export function download(f, priority = 1) {
  if (!f) return;
  const cur = fileOf(f);
  if (cur.local?.is_downloading_completed || requested.has(cur.id)) return;
  if (!cur.local?.can_be_downloaded && cur.local) return;
  requested.add(cur.id);
  send({ '@type': 'downloadFile', file_id: cur.id, priority, offset: 0, limit: 0, synchronous: false })
    .then(file => { S.files.set(file.id, file); changed(); })
    .catch(() => requested.delete(cur.id));
}
export function fileUrl(f) {
  const cur = fileOf(f);
  return cur?.local?.is_downloading_completed ? shell.fileUrl(cur.local.path) : '';
}

// ── HUD и меню ──
let hudTimer;
export function showHud(text) {
  clearTimeout(hudTimer);
  S.hud = { text, id: Math.random(), out: false };
  changed();
  hudTimer = setTimeout(() => {
    if (S.hud) { S.hud.out = true; changed(); }
    hudTimer = setTimeout(() => { S.hud = null; changed(); }, 260);
  }, 1500);
}
export function openMenu(x, y, items) { S.menu = { x, y, items }; changed(); }
export function closeMenu() { if (S.menu) { S.menu = null; changed(); } }
export function openModal(m) { S.modal = { ...m, out: false }; changed(); }
export function closeModal() {
  if (!S.modal) return;
  S.modal.out = true; changed();
  setTimeout(() => { S.modal = null; changed(); }, 180);
}

// ── история сообщений ──
function hist(chatId) {
  let h = S.history.get(chatId);
  if (!h) { h = { list: [], byId: new Map(), hasMore: true, loading: false }; S.history.set(chatId, h); }
  return h;
}
function putMessage(m, { fresh = false } = {}) {
  const h = S.history.get(m.chat_id);
  if (!h) return;
  const exists = h.byId.has(m.id);
  h.byId.set(m.id, m);
  if (exists) { h.list = h.list.map(x => (x.id === m.id ? m : x)); return; }
  if (!h.list.length || h.list[h.list.length - 1].id < m.id) h.list = [...h.list, m];
  else h.list = [...h.list, m].sort((a, b) => a.id - b.id);
  if (fresh) S.fresh.add(m.id);
}
function removeMessage(chatId, id) {
  const h = S.history.get(chatId);
  if (!h || !h.byId.has(id)) return;
  h.byId.delete(id);
  h.list = h.list.filter(x => x.id !== id);
}

export async function loadHistory(chatId, older = false) {
  const h = hist(chatId);
  if (h.loading || (older && !h.hasMore)) return;
  h.loading = true; changed();
  try {
    let from = older && h.list.length ? h.list[0].id : 0;
    let got = 0;
    for (let i = 0; i < 5 && got < 40; i++) {
      const r = await send({ '@type': 'getChatHistory', chat_id: chatId, from_message_id: from, offset: 0, limit: 50, only_local: false });
      if (!r.messages?.length) { h.hasMore = false; break; }
      for (const m of r.messages) if (!h.byId.has(m.id)) { h.byId.set(m.id, m); got++; }
      from = r.messages[r.messages.length - 1].id;
    }
    h.list = [...h.byId.values()].sort((a, b) => a.id - b.id);
  } catch (e) {
    console.warn('history', e);
  } finally {
    h.loading = false; changed();
  }
}

// ── действия ──
export async function selectChat(chatId) {
  if (S.currentChatId === chatId) return;
  const prev = S.currentChatId;
  if (prev) send({ '@type': 'closeChat', chat_id: prev }).catch(() => {});
  S.currentChatId = chatId;
  S.reply = null; S.editing = null; S.highlight = null;
  changed();
  if (!chatId) return;
  send({ '@type': 'openChat', chat_id: chatId }).catch(() => {});
  const h = hist(chatId);
  if (!h.list.length) await loadHistory(chatId);
  markRead(chatId);
}

let readTimer;
export function markRead(chatId = S.currentChatId) {
  clearTimeout(readTimer);
  readTimer = setTimeout(() => {
    const chat = S.chats.get(chatId);
    const h = S.history.get(chatId);
    if (!chat || !h || document.hidden || chatId !== S.currentChatId) return;
    const ids = h.list.slice(-50).map(m => m.id);
    if (!ids.length) return;
    if (chat.unread_count > 0 || chat.unread_mention_count > 0 || chat.is_marked_as_unread) {
      send({ '@type': 'viewMessages', chat_id: chatId, message_ids: ids, force_read: true }).catch(() => {});
      if (chat.is_marked_as_unread) send({ '@type': 'toggleChatIsMarkedAsUnread', chat_id: chatId, is_marked_as_unread: false }).catch(() => {});
    }
  }, 250);
}
document.addEventListener('visibilitychange', () => markRead());
window.addEventListener('focus', () => markRead());

export async function sendText(chatId, text) {
  const body = text.replace(/\s+$/, '');
  if (!body.trim()) return;
  const editing = S.editing, reply = S.reply;
  S.editing = null; S.reply = null; changed();
  const content = { '@type': 'inputMessageText', text: { '@type': 'formattedText', text: body, entities: [] } };
  try {
    if (editing) {
      await send({ '@type': 'editMessageText', chat_id: chatId, message_id: editing.id, input_message_content: content });
    } else {
      const req = { '@type': 'sendMessage', chat_id: chatId, input_message_content: content };
      if (reply) req.reply_to = { '@type': 'inputMessageReplyToMessage', message_id: reply.id };
      const m = await send(req);
      putMessage(m, { fresh: true }); changed();
    }
  } catch (e) {
    showHud(e.message || 'Не удалось отправить');
  }
}

export function deleteMessages(chatId, ids, revoke) {
  return send({ '@type': 'deleteMessages', chat_id: chatId, message_ids: ids, revoke });
}

export async function loadContacts() {
  try {
    const r = await send({ '@type': 'getContacts' });
    S.contacts = r.user_ids;
  } catch { S.contacts = []; }
  changed();
}

export async function openPrivate(userId) {
  try {
    const chat = await send({ '@type': 'createPrivateChat', user_id: userId, force: false });
    S.chats.set(chat.id, { ...(S.chats.get(chat.id) || {}), ...chat });
    S.tab = 'chats';
    selectChat(chat.id);
  } catch (e) { showHud(e.message); }
}

let searchSeq = 0;
export async function search(q) {
  S.searchQuery = q;
  const my = ++searchSeq;
  if (!q.trim()) { S.searchResults = null; changed(); return; }
  changed();
  try {
    const [local, global] = await Promise.all([
      send({ '@type': 'searchChats', query: q, limit: 50 }),
      send({ '@type': 'searchChatsOnServer', query: q, limit: 50 }).catch(() => ({ chat_ids: [] })),
    ]);
    if (my !== searchSeq) return;
    S.searchResults = [...new Set([...local.chat_ids, ...global.chat_ids])];
  } catch {
    if (my !== searchSeq) return;
    const lq = q.toLowerCase();
    S.searchResults = [...S.chats.values()].filter(c => chatTitle(c).toLowerCase().includes(lq)).map(c => c.id);
  }
  changed();
}

export async function loadChats(key = 'main') {
  for (let i = 0; i < 20; i++) {
    try { await send({ '@type': 'loadChats', chat_list: listOf(key), limit: 100 }); }
    catch { break; } // 404 — все чаты загружены
  }
}

export function logOut() { return send({ '@type': 'logOut' }); }

// ── обработка обновлений TDLib ──
function setPositions(chat, positions) {
  for (const p of positions || []) {
    const k = listKey(p.list);
    chat.positions = (chat.positions || []).filter(x => listKey(x.list) !== k);
    if (p.order !== '0') chat.positions.push(p);
  }
}
const patchChat = (id, fn) => { const c = S.chats.get(id); if (c) { const n = { ...c }; fn(n); S.chats.set(id, n); } };

function setTyping(chatId, sender, action) {
  let m = S.typing.get(chatId);
  const key = senderId(sender);
  if (action['@type'] === 'chatActionCancel') { m?.delete(key); }
  else {
    if (!m) { m = new Map(); S.typing.set(chatId, m); }
    m.set(key, { action, sender, until: Date.now() + 6000 });
    setTimeout(() => { const e = S.typing.get(chatId)?.get(key); if (e && e.until <= Date.now()) { S.typing.get(chatId).delete(key); changed(); } }, 6100);
  }
}
export function typingText(chatId) {
  const m = S.typing.get(chatId);
  if (!m || !m.size) return null;
  const [first] = m.values();
  const a = first.action['@type'];
  const verb = a === 'chatActionRecordingVoiceNote' ? 'записывает голосовое'
    : a === 'chatActionUploadingPhoto' ? 'отправляет фото'
      : a === 'chatActionUploadingVideo' || a === 'chatActionRecordingVideo' ? 'отправляет видео'
        : a === 'chatActionChoosingSticker' ? 'выбирает стикер'
          : a === 'chatActionUploadingDocument' ? 'отправляет файл' : 'печатает';
  const chat = S.chats.get(chatId);
  if (chat && isGroup(chat)) {
    const n = senderName(first.sender).split(' ')[0];
    return m.size > 1 ? `${m.size} печатают` : `${n} ${verb}`;
  }
  return verb;
}

onUpdate(u => {
  switch (u['@type']) {
    case 'updateAuthorizationState': {
      S.auth = u.authorization_state;
      const t = S.auth['@type'];
      if (t === 'authorizationStateWaitTdlibParameters') {
        shell.hasCredentials().then(ok => {
          S.credsReady = ok; changed();
          if (ok) shell.setParameters(navigator.language?.slice(0, 2) || 'ru').catch(e => { console.error(e); showHud(String(e)); });
        });
      } else if (t === 'authorizationStateReady') {
        loadChats('main');
        send({ '@type': 'getMe' }).then(me => { S.myId = me.id; S.users.set(me.id, me); changed(); }).catch(() => {});
      } else if (t === 'authorizationStateClosed') {
        for (const k of ['users', 'chats', 'basicGroups', 'supergroups', 'files', 'history', 'typing']) S[k].clear();
        S.currentChatId = null; S.folders = []; S.folder = 'main'; S.contacts = null; S.myId = null;
        shell.restart();
      }
      break;
    }
    case 'updateConnectionState': S.connection = u.state['@type']; break;
    case 'updateOption': if (u.name === 'my_id' && u.value?.value) S.myId = Number(u.value.value); break;
    case 'updateUser': S.users.set(u.user.id, u.user); break;
    case 'updateUserStatus': { const usr = S.users.get(u.user_id); if (usr) S.users.set(u.user_id, { ...usr, status: u.status }); break; }
    case 'updateBasicGroup': S.basicGroups.set(u.basic_group.id, u.basic_group); break;
    case 'updateSupergroup': S.supergroups.set(u.supergroup.id, u.supergroup); break;
    case 'updateFile': S.files.set(u.file.id, u.file); break;
    case 'updateNewChat': {
      const c = { ...u.chat, positions: [...(u.chat.positions || [])] };
      S.chats.set(c.id, c);
      break;
    }
    case 'updateChatTitle': patchChat(u.chat_id, c => { c.title = u.title; }); break;
    case 'updateChatPhoto': patchChat(u.chat_id, c => { c.photo = u.photo; }); break;
    case 'updateChatAccentColors': patchChat(u.chat_id, c => { c.accent_color_id = u.accent_color_id; }); break;
    case 'updateChatPermissions': patchChat(u.chat_id, c => { c.permissions = u.permissions; }); break;
    case 'updateChatLastMessage': patchChat(u.chat_id, c => { c.last_message = u.last_message; setPositions(c, u.positions); }); break;
    case 'updateChatPosition': patchChat(u.chat_id, c => setPositions(c, [u.position])); break;
    case 'updateChatDraftMessage': patchChat(u.chat_id, c => { c.draft_message = u.draft_message; setPositions(c, u.positions); }); break;
    case 'updateChatReadInbox': patchChat(u.chat_id, c => { c.last_read_inbox_message_id = u.last_read_inbox_message_id; c.unread_count = u.unread_count; }); break;
    case 'updateChatReadOutbox': patchChat(u.chat_id, c => { c.last_read_outbox_message_id = u.last_read_outbox_message_id; }); break;
    case 'updateChatUnreadMentionCount': patchChat(u.chat_id, c => { c.unread_mention_count = u.unread_mention_count; }); break;
    case 'updateChatNotificationSettings': patchChat(u.chat_id, c => { c.notification_settings = u.notification_settings; }); break;
    case 'updateChatIsMarkedAsUnread': patchChat(u.chat_id, c => { c.is_marked_as_unread = u.is_marked_as_unread; }); break;
    case 'updateChatFolders': case 'updateChatFilters': {
      const arr = u.chat_folders || u.chat_filters || [];
      S.folders = arr.map(f => ({ id: f.id, title: f.name?.text?.text ?? f.title ?? 'Папка' }));
      for (const f of S.folders) loadChats(`f${f.id}`);
      if (S.folder !== 'main' && !S.folders.some(f => `f${f.id}` === S.folder)) S.folder = 'main';
      break;
    }
    case 'updateNewMessage': {
      putMessage(u.message, { fresh: true });
      if (u.message.chat_id === S.currentChatId && !u.message.is_outgoing) markRead();
      const m = S.typing.get(u.message.chat_id); m?.delete(senderId(u.message.sender_id));
      break;
    }
    case 'updateMessageSendSucceeded': case 'updateMessageSendFailed': {
      const h = S.history.get(u.message.chat_id);
      if (h && h.byId.has(u.old_message_id)) {
        h.byId.delete(u.old_message_id);
        h.byId.set(u.message.id, u.message);
        h.list = h.list.map(x => (x.id === u.old_message_id ? u.message : x)).sort((a, b) => a.id - b.id);
        if (S.fresh.has(u.old_message_id)) S.fresh.add(u.message.id);
      } else putMessage(u.message);
      if (u['@type'] === 'updateMessageSendFailed') showHud(u.error?.message || 'Сообщение не отправлено');
      break;
    }
    case 'updateMessageContent': {
      const h = S.history.get(u.chat_id), m = h?.byId.get(u.message_id);
      if (m) putMessage({ ...m, content: u.new_content });
      break;
    }
    case 'updateMessageEdited': {
      const h = S.history.get(u.chat_id), m = h?.byId.get(u.message_id);
      if (m) putMessage({ ...m, edit_date: u.edit_date });
      break;
    }
    case 'updateMessageInteractionInfo': {
      const h = S.history.get(u.chat_id), m = h?.byId.get(u.message_id);
      if (m) putMessage({ ...m, interaction_info: u.interaction_info });
      break;
    }
    case 'updateDeleteMessages':
      if (!u.from_cache) for (const id of u.message_ids) removeMessage(u.chat_id, id);
      break;
    case 'updateChatAction': setTyping(u.chat_id, u.sender_id, u.action); break;
    default: return;
  }
  changed();
});
