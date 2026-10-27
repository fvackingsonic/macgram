import { html, useEffect, useState, useRef } from '../lib.js';
import { S, changed, download, fileUrl, fileOf, senderName, senderId, openMenu, openModal, closeModal, showHud, deleteMessages, isGroup, isChannel, chatUser } from '../store.js';
import { send, shell } from '../td.js';
import { Icon } from '../icons.js';
import { hm, renderFormatted, contentSummary, fileSize, duration, peerIndex, nameColor, jumboEmoji, userName, serviceText } from '../format.js';
import { Avatar } from './common.js';
import { player, progress } from '../player.js';

const onLink = url => shell.openUrl(url);

// ── цитата ответа ──
const replyCache = new Map();
function useReplied(msg) {
  const rt = msg.reply_to;
  const replyId = rt?.['@type'] === 'messageReplyToMessage' ? rt.message_id : msg.reply_to_message_id;
  const replyChat = rt?.chat_id || msg.chat_id;
  const local = replyId ? S.history.get(replyChat)?.byId.get(replyId) : null;
  const [, force] = useState(0);
  useEffect(() => {
    if (!replyId || local || replyCache.has(`${replyChat}:${replyId}`)) return;
    replyCache.set(`${replyChat}:${replyId}`, null);
    send({ '@type': 'getRepliedMessage', chat_id: msg.chat_id, message_id: msg.id })
      .then(m => { replyCache.set(`${replyChat}:${replyId}`, m); force(x => x + 1); })
      .catch(() => {});
  }, [replyId]);
  if (!replyId) return null;
  return { id: replyId, msg: local || replyCache.get(`${replyChat}:${replyId}`), quote: rt?.quote };
}

export function jumpTo(chatId, id) {
  const el = document.querySelector(`[data-mid="${id}"]`);
  if (!el) { showHud('Сообщение ещё не загружено'); return; }
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  S.highlight = id; changed();
  setTimeout(() => { if (S.highlight === id) { S.highlight = null; changed(); } }, 1300);
}

function ReplyQuote({ msg }) {
  const r = useReplied(msg);
  if (!r) return null;
  const name = r.msg ? senderName(r.msg.sender_id) : '…';
  const text = r.quote?.text?.text || (r.msg ? contentSummary(r.msg.content, id => userName(S.users.get(id))) : 'Загрузка…');
  return html`<div class="reply-quote" onClick=${e => { e.stopPropagation(); jumpTo(msg.chat_id, r.id); }}>
    <div><div class="rq-name">${name}</div><div class="rq-text">${text}</div></div>
  </div>`;
}

// ── медиа ──
function pickSize(sizes, maxW = 800) {
  if (!sizes?.length) return null;
  const sorted = [...sizes].sort((a, b) => a.width - b.width);
  return sorted.find(s => s.width >= Math.min(maxW, sorted[sorted.length - 1].width)) || sorted[sorted.length - 1];
}
function fit(w, h, maxW = 360, maxH = 420) {
  if (!w || !h) return [maxW, Math.round(maxW * 0.75)];
  let k = Math.min(maxW / w, maxH / h, 1);
  let W = Math.round(w * k), H = Math.round(h * k);
  if (W < 140) { H = Math.round(H * 140 / W); W = 140; }
  return [W, Math.min(H, maxH)];
}

function Photo({ photo, overlay }) {
  const size = pickSize(photo.sizes);
  useEffect(() => { if (size) download(size.photo, 2); }, [size?.photo.id]);
  const [W, H] = fit(size?.width, size?.height);
  const url = size ? fileUrl(size.photo) : '';
  const mini = photo.minithumbnail?.data;
  const open = e => { e.stopPropagation(); S.viewer = { photo, url }; changed(); };
  return html`<div class="photo" style=${`width:${W}px;height:${H}px;cursor:zoom-in`} onClick=${open}>
    ${mini && html`<img class="blur" src=${`data:image/jpeg;base64,${mini}`} alt=""/>`}
    ${url && html`<img class="full" src=${url} alt="" draggable="false"/>`}
    ${overlay}
  </div>`;
}

