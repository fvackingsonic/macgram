import { html, useRef, useEffect, useState, useLayoutEffect } from '../lib.js';
import {
  S, changed, loadHistory, sendText, selectChat, isMuted, chatTitle, chatUser, isSaved, isGroup, isChannel, typingText, senderName,
  openMenu, showHud, markRead,
} from '../store.js';
import { send } from '../td.js';
import { Icon } from '../icons.js';
import { userStatus, count, dayLabel, sameDay, contentSummary, userName } from '../format.js';
import { Avatar, Spinner, TypingDots, dragHandlers } from './common.js';
import { MessageRow, canReply, focusComposer, isServiceType } from './message.js';
import { ProfileScreen } from './profile.js';
import { pickAndSend, pasteImage } from './attach.js';
import { MediaPanel } from './media-panel.js';
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
      { label: muted ? 'Включить уведомления' : 'Выключить уведомления', icon: Icon.muted(15), action: toggleMute },
      { label: 'Обновить историю', icon: Icon.reply(15), action: () => { S.history.delete(chat.id); loadHistory(chat.id); } },
    ]);
  };
  const openProfile = () => { S.profile = true; changed(); };
  return html`<div class="chat">
    <${Messages} chat=${chat}/>
    <div class="chat-top" ...${dragHandlers()}>
      <header class="chat-header glass no-drag" onClick=${openProfile}>
        <${Avatar} chat=${chat} size=${34}/>
        <div class="titles">
          <div class="title">${chatTitle(chat)}${muted && html`<span style="color:var(--gray-icon)">${Icon.muted()}</span>`}</div>
          ${st.text && html`<div class=${`status ${st.cls || ''}`}>${st.text}</div>`}
        </div>
      </header>
      <button class="glass circle" title="Ещё" onClick=${more}>${Icon.more()}</button>
    </div>
    <${PlayerBar}/>
    ${canReply(chat) ? html`<${Composer} chat=${chat}/>` : html`<div class="composer-wrap"><button class="glass readonly-bar" onClick=${toggleMute}>${muted ? 'Включить звук' : 'Выключить звук'}</button></div>`}
  </div>`;
}

function Messages({ chat }) {
  const ref = useRef();
  const h = S.history.get(chat.id);
  const list = h?.list || [];
  const onScroll = () => {
    const el = ref.current; if (!el) return;
    // column-reverse: scrollTop отрицательный, 0 — у самого низа
    if (el.scrollHeight - el.clientHeight + el.scrollTop < 600) loadHistory(chat.id, true);
    if (el.scrollTop > -40) markRead(chat.id);
  };
  useEffect(() => { onScroll(); }, [list.length]);

  // Каждый день — отдельная секция, чтобы «липкая» дата не наезжала на соседние.
  const same = (a, b) => a && b && !isServiceType(a.content) && !isServiceType(b.content) && sameDay(a.date, b.date)
    && JSON.stringify(a.sender_id) === JSON.stringify(b.sender_id) && Math.abs(a.date - b.date) < 300 && a.is_outgoing === b.is_outgoing;
  const days = [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i], prev = list[i - 1], next = list[i + 1];
    if (!prev || !sameDay(prev.date, m.date)) days.push({ key: `d${m.id}`, date: m.date, rows: [] });
    days[days.length - 1].rows.push(html`<${MessageRow} key=${m.id} msg=${m} chat=${chat} first=${!same(prev, m)} last=${!same(m, next)}/>`);
  }
  const items = days.map(d => html`<section class="day" key=${d.key}>
    <div class="date-sep"><span>${dayLabel(d.date)}</span></div>${d.rows}</section>`);
  return html`<div class="messages" ref=${ref} onScroll=${onScroll}>
    <div class="messages-inner">
      ${h?.loading && html`<div class="loader-top" style="color:var(--gray-text)"><${Spinner}/></div>`}
      ${!h?.loading && !list.length && html`<div class="main-empty" style="padding:40px"><span>Сообщений пока нет</span></div>`}
      ${items}
    </div>
  </div>`;
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
  const onKey = e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    else if (e.key === 'Escape' && (S.reply || S.editing)) {
      if (S.editing) setText('');
      S.reply = null; S.editing = null; changed();
    } else if (e.key === 'ArrowUp' && !text) {
      const mine = [...(S.history.get(chat.id)?.list || [])].reverse().find(m => m.is_outgoing && m.content['@type'] === 'messageText');
      if (mine) { e.preventDefault(); S.editing = mine; S.reply = null; changed(); setText(mine.content.text.text); focusComposer(); }
    }
  };
  const bar = S.editing ? { title: 'Редактирование', text: contentSummary(S.editing.content), icon: Icon.edit(18) }
    : S.reply ? { title: `Ответ ${senderName(S.reply.sender_id) || chatTitle(chat)}`, text: contentSummary(S.reply.content, id => userName(S.users.get(id))), icon: Icon.reply(18) } : null;
  const ready = !!text.trim();
  const soon = what => () => showHud(`${what} — в следующем обновлении`);
  return html`<div class="composer-wrap">
    ${panel && html`<${MediaPanel} chatId=${chat.id} onEmoji=${insertEmoji} onClose=${() => setPanel(false)}/>`}
    <button class="glass circle" title="Прикрепить файл" onClick=${() => pickAndSend(false)}>${Icon.attach()}</button>
    <div class="composer glass">
      ${bar && html`<div class="compose-bar" key=${S.editing?.id || S.reply?.id}>
        <span style="color:var(--accent)">${bar.icon}</span>
        <div class="bar-body"><div class="bar-title">${bar.title}</div><div class="bar-text">${bar.text}</div></div>
        <button class="icon-btn gray" onClick=${() => { if (S.editing) setText(''); S.reply = null; S.editing = null; changed(); }}>${Icon.close(14)}</button>
      </div>`}
      <div class="compose-row">
        <textarea ref=${ref} class="compose-input" rows="1" placeholder=${isChannel(chat) ? 'Публикация…' : 'Сообщение'} value=${text}
          onInput=${onInput} onKeyDown=${onKey} onPaste=${onPaste}/>
        <button class=${`icon-btn emoji-btn ${panel ? 'active' : ''}`} title="Эмодзи и стикеры" onClick=${() => setPanel(!panel)}>${Icon.smile()}</button>
      </div>
    </div>
    <button class=${`glass circle send-btn ${ready ? 'ready' : ''}`} title=${ready ? 'Отправить' : 'Голосовое сообщение'} onClick=${ready ? submit : soon('Голосовые сообщения')}>
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
    <button class="icon-btn gray" title="Закрыть" onClick=${player.stop}>${Icon.close(14)}</button>
    <div class="pb-progress" onClick=${seek}><i style=${`width:${progress() * 100}%`}/></div>
  </div>`;
}
