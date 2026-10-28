// Память: macgram не ограничивает себя — недавние чаты держатся в памяти целиком, чтобы
// переключение между ними было мгновенным. Убираем только то, что давно не нужно:
//  • чаты, которые не открывали больше 30 минут, — до последних 200 сообщений (остальное мгновенно
//    подгрузится из локальной базы TDLib);
//  • окно скрыто дольше 20 минут — сбрасываем кэши анимаций стикеров.
import { S } from './store.js';
import { dropTgsCaches } from './components/tgs.js';
import { send } from './td.js';

const KEEP = 200;
const lastSeen = new Map(); // chatId -> время последнего открытия

function trimHistories(aggressive) {
  const now = Date.now();
  for (const [chatId, h] of S.history) {
    if (chatId === S.currentChatId || h.loading) continue;
    if (now - (lastSeen.get(chatId) || 0) < (aggressive ? 10 : 30) * 60000) continue;
    if (h.list.length <= KEEP) continue;
    const drop = h.list.slice(0, h.list.length - KEEP);
    for (const m of drop) h.byId.delete(m.id);
    h.list = h.list.slice(-KEEP);
    h.hasMore = true;
  }
  // Файлы, которые не скачаны и не качаются, держать в памяти незачем — их пришлёт TDLib снова.
  if (aggressive && S.files.size > 20000) {
    for (const [id, f] of S.files) if (!f.local?.is_downloading_active && !f.local?.is_downloading_completed) S.files.delete(id);
  }
}

let prevChat = null;
setInterval(() => {
  if (S.currentChatId !== prevChat) { if (prevChat) lastSeen.set(prevChat, Date.now()); prevChat = S.currentChatId; }
}, 2000);
setInterval(() => trimHistories(false), 10 * 60000);

let hideTimer = null;
document.addEventListener('visibilitychange', () => {
  clearTimeout(hideTimer);
  if (document.hidden) hideTimer = setTimeout(() => { trimHistories(true); dropTgsCaches(); }, 20 * 60000);
});

// «Удалять файлы, которые не открывали» (Данные и память): уборка кэша TDLib раз в сутки.
function autoClean() {
  const days = S.prefs.cacheTtl || 0;
  if (!days || S.auth?.['@type'] !== 'authorizationStateReady') return;
  send({ '@type': 'optimizeStorage', size: -1, ttl: days * 86400, count: -1, immunity_delay: -1, file_types: [], chat_ids: [], exclude_chat_ids: [], return_deleted_file_statistics: false, chat_limit: 0 }).catch(() => {});
}
setTimeout(autoClean, 60000);
setInterval(autoClean, 24 * 3600e3);