function Video({ video, gif }) {
  const [play, setPlay] = useState(gif);
  const file = video[gif ? 'animation' : 'video'];
  const thumb = video.thumbnail;
  useEffect(() => { if (thumb?.file) download(thumb.file, 2); }, [thumb?.file?.id]);
  useEffect(() => { if (play) download(file, 4); }, [play, file?.id]);
  const [W, H] = fit(video.width, video.height);
  const src = play ? fileUrl(file) : '';
  const tUrl = thumb?.format?.['@type'] === 'thumbnailFormatJpeg' ? fileUrl(thumb.file) : '';
  const mini = video.minithumbnail?.data;
  const cur = fileOf(file);
  const progress = cur?.size ? Math.round(100 * (cur.local?.downloaded_size || 0) / cur.size) : 0;
  return html`<div class="photo" style=${`width:${W}px;height:${H}px`} onClick=${() => !gif && setPlay(true)}>
    ${mini && html`<img class="blur" src=${`data:image/jpeg;base64,${mini}`} alt=""/>`}
    ${tUrl && !src && html`<img class="full" src=${tUrl} alt="" onError=${e => e.target.remove()}/>`}
    ${src && html`<video class="full" src=${src} autoplay loop=${gif} muted=${gif} controls=${!gif} playsinline/>`}
    ${!src && !gif && html`<div class="play-badge">${play ? html`<span style="font-size:11px">${progress}%</span>` : Icon.play(22)}</div>`}
    ${!gif && !src && html`<span class="dur-badge">${duration(video.duration || 0)}</span>`}
  </div>`;
}

function Sticker({ sticker }) {
  const fmt = sticker.format?.['@type'];
  useEffect(() => { if (fmt !== 'stickerFormatTgs') download(sticker.sticker, 3); }, [sticker.sticker.id]);
  const url = fileUrl(sticker.sticker);
  if (fmt === 'stickerFormatWebm' && url) return html`<video class="sticker-img" src=${url} autoplay loop muted playsinline/>`;
  if (fmt === 'stickerFormatWebp' && url) return html`<img class="sticker-img" src=${url} alt=${sticker.emoji} draggable="false"/>`;
  return html`<div class="sticker-emoji">${sticker.emoji || '🙂'}</div>`;
}

function Voice({ msg }) {
  const voice = msg.content.voice_note;
  const cur = player.isCurrent(msg);
  const p = cur ? S.player : null;
  const bars = useWave(voice.waveform);
  const prog = cur ? progress() : 0;
  const onWave = e => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - r.left) / r.width;
    if (!cur) player.play(msg);
    setTimeout(() => player.seek(f), cur ? 0 : 400);
  };
  return html`<div class="file">
    <button class="file-ic" onClick=${e => { e.stopPropagation(); player.play(msg); }}>
      ${p?.loading && !p.playing ? html`<span class="spinner" style="width:18px;height:18px"/>` : p?.playing ? Icon.pause(18) : Icon.play(18)}
    </button>
    <div style="flex:1;min-width:0">
      <div class="voice-wave" onClick=${onWave} style="cursor:pointer">${bars.map((v, i) => html`<i class=${i / bars.length < prog ? 'on' : ''} style=${`height:${3 + v * 19}px`}/>`)}</div>
      <div class="fsize">${cur && p.time > 0 ? `${duration(Math.floor(p.time))} / ` : ''}${duration(voice.duration || 0)}</div>
    </div>
  </div>`;
}

function Audio_({ msg }) {
  const a = msg.content.audio;
  const cur = player.isCurrent(msg);
  const p = cur ? S.player : null;
  const title = a.title || a.file_name || 'Аудио';
  return html`<div class="file" style="min-width:240px">
    <button class="file-ic" onClick=${e => { e.stopPropagation(); player.play(msg); }}>
      ${p?.loading && !p.playing ? html`<span class="spinner" style="width:18px;height:18px"/>` : p?.playing ? Icon.pause(18) : Icon.play(18)}
    </button>
    <div style="min-width:0;flex:1">
      <div class="fname">${title}</div>
      <div class="fsize">${a.performer ? `${a.performer} · ` : ''}${cur && p.time > 0 ? `${duration(Math.floor(p.time))} / ` : ''}${duration(a.duration || 0)}</div>
      ${cur && html`<div class="mini-progress" onClick=${e => { const r = e.currentTarget.getBoundingClientRect(); player.seek((e.clientX - r.left) / r.width); }}><i style=${`width:${progress() * 100}%`}/></div>`}
    </div>
  </div>`;
}

