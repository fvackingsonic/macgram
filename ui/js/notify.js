// Уведомления Windows и счётчик непрочитанных на значке в панели задач.
import { S, chatTitle, senderName, isGroup, inList, isMuted } from './store.js';
import { onUpdate, shell } from './td.js';
import { contentSummary, userName } from './format.js';

onUpdate(u => {
  if (u['@type'] !== 'updateNewMessage') return;
  const m = u.message;
  if (m.is_outgoing || S.auth?.['@type'] !== 'authorizationStateReady') return;
  if (Date.now() / 1000 - m.date > 60) return; // старые сообщения при синхронизации не показываем
  const chat = S.chats.get(m.chat_id);
  if (!chat) return;
  if (isMuted(chat) && !m.contains_unread_mention) return;
  if (document.hasFocus() && (S.currentChatId === m.chat_id || S.prefs.notifyActive === false)) return;
  const text = contentSummary(m.content, id => userName(S.users.get(id)));
  const who = isGroup(chat) ? senderName(m.sender_id) : '';
  const body = S.prefs.notifyPreview === false ? 'Новое сообщение' : who ? `${who}: ${text}` : text;
  // Заблокировано код-паролем — не показываем ни имя, ни текст.
  if (S.locked) { shell.notify('macgram', 'Новое сообщение'); return; }
  shell.notify(S.prefs.notifyName === false ? 'macgram' : chatTitle(chat), body);
});

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
