// Кнопки ботов: под сообщением (inline-клавиатура) и вместо клавиатуры над полем ввода.
import { html, useEffect, useState } from '../lib.js';
import { S, changed, showHud, openModal, closeModal, selectChat, sendText } from '../store.js';
import { send } from '../td.js';
import { openLink } from '../links.js';

async function pressInline(msg, b) {
  const t = b.type?.['@type'];
  try {
    switch (t) {
      case 'inlineKeyboardButtonTypeUrl': return openLink(b.type.url, b.type.url);
      case 'inlineKeyboardButtonTypeLoginUrl': return openLink(b.type.url, b.type.url);
      case 'inlineKeyboardButtonTypeCallback':
      case 'inlineKeyboardButtonTypeCallbackGame': {
        const payload = t === 'inlineKeyboardButtonTypeCallback'
          ? { '@type': 'callbackQueryPayloadData', data: b.type.data }
          : { '@type': 'callbackQueryPayloadGame', game_short_name: '' };
        const a = await send({ '@type': 'getCallbackQueryAnswer', chat_id: msg.chat_id, message_id: msg.id, payload });
        if (a.url) openLink(a.url, a.url);
        if (a.text) {
          if (a.show_alert) openModal({ title: 'Бот', text: a.text, buttons: [{ label: 'OK', action: closeModal }] });
          else showHud(a.text);
        }
        return;
      }
      case 'inlineKeyboardButtonTypeSwitchInline': {
        const bot = S.users.get(msg.via_bot_user_id || msg.sender_id?.user_id);
        const name = bot?.usernames?.active_usernames?.[0];
        if (name) { const el = document.querySelector('.compose-input'); if (el) { el.value = `@${name} ${b.type.query || ''}`; el.dispatchEvent(new Event('input', { bubbles: true })); el.focus(); } }
        return;
      }
      case 'inlineKeyboardButtonTypeUser': {
        const c = await send({ '@type': 'createPrivateChat', user_id: b.type.user_id, force: false });
        return selectChat(c.id);
      }
      case 'inlineKeyboardButtonTypeCopyText':
        await navigator.clipboard.writeText(b.type.text); return showHud('Скопировано');
      case 'inlineKeyboardButtonTypeWebApp': {
        const r = await send({ '@type': 'openWebApp', chat_id: msg.chat_id, bot_user_id: msg.via_bot_user_id || msg.sender_id?.user_id, url: b.type.url, message_thread_id: 0, topic_id: null, reply_to: null, parameters: { '@type': 'webAppOpenParameters', theme: null, application_name: 'macgram', mode: { '@type': 'webAppOpenModeFullSize' } } });
        return openLink(r.url, r.url);
      }
      case 'inlineKeyboardButtonTypeBuy': return showHud('Оплата в боте — в Telegram на телефоне');
      default: showHud('Эта кнопка работает только в Telegram на телефоне');
    }
  } catch (e) { showHud(e.message || 'Бот не ответил'); }
}

export function InlineKeyboard({ msg }) {
  const rows = msg.reply_markup?.rows;
  if (!rows?.length) return null;
  return html`<div class="ikb">${rows.map(r => html`<div class="ikb-row">${r.map(b => html`
    <button class="ikb-btn" onClick=${e => { e.stopPropagation(); pressInline(msg, b); }}>
      <span>${b.text}</span>${b.type?.['@type'] === 'inlineKeyboardButtonTypeUrl' && html`<i class="ikb-arrow">↗</i>`}
    </button>`)}</div>`)}</div>`;
}

// Клавиатура бота над полем ввода (replyMarkupShowKeyboard).
export function ReplyKeyboard({ chat }) {
  const [msg, setMsg] = useState(null);
  const [hidden, setHidden] = useState(false);
  const id = chat.reply_markup_message_id;
  useEffect(() => {
    setMsg(null); setHidden(false);
    if (!id) return;
    send({ '@type': 'getMessage', chat_id: chat.id, message_id: id }).then(setMsg).catch(() => {});
  }, [chat.id, id]);
  const rm = msg?.reply_markup;
  if (!rm || rm['@type'] !== 'replyMarkupShowKeyboard' || !rm.rows?.length) return null;
  if (hidden) return html`<button class="rkb-toggle glass" title="Показать кнопки бота" onClick=${() => setHidden(false)}>⌨</button>`;
  const press = async b => {
    const t = b.type?.['@type'];
    const done = () => { if (rm.one_time) setHidden(true); };
    try {
      if (t === 'keyboardButtonTypeText' || !t) { sendText(chat.id, b.text); done(); return; }
      if (t === 'keyboardButtonTypeRequestPhoneNumber') {
        const me = S.users.get(S.myId);
        openModal({ title: 'Отправить номер телефона?', text: `Бот получит ваш номер +${me?.phone_number || ''}.`, buttons: [
          { label: 'Отправить', action: () => { closeModal(); send({ '@type': 'sendMessage', chat_id: chat.id, input_message_content: { '@type': 'inputMessageContact', contact: { '@type': 'contact', phone_number: me?.phone_number || '', first_name: me?.first_name || '', last_name: me?.last_name || '', vcard: '', user_id: S.myId } } }).then(done).catch(e => showHud(e.message)); } },
          { label: 'Отмена', kind: 'second', action: closeModal }] });
        return;
      }
      if (t === 'keyboardButtonTypeWebApp') {
        const r = await send({ '@type': 'openWebApp', chat_id: chat.id, bot_user_id: msg.sender_id?.user_id, url: b.type.url, message_thread_id: 0, topic_id: null, reply_to: null, parameters: { '@type': 'webAppOpenParameters', theme: null, application_name: 'macgram', mode: { '@type': 'webAppOpenModeFullSize' } } });
        openLink(r.url, r.url); return;
      }
      if (t === 'keyboardButtonTypeRequestLocation') { showHud('Отправка местоположения с компьютера пока не поддерживается'); return; }
      showHud('Эта кнопка работает только в Telegram на телефоне');
    } catch (e) { showHud(e.message || 'Бот не ответил'); }
  };
  return html`<div class="rkb glass">
    <div class="rkb-rows">${rm.rows.map(r => html`<div class="rkb-row">${r.map(b => html`<button onClick=${() => press(b)}>${b.text}</button>`)}</div>`)}</div>
    <button class="rkb-hide" title="Скрыть" onClick=${() => setHidden(true)}>✕</button>
  </div>`;
}

