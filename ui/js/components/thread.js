// Ветки комментариев к постам каналов и темы форумов — как в Telegram для macOS:
// открываются «push»-переходом поверх чата, сверху — исходный пост, внизу — поле ввода.
import { html, useRef, useEffect, useState, useLayoutEffect } from '../lib.js';
import { S, changed, chatTitle, showHud, updateHooks, isChannel, senderName } from '../store.js';
import { send } from '../td.js';
import { Icon } from '../icons.js';
import { MI } from '../mac-icons.js';
import { count, dayLabel, sameDay, contentSummary, userName } from '../format.js';
import { Avatar, Spinner, dragHandlers } from './common.js';
import { MessageRow, msgDeps, isServiceType } from './message.js';
import { Composer } from './chat.js';

// ── открыть / закрыть ──
function fresh(extra) {
  S.profile = false; S.profileClosing = false;
  S.reply = null; S.editing = null;
  return { list: [], byId: new Map(), hasMore: true, loading: true, closing: false, ...extra };
}

export async function openComments(channelChatId, post) {
  const t = S.thread = fresh({ kind: 'comments', sourceChatId: channelChatId, root: post, title: 'Комментарии', count: post.interaction_info?.reply_info?.reply_count || 0 });
  changed();
  try {
    const info = await send({ '@type': 'getMessageThread', chat_id: channelChatId, message_id: post.id });
    if (S.thread !== t) return;
    t.chatId = info.chat_id;
    t.threadId = info.message_thread_id;
    t.topic = { '@type': 'messageTopicThread', message_thread_id: info.message_thread_id };
    t.count = info.reply_info?.reply_count ?? t.count;
    t.readUpTo = info.reply_info?.last_read_inbox_message_id || 0;
    await loadThread();
  } catch (e) {
    if (S.thread === t) { showHud(e.message || 'Комментарии недоступны'); closeThread(true); }
  }
}

export async function openTopic(chat, topic) {
  const info = topic.info;
  const t = S.thread = fresh({
    kind: 'topic', chatId: chat.id, topicId: info.forum_topic_id, title: info.name, icon: info.icon, general: info.is_general, closed: info.is_closed,
    topic: { '@type': 'messageTopicForum', forum_topic_id: info.forum_topic_id }, readUpTo: topic.last_read_inbox_message_id || 0,
  });
  changed();
  await loadThread();
  if (S.thread === t && topic.unread_mention_count) send({ '@type': 'readAllForumTopicMentions', chat_id: chat.id, forum_topic_id: info.forum_topic_id }).catch(() => {});
}

export function closeThread(now = false) {
  const t = S.thread;
  if (!t || t.closing) return;
  if (now || S.prefs.glass === false) { S.thread = null; changed(); return; }
  t.closing = true; changed();
  setTimeout(() => { if (S.thread === t) { S.thread = null; changed(); } }, 380);
}

// ── история ветки ──
function put(m) {
  const t = S.thread;
  if (!t || (t.kind === 'comments' && m.id === t.threadId)) return false;
  const had = t.byId.has(m.id);
  t.byId.set(m.id, m);
  t.list = had ? t.list.map(x => (x.id === m.id ? m : x)) : [...t.list, m].sort((a, b) => a.id - b.id);
  return true;
}

export async function loadThread(older = false) {
  const t = S.thread;
  if (!t || !t.chatId || (older && (!t.hasMore || t.loading && t.list.length))) return;
  t.loading = true; changed();
  try {
    const from = older && t.list.length ? t.list[0].id : 0;
    const r = t.kind === 'comments'
      ? await send({ '@type': 'getMessageThreadHistory', chat_id: t.chatId, message_id: t.threadId, from_message_id: from, offset: 0, limit: 50 })
      : await send({ '@type': 'getForumTopicHistory', chat_id: t.chatId, forum_topic_id: t.topicId, from_message_id: from, offset: 0, limit: 50 });
    if (S.thread !== t) return;
    const msgs = (r.messages || []).filter(m => !t.byId.has(m.id));
    if (!msgs.length) t.hasMore = false;
    for (const m of msgs) put(m);
  } catch (e) {
    console.warn('thread', e);
    if (S.thread === t) t.hasMore = false;
  } finally {
    if (S.thread === t) { t.loading = false; changed(); markThreadRead(); }
  }
}

let readTimer;
function markThreadRead() {
  clearTimeout(readTimer);
  readTimer = setTimeout(() => {
    const t = S.thread;
    if (!t || !t.chatId || document.hidden || !t.list.length) return;
    const last = t.list[t.list.length - 1].id;
    if (last <= (t.readUpTo || 0)) return;
    t.readUpTo = last;
    send({ '@type': 'viewMessages', chat_id: t.chatId, message_ids: t.list.slice(-50).map(m => m.id),
      source: { '@type': t.kind === 'comments' ? 'messageSourceMessageThreadHistory' : 'messageSourceForumTopicHistory' }, force_read: true }).catch(() => {});
  }, 300);
}

