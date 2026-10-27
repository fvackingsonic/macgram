// Уведомления Windows и счётчик непрочитанных на значке в панели задач.
import { S, chatTitle, senderName, isGroup, inList, isMuted, fileUrl, selectChat, setPref, sendText, showHud, changed } from './store.js';
import { initials, peerIndex, avatarGradient } from './format.js';
import { lockNow } from './passcode.js';
import { onUpdate, shell, send } from './td.js';
import { contentSummary, userName } from './format.js';
import { playTone } from './sound.js';

onUpdate(u => {
  if (u['@type'] !== 'updateNewMessage') return;
  const m = u.message;
  if (m.is_outgoing || S.auth?.['@type'] !== 'authorizationStateReady') return;
  if (Date.now() / 1000 - m.date > 60) return; // старые сообщения при синхронизации не показываем
  const chat = S.chats.get(m.chat_id);
  if (!chat) return;
  if (S.prefs.notifyAll === false) return;
  if (isMuted(chat) && !m.contains_unread_mention) return;
  if (document.hasFocus() && (S.currentChatId === m.chat_id || S.prefs.notifyActive === false)) return;
  const text = contentSummary(m.content, id => userName(S.users.get(id)));
  const who = isGroup(chat) ? senderName(m.sender_id) : '';
  const body = S.prefs.notifyPreview === false ? 'Новое сообщение' : who ? `${who}: ${text}` : text;
  // Заблокировано код-паролем — не показываем ни имя, ни текст.
  if (S.prefs.notifySound !== false) playTone(S.prefs.notifyTone);
  if (S.locked) { show(null, 'macgram', 'Новое сообщение'); return; }
  show(chat, S.prefs.notifyName === false ? 'macgram' : chatTitle(chat), body);
});

// Всплывающее уведомление: своё окно macgram в углу экрана (по щелчку открывает чат)
// или системное уведомление Windows — смотря что выбрано в настройках.
let toastBroken = false;
function show(chat, title, body) {
  if (S.prefs.notifyStyle === 'windows' || toastBroken || !window.__TAURI__) { shell.notify(title, body).catch(() => {}); return; }
  const photo = chat && S.prefs.notifyName !== false ? fileUrl(chat.photo?.small) : '';
  const payload = { chatId: chat?.id || 0, title, body,
    initials: chat ? initials(chatTitle(chat)) : 'm', color: chat ? avatarGradient(peerIndex(chat.id)) : '', photo };
  // Если своё окно уведомления не ответило за 3 с — показываем обычное уведомление Windows.
  let done = false;
  const fallback = setTimeout(() => { if (!done) shell.notify(title, body).catch(() => {}); }, 3000);
  window.__TAURI__.core.invoke('toast_show', { payload })
    .then(() => { done = true; clearTimeout(fallback); })
    .catch(() => { done = true; clearTimeout(fallback); shell.notify(title, body).catch(() => {}); });
}

// События из трея и из окна уведомления.
if (window.__TAURI__) {
  const ev = window.__TAURI__.event;
  ev.listen('open-chat', e => { if (e.payload) selectChat(e.payload); });
  ev.listen('tray-notify', e => setPref('notifyAll', !!e.payload));
  ev.listen('tray-lock', () => lockNow());
  // Своё окно уведомления не смогло показаться — показываем уведомление Windows и дальше сразу его.
  ev.listen('toast-failed', e => { toastBroken = true; const p = e.payload || {}; shell.notify(p.title || 'macgram', p.body || '').catch(() => {}); });
  // Быстрый ответ из всплывающего уведомления, как в macOS.
  ev.listen('toast-reply', e => {
    const { chatId, text } = e.payload || {};
    if (!chatId || !text || S.locked) return;
    const saved = { reply: S.reply, editing: S.editing };
    S.reply = null; S.editing = null;
    const last = S.chats.get(chatId)?.last_message;
    if (last) send({ '@type': 'viewMessages', chat_id: chatId, message_ids: [last.id], force_read: true }).catch(() => {});
    sendText(chatId, text).then(() => showHud('Ответ отправлен')).finally(() => { if (!S.reply && !S.editing) { S.reply = saved.reply; S.editing = saved.editing; changed(); } });
  });
}

let lastBadge = -1;
function badgePng(n) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#ff3b30';
  g.beginPath(); g.arc(16, 16, 15, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff';
  g.font = `bold ${n > 99 ? 12 : n > 9 ? 16 : 19}px "Segoe UI", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(n > 99 ? '99+' : String(n), 16, 17);
  return c.toDataURL('image/png').split(',')[1];
}

export function updateBadge() {
  let n = 0;
  // Как в macOS: считать чаты или сообщения, учитывать ли чаты без звука.
  const withMuted = S.prefs.badgeMuted === true, byMessages = S.prefs.badgeMode === 'messages';
  const tdl = S.unreadChats?.main;
  if (tdl && !byMessages) { n = withMuted ? tdl.unread_count : tdl.unread_unmuted_count; }
  else
  for (const c of S.chats.values()) {
    if (!inList(c, 'main') || (!withMuted && isMuted(c))) continue;
    if (c.unread_count > 0 || c.is_marked_as_unread) n += byMessages ? Math.max(1, c.unread_count) : 1;
  }
  if (S.prefs.badge === false) n = 0;
  if (n === lastBadge) return;
  lastBadge = n;
  shell.setBadge(n ? badgePng(n) : null);
}
setInterval(updateBadge, 1500);
