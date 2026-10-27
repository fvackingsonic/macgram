import { html, useRef, useEffect, useState, useLayoutEffect } from '../lib.js';
import {
  S, changed, loadHistory, loadNewer, resetToLatest, jumpTo, sendText, selectChat, isMuted, chatTitle, chatUser, isSaved, isGroup, isChannel, typingText, senderName,
  openMenu, showHud, markRead,
} from '../store.js';
import { send } from '../td.js';
import { Icon } from '../icons.js';
import { userStatus, count, dayLabel, sameDay, contentSummary, userName } from '../format.js';
import { Avatar, Spinner, TypingDots, dragHandlers } from './common.js';
import { MessageRow, AlbumRow, canReply, focusComposer, isServiceType } from './message.js';
import { ProfileScreen } from './profile.js';
import { pickAndSend, pasteImage } from './attach.js';
import { MediaPanel } from './media-panel.js';
import { SelectionBar } from './forward.js';
import { startRecording, finishRecording, cancelRecording } from '../voice.js';
import { player, progress } from '../player.js';
import { duration } from '../format.js';

export function Main() {
  const chat = S.chats.get(S.currentChatId);
  if (!chat) return html`<main class="main"><div class="main-drag" ...${dragHandlers()}/>
    <div class="main-empty"><span class="service-pill">Выберите, кому хотели бы написать</span></div></main>`;
  return html`<main class="main">
    ${S.profile ? html`<${ProfileScreen} key=${`p${chat.id}`} chat=${chat}/>` : html`<${Chat} key=${chat.id} chat=${chat}/>`}
  </main>`;
}

function status(chat) {
  const typing = typingText(chat.id);
  if (typing) return { text: html`<${TypingDots}/>${typing}`, cls: 'typing' };
  if (isSaved(chat)) return { text: '' };
  const user = chatUser(chat);
  if (user) {
    const t = userStatus(user);
    return { text: t, cls: t === 'в сети' ? 'online' : '' };
  }
  if (chat.type['@type'] === 'chatTypeBasicGroup') {
    const g = S.basicGroups.get(chat.type.basic_group_id);
    return { text: g ? count(g.member_count, 'участник', 'участника', 'участников') : '' };
  }
  if (chat.type['@type'] === 'chatTypeSupergroup') {
    const g = S.supergroups.get(chat.type.supergroup_id);
    if (!g?.member_count) return { text: chat.type.is_channel ? 'канал' : 'группа' };
    return { text: chat.type.is_channel ? count(g.member_count, 'подписчик', 'подписчика', 'подписчиков') : count(g.member_count, 'участник', 'участника', 'участников') };
  }
  return { text: '' };
}

function Chat({ chat }) {
  const st = status(chat);
  const muted = isMuted(chat);
  const toggleMute = () => send({ '@type': 'setChatNotificationSettings', chat_id: chat.id, notification_settings: { ...(chat.notification_settings || {}), '@type': 'chatNotificationSettings', use_default_mute_for: false, mute_for: muted ? 0 : 2147483647 } })
    .then(() => showHud(muted ? 'Уведомления включены' : 'Уведомления выключены')).catch(e => showHud(e.message));
  const more = e => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(r.right - 200, r.bottom + 4, [
      { label: muted ? 'Включить уведомления' : 'Выключить уведомления', icon: Icon.menu(muted ? 'menu_unmuted' : 'menu_mute'), action: toggleMute },
      { label: 'Обновить историю', icon: Icon.menu('menu_select_all'), action: () => { S.history.delete(chat.id); loadHistory(chat.id); } },
    ]);
  };
  const openProfile = () => { S.profile = true; changed(); };
  const pinned = S.pinned.get(chat.id);
  const bars = (pinned?.list?.length ? 1 : 0) + (S.player ? 1 : 0);
  return html`<div class=${`chat bars-${bars}`}>
    <${Messages} chat=${chat}/>
    ${S.chatSearch?.chatId === chat.id ? html`<${ChatSearch} chat=${chat}/>` : html`<div class="chat-top" ...${dragHandlers()}>
      <header class="chat-header glass no-drag" onClick=${openProfile}>
        <${Avatar} chat=${chat} size=${34}/>
        <div class="titles">
          <div class="title">${chatTitle(chat)}${muted && html`<span style="color:var(--gray-icon)">${Icon.muted()}</span>`}</div>
          ${st.text && html`<div class=${`status ${st.cls || ''}`}>${st.text}</div>`}
        </div>
      </header>
      <button class="glass circle" title="Поиск (Ctrl+F)" onClick=${() => { S.chatSearch = { chatId: chat.id, q: '', results: [], index: -1, total: 0 }; changed(); }}>${Icon.menu('Icon_SearchChatMessages')}</button>
      <button class="glass circle" title="Ещё" onClick=${more}>${Icon.more()}</button>
    </div>`}
    <div class="top-bars">
      <${PinnedBar} chat=${chat}/>
      <${PlayerBar}/>
    </div>
    ${S.selection?.chatId === chat.id ? html`<${SelectionBar} chat=${chat}/>` : canReply(chat) ? html`<${Composer} chat=${chat}/>` : html`<div class="composer-wrap"><button class="glass readonly-bar" onClick=${toggleMute}>${muted ? 'Включить звук' : 'Выключить звук'}</button></div>`}
  </div>`;
}