function useWave(b64) {
  // waveform — 5-битные значения, упакованные подряд
  try {
    const bin = atob(b64 || '');
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    const n = Math.floor(bytes.length * 8 / 5);
    const vals = [];
    for (let i = 0; i < n; i++) {
      const bit = i * 5, byte = bit >> 3, shift = bit & 7;
      const v = ((bytes[byte] | ((bytes[byte + 1] || 0) << 8)) >> shift) & 31;
      vals.push(v / 31);
    }
    if (!vals.length) return Array(32).fill(.3);
    const out = [];
    for (let i = 0; i < 40; i++) out.push(vals[Math.floor(i * vals.length / 40)]);
    return out;
  } catch { return Array(40).fill(.3); }
}

function VideoNote({ note }) {
  const ref = useRef();
  const [sound, setSound] = useState(false);
  useEffect(() => { if (note.thumbnail?.file) download(note.thumbnail.file, 2); download(note.video, 1); }, [note.video.id]);
  const src = fileUrl(note.video);
  const thumb = note.thumbnail?.format?.['@type'] === 'thumbnailFormatJpeg' ? fileUrl(note.thumbnail.file) : '';
  const mini = note.minithumbnail?.data;
  const toggle = () => {
    const v = ref.current; if (!v) return;
    if (!sound) { v.muted = false; v.loop = false; v.currentTime = 0; v.play().catch(() => {}); setSound(true); }
    else { v.muted = true; v.loop = true; setSound(false); }
  };
  return html`<div class="video-note" onClick=${toggle}>
    ${mini && html`<img class="blur" src=${`data:image/jpeg;base64,${mini}`} alt=""/>`}
    ${thumb && !src && html`<img src=${thumb} alt="" onError=${e => e.target.remove()}/>`}
    ${src && html`<video ref=${ref} src=${src} autoplay muted loop playsinline onEnded=${() => { const v = ref.current; if (v) { v.muted = true; v.loop = true; v.play().catch(() => {}); } setSound(false); }}/>`}
    ${!sound && html`<span class="dur-badge" style="left:50%;top:auto;bottom:10px;transform:translateX(-50%)">${duration(note.duration || 0)} ${Icon.muted(11)}</span>`}
  </div>`;
}

function Doc({ name, size, icon }) {
  return html`<div class="file"><div class="file-ic">${icon || Icon.file(20)}</div>
    <div style="min-width:0"><div class="fname">${name}</div><div class="fsize">${fileSize(size)}</div></div></div>`;
}

