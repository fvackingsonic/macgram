import { html, useRef, useEffect, useState, useLayoutEffect } from '../lib.js';
import {
  S, changed, useTick, loadHistory, loadNewer, resetToLatest, jumpTo, sendText, selectChat, isMuted, chatTitle, chatUser, isSaved, isGroup, isChannel, typingText, senderName,
  openMenu, showHud, markRead, openModal, closeModal,
} from '../store.js';
import { send } from '../td.js';
import { Icon } from '../icons.js';
import { userStatus, count, dayLabel, sameDay, contentSummary, userName } from '../format.js';
import { Avatar, Spinner, TypingDots, dragHandlers } from './common.js';
import { MessageRow, AlbumRow, msgDeps, canReply, focusComposer, isServiceType } from './message.js';
import { ProfileScreen } from './profile.js';
import { pickAndSend, pasteImage } from './attach.js';
import { MediaPanel } from './media-panel.js';
import { ReplyKeyboard } from './keyboards.js';
import { PlayPauseAnim } from './tgs.js';
import { MI } from '../mac-icons.js';
import { SelectionBar } from './forward.js';
import { startRecording, finishRecording, cancelRecording } from '../voice.js';
import { player, progress } from '../player.js';
import { MusicChip, MusicPanel } from './music.js';
import { duration } from '../format.js';
import { ThreadScreen, ForumTopics, isForum } from './thread.js';

