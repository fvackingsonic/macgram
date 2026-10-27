import { html } from './lib.js';

const pad = n => String(n).padStart(2, '0');
const DAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export const hm = ts => { const d = new Date(ts * 1000); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function listTime(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000), now = new Date();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 864e5);
  if (days === 0) return hm(ts);
  if (days < 7) return DAYS[d.getDay()];
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
}

export function dayLabel(ts) {
  const d = new Date(ts * 1000), now = new Date();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 864e5);
  if (days === 0) return 'Сегодня';
  if (days === 1) return 'Вчера';
  const base = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}
export const sameDay = (a, b) => startOfDay(new Date(a * 1000)) === startOfDay(new Date(b * 1000));

export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
export const count = (n, one, few, many) => `${n.toLocaleString('ru-RU')} ${plural(n, one, few, many)}`;

export function fileSize(b) {
  if (!b) return '';
  if (b < 1024) return `${b} Б`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} КБ`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} МБ`;
  return `${(b / 1024 ** 3).toFixed(2)} ГБ`;
}
export const duration = s => `${Math.floor(s / 60)}:${pad(s % 60)}`;

export function userStatus(user) {
  if (!user) return '';
  if (user.type?.['@type'] === 'userTypeBot') return 'бот';
  const st = user.status || {};
  switch (st['@type']) {
    case 'userStatusOnline': return 'в сети';
    case 'userStatusOffline': {
      const d = new Date(st.was_online * 1000), now = new Date();
      const days = Math.round((startOfDay(now) - startOfDay(d)) / 864e5);
      const mins = Math.floor((now - d) / 60000);
      if (mins < 1) return 'был(а) только что';
      if (mins < 60) return `был(а) ${count(mins, 'минуту', 'минуты', 'минут')} назад`;
      if (days === 0) return `был(а) в ${hm(st.was_online)}`;
      if (days === 1) return `был(а) вчера в ${hm(st.was_online)}`;
      return `был(а) ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
    }
    case 'userStatusRecently': return 'был(а) недавно';
    case 'userStatusLastWeek': return 'был(а) на этой неделе';
    case 'userStatusLastMonth': return 'был(а) в этом месяце';
    default: return 'был(а) давно';
  }
}

export function initials(title = '') {
  const parts = title.replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return (title.trim()[0] || '?').toUpperCase();
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

// Цвета аватаров из палитры Telegram для macOS (верх/низ градиента).
const AVATAR = [
  ['#ff885e', '#ff516a'], ['#ffcd6a', '#ffa85c'], ['#82b1ff', '#665fff'], ['#a0de7e', '#54cb68'],
  ['#53edd6', '#28c9b7'], ['#72d5fd', '#2a9ef1'], ['#e0a2f3', '#d669ed'],
];
const NAME = ['#fc5c51', '#fa790f', '#895dd5', '#0fb297', '#00c1a6', '#3ca5ec', '#3d72ed'];
export function peerIndex(id, accent) {
  if (typeof accent === 'number' && accent >= 0 && accent < 7) return accent;
  return Math.abs(Number(id) || 0) % 7;
}
export const avatarGradient = i => `linear-gradient(180deg, ${AVATAR[i][0]}, ${AVATAR[i][1]})`;
export const nameColor = i => NAME[i];

export const userName = u => u ? [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Удалённый аккаунт' : '';

// Короткое описание содержимого сообщения — для списка чатов и цитат.
export function contentSummary(content, userNameOf = () => '') {
  if (!content) return '';
  const cap = c => c?.text ? `, ${c.text}` : '';
  switch (content['@type']) {
    case 'messageText': return content.text.text;
    case 'messagePhoto': return `Фото${cap(content.caption)}`;
    case 'messageVideo': return `Видео${cap(content.caption)}`;
    case 'messageAnimation': return `GIF${cap(content.caption)}`;
    case 'messageVoiceNote': return 'Голосовое сообщение';
    case 'messageVideoNote': return 'Видеосообщение';
    case 'messageAudio': return `${content.audio?.performer || ''} ${content.audio?.title || 'Аудио'}`.trim();
    case 'messageDocument': return content.document?.file_name || 'Файл';
    case 'messageSticker': return `${content.sticker?.emoji || ''} Стикер`.trim();
    case 'messageAnimatedEmoji': return content.emoji;
    case 'messageContact': return 'Контакт';
    case 'messageLocation': case 'messageVenue': return 'Геопозиция';
    case 'messagePoll': return `📊 ${content.poll?.question?.text ?? content.poll?.question ?? 'Опрос'}`;
    case 'messageDice': return content.emoji;
    case 'messageCall': return content.is_video ? 'Видеозвонок' : 'Звонок';
    case 'messageStory': return 'История';
    case 'messageGame': return 'Игра';
    case 'messageInvoice': return 'Счёт';
    default: return serviceText(content, userNameOf) || 'Сообщение';
  }
}

export function serviceText(c, userNameOf = () => '') {
  switch (c['@type']) {
    case 'messageChatAddMembers': return `${c.member_user_ids.map(userNameOf).join(', ')} — в чате`;
    case 'messageChatJoinByLink': case 'messageChatJoinByRequest': return 'вступил(а) в группу';
    case 'messageChatDeleteMember': return `${userNameOf(c.user_id)} покинул(а) группу`;
    case 'messageChatChangeTitle': return `Новое название: «${c.title}»`;
    case 'messageChatChangePhoto': return 'Фото группы обновлено';
    case 'messageChatDeletePhoto': return 'Фото группы удалено';
    case 'messagePinMessage': return 'Сообщение закреплено';
    case 'messageBasicGroupChatCreate': return `Группа «${c.title}» создана`;
    case 'messageSupergroupChatCreate': return `«${c.title}» создан(а)`;
    case 'messageContactRegistered': return 'Присоединился(-ась) к Telegram';
    case 'messageScreenshotTaken': return 'Сделан снимок экрана';
    case 'messageChatSetMessageAutoDeleteTime': return 'Изменён таймер автоудаления';
    case 'messageChatUpgradeTo': case 'messageChatUpgradeFrom': return 'Группа преобразована в супергруппу';
    case 'messageGameScore': return `Результат в игре: ${c.score}`;
    case 'messageForumTopicCreated': return `Создана тема «${c.name}»`;
    case 'messageGiftedPremium': return 'Подарок: Premium';
    case 'messageCustomServiceAction': return c.text;
    case 'messageUnsupported': return 'Это сообщение пока не поддерживается';
    default: return '';
  }
}

export const SERVICE_TYPES = new Set([
  'messageChatAddMembers', 'messageChatJoinByLink', 'messageChatJoinByRequest', 'messageChatDeleteMember',
  'messageChatChangeTitle', 'messageChatChangePhoto', 'messageChatDeletePhoto', 'messagePinMessage',
  'messageBasicGroupChatCreate', 'messageSupergroupChatCreate', 'messageContactRegistered',
  'messageScreenshotTaken', 'messageChatSetMessageAutoDeleteTime', 'messageChatUpgradeTo',
  'messageChatUpgradeFrom', 'messageForumTopicCreated', 'messageCustomServiceAction', 'messageGameScore',
]);

const isEmojiOnly = s => s && s.length <= 12 && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u.test(s) && !/^[\d#*\s]+$/.test(s);
export const jumboEmoji = c => c?.['@type'] === 'messageText' && !c.text.entities?.length && isEmojiOnly(c.text.text) ? c.text.text : null;

// Отрисовка formattedText с вложенными сущностями (жирный, ссылки, код и т.д.).
// Смещения в TDLib считаются в UTF-16 — это совпадает с индексами строк в JS.
export function renderFormatted(ft, onLink) {
  if (!ft) return null;
  const text = ft.text || '';
  const ents = (ft.entities || []).filter(e => e.length > 0);
  if (!ents.length) return text;
  const cuts = new Set([0, text.length]);
  for (const e of ents) { cuts.add(e.offset); cuts.add(Math.min(text.length, e.offset + e.length)); }
  const points = [...cuts].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    let node = text.slice(a, b);
    const active = ents.filter(e => e.offset <= a && e.offset + e.length >= b);
    for (const e of active) node = wrap(e.type, node, text.slice(e.offset, e.offset + e.length), onLink);
    out.push(node);
  }
  return out;
}

function wrap(type, child, full, onLink) {
  const link = url => html`<a href=${url} title=${url} onClick=${ev => { ev.preventDefault(); ev.stopPropagation(); onLink?.(url, full); }}>${child}</a>`;
  switch (type['@type']) {
    case 'textEntityTypeBold': return html`<b>${child}</b>`;
    case 'textEntityTypeItalic': return html`<i>${child}</i>`;
    case 'textEntityTypeUnderline': return html`<u>${child}</u>`;
    case 'textEntityTypeStrikethrough': return html`<s>${child}</s>`;
    case 'textEntityTypeCode': return html`<code>${child}</code>`;
    case 'textEntityTypePre': case 'textEntityTypePreCode': return html`<pre>${child}</pre>`;
    case 'textEntityTypeBlockQuote': case 'textEntityTypeExpandableBlockQuote': return html`<blockquote>${child}</blockquote>`;
    case 'textEntityTypeSpoiler': return html`<span class="spoiler" onClick=${e => { e.stopPropagation(); e.currentTarget.classList.add('shown'); }}>${child}</span>`;
    case 'textEntityTypeTextUrl': { const a = link(type.url); return a; }
    case 'textEntityTypeUrl': return link(/^[a-z]+:\/\//i.test(full) ? full : `https://${full}`);
    case 'textEntityTypeEmailAddress': return link(`mailto:${full}`);
    case 'textEntityTypeMention': return link(`https://t.me/${full.slice(1)}`);
    case 'textEntityTypeMentionName': case 'textEntityTypeHashtag': case 'textEntityTypeCashtag': case 'textEntityTypeBotCommand':
      return html`<a onClick=${e => e.preventDefault()}>${child}</a>`;
    default: return child;
  }
}