function Messages({ chat }) {
  const ref = useRef();
  const h = S.history.get(chat.id);
  const list = h?.list || [];
  const [atBottom, setAtBottom] = useState(true);
  const onScroll = () => {
    const el = ref.current; if (!el) return;
    // column-reverse: scrollTop отрицательный, 0 — у самого низа
    if (el.scrollHeight - el.clientHeight + el.scrollTop < 600) loadHistory(chat.id, true);
    if (el.scrollTop > -400 && h?.hasNewer) loadNewer(chat.id);
    const bottom = el.scrollTop > -150;
    if (bottom !== atBottom) setAtBottom(bottom);
    if (bottom) markRead(chat.id);
  };
  useEffect(() => { onScroll(); }, [list.length]);
  const toBottom = async () => {
    if (h?.hasNewer) { await resetToLatest(chat.id); }
    ref.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Сообщения одного альбома (media_album_id) показываем одной сеткой.
  const units = [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    const album = m.media_album_id && m.media_album_id !== '0' ? m.media_album_id : null;
    const last = units[units.length - 1];
    if (album && last?.album === album) last.msgs.push(m);
    else units.push({ album, msgs: [m] });
  }
  const head = u => u.msgs[0], tail = u => u.msgs[u.msgs.length - 1];
  const same = (a, b) => a && b && !isServiceType(a.content) && !isServiceType(b.content) && sameDay(a.date, b.date)
    && JSON.stringify(a.sender_id) === JSON.stringify(b.sender_id) && Math.abs(a.date - b.date) < 300 && a.is_outgoing === b.is_outgoing;
  const mark = S.unreadMark.get(chat.id);
  let sepDone = !mark;
  const days = [];
  for (let i = 0; i < units.length; i++) {
    const u = units[i], prev = units[i - 1], next = units[i + 1];
    const m = head(u);
    if (!prev || !sameDay(tail(prev).date, m.date)) days.push({ key: `d${m.id}`, date: m.date, rows: [] });
    const rows = days[days.length - 1].rows;
    if (!sepDone && m.id > mark && !m.is_outgoing) { sepDone = true; rows.push(html`<div class="unread-sep" key="unread"><span>Непрочитанные сообщения</span></div>`); }
    const first = !same(prev && tail(prev), m), lastInGroup = !same(tail(u), next && head(next));
    rows.push(u.album && u.msgs.length > 1
      ? html`<${AlbumRow} key=${`a${u.album}`} msgs=${u.msgs} chat=${chat} first=${first} last=${lastInGroup}/>`
      : html`<${MessageRow} key=${m.id} msg=${m} chat=${chat} first=${first} last=${lastInGroup}/>`);
  }
  const items = days.map(d => html`<section class="day" key=${d.key}>
    <div class="date-sep"><span>${dayLabel(d.date)}</span></div>${d.rows}</section>`);
  const showDown = !atBottom || h?.hasNewer;
  return html`
    <div class="messages" ref=${ref} onScroll=${onScroll}>
      <div class="messages-inner">
        ${h?.loading && !list.length && html`<div class="loader-top" style="color:var(--service-text)"><span class="service-pill"><${Spinner}/></span></div>`}
        ${!h?.loading && !list.length && html`<div class="main-empty" style="padding:40px"><span class="service-pill">Сообщений пока нет</span></div>`}
        ${items}
      </div>
    </div>
    <button class=${`glass circle scroll-down ${showDown ? 'show' : ''}`} title="К последним сообщениям" onClick=${toBottom}>
      ${Icon.menu('Icon_SearchArrow')}
      ${chat.unread_count > 0 && html`<span class="badge">${chat.unread_count > 999 ? '999+' : chat.unread_count}</span>`}
    </button>`;
}

const drafts = new Map();

function Composer({ chat }) {
  const ref = useRef();
  const [text, setText] = useState(drafts.get(chat.id) || '');
  const [panel, setPanel] = useState(false);
  const insertEmoji = e => {
    const el = ref.current; if (!el) return;
    const a = el.selectionStart ?? text.length, b = el.selectionEnd ?? text.length;
    const v = text.slice(0, a) + e + text.slice(b);
    setText(v);
    setTimeout(() => { el.focus(); el.setSelectionRange(a + e.length, a + e.length); }, 0);
  };
  const resize = () => { const el = ref.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(200, el.scrollHeight)}px`; };
  useLayoutEffect(resize, [text]);
  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => () => { drafts.set(chat.id, ref.current?.value || ''); }, []);

  const lastTyping = useRef(0);
  const onInput = e => {
    setText(e.target.value);
    const now = Date.now();
    if (e.target.value && now - lastTyping.current > 4000) {
      lastTyping.current = now;
      send({ '@type': 'sendChatAction', chat_id: chat.id, message_thread_id: 0, action: { '@type': 'chatActionTyping' } }).catch(() => {});
    }
  };
  const onPaste = e => {
    const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    files.forEach(f => pasteImage(f).catch(err => showHud(String(err))));
  };
  const submit = () => {
    if (!text.trim()) return;
    sendText(chat.id, text);
    setText(''); drafts.delete(chat.id);
  };
  const wrapSel = mark => {
    const el = ref.current; if (!el) return;
    const a = el.selectionStart, b = el.selectionEnd;
    if (a === b) return;
    const v = text.slice(0, a) + mark + text.slice(a, b) + mark + text.slice(b);
    setText(v);
    setTimeout(() => { el.focus(); el.setSelectionRange(a + mark.length, b + mark.length); }, 0);
  };
  const onKey = e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const marks = { KeyB: '**', KeyI: '__', KeyU: '__', KeyM: '`', KeyP: '||' };
      if (e.shiftKey && e.code === 'KeyX') { e.preventDefault(); wrapSel('~~'); return; }
      if (marks[e.code] && !e.shiftKey) { e.preventDefault(); wrapSel(marks[e.code]); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    else if (e.key === 'Escape' && (S.reply || S.editing)) {
      if (S.editing) setText('');
      S.reply = null; S.editing = null; changed();
    } else if (e.key === 'ArrowUp' && !text) {
      const mine = [...(S.history.get(chat.id)?.list || [])].reverse().find(m => m.is_outgoing && m.content['@type'] === 'messageText');
      if (mine) { e.preventDefault(); S.editing = mine; S.reply = null; changed(); setText(mine.content.text.text); focusComposer(); }
    }
  };
  const bar = S.editing ? { title: 'Редактирование', text: contentSummary(S.editing.content), icon: Icon.menu('Icon_ChatAction_EditMessage') }
    : S.reply ? { title: `Ответ ${senderName(S.reply.sender_id) || chatTitle(chat)}`, text: contentSummary(S.reply.content, id => userName(S.users.get(id))), icon: Icon.menu('Icon_ChatAction_ReplyMessage') } : null;
  const ready = !!text.trim();
  const soon = what => () => showHud(`${what} — в следующем обновлении`);
  const rec = S.recording?.chatId === chat.id ? S.recording : null;
  useEffect(() => {
    if (!rec) return;
    const k = e => { if (e.key === 'Escape') { e.stopPropagation(); cancelRecording(); } if (e.key === 'Enter') { e.preventDefault(); finishRecording(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [!!rec]);
  if (rec) {
    const t = rec.time;
    return html`<div class="composer-wrap">
      <button class="glass circle" title="Отменить" onClick=${cancelRecording}>${Icon.trash(20)}</button>
      <div class="composer glass recording">
        <span class="rec-dot" style=${`transform:scale(${1 + Math.min(1, rec.level * 4) * 0.6})`}/>
        <span class="rec-time">${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')},${Math.floor((t * 10) % 10)}</span>
        <span class="rec-hint">Esc — отмена, Enter — отправить</span>
      </div>
      <button class="glass circle send-btn ready rec-send" title="Отправить" onClick=${finishRecording}><span>${Icon.send(22)}</span></button>
    </div>`;
  }
  return html`<div class="composer-wrap">
    ${panel && html`<${MediaPanel} chatId=${chat.id} onEmoji=${insertEmoji} onClose=${() => setPanel(false)}/>`}
    <button class="glass circle" title="Прикрепить файл" onClick=${() => pickAndSend(false)}>${Icon.attach()}</button>
    <div class="composer glass">
      ${bar && html`<div class="compose-bar" key=${S.editing?.id || S.reply?.id}>
        <span style="color:var(--accent)">${bar.icon}</span>
        <div class="bar-body"><div class="bar-title">${bar.title}</div><div class="bar-text">${bar.text}</div></div>
        <button class="icon-btn gray" onClick=${() => { if (S.editing) setText(''); S.reply = null; S.editing = null; changed(); }}>${Icon.menu('Icon_ChatAction_Close')}</button>
      </div>`}
      <div class="compose-row">
        <textarea ref=${ref} class="compose-input" rows="1" placeholder=${isChannel(chat) ? 'Публикация…' : 'Сообщение'} value=${text}
          onInput=${onInput} onKeyDown=${onKey} onPaste=${onPaste}/>
        <button class=${`icon-btn emoji-btn ${panel ? 'active' : ''}`} title="Эмодзи и стикеры" onClick=${() => setPanel(!panel)}>${Icon.smile()}</button>
      </div>
    </div>
    <button class=${`glass circle send-btn ${ready ? 'ready' : ''}`} title=${ready ? 'Отправить' : 'Голосовое сообщение'} onClick=${ready ? submit : () => startRecording(chat.id)}>
      <span class=${ready ? 'hide' : ''}>${Icon.mic()}</span>
      <span class=${ready ? '' : 'hide'}>${Icon.send(22)}</span>
    </button>
  </div>`;
}

// Полоска плеера под шапкой чата (как в macOS).
const RATES = [1, 1.5, 2];
function PlayerBar() {
  const p = S.player;
  if (!p) return null;
  const owner = S.chats.get(p.chatId);
  const goto = () => { if (p.chatId !== S.currentChatId) selectChat(p.chatId); else document.querySelector(`[data-mid="${p.msgId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  const seek = e => { const r = e.currentTarget.getBoundingClientRect(); player.seek((e.clientX - r.left) / r.width); };
  return html`<div class="player-bar glass">
    <button class="icon-btn" onClick=${player.toggle}>${p.playing ? Icon.pause(18) : Icon.play(18)}</button>
    <div class="pb-info" onClick=${goto}>
      <div class="pb-title">${p.performer ? html`<b>${p.performer}</b> — ` : ''}${p.title}</div>
      <div class="pb-sub">${owner ? chatTitle(owner) : ''} · ${duration(Math.floor(p.time))} / ${duration(Math.floor(p.duration || 0))}</div>
    </div>
    <button class="pb-rate" title="Скорость" onClick=${() => player.setRate(RATES[(RATES.indexOf(p.rate) + 1) % RATES.length])}>${p.rate}×</button>
    <label class="pb-vol" title="Громкость">${Icon.volume(15)}<input type="range" min="0" max="1" step="0.01" value=${p.volume} onInput=${e => player.setVolume(Number(e.target.value))}/></label>
    <button class="icon-btn gray" title="Закрыть" onClick=${player.stop}>${Icon.menu('Icon_ChatAction_Close')}</button>
    <div class="pb-progress" onClick=${seek}><i style=${`width:${progress() * 100}%`}/></div>
  </div>`;
}

// Плашка закреплённого сообщения под шапкой. Клик — переход к сообщению и к следующему закрепу.
function PinnedBar({ chat }) {
  const p = S.pinned.get(chat.id);
  if (!p?.list?.length) return null;
  const msg = p.list[Math.min(p.index, p.list.length - 1)];
  const n = p.list.length;
  const c = msg.content;
  const photo = c.photo ? [...c.photo.sizes].sort((a, b) => a.width - b.width)[0] : null;
  const mini = (c.photo || c.video || c.animation)?.minithumbnail?.data;
  const go = () => { jumpTo(chat.id, msg.id); p.index = (p.index + 1) % n; changed(); };
  const unpin = e => {
    e.stopPropagation();
    send({ '@type': 'unpinChatMessage', chat_id: chat.id, message_id: msg.id }).catch(() => {
      S.pinned.delete(chat.id); changed(); // нет прав — просто скрываем у себя
    });
  };
  return html`<div class="pinned-bar glass" onClick=${go}>
    <div class="pin-lines">${Array.from({ length: Math.min(n, 4) }, (_, i) => html`<i class=${i === Math.min(p.index, 3) ? 'on' : ''}/>`)}</div>
    ${mini && html`<img class="pin-thumb" src=${`data:image/jpeg;base64,${mini}`} alt=""/>`}
    <div class="pin-body">
      <div class="pin-title">Закреплённое сообщение${n > 1 ? ` #${n - p.index}` : ''}</div>
      <div class="pin-text">${contentSummary(c, id => userName(S.users.get(id)))}</div>
    </div>
    <button class="icon-btn gray" title="Открепить" onClick=${unpin}>${Icon.menu('Icon_ChatAction_Close')}</button>
  </div>`;
}

// Поиск по сообщениям чата: поле в шапке, стрелки ↑↓ и счётчик.
function ChatSearch({ chat }) {
  const st = S.chatSearch;
  const ref = useRef();
  const timer = useRef();
  useEffect(() => { setTimeout(() => ref.current?.focus(), 30); }, []);
  const close = () => { S.chatSearch = null; changed(); };
  const run = async q => {
    if (!q.trim()) { Object.assign(st, { results: [], index: -1, total: 0, loading: false }); changed(); return; }
    st.loading = true; changed();
    try {
      const r = await send({ '@type': 'searchChatMessages', chat_id: chat.id, query: q, from_message_id: 0, offset: 0, limit: 100, filter: null });
      if (S.chatSearch !== st || st.q !== q) return;
      st.results = (r.messages || []).map(m => m.id); st.total = r.total_count ?? st.results.length; st.index = st.results.length ? 0 : -1;
      if (st.index >= 0) jumpTo(chat.id, st.results[0]);
    } catch { st.results = []; st.total = 0; st.index = -1; }
    st.loading = false; changed();
  };
  const onInput = e => { st.q = e.target.value; changed(); clearTimeout(timer.current); const v = st.q; timer.current = setTimeout(() => run(v), 250); };
  const step = d => {
    if (!st.results.length) return;
    st.index = Math.max(0, Math.min(st.results.length - 1, st.index + d)); changed();
    jumpTo(chat.id, st.results[st.index]);
  };
  const onKey = e => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter' || e.key === 'ArrowUp') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); step(-1); }
  };
  return html`<div class="chat-top">
    <label class="chat-header glass search-mode">
      ${Icon.search(16)}
      <input ref=${ref} placeholder=${`Поиск в «${chatTitle(chat)}»`} value=${st.q} onInput=${onInput} onKeyDown=${onKey}/>
      ${st.loading ? html`<${Spinner}/>` : st.q && html`<span class="cs-count">${st.results.length ? `${st.index + 1} из ${st.total}` : 'Нет результатов'}</span>`}
      <button class="icon-btn gray" title="Раньше (Enter)" disabled=${st.index >= st.results.length - 1} onClick=${() => step(1)}>${Icon.menu('Icon_SearchArrow')}</button>
      <button class="icon-btn gray" title="Позже" disabled=${st.index <= 0} onClick=${() => step(-1)} style="transform:rotate(180deg)">${Icon.menu('Icon_SearchArrow')}</button>
    </label>
    <button class="glass circle" title="Закрыть поиск" onClick=${close}>${Icon.close(16)}</button>
  </div>`;
}