export function Main() {
  const chat = S.chats.get(S.currentChatId);
  if (!chat) return html`<main class="main"><div class="main-drag" ...${dragHandlers()}/>
    <div class="main-empty"><span class="service-pill">Выберите, кому хотели бы написать</span></div>
    <div class="main-top no-drag"><${MusicChip}/></div><${MusicPanel}/></main>`;
  // Профиль открывается как push в NavigationViewController (macOS): чат уезжает влево на треть
  // и гаснет, профиль въезжает справа (0.4 с, spring); «назад» — обратное движение.
  // Ветка комментариев и тема форума открываются так же, как профиль.
  const nav = S.profile ? (S.profileClosing ? 'popping' : 'pushed') : S.thread ? (S.thread.closing ? 'popping' : 'pushed') : '';
  const forum = isForum(chat) && !S.forumAsChat?.has(chat.id);
  const openProfile = () => { S.profile = true; changed(); };
  return html`<main class=${`main ${nav}`}>
    <div class="nav-layer nav-prev" key=${`c${chat.id}${forum ? 'f' : ''}`}>${forum
      ? html`<${ForumTopics} chat=${chat} onProfile=${openProfile} onAsChat=${() => { (S.forumAsChat ||= new Set()).add(chat.id); changed(); }}/>`
      : html`<${Chat} key=${chat.id} chat=${chat}/>`}</div>
    <${MusicPanel}/>
    ${S.profile && html`<div class=${`nav-layer nav-next ${S.profileClosing ? 'out' : ''}`} key=${`p${chat.id}`}><${ProfileScreen} chat=${chat}/></div>`}
    ${!S.profile && S.thread && html`<div class=${`nav-layer nav-next ${S.thread.closing ? 'out' : ''}`} key=${`t${S.thread.sourceChatId || S.thread.chatId}:${S.thread.root?.id || S.thread.topicId}`}><${ThreadScreen}/></div>`}
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
      ...(isForum(chat) ? [{ label: 'Показать темы', icon: MI('Icon_Profile_Topics', 18), action: () => { S.forumAsChat?.delete(chat.id); changed(); } }] : []),
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
      <${MusicChip}/>
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
  // Лента в column-reverse привязана к низу: если внизу добавились сообщения (подгрузка более новых
  // или новое входящее), браузер сдвигает видимую часть — читателя «кидает вниз». Запоминаем
  // положение от верха и возвращаем его, когда пользователь не у самого конца переписки.
  const pos = useRef({ fromTop: 0, lastId: 0, bottom: true });
  const lastId = list.length ? list[list.length - 1].id : 0;
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const p = pos.current;
    if (lastId !== p.lastId && p.lastId && !p.bottom) {
      el.scrollTop = p.fromTop - (el.scrollHeight - el.clientHeight);
    }
    p.lastId = lastId;
    p.fromTop = el.scrollHeight - el.clientHeight + el.scrollTop;
  }, [lastId, list.length]);
  const onScroll = () => {
    const el = ref.current; if (!el) return;
    pos.current.fromTop = el.scrollHeight - el.clientHeight + el.scrollTop;
    pos.current.bottom = el.scrollTop > -5;
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
    // Ключ дня — сама дата, а не первое сообщение: иначе при подгрузке старых сообщений
    // весь день пересоздавался и ленту «дёргало».
    if (!prev || !sameDay(tail(prev).date, m.date)) days.push({ key: `d${new Date(m.date * 1000).toDateString()}`, date: m.date, rows: [] });
    const rows = days[days.length - 1].rows;
    if (!sepDone && m.id > mark && !m.is_outgoing) { sepDone = true; rows.push(html`<div class="unread-sep" key="unread"><span>Непрочитанные сообщения</span></div>`); }
    const first = !same(prev && tail(prev), m), lastInGroup = !same(tail(u), next && head(next));
    rows.push(u.album && u.msgs.length > 1
      ? html`<${AlbumRow} key=${`a${u.album}`} msgs=${u.msgs} chat=${chat} first=${first} last=${lastInGroup}
          dep=${u.msgs.map(msgDeps).join('/')} ids=${u.msgs.map(x => x.id).join(',')} m0=${u.msgs[0]} mN=${u.msgs[u.msgs.length - 1]}
          readOut=${tail(u).id <= (chat.last_read_outbox_message_id || 0)} cid=${chat.id}/>`
      : html`<${MessageRow} key=${m.id} msg=${m} chat=${chat} first=${first} last=${lastInGroup}
          dep=${msgDeps(m)} sender=${S.users.get(m.sender_id?.user_id)}
          readOut=${m.is_outgoing && m.id <= (chat.last_read_outbox_message_id || 0)} cid=${chat.id}/>`);
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

// Выбор даты для отложенного сообщения.
function pickSchedule(done) {
  const d = new Date(Date.now() + 3600e3); d.setSeconds(0, 0);
  const pad = n => String(n).padStart(2, '0');
  let val = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  openModal({
    title: 'Отправить в…',
    body: html`<input class="dt-input" type="datetime-local" value=${val} onInput=${e => { val = e.target.value; }}/>`,
    buttons: [
      { label: 'Запланировать', action: () => { const t = new Date(val); if (!(t > new Date())) { showHud('Выберите время в будущем'); return; } closeModal(); done(t); } },
      { label: 'Отмена', kind: 'second', action: closeModal },
    ],
  });
}

const drafts = new Map();

// Черновик синхронизируется с Telegram (виден на других устройствах и в списке чатов).
function saveDraft(chatId, text) {
  const t = (text || '').trim() ? text : '';
  send({ '@type': 'setChatDraftMessage', chat_id: chatId, topic_id: null, draft_message: t
    ? { '@type': 'draftMessage', date: 0, input_message_text: { '@type': 'inputMessageText', text: { '@type': 'formattedText', text: t, entities: [] } } }
    : null }).catch(() => {});
}

export function Composer({ chat, topic, onSent }) {
  const ref = useRef();
  // В ветке комментариев / теме форума свой локальный черновик.
  const dkey = topic ? `${chat.id}:${topic.message_thread_id || topic.forum_topic_id}` : chat.id;
  const [text, setText] = useState(() => drafts.get(dkey) ?? (topic ? '' : chat.draft_message?.input_message_text?.text?.text ?? ''));
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
  useEffect(() => () => {
    const v = ref.current?.value || '';
    const before = chat.draft_message?.input_message_text?.text?.text || '';
    drafts.set(dkey, v);
    if (!topic && v !== before && !S.editing) saveDraft(chat.id, v);
  }, []);

  const lastTyping = useRef(0);
  const onInput = e => {
    setText(e.target.value);
    const now = Date.now();
    if (e.target.value && now - lastTyping.current > 4000) {
      lastTyping.current = now;
      send({ '@type': 'sendChatAction', chat_id: chat.id, topic_id: topic || null, business_connection_id: '', action: { '@type': 'chatActionTyping' } }).catch(() => {});
    }
  };
  const onPaste = e => {
    const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    files.forEach(f => pasteImage(f).catch(err => showHud(String(err))));
  };
  const submit = (opts = {}) => {
    if (!text.trim()) return;
    sendText(chat.id, text, topic ? { ...opts, topic, onSent } : opts);
    setText(''); drafts.delete(dkey);
    if (!topic && chat.draft_message) saveDraft(chat.id, '');
  };
  // Правый клик по кнопке отправки: без звука / отложить (как в macOS).
  const sendMenu = e => {
    e.preventDefault();
    if (!text.trim()) return;
    const at = (d) => Math.floor(d.getTime() / 1000);
    const tomorrow9 = new Date(); tomorrow9.setDate(tomorrow9.getDate() + 1); tomorrow9.setHours(9, 0, 0, 0);
    const saved = chat.id === S.myId;
    openMenu(e.clientX, e.clientY, [
      ...(saved ? [] : [{ label: 'Отправить без звука', icon: Icon.menu('menu_mute'), action: () => submit({ silent: true }) }]),
      { label: saved ? 'Напомнить через час' : 'Отправить через час', icon: Icon.menu('menu_select_messages'), action: () => submit({ sendAt: at(new Date(Date.now() + 3600e3)) }) },
      { label: saved ? 'Напомнить завтра в 9:00' : 'Отправить завтра в 9:00', icon: Icon.menu('menu_select_messages'), action: () => submit({ sendAt: at(tomorrow9) }) },
      { label: saved ? 'Напомнить…' : 'Отложить…', icon: Icon.menu('menu_select_messages'), action: () => pickSchedule(d => submit({ sendAt: at(d) })) },
    ]);
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
    // Отправка по Enter или по Ctrl+Enter — настройка «Общие → Отправка сообщений».
    const ctrlMode = S.prefs.sendKey === 'ctrl';
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && (ctrlMode ? (e.ctrlKey || e.metaKey) : !(e.ctrlKey || e.metaKey))) { e.preventDefault(); submit(); }
    else if (e.key === 'Escape' && (S.reply || S.editing)) {
      if (S.editing) setText('');
      S.reply = null; S.editing = null; changed();
    } else if (e.key === 'ArrowUp' && !text) {
      const mine = [...((topic ? S.thread?.list : S.history.get(chat.id)?.list) || [])].reverse().find(m => m.is_outgoing && m.content['@type'] === 'messageText');
      if (mine) { e.preventDefault(); S.editing = mine; S.reply = null; changed(); setText(mine.content.text.text); focusComposer(); }
    }
  };
  const bar = S.editing ? { title: 'Редактирование', text: contentSummary(S.editing.content), icon: Icon.menu('Icon_ChatAction_EditMessage') }
    : S.reply ? { title: `Ответ ${senderName(S.reply.sender_id) || chatTitle(chat)}`, text: contentSummary(S.reply.content, id => userName(S.users.get(id))), icon: Icon.menu('Icon_ChatAction_ReplyMessage') } : null;
  const ready = !!text.trim();
  const soon = what => () => showHud(`${what} — в следующем обновлении`);
  useTick();
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
    <${ReplyKeyboard} chat=${chat}/>
    ${panel && html`<${MediaPanel} chatId=${chat.id} onEmoji=${insertEmoji} onClose=${() => setPanel(false)}/>`}
    ${!topic && html`<button class="glass circle" title="Прикрепить файл" onClick=${() => pickAndSend(false)}>${Icon.attach()}</button>`}
    <div class="composer glass">
      ${bar && html`<div class="compose-bar" key=${S.editing?.id || S.reply?.id}>
        <span style="color:var(--accent)">${bar.icon}</span>
        <div class="bar-body"><div class="bar-title">${bar.title}</div><div class="bar-text">${bar.text}</div></div>
        <button class="icon-btn gray" onClick=${() => { if (S.editing) setText(''); S.reply = null; S.editing = null; changed(); }}>${Icon.menu('Icon_ChatAction_Close')}</button>
      </div>`}
      <div class="compose-row">
        <textarea ref=${ref} class="compose-input" rows="1" spellcheck=${S.prefs.spellcheck !== false} placeholder=${isChannel(chat) ? 'Публикация…' : 'Сообщение'} value=${text}
          onInput=${onInput} onKeyDown=${onKey} onPaste=${onPaste}/>
        <button class=${`icon-btn emoji-btn ${panel ? 'active' : ''}`} title="Эмодзи и стикеры" onClick=${() => setPanel(!panel)}>${Icon.smile()}</button>
      </div>
    </div>
    <button class=${`glass circle send-btn ${ready ? 'ready' : ''}`} title=${ready ? 'Отправить (правая кнопка — без звука или отложить)' : topic ? 'Отправить' : 'Голосовое сообщение'} onClick=${ready ? () => submit() : topic ? null : () => startRecording(chat.id)} onContextMenu=${sendMenu}>
      <span class=${ready || topic ? 'hide' : ''}>${Icon.mic()}</span>
      <span class=${ready || topic ? '' : 'hide'}>${Icon.send(22)}</span>
    </button>
  </div>`;
}