// ── боты в чате: описание, «Начать», меню команд и кнопка-меню (Web App) ──
const botCache = new Map();
const botName = u => u?.usernames?.active_usernames?.[0] || '';
export function useBots(chat) {
  const [, force] = useState(0);
  const id = chat?.id;
  useEffect(() => {
    if (!chat || botCache.has(id)) return;
    botCache.set(id, null);
    const t = chat.type['@type'];
    const done = v => { botCache.set(id, v); force(x => x + 1); };
    if (t === 'chatTypePrivate') {
      const u = S.users.get(chat.type.user_id);
      if (u?.type?.['@type'] !== 'userTypeBot') { done({ isBot: false, commands: [] }); return; }
      send({ '@type': 'getUserFullInfo', user_id: u.id }).then(fi => {
        const bi = fi.bot_info || {};
        done({ isBot: true, botId: u.id, description: bi.description || '', short: bi.short_description || '', photo: bi.photo || null,
          menu: bi.menu_button?.url ? { text: bi.menu_button.text || 'Меню', url: bi.menu_button.url } : null,
          commands: (bi.commands || []).map(c => ({ cmd: c.command, desc: c.description, botId: u.id, bot: '' })) });
      }).catch(() => done({ isBot: true, botId: u.id, commands: [] }));
    } else if (t === 'chatTypeSupergroup' || t === 'chatTypeBasicGroup') {
      const req = t === 'chatTypeSupergroup' ? { '@type': 'getSupergroupFullInfo', supergroup_id: chat.type.supergroup_id } : { '@type': 'getBasicGroupFullInfo', basic_group_id: chat.type.basic_group_id };
      send(req).then(fi => {
        const many = (fi.bot_commands || []).length > 1;
        done({ isBot: false, commands: (fi.bot_commands || []).flatMap(bc => (bc.commands || []).map(c => ({ cmd: c.command, desc: c.description, botId: bc.bot_user_id, bot: many ? botName(S.users.get(bc.bot_user_id)) : '' }))) });
      }).catch(() => done({ isBot: false, commands: [] }));
    } else done({ isBot: false, commands: [] });
  }, [id]);
  return botCache.get(id) || null;
}
export const startBot = chat => send({ '@type': 'sendBotStartMessage', bot_user_id: chat.type.user_id, chat_id: chat.id, parameter: '' }).catch(e => showHud(e.message));
export async function openBotMenu(chat, b) {
  try {
    const r = await send({ '@type': 'openWebApp', chat_id: chat.id, bot_user_id: b.botId, url: b.menu.url, message_thread_id: 0, topic_id: null, reply_to: null, parameters: { '@type': 'webAppOpenParameters', theme: null, application_name: 'macgram', mode: { '@type': 'webAppOpenModeFullSize' } } });
    openLink(r.url, r.url);
  } catch (e) { showHud(e.message || 'Бот не ответил'); }
}
// Подсказка команд над полем ввода: «/» в начале сообщения
export function CommandList({ items, sel, onPick }) {
  if (!items.length) return null;
  return html`<div class="cmd-list glass">${items.slice(0, 40).map((c, i) => html`
    <button class=${`cmd-item ${i === sel ? 'on' : ''}`} onMouseDown=${e => { e.preventDefault(); onPick(c); }}>
      <b>/${c.cmd}${c.bot ? html`<i>@${c.bot}</i>` : ''}</b><span>${c.desc}</span></button>`)}</div>`;
}
// Пустой чат с ботом: что умеет бот (как в Telegram для macOS)
export function BotIntro({ b }) {
  if (!b?.isBot || !(b.description || b.short)) return null;
  return html`<div class="bot-intro glass"><b>Что умеет этот бот?</b><p class="selectable">${b.description || b.short}</p></div>`;
}
