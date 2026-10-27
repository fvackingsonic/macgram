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
        const r = await send({ '@type': 'openWebApp', chat_id: msg.chat_id, bot_user_id: msg.via_bot_user_id || msg.sender_id?.user_id, url: b.type.url, message_thread_id: 0, reply_to: null, parameters: { '@type': 'webAppOpenParameters', theme: null, application_name: 'macgram', mode: { '@type': 'webAppOpenModeFullSize' } } });
        return openLink(r.url, r.url);
      }
      default: showHud('Эта кнопка пока не поддерживается');
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
  const press = b => {
    const t = b.type?.['@type'];
    if (t === 'keyboardButtonTypeText' || !t) { sendText(chat.id, b.text); if (rm.one_time) setHidden(true); return; }
    showHud('Эта кнопка пока не поддерживается');
  };
  return html`<div class="rkb glass">
    <div class="rkb-rows">${rm.rows.map(r => html`<div class="rkb-row">${r.map(b => html`<button onClick=${() => press(b)}>${b.text}</button>`)}</div>`)}</div>
    <button class="rkb-hide" title="Скрыть" onClick=${() => setHidden(true)}>✕</button>
  </div>`;
}