// Плеер как InlineAudioPlayerView из Telegram для macOS: стеклянная карточка 52px (радиус 20),
// «назад / пауза / вперёд», название и исполнитель, повтор, скорость, громкость, закрыть;
// тонкая полоска прогресса снизу, при наведении — толще, карточка растёт до 66px, подсказка времени.
function PlayerBar() {
  useTick();
  const p = S.player;
  const [hover, setHover] = useState(null);
  const [expanded, setExpanded] = useState(false);
  if (!p) return null;
  const owner = S.chats.get(p.chatId);
  const goto = () => { if (p.chatId !== S.currentChatId) selectChat(p.chatId); else jumpTo(p.chatId, p.msgId); };
  const posFromEvent = e => { const r = e.currentTarget.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
  const prog = progress();
  const d = p.duration || 0;
  const hasPrev = p.kind !== 'note', hasNext = !!player.neighbor(1);
  const nextRepeat = { none: 'all', all: 'one', one: 'none' }[p.repeat || 'none'];
  const title = p.kind === 'audio' ? p.title : p.performer || p.title;
  const artist = p.kind === 'audio' ? p.performer : (p.kind === 'note' ? 'Видеосообщение' : 'Голосовое сообщение');
  return html`<div class=${`player-bar glass ${expanded ? 'expanded' : ''}`} onMouseMove=${e => {
      const r = e.currentTarget.getBoundingClientRect(); setExpanded(r.bottom - e.clientY < 22);
    }} onMouseLeave=${() => { setExpanded(false); setHover(null); }}>
    <div class="pb-row">
      <button class="pb-btn" title="Предыдущий" disabled=${!hasPrev} onClick=${player.prev}>${MI('Icon_InlinePlayerNext', 22, 'transform:scaleX(-1)')}</button>
      <button class="pb-btn pb-play" title=${p.playing ? 'Пауза' : 'Играть'} onClick=${player.toggle}>
        <${PlayPauseAnim} playing=${p.playing} size=${34} tone=${S.prefs.theme + document.documentElement.dataset.palette}/>
      </button>
      <button class="pb-btn" title="Следующий" disabled=${!hasNext} onClick=${player.next}>${MI('Icon_InlinePlayerNext', 22)}</button>
      <div class="pb-info" onClick=${goto}>
        <div class="pb-title">${title}</div>
        ${artist && html`<div class="pb-sub">${artist}${owner && p.chatId !== S.currentChatId ? ` · ${chatTitle(owner)}` : ''}</div>`}
      </div>
      ${p.kind === 'audio' && html`<button class=${`pb-btn ${p.repeat && p.repeat !== 'none' ? 'on' : 'dim'}`} title="Повтор" onClick=${() => player.setRepeat(nextRepeat)}>
        ${MI(p.repeat === 'one' ? 'Icon_InlinePlayer_RepeatOne' : p.repeat === 'all' ? 'Icon_InlinePlayer_Repeat' : 'Icon_AudioPlayer_List', 24)}</button>`}
      <label class="pb-vol pb-ratew" title="Скорость">
        <button class=${`pb-rate ${p.rate === 1 ? 'dim' : ''}`} onClick=${e => { e.preventDefault(); e.currentTarget.focus(); }}>${Number(p.rate).toFixed(1)}x</button>
        <span class="pb-vol-pop pb-rate-pop">
          <span class="pb-rate-val">${Number(p.rate).toFixed(1)}x</span>
          <input type="range" min="0.2" max="2.5" step="0.1" value=${p.rate} onInput=${e => player.setRate(Number(e.target.value))}/>
          ${p.rate !== 1 && html`<button class="pb-rate-reset" onClick=${e => { e.preventDefault(); player.setRate(1); }}>Сбросить</button>`}
        </span>
      </label>
      <label class="pb-vol" title="Громкость (колёсико мыши — тише/громче)" onWheel=${e => { e.preventDefault(); player.setVolume(Math.max(0, Math.min(1, (p.volume ?? 1) - Math.sign(e.deltaY) * 0.05))); }}>
        <button class=${`pb-btn ${p.muted ? 'dim' : ''}`} onClick=${e => { e.preventDefault(); player.toggleMute(); }}>${MI(p.muted ? 'Icon_InlinePlayer_VolumeOff' : 'Icon_InlinePlayer_VolumeOn', 24)}</button>
        <span class="pb-vol-pop"><input type="range" min="0" max="1" step="0.01" value=${p.volume} onInput=${e => player.setVolume(Number(e.target.value))}/></span>
      </label>
      <button class="pb-btn" title="Закрыть" onClick=${player.stop}>${MI('Icon_Pip_Close', 18)}</button>
    </div>
    <div class="pb-track" onClick=${e => player.seek(posFromEvent(e))} onMouseMove=${e => setHover(posFromEvent(e))} onMouseLeave=${() => setHover(null)}>
      <div class="pb-line"><i class="pb-fill" style=${`width:${prog * 100}%`}/>${hover != null && html`<i class="pb-preview" style=${`width:${hover * 100}%`}/>`}</div>
    </div>
    ${expanded && hover != null && html`<div class="pb-tip" style=${`left:calc(20px + (100% - 40px) * ${hover})`}><b>${duration(Math.floor(hover * d))}</b> ${duration(Math.floor(d))}</div>`}
  </div>`;
}

// Индикатор закрепов как VerticalParticleListControl (macOS): полоска 2×30, сегменты через 2px
// (до 3 — делят высоту, больше — по 12px и список прокручивается), выбранный сегмент
// цвета текста ездит на пружине 0.4 с, остальные — тот же цвет с прозрачностью 0.2.
function PinIndicator({ count, index }) {
  const H = 30, W = 2, n = Math.max(1, count);
  const ih = n <= 3 ? Math.floor((H - (n - 1) * W) / n) : 12;
  const total = ih * n + W * (n - 1);
  // В macOS координаты снизу вверх: индекс 0 (последний закреп) — внизу.
  const itemY = ih * index + W * index;
  const maxDiff = -(total - H);
  let pos = 0;
  if (n > 3) pos = Math.max(Math.min(0, -(itemY + ih - H) - (H - ih) / 2), maxDiff);
  const sel = pos === 0 ? itemY : pos === maxDiff ? H - ih : (H - ih) / 2;
  const segs = Array.from({ length: n }, (_, i) => html`<i style=${`bottom:${i * (ih + W)}px;height:${ih}px`}/>`);
  return html`<div class="pin-ind">
    <div class="pin-ind-list" style=${`height:${total}px;transform:translateY(${-pos}px)`}>${segs}</div>
    <b style=${`height:${ih}px;transform:translateY(${-sel}px)`}/>
  </div>`;
}

// Плашка закреплённого сообщения под шапкой. Клик — переход к сообщению и к следующему закрепу.
// Смена закрепа как в ChatPinnedView: старый текст уезжает вверх (к более новому) или вниз
// и гаснет за 0.2 с, новый проявляется.
function PinnedBar({ chat }) {
  const p = S.pinned.get(chat.id);
  const prev = useRef(null);
  const [leaving, setLeaving] = useState(null);
  const msg = p?.list?.length ? p.list[Math.min(p.index, p.list.length - 1)] : null;
  useEffect(() => {
    const old = prev.current;
    prev.current = msg ? { id: msg.id, node: renderPin(msg) } : null;
    if (old && msg && old.id !== msg.id) {
      setLeaving({ node: old.node, dir: msg.id > old.id ? 'up' : 'down', key: Date.now() });
      const t = setTimeout(() => setLeaving(null), 220);
      return () => clearTimeout(t);
    }
  }, [msg?.id]);
  if (!msg) return null;
  const n = p.list.length;
  const go = () => { jumpTo(chat.id, msg.id); p.index = (p.index + 1) % n; changed(); };
  const unpin = e => {
    e.stopPropagation();
    send({ '@type': 'unpinChatMessage', chat_id: chat.id, message_id: msg.id }).catch(() => {
      S.pinned.delete(chat.id); changed(); // нет прав — просто скрываем у себя
    });
  };
  return html`<div class="pinned-bar glass" onClick=${go}>
    <${PinIndicator} count=${n} index=${Math.min(p.index, n - 1)}/>
    <div class="pin-stage">
      ${leaving && html`<div class=${`pin-slide out-${leaving.dir}`} key=${leaving.key}>${leaving.node}</div>`}
      <div class=${`pin-slide ${leaving ? 'in' : ''}`} key=${msg.id}>${renderPin(msg, n > 1 ? n - p.index : 0)}</div>
    </div>
    <button class="icon-btn gray" title="Открепить" onClick=${unpin}>${Icon.menu('Icon_ChatAction_Close')}</button>
  </div>`;
}
function renderPin(msg, num = 0) {
  const c = msg.content;
  const mini = (c.photo || c.video || c.animation)?.minithumbnail?.data;
  return html`${mini && html`<img class="pin-thumb" src=${`data:image/jpeg;base64,${mini}`} alt=""/>`}
    <div class="pin-body">
      <div class="pin-title">Закреплённое сообщение${num ? ` #${num}` : ''}</div>
      <div class="pin-text">${contentSummary(c, id => userName(S.users.get(id)))}</div>
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