const belongs = m => {
  const t = S.thread;
  if (!t || !t.chatId || t.closing || m.chat_id !== t.chatId) return false;
  const tp = m.topic_id;
  if (t.kind === 'comments') return (tp?.['@type'] === 'messageTopicThread' && tp.message_thread_id === t.threadId) || m.message_thread_id === t.threadId;
  return tp?.['@type'] === 'messageTopicForum' && tp.forum_topic_id === t.topicId;
};

// Новые, изменённые и удалённые сообщения ветки приходят обычными обновлениями TDLib.
updateHooks.add(u => {
  const t = S.thread;
  if (!t) return false;
  const patch = (chatId, id, fn) => {
    if (t.root && chatId === t.sourceChatId && id === t.root.id) { t.root = fn(t.root); return true; }
    if (chatId !== t.chatId || !t.byId.has(id)) return false;
    return put(fn(t.byId.get(id)));
  };
  switch (u['@type']) {
    case 'updateNewMessage':
      if (!belongs(u.message)) return false;
      if (!t.byId.has(u.message.id)) { S.fresh.add(u.message.id); if (t.kind === 'comments') t.count++; }
      put(u.message); markThreadRead();
      return true;
    case 'updateMessageSendSucceeded': case 'updateMessageSendFailed':
      if (u.message.chat_id !== t.chatId || !t.byId.has(u.old_message_id)) return false;
      t.byId.delete(u.old_message_id); t.list = t.list.filter(x => x.id !== u.old_message_id);
      return put(u.message);
    case 'updateMessageContent': return patch(u.chat_id, u.message_id, m => ({ ...m, content: u.new_content }));
    case 'updateMessageEdited': return patch(u.chat_id, u.message_id, m => ({ ...m, edit_date: u.edit_date, reply_markup: u.reply_markup }));
    case 'updateMessageInteractionInfo': {
      const r = patch(u.chat_id, u.message_id, m => ({ ...m, interaction_info: u.interaction_info }));
      if (r && t.root && u.message_id === t.root.id && u.chat_id === t.sourceChatId) t.count = u.interaction_info?.reply_info?.reply_count ?? t.count;
      return r;
    }
    case 'updateDeleteMessages':
      if (u.chat_id !== t.chatId || u.from_cache) return false;
      for (const id of u.message_ids) t.byId.delete(id);
      t.list = t.list.filter(x => !u.message_ids.includes(x.id));
      return true;
    case 'updateForumTopicInfo':
      if (t.kind !== 'topic' || u.info.chat_id !== t.chatId || u.info.forum_topic_id !== t.topicId) return false;
      t.title = u.info.name; t.icon = u.info.icon; t.closed = u.info.is_closed;
      return true;
    default: return false;
  }
});