// ── тело сообщения ──
function Body({ msg, showName, chat }) {
  const c = msg.content;
  const t = c['@type'];
  const nameEl = showName && html`<div class="sender" style=${`color:${nameColor(peerIndex(senderId(msg.sender_id)))}`}>${senderName(msg.sender_id) || chat.title}</div>`;
  const fwd = msg.forward_info && html`<div class="sender" style="font-weight:500;opacity:.85">Переслано от ${forwardName(msg.forward_info)}</div>`;
  const meta = html`<${Meta} msg=${msg} chat=${chat}/>`;
  switch (t) {
    case 'messageText':
      return html`<div class="bubble">${nameEl}${fwd}<${ReplyQuote} msg=${msg}/><span class="text selectable">${renderFormatted(c.text, onLink)}</span>${meta}</div>`;
    case 'messagePhoto': case 'messageVideo': case 'messageAnimation': {
      const cap = c.caption?.text;
      const media = t === 'messagePhoto' ? html`<${Photo} photo=${c.photo} overlay=${!cap && html`<div class="meta-overlay">${metaInner(msg, chat)}</div>`}/>`
        : html`<div style="position:relative"><${Video} video=${t === 'messageVideo' ? c.video : c.animation} gif=${t === 'messageAnimation'}/>${!cap && html`<div class="meta-overlay">${metaInner(msg, chat)}</div>`}</div>`;
      return html`<div class=${`bubble media ${cap ? 'with-caption' : ''}`}>
        ${(nameEl || fwd) && html`<div style="padding:6px 10px 2px">${nameEl}${fwd}</div>`}
        ${media}
        ${cap && html`<div class="caption"><span class="text selectable">${renderFormatted(c.caption, onLink)}</span>${meta}</div>`}
      </div>`;
    }
    case 'messageSticker':
      return html`<div class="bubble sticker"><${Sticker} sticker=${c.sticker}/><div style="display:flex;justify-content:flex-end"><span class="meta-overlay" style="position:static">${metaInner(msg, chat)}</span></div></div>`;
    case 'messageAnimatedEmoji':
      return html`<div class="bubble jumbo">${c.emoji}${meta}</div>`;
    case 'messageVideoNote':
      return html`<div class="bubble round"><${ReplyQuote} msg=${msg}/><${VideoNote} note=${c.video_note}/><div><span class="meta-overlay">${metaInner(msg, chat)}</span></div></div>`;
    case 'messageVoiceNote':
      return html`<div class="bubble">${nameEl}<${ReplyQuote} msg=${msg}/><${Voice} msg=${msg}/>${meta}</div>`;
    case 'messageDocument':
      return html`<div class="bubble">${nameEl}${fwd}<${ReplyQuote} msg=${msg}/><${Doc} name=${c.document.file_name || 'Файл'} size=${c.document.document?.size}/>
        ${c.caption?.text && html`<div class="text selectable">${renderFormatted(c.caption, onLink)}</div>`}${meta}</div>`;
    case 'messageAudio':
      return html`<div class="bubble">${nameEl}${fwd}<${ReplyQuote} msg=${msg}/><${Audio_} msg=${msg}/>
        ${c.caption?.text && html`<div class="text selectable">${renderFormatted(c.caption, onLink)}</div>`}${meta}</div>`;
    default:
      return html`<div class="bubble">${nameEl}${fwd}<span class="text" style="opacity:.8"><i>${contentSummary(c, id => userName(S.users.get(id)))}</i></span>${meta}</div>`;
  }
}

function forwardName(fi) {
  const o = fi.origin || {};
  switch (o['@type']) {
    case 'messageOriginUser': return userName(S.users.get(o.sender_user_id));
    case 'messageOriginHiddenUser': return o.sender_name;
    case 'messageOriginChat': case 'messageOriginChannel': return S.chats.get(o.chat_id || o.sender_chat_id)?.title || 'канала';
    default: return '';
  }
}

function metaInner(msg, chat) {
  const read = msg.is_outgoing && msg.id <= (chat.last_read_outbox_message_id || 0);
  const views = msg.interaction_info?.view_count;
  return html`${msg.edit_date ? html`<span class="edited">изм.</span>` : null}
    ${isChannel(chat) && views ? html`<span>${views >= 1000 ? `${(views / 1000).toFixed(1)}K` : views} 👁</span>` : null}
    ${hm(msg.date)}
    ${msg.is_outgoing && !isChannel(chat) && chat.id !== S.myId && (msg.sending_state ? (msg.sending_state['@type'] === 'messageSendingStateFailed' ? html`<span style="color:var(--red)">!</span>` : Icon.clock(12)) : read ? Icon.checks(13) : Icon.check(13))}`;
}
const Meta = ({ msg, chat }) => html`<span class="meta-inline">${metaInner(msg, chat)}</span>`;

