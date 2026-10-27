// Открытие ссылок как в Telegram для macOS:
//  • t.me/username, t.me/username/123, t.me/+hash, tg://resolve — открываются прямо в приложении;
//  • ссылка, у которой видимый текст не совпадает с адресом, — сначала спрашиваем (защита от подмены);
//  • остальное — в браузере, только http(s) и mailto.
import { html } from './lib.js';
import { S, changed, openModal, closeModal, showHud, selectChat, jumpTo } from './store.js';
import { send, shell } from './td.js';

const SAFE = /^(https?:|mailto:)/i;

function parseTg(url) {
  let u;
  try { u = new URL(url.startsWith('tg:') ? url.replace(/^tg:\/\//, 'tg://x/') : url); } catch { return null; }
  if (url.startsWith('tg:')) {
    const p = Object.fromEntries(new URLSearchParams(u.search));
    if (url.includes('resolve') && p.domain) return { username: p.domain, post: Number(p.post) || 0 };
    if (url.includes('join') && p.invite) return { invite: url };
    return null;
  }
  if (!/^(www\.)?(t\.me|telegram\.me|telegram\.dog)$/i.test(u.hostname)) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (!parts.length) return null;
  if (parts[0].startsWith('+') || parts[0] === 'joinchat') return { invite: url };
  if (parts[0] === 'c' || parts[0] === 's' || parts[0].includes('.')) return null;
  return { username: parts[0], post: Number(parts[1]) || 0 };
}

async function openInternal(t) {
  try {
    if (t.invite) {
      const info = await send({ '@type': 'checkChatInviteLink', invite_link: t.invite });
      if (info.chat_id) { selectChat(info.chat_id); return; }
      openModal({
        title: info.title || 'Приглашение',
        text: `${info.member_count ? `${info.member_count} участников. ` : ''}Вступить?`,
        buttons: [
          { label: 'Вступить', action: async () => { closeModal(); try { const c = await send({ '@type': 'joinChatByInviteLink', invite_link: t.invite }); selectChat(c.id); } catch (e) { showHud(e.message); } } },
          { label: 'Отмена', kind: 'second', action: closeModal },
        ],
      });
      return;
    }
    const chat = await send({ '@type': 'searchPublicChat', username: t.username });
    await selectChat(chat.id);
    if (t.post) setTimeout(() => jumpTo(chat.id, t.post * 1048576), 300);
  } catch (e) { showHud(e.message?.includes('USERNAME') ? 'Такого пользователя или канала нет' : (e.message || 'Не удалось открыть ссылку')); }
}

export function openLink(url, shownText = '') {
  if (!url) return;
  const tg = parseTg(url);
  if (tg) { openInternal(tg); return; }
  if (!SAFE.test(url)) { showHud('Такие ссылки не открываются из соображений безопасности'); return; }
  const norm = s => String(s || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '').toLowerCase();
  const hidden = shownText && norm(shownText) !== norm(url);
  if (!hidden) { shell.openUrl(url); return; }
  openModal({
    title: 'Открыть ссылку?',
    body: html`<p class="link-check">${url}</p>`,
    buttons: [
      { label: 'Открыть', action: () => { closeModal(); shell.openUrl(url); } },
      { label: 'Отмена', kind: 'second', action: closeModal },
    ],
  });
}