// ── экран ветки ──
export function TopicIcon({ icon, general, size = 22 }) {
  if (general) return html`<span class="topic-ic general" style=${`width:${size}px;height:${size}px;font-size:${Math.round(size * 0.72)}px`}>#</span>`;
  const c = `#${((icon?.color ?? 0x6fb9f0) >>> 0 & 0xffffff).toString(16).padStart(6, '0')}`;
  return html`<svg class="topic-ic" width=${size} height=${size} viewBox="0 0 24 24"><defs><linearGradient id=${`tg${c.slice(1)}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color=${c} stop-opacity=".75"/><stop offset="1" stop-color=${c}/></linearGradient></defs>
    <path d="M12 2.5c5.5 0 9.5 3.8 9.5 8.6 0 4.8-4 8.6-9.5 8.6-1 0-2-.1-2.9-.4L4.6 21.5l1.1-3.8C3.7 16.1 2.5 13.7 2.5 11.1 2.5 6.3 6.5 2.5 12 2.5z" fill=${`url(#tg${c.slice(1)})`}/></svg>`;
}

export function ThreadScreen() {
  const t = S.thread;
  const chat = t?.chatId ? S.chats.get(t.chatId) : null;
  const ref = useRef();
  const [atBottom, setAtBottom] = useState(true);
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape' && !S.menu && !S.modal && !S.viewer && !S.reply && !S.editing) { e.stopImmediatePropagation(); closeThread(); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, []);
  if (!t) return null;
  const onScroll = () => {
    const el = ref.current; if (!el) return;
    if (el.scrollHeight - el.clientHeight + el.scrollTop < 600) loadThread(true);
    const b = el.scrollTop > -150;
    if (b !== atBottom) setAtBottom(b);
  };
  const source = t.sourceChatId ? S.chats.get(t.sourceChatId) : null;
  const list = t.list;
  const same = (a, b) => a && b && !isServiceType(a.content) && !isServiceType(b.content) && sameDay(a.date, b.date)
    && JSON.stringify(a.sender_id) === JSON.stringify(b.sender_id) && Math.abs(a.date - b.date) < 300;
  const days = [];
  list.forEach((m, i) => {
    const prev = list[i - 1], next = list[i + 1];
    if (!prev || !sameDay(prev.date, m.date)) days.push({ key: `d${new Date(m.date * 1000).toDateString()}`, date: m.date, rows: [] });
    days[days.length - 1].rows.push(html`<${MessageRow} key=${m.id} msg=${m} chat=${chat} first=${!same(prev, m)} last=${!same(m, next)}
      dep=${msgDeps(m)} sender=${S.users.get(m.sender_id?.user_id)} readOut=${false} cid=${t.chatId}/>`);
  });
  const sub = t.kind === 'comments' ? (t.count ? count(t.count, 'комментарий', 'комментария', 'комментариев') : 'Нет комментариев')
    : t.closed ? 'тема закрыта' : chat ? chatTitle(chat) : '';
  const canWrite = chat && !(t.kind === 'topic' && t.closed) && chat.permissions?.can_send_basic_messages !== false;
  return html`<div class="chat thread-screen bars-0">
    <div class="messages" ref=${ref} onScroll=${onScroll}>
      <div class="messages-inner">
        ${t.root && source && html`<div class="thread-root">
          <${MessageRow} key=${`root${t.root.id}`} msg=${t.root} chat=${source} first=${true} last=${true} dep=${msgDeps(t.root)} cid=${source.id} inThread=${true}/>
          <div class="thread-start"><span class="service-pill">${t.count ? 'Начало обсуждения' : 'Комментариев пока нет — напишите первым'}</span></div>
        </div>`}
        ${t.loading && !list.length && html`<div class="loader-top"><span class="service-pill"><${Spinner}/></span></div>`}
        ${!t.loading && !list.length && !t.root && html`<div class="main-empty" style="padding:40px"><span class="service-pill">Сообщений пока нет</span></div>`}
        ${days.map(d => html`<section class="day" key=${d.key}><div class="date-sep"><span>${dayLabel(d.date)}</span></div>${d.rows}</section>`)}
      </div>
    </div>
    <div class="chat-top" ...${dragHandlers()}>
      <button class="glass circle no-drag" title="Назад (Esc)" onClick=${() => closeThread()}>${Icon.back(16)}</button>
      <header class="chat-header glass no-drag thread-head">
        ${t.kind === 'topic' ? html`<${TopicIcon} icon=${t.icon} general=${t.general} size=${30}/>` : html`<span class="thread-head-ic">${MI('Icon_ChannelComments', 20)}</span>`}
        <div class="titles">
          <div class="title">${t.title}${t.closed && MI('Icon_Forum_ClosedTopic', 11)}</div>
          <div class="status">${sub}</div>
        </div>
      </header>
    </div>
    <button class=${`glass circle scroll-down ${atBottom ? '' : 'show'}`} title="Вниз" onClick=${() => ref.current?.scrollTo({ top: 0, behavior: 'smooth' })}>${Icon.menu('Icon_SearchArrow')}</button>
    ${canWrite ? html`<${Composer} chat=${chat} topic=${t.topic} key=${`tc${t.chatId}:${t.threadId || t.topicId}`}
        onSent=${m => { if (S.thread === t) { put(m); changed(); ref.current?.scrollTo({ top: 0 }); } }}/>`
      : html`<div class="composer-wrap"><div class="glass readonly-bar">${t.closed ? 'Тема закрыта' : t.chatId ? 'Нельзя писать в этот чат' : html`<${Spinner}/>`}</div></div>`}
  </div>`;
}

// ── кнопка «Комментарии» под постом канала (ChannelCommentsControl в macOS) ──
export function CommentsBar({ msg, chat }) {
  const ri = msg.interaction_info?.reply_info;
  if (!ri) return null;
  const n = ri.reply_count || 0;
  const peers = (ri.recent_replier_ids || []).slice(0, 3);
  const unread = n > 0 && ri.last_message_id > (ri.last_read_inbox_message_id || 0);
  return html`<button class="comments-bar" onClick=${e => { e.stopPropagation(); openComments(chat.id, msg); }}>
    ${peers.length ? html`<span class="cb-avatars">${peers.map(p => html`<span class="cb-av"><${Avatar} user=${p.user_id ? S.users.get(p.user_id) : null} chat=${p.chat_id ? S.chats.get(p.chat_id) : null} size=${22}/></span>`)}</span>`
      : html`<span class="cb-ic">${MI('Icon_ChannelComments', 18)}</span>`}
    <span class="cb-text">${n ? count(n, 'комментарий', 'комментария', 'комментариев') : 'Оставить комментарий'}</span>
    ${unread && html`<i class="cb-dot"/>`}
    <span class="cb-next">${MI('Icon_ChannelComments_Next', 15)}</span>
  </button>`;
}

// ── список тем форума ──
const topicsCache = new Map(); // chatId -> { list, loading, ver }
async function loadTopics(chatId) {
  const c = topicsCache.get(chatId) || { list: null, loading: false };
  topicsCache.set(chatId, c);
  if (c.loading) return;
  c.loading = true;
  try {
    const r = await send({ '@type': 'getForumTopics', chat_id: chatId, query: '', offset_date: 0, offset_message_id: 0, offset_forum_topic_id: 0, limit: 100 });
    c.list = r.topics || [];
  } catch (e) { if (!c.list) c.list = []; showHud(e.message || 'Не удалось загрузить темы'); }
  c.loading = false; changed();
}
let topicsTimer;
updateHooks.add(u => {
  const id = u['@type'] === 'updateNewMessage' ? u.message.chat_id : u['@type'] === 'updateForumTopicInfo' ? u.info.chat_id : u['@type'] === 'updateForumTopic' ? u.chat_id : null;
  if (id == null || !topicsCache.has(id)) return false;
  clearTimeout(topicsTimer);
  topicsTimer = setTimeout(() => loadTopics(id), 400);
  return false;
});

export const isForum = chat => chat?.type?.['@type'] === 'chatTypeSupergroup' && !!S.supergroups.get(chat.type.supergroup_id)?.is_forum;

export function ForumTopics({ chat, onAsChat, onProfile }) {
  const c = topicsCache.get(chat.id);
  useEffect(() => { loadTopics(chat.id); }, [chat.id]);
  const list = c?.list;
  const [q, setQ] = useState('');
  const shown = (list || []).filter(x => !x.info.is_hidden || x.info.is_general).filter(x => !q || x.info.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.is_pinned - a.is_pinned) || (Number(b.order || 0) - Number(a.order || 0)) || ((b.last_message?.date || 0) - (a.last_message?.date || 0)));
  const sg = S.supergroups.get(chat.type.supergroup_id);
  const time = d => { if (!d) return ''; const x = new Date(d * 1000); return sameDay(d, Date.now() / 1000) ? x.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : x.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); };
  return html`<div class="chat forum-screen">
    <div class="forum-list">
      <label class="search forum-search">${Icon.search()}<input placeholder="Поиск тем" value=${q} onInput=${e => setQ(e.target.value)}/></label>
      ${!list && html`<div class="empty" style="padding:30px;display:grid;place-items:center"><${Spinner}/></div>`}
      ${list && !shown.length && html`<div class="main-empty" style="padding:40px"><span class="service-pill">${q ? 'Ничего не найдено' : 'Тем пока нет'}</span></div>`}
      ${shown.length > 0 && html`<div class="forum-card">${shown.map(tp => {
        const m = tp.last_message;
        const who = m && !m.is_outgoing ? senderName(m.sender_id) : m?.is_outgoing ? 'Вы' : '';
        return html`<button class=${`topic-row ${S.thread?.topicId === tp.info.forum_topic_id ? 'on' : ''}`} key=${tp.info.forum_topic_id} onClick=${() => openTopic(chat, tp)}>
          <${TopicIcon} icon=${tp.info.icon} general=${tp.info.is_general} size=${30}/>
          <div class="body">
            <div class="line"><div class="name"><span>${tp.info.name}</span>${tp.info.is_closed && MI('Icon_Forum_ClosedTopic', 11)}</div><div class="time">${time(m?.date)}</div></div>
            <div class="line"><div class="preview">${who && html`<span class="who">${who}: </span>`}${m ? contentSummary(m.content, id => userName(S.users.get(id))) : ''}</div>
              ${tp.unread_mention_count > 0 && html`<span class="badge mention">@</span>`}
              ${tp.unread_count > 0 && html`<span class="badge">${tp.unread_count}</span>`}${tp.is_pinned && !tp.unread_count && Icon.pin(14)}</div>
          </div>
        </button>`;
      })}</div>`}
    </div>
    <div class="chat-top" ...${dragHandlers()}>
      <header class="chat-header glass no-drag" onClick=${onProfile}>
        <${Avatar} chat=${chat} size=${34}/>
        <div class="titles"><div class="title">${chatTitle(chat)}</div>
          <div class="status">${list ? count(list.length, 'тема', 'темы', 'тем') : 'темы'}${sg?.member_count ? ` · ${count(sg.member_count, 'участник', 'участника', 'участников')}` : ''}</div></div>
      </header>
      <button class="glass circle no-drag" title="Показать как сообщения" onClick=${onAsChat}>${MI('Icon_Profile_Topics', 22) || Icon.chats(20)}</button>
    </div>
  </div>`;
}