// ── строка сообщения ──
export function MessageRow({ msg, chat, first, last }) {
  const c = msg.content;
  const fresh = S.fresh.has(msg.id);
  useEffect(() => { if (fresh) setTimeout(() => S.fresh.delete(msg.id), 600); }, [fresh]);
  if (isServiceType(c)) {
    const actor = senderName(msg.sender_id);
    const t = serviceText(c, id => userName(S.users.get(id)));
    return html`<div class="service" data-mid=${msg.id}><span>${['messageChatJoinByLink', 'messageChatJoinByRequest', 'messagePinMessage', 'messageChatChangePhoto', 'messageContactRegistered'].includes(c['@type']) ? `${actor} — ${t.toLowerCase()}` : t}</span></div>`;
  }
  const out = msg.is_outgoing && !isChannel(chat);
  const group = isGroup(chat);
  const showAvatar = group && !out;
  const jumbo = jumboEmoji(c);

  const onContext = e => {
    e.preventDefault();
    const items = [];
    const text = c.text?.text || c.caption?.text;
    if (canReply(chat)) items.push({ label: 'Ответить', icon: Icon.reply(), action: () => { S.reply = msg; S.editing = null; changed(); focusComposer(); } });
    if (msg.is_outgoing && c['@type'] === 'messageText' && Date.now() / 1000 - msg.date < 48 * 3600) {
      items.push({ label: 'Изменить', icon: Icon.edit(), action: () => { S.editing = msg; S.reply = null; changed(); focusComposer(msg.content.text.text); } });
    }
    if (text) items.push({ label: 'Копировать текст', icon: Icon.copy(), action: () => navigator.clipboard.writeText(text).then(() => showHud('Скопировано')) });
    if (items.length) items.push('-');
    items.push({ label: 'Удалить', icon: Icon.trash(), danger: true, action: () => confirmDelete(chat, msg) });
    openMenu(e.clientX, e.clientY, items);
  };

  const content = jumbo
    ? html`<div class="bubble jumbo">${jumbo}<${Meta} msg=${msg} chat=${chat}/></div>`
    : html`<${Body} msg=${msg} chat=${chat} showName=${group && !out && first}/>`;
  const sender = S.users.get(msg.sender_id?.user_id);
  const senderChat = msg.sender_id?.chat_id ? S.chats.get(msg.sender_id.chat_id) : null;
  return html`<div data-mid=${msg.id}
      class=${`msg-row ${out ? 'out' : 'in'} ${first ? 'first' : ''} ${last ? 'last' : ''} ${fresh ? 'fresh' : ''} ${S.highlight === msg.id ? 'highlight' : ''}`}
      onContextMenu=${onContext} onDblClick=${() => { if (canReply(chat)) { S.reply = msg; changed(); focusComposer(); } }}>
    ${showAvatar && html`<div class="av-slot">${last && (sender || senderChat) && html`<${Avatar} user=${sender} chat=${senderChat} size=${34}/>`}</div>`}
    ${content}
  </div>`;
}

const SERVICE = new Set(['messageChatAddMembers', 'messageChatJoinByLink', 'messageChatJoinByRequest', 'messageChatDeleteMember', 'messageChatChangeTitle', 'messageChatChangePhoto', 'messageChatDeletePhoto', 'messagePinMessage', 'messageBasicGroupChatCreate', 'messageSupergroupChatCreate', 'messageContactRegistered', 'messageScreenshotTaken', 'messageChatSetMessageAutoDeleteTime', 'messageChatUpgradeTo', 'messageChatUpgradeFrom', 'messageForumTopicCreated', 'messageCustomServiceAction', 'messageGameScore']);
export const isServiceType = c => SERVICE.has(c['@type']);

export function canReply(chat) {
  if (!isChannel(chat)) return true;
  const sg = S.supergroups.get(chat.type.supergroup_id);
  const st = sg?.status?.['@type'];
  return st === 'chatMemberStatusCreator' || (st === 'chatMemberStatusAdministrator' && sg.status.rights?.can_post_messages !== false);
}

export function focusComposer(text) {
  setTimeout(() => {
    const el = document.querySelector('.compose-input');
    if (!el) return;
    if (text != null) { el.value = text; el.dispatchEvent(new Event('input', { bubbles: true })); }
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, 0);
}

function confirmDelete(chat, msg) {
  const user = chatUser(chat);
  const canRevoke = chat.id !== S.myId && (msg.is_outgoing || !user);
  let revoke = true;
  openModal({
    icon: html`<div style="display:flex;justify-content:center;color:var(--red)">${Icon.trash(36)}</div>`,
    title: 'Удалить сообщение?',
    text: 'Это действие нельзя отменить.',
    body: canRevoke && user ? html`<label class="check-line"><input type="checkbox" checked onChange=${e => { revoke = e.target.checked; }}/>Удалить также для ${user.first_name}</label>` : null,
    buttons: [
      { label: 'Удалить', kind: 'danger', action: () => { closeModal(); deleteMessages(chat.id, [msg.id], canRevoke && revoke).catch(e => showHud(e.message)); } },
      { label: 'Отмена', kind: 'second', action: closeModal },
    ],
  });
}
