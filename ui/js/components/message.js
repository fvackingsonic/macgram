import { html, useEffect, useLayoutEffect, useState, useRef, memo } from '../lib.js';
import { insertAtBottom } from '../mac-anim.js';
import { openLink } from '../links.js';
import { InlineKeyboard } from './keyboards.js';
import { S, changed, useTick, jumpTo, download, fileUrl, fileOf, senderName, senderId, openMenu, openModal, closeModal, showHud, deleteMessages, isGroup, isChannel, chatUser, openPeerProfile, selectChat } from '../store.js';
import { send, shell } from '../td.js';
import { Icon } from '../icons.js';
import { MI } from '../mac-icons.js';
import { hm, renderFormatted, contentSummary, fileSize, duration, peerIndex, nameColor, jumboEmoji, userName, serviceText, count } from '../format.js';
import { openForward, startSelection, toggleSelected } from './forward.js';
import { Avatar } from './common.js';
import { player, progress } from '../player.js';
import { Tgs } from './tgs.js';
import { CommentsBar } from './thread.js';

const onLink = (url, text) => openLink(url, text);

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
  // Автозагрузка фото можно выключить (Данные и память) — тогда фото качается по щелчку.
  const [want, setWant] = useState(S.prefs.autoPhoto !== false);
  useEffect(() => { if (size && want) download(size.photo, 2); }, [size?.photo.id, want]);
  const [W, H] = fit(size?.width, size?.height);
  const url = size ? fileUrl(size.photo) : '';
  const mini = photo.minithumbnail?.data;
  const open = e => { e.stopPropagation(); if (!want && !url) { setWant(true); return; } S.viewer = { photo, url }; changed(); };
  return html`<div class="photo" style=${`width:${W}px;height:${H}px`} onClick=${open}>
    ${!want && !url && html`<div class="play-badge"><svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 3v10m0 0l-4-4m4 4l4-4M4 16h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`}
    ${mini && html`<img decoding="async" class="blur" src=${`data:image/jpeg;base64,${mini}`} alt=""/>`}
    ${url && html`<img decoding="async" class="full" src=${url} alt="" draggable="false"/>`}
    ${overlay}
  </div>`;
}

function Video({ video, gif }) {
  const [play, setPlay] = useState(gif && S.prefs.autoplayGif !== false);
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
  const openViewer = e => { e.stopPropagation(); S.viewer = { video }; changed(); };
  return html`<div class="photo" style=${`width:${W}px;height:${H}px;cursor:pointer`} onClick=${e => { if (gif) { e.stopPropagation(); setPlay(true); } else openViewer(e); }}>
    ${mini && html`<img decoding="async" class="blur" src=${`data:image/jpeg;base64,${mini}`} alt=""/>`}
    ${tUrl && !src && html`<img decoding="async" class="full" src=${tUrl} alt="" onError=${e => e.target.remove()}/>`}
    ${src && html`<video class="full" src=${src} autoplay loop=${gif} muted=${gif} controls=${!gif} playsinline/>`}
    ${!src && gif && !play && html`<div class="play-badge"><span style="font-size:11px;font-weight:700">GIF</span></div>`}
    ${!src && !gif && html`<div class="play-badge">${play ? html`<span style="font-size:11px">${progress}%</span>` : Icon.play(22)}</div>`}
    ${!gif && !src && html`<span class="dur-badge">${duration(video.duration || 0)}</span>`}
  </div>`;
}

function Sticker({ sticker }) {
  const fmt = sticker.format?.['@type'];
  useEffect(() => { if (fmt !== 'stickerFormatTgs') download(sticker.sticker, 3); }, [sticker.sticker.id]);
  const url = fileUrl(sticker.sticker);
  const live = S.prefs.animStickers !== false;
  if (fmt === 'stickerFormatWebm' && url) return html`<video class="sticker-img" src=${url} autoplay=${live} loop muted playsinline onMouseEnter=${e => !live && e.target.play()} onMouseLeave=${e => !live && e.target.pause()}/>`;
  if (fmt === 'stickerFormatWebp' && url) return html`<img decoding="async" class="sticker-img" src=${url} alt=${sticker.emoji} draggable="false"/>`;
  if (fmt === 'stickerFormatTgs') return html`<${Tgs} file=${sticker.sticker} size=${160} autoplay=${live} hover=${!live} loop=${S.prefs.loopStickers !== false} fallback=${sticker.emoji || '🙂'}/>`;
  return html`<div class="sticker-emoji">${sticker.emoji || '🙂'}</div>`;
}

function Voice({ msg }) {
  useTick();
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
  useTick();
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

// Кружок как в Telegram для macOS: без звука крутится, пока виден; значок «без звука» сверху.
// По клику играет со звуком через общий плеер (полоска сверху: громкость, скорость),
// вокруг — белое кольцо прогресса, внизу слева — прошедшее время.
function VideoNote({ msg }) {
  useTick();
  const note = msg.content.video_note;
  const ref = useRef();
  const box = useRef();
  const [visible, setVisible] = useState(false);
  useEffect(() => { if (note.thumbnail?.file) download(note.thumbnail.file, 2); }, [note.video.id]);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 });
    io.observe(box.current);
    return () => io.disconnect();
  }, []);
  const autoNote = S.prefs.autoplayNotes !== false;
  useEffect(() => { if (visible && autoNote) download(note.video, 1); }, [visible]);
  const src = fileUrl(note.video);
  const active = S.player?.kind === 'note' && S.player.msgId === msg.id && S.player.chatId === msg.chat_id;
  useEffect(() => {
    const v = ref.current; if (!v || active) return;
    if (visible && autoNote) v.play().catch(() => {}); else v.pause();
  }, [visible, src, active]);
  const thumb = note.thumbnail?.format?.['@type'] === 'thumbnailFormatJpeg' ? fileUrl(note.thumbnail.file) : '';
  const mini = note.minithumbnail?.data;
  const click = e => {
    e.stopPropagation();
    const v = ref.current;
    if (!v) { download(note.video, 32); return; }
    player.playNote(msg, v, senderName(msg.sender_id));
  };
  const d = note.duration || 1;
  const t = active ? S.player.time : 0;
  const C = 2 * Math.PI * 108.5;
  return html`<div class="video-note" ref=${box} onClick=${click}>
    ${mini && html`<img decoding="async" class="blur" src=${`data:image/jpeg;base64,${mini}`} alt=""/>`}
    ${thumb && !src && html`<img decoding="async" src=${thumb} alt="" onError=${e => e.target.remove()}/>`}
    ${src && html`<video ref=${ref} src=${src} muted loop playsinline preload="metadata"/>`}
    ${active && html`<svg class="note-ring" viewBox="0 0 220 220"><circle cx="110" cy="110" r="108.5" stroke-dasharray=${`${C * Math.min(1, t / d)} ${C}`}/></svg>`}
    ${!active && html`<span class="note-muted">${Icon.menu('Icon_VideoMessageMutedIcon')}</span>`}
    ${active && !S.player.playing && html`<div class="play-badge">${Icon.play(20)}</div>`}
    <span class="note-dur">${duration(Math.floor(active ? t : d))}${!msg.content.is_viewed && !msg.is_outgoing ? html`<i class="note-unread"/>` : null}</span>
  </div>`;
}

function Doc({ name, size, icon }) {
  return html`<div class="file"><div class="file-ic">${icon || Icon.file(20)}</div>
    <div style="min-width:0"><div class="fname">${name}</div><div class="fsize">${fileSize(size)}</div></div></div>`;
}

// ── превью ссылки ──
function LinkPreview({ lp }) {
  const photo = lp.photo || lp.type?.photo || lp.type?.video?.cover || null;
  const sizes = photo?.sizes || [];
  const big = photo && (lp.show_large_media ?? lp.has_large_media ?? false);
  const size = big ? pickSize(sizes, 600) : [...sizes].sort((a, b) => a.width - b.width).find(x => x.width >= 100) || sizes[0];
  useEffect(() => { if (size) download(size.photo, 1); }, [size?.photo.id]);
  const url = size ? fileUrl(size.photo) : '';
  const desc = typeof lp.description === 'string' ? lp.description : lp.description?.text;
  return html`<div class="link-preview" onClick=${e => { e.stopPropagation(); onLink(lp.url); }}>
    <div class="lp-body">
      ${lp.site_name && html`<div class="lp-site">${lp.site_name}</div>`}
      ${lp.title && html`<div class="lp-title">${lp.title}</div>`}
      ${desc && html`<div class="lp-desc">${desc}</div>`}
    </div>
    ${url && !big && html`<img decoding="async" class="lp-thumb" src=${url} alt=""/>`}
    ${url && big && html`<img decoding="async" class="lp-big" src=${url} alt=""/>`}
  </div>`;
}

// ── опрос ──
function Poll({ msg }) {
  const p = msg.content.poll;
  const q = typeof p.question === 'string' ? p.question : p.question?.text;
  const optText = o => typeof o.text === 'string' ? o.text : o.text?.text;
  const voted = p.is_closed || p.options.some(o => o.is_chosen);
  const quiz = p.type?.['@type'] === 'pollTypeQuiz';
  const multi = p.allows_multiple_answers ?? p.type?.allow_multiple_answers;
  const [picked, setPicked] = useState([]);
  const vote = ids => send({ '@type': 'setPollAnswer', chat_id: msg.chat_id, message_id: msg.id, option_ids: ids }).catch(e => showHud(e.message));
  const kind = quiz ? 'Викторина' : p.is_anonymous ? 'Анонимный опрос' : 'Опрос';
  return html`<div class="poll">
    <div class="poll-q">${q}</div>
    <div class="poll-kind">${p.is_closed ? 'Опрос завершён' : kind}</div>
    ${p.options.map((o, i) => voted
      ? html`<div class=${`poll-opt res ${o.is_chosen ? 'chosen' : ''} ${quiz && p.type.correct_option_id === i ? 'correct' : ''}`}>
          <span class="poll-pct">${o.vote_percentage}%</span>
          <div class="poll-main"><div>${optText(o)}${o.is_chosen ? ' ✓' : ''}</div><div class="poll-bar"><i style=${`width:${Math.max(2, o.vote_percentage)}%`}/></div></div>
        </div>`
      : html`<button class="poll-opt" onClick=${e => {
          e.stopPropagation();
          if (multi) setPicked(x => x.includes(i) ? x.filter(y => y !== i) : [...x, i]); else vote([i]);
        }}><span class=${`poll-radio ${picked.includes(i) ? 'on' : ''}`}/><span>${optText(o)}</span></button>`)}
    <div class="poll-foot">
      ${multi && !voted ? html`<button class="poll-vote" disabled=${!picked.length} onClick=${e => { e.stopPropagation(); vote(picked); }}>Проголосовать</button>`
        : count(p.total_voter_count, 'голос', 'голоса', 'голосов')}
    </div>
  </div>`;
}

// ── альбом (несколько фото/видео одним сообщением) ──
function albumRows(n) {
  return { 2: [2], 3: [1, 2], 4: [2, 2], 5: [2, 3], 6: [3, 3], 7: [2, 2, 3], 8: [2, 3, 3], 9: [3, 3, 3], 10: [2, 2, 3, 3] }[n] || [n];
}
function mediaInfo(m) {
  const c = m.content;
  if (c['@type'] === 'messagePhoto') { const s = pickSize(c.photo.sizes, 600); return { kind: 'photo', w: s?.width || 1, h: s?.height || 1, file: s?.photo, mini: c.photo.minithumbnail?.data, photo: c.photo }; }
  if (c['@type'] === 'messageVideo') return { kind: 'video', w: c.video.width || 16, h: c.video.height || 9, thumb: c.video.thumbnail, mini: c.video.minithumbnail?.data, video: c.video };
  return { kind: 'other', w: 1, h: 1 };
}
function AlbumTile({ m, w, h }) {
  const info = mediaInfo(m);
  useEffect(() => { if (info.file) download(info.file, 2); if (info.thumb?.file) download(info.thumb.file, 2); }, [m.id]);
  const url = info.file ? fileUrl(info.file) : info.thumb?.format?.['@type'] === 'thumbnailFormatJpeg' ? fileUrl(info.thumb.file) : '';
  const open = e => { e.stopPropagation(); S.viewer = info.kind === 'video' ? { video: info.video } : { photo: info.photo, url }; changed(); };
  return html`<div class="album-tile photo" style=${`width:${w}px;height:${h}px`} data-mid=${m.id} onClick=${open}>
    ${info.mini && html`<img decoding="async" class="blur" src=${`data:image/jpeg;base64,${info.mini}`} alt=""/>`}
    ${url && html`<img decoding="async" class="full" src=${url} alt="" draggable="false"/>`}
    ${info.kind === 'video' && html`<div class="play-badge" style="width:36px;height:36px">${Icon.play(14)}</div>`}
    <${Upload} msg=${m}/>
  </div>`;
}
export const AlbumRow = memo(AlbumRowView, ['msgs', 'chat']);
function AlbumRowView({ msgs, chat, first, last }) {
  const lead = msgs[0], end = msgs[msgs.length - 1];
  const out = lead.is_outgoing && !isChannel(chat);
  const group = isGroup(chat);
  const W = 360, GAP = 2;
  const rows = []; let k = 0;
  for (const n of albumRows(msgs.length)) { rows.push(msgs.slice(k, k + n)); k += n; }
  const capMsg = msgs.find(m => m.content.caption?.text);
  const sender = S.users.get(lead.sender_id?.user_id);
  const onContext = e => { e.preventDefault(); openMenu(e.clientX, e.clientY, [
    { label: 'Ответить', icon: Icon.reply(), action: () => { S.reply = lead; changed(); focusComposer(); } },
    { label: 'Переслать', icon: Icon.forward(), action: () => openForward(chat.id, msgs.map(m => m.id)) },
    '-',
    { label: 'Удалить альбом', icon: Icon.trash(), danger: true, action: () => deleteMessages(chat.id, msgs.map(m => m.id), true).catch(err => showHud(err.message)) },
  ]); };
  return html`<div data-mid=${lead.id} class=${`msg-row ${out ? 'out' : 'in'} ${first ? 'first' : ''} ${last ? 'last' : ''}`} onContextMenu=${onContext}>
    ${group && !out && html`<div class="av-slot" onClick=${e => last && openSender(e, lead.sender_id)}>${last && sender && html`<${Avatar} user=${sender} size=${34}/>`}</div>`}
    <div class=${`bubble media album ${capMsg ? 'with-caption' : ''}`} style=${`width:${W}px`}>
      ${rows.map(row => {
        const ars = row.map(m => { const i = mediaInfo(m); return i.w / i.h; });
        const sum = ars.reduce((a, b) => a + b, 0);
        const rh = Math.min(260, Math.round((W - GAP * (row.length - 1)) / sum));
        return html`<div class="album-row" style=${`gap:${GAP}px;margin-bottom:${GAP}px`}>
          ${row.map((m, i) => html`<${AlbumTile} key=${m.id} m=${m} w=${Math.floor((W - GAP * (row.length - 1)) * ars[i] / sum)} h=${rh}/>`)}
        </div>`;
      })}
      ${capMsg ? html`<div class="caption"><span class="text selectable">${renderFormatted(capMsg.content.caption, onLink)}</span><${Meta} msg=${end} chat=${chat}/></div>`
        : html`<div class="meta-overlay">${metaInner(end, chat)}</div>`}
    </div>
  </div>`;
}

// ── тело сообщения ──
function uploadFile(c) {
  switch (c['@type']) {
    case 'messagePhoto': return [...c.photo.sizes].sort((a, b) => b.width - a.width)[0]?.photo;
    case 'messageVideo': return c.video.video;
    case 'messageAnimation': return c.animation.animation;
    case 'messageDocument': return c.document.document;
    case 'messageAudio': return c.audio.audio;
    default: return null;
  }
}
function Upload({ msg }) {
  if (msg.sending_state?.['@type'] !== 'messageSendingStatePending') return null;
  const f = fileOf(uploadFile(msg.content));
  const total = f?.expected_size || f?.size || 0;
  const pct = total ? Math.min(99, Math.round(100 * (f.remote?.uploaded_size || 0) / total)) : 0;
  return html`<div class="upload"><svg width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" fill="rgba(0,0,0,.45)"/>
    <circle cx="22" cy="22" r="16" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-dasharray=${`${Math.max(4, pct) * 1.005} 100.5`} transform="rotate(-90 22 22)" style="transition:stroke-dasharray .3s"/></svg>
    <span>${pct}%</span></div>`;
}

function Body({ msg, showName, chat }) {
  const c = msg.content;
  const t = c['@type'];
  const via = msg.via_bot_user_id && S.users.get(msg.via_bot_user_id)?.usernames?.active_usernames?.[0];
  const nameEl = (showName || via) && html`<div class="sender">${showName && html`<span class="peer-link" style=${`color:${nameColor(peerIndex(senderId(msg.sender_id)))}`} onClick=${e => openSender(e, msg.sender_id)}>${senderName(msg.sender_id) || chat.title}</span>`}<${ViaBot} msg=${msg}/></div>`;
  const fwd = msg.forward_info && html`<div class="sender fwd-from">Переслано от <span class="peer-link" onClick=${e => openForwardOrigin(e, msg.forward_info)}>${forwardName(msg.forward_info)}</span></div>`;
  const meta = html`<${Meta} msg=${msg} chat=${chat}/>`;
  switch (t) {
    case 'messageText': {
      const lp = c.link_preview || c.web_page;
      return html`<div class="bubble">${nameEl}${fwd}<${ReplyQuote} msg=${msg}/>
        ${lp && lp.show_above_text && html`<${LinkPreview} lp=${lp}/>`}
        <span class="text selectable">${renderFormatted(c.text, onLink)}</span>
        ${lp && !lp.show_above_text && html`<${LinkPreview} lp=${lp}/>`}${meta}</div>`;
    }
    case 'messagePoll':
      return html`<div class="bubble poll-bubble">${nameEl}${fwd}<${Poll} msg=${msg}/>${meta}</div>`;
    case 'messagePhoto': case 'messageVideo': case 'messageAnimation': {
      const cap = c.caption?.text;
      const media = t === 'messagePhoto' ? html`<${Photo} photo=${c.photo} overlay=${!cap && html`<div class="meta-overlay">${metaInner(msg, chat)}</div>`}/>`
        : html`<div style="position:relative"><${Video} video=${t === 'messageVideo' ? c.video : c.animation} gif=${t === 'messageAnimation'}/>${!cap && html`<div class="meta-overlay">${metaInner(msg, chat)}</div>`}</div>`;
      return html`<div class=${`bubble media ${cap ? 'with-caption' : ''}`}>
        ${(nameEl || fwd) && html`<div style="padding:6px 10px 2px">${nameEl}${fwd}</div>`}
        <div style="position:relative">${media}<${Upload} msg=${msg}/></div>
        ${cap && html`<div class="caption"><span class="text selectable">${renderFormatted(c.caption, onLink)}</span>${meta}</div>`}
      </div>`;
    }
    case 'messageSticker':
      return html`<div class="bubble sticker"><${Sticker} sticker=${c.sticker}/><div style="display:flex;justify-content:flex-end"><span class="meta-overlay" style="position:static">${metaInner(msg, chat)}</span></div></div>`;
    case 'messageAnimatedEmoji': {
      const st = c.animated_emoji?.sticker;
      if (st?.format?.['@type'] === 'stickerFormatTgs') return html`<div class="bubble sticker"><${Tgs} file=${st.sticker} size=${112} fallback=${c.emoji}/><div style="display:flex;justify-content:flex-end"><span class="meta-overlay" style="position:static">${metaInner(msg, chat)}</span></div></div>`;
      return html`<div class="bubble jumbo">${c.emoji}${meta}</div>`;
    }
    case 'messageVideoNote':
      return html`<div class="bubble round"><${ReplyQuote} msg=${msg}/><${VideoNote} msg=${msg}/><div><span class="meta-overlay">${metaInner(msg, chat)}</span></div></div>`;
    case 'messageVoiceNote':
      return html`<div class="bubble">${nameEl}<${ReplyQuote} msg=${msg}/><${Voice} msg=${msg}/>${meta}</div>`;
    case 'messageDocument':
      return html`<div class="bubble">${nameEl}${fwd}<${ReplyQuote} msg=${msg}/><div style="position:relative"><${Doc} name=${c.document.file_name || 'Файл'} size=${c.document.document?.size}/><${Upload} msg=${msg}/></div>
        ${c.caption?.text && html`<div class="text selectable">${renderFormatted(c.caption, onLink)}</div>`}${meta}</div>`;
    case 'messageAudio':
      return html`<div class="bubble">${nameEl}${fwd}<${ReplyQuote} msg=${msg}/><${Audio_} msg=${msg}/>
        ${c.caption?.text && html`<div class="text selectable">${renderFormatted(c.caption, onLink)}</div>`}${meta}</div>`;
    default:
      return html`<div class="bubble">${nameEl}${fwd}<span class="text" style="opacity:.8"><i>${contentSummary(c, id => userName(S.users.get(id)))}</i></span>${meta}</div>`;
  }
}

const QUICK = ['👍', '❤️', '🔥', '😂', '😮', '😢', '🙏', '👎'];
const reactionList = msg => {
  const r = msg.interaction_info?.reactions;
  return (Array.isArray(r) ? r : r?.reactions) || [];
};
export function toggleReaction(msg, emoji, chosen) {
  const reaction_type = { '@type': 'reactionTypeEmoji', emoji };
  const req = chosen
    ? { '@type': 'removeMessageReaction', chat_id: msg.chat_id, message_id: msg.id, reaction_type }
    : { '@type': 'addMessageReaction', chat_id: msg.chat_id, message_id: msg.id, reaction_type, is_big: false, update_recent_reactions: true };
  send(req).catch(e => showHud(/reaction/i.test(e.message || '') ? 'Эта реакция недоступна в этом чате' : e.message));
}
function Reactions({ msg }) {
  const list = reactionList(msg).filter(r => r.total_count > 0);
  if (!list.length) return null;
  return html`<div class="reactions">${list.map(r => {
    const emoji = r.type?.emoji || (r.type?.['@type'] === 'reactionTypePaid' ? '⭐' : '✨');
    return html`<button class=${`reaction ${r.is_chosen ? 'on' : ''}`} key=${emoji} onClick=${e => { e.stopPropagation(); if (r.type?.emoji) toggleReaction(msg, emoji, r.is_chosen); }}>
      <span class="r-emoji">${emoji}</span><span>${r.total_count}</span></button>`;
  })}</div>`;
}

// Нажали на отправителя (имя, аватар): профиль человека или канала поверх чата.
const peerOf = sid => (sid?.user_id ? { user: sid.user_id } : sid?.chat_id ? { chat: sid.chat_id } : null);
const openSender = (e, sid) => { e.stopPropagation(); const p = peerOf(sid); if (p) openPeerProfile(p); };
// «Переслано от»: человек — его профиль (если он не скрыл аккаунт), канал/чат — открыть его на этом посте.
function openForwardOrigin(e, fi) {
  e.stopPropagation();
  const o = fi.origin || {};
  if (o['@type'] === 'messageOriginUser') return openPeerProfile({ user: o.sender_user_id });
  if (o['@type'] === 'messageOriginHiddenUser') return showHud(`${o.sender_name} скрыл ссылку на свой аккаунт`);
  const cid = o.chat_id || o.sender_chat_id;
  if (!cid) return;
  if (o['@type'] === 'messageOriginChannel' && o.message_id) { selectChat(cid).then(() => setTimeout(() => jumpTo(cid, o.message_id), 300)).catch(() => openPeerProfile({ chat: cid })); return; }
  openPeerProfile({ chat: cid });
}
// «via @bot» — сообщение отправлено через встроенного бота; нажатие вставляет @бота в поле ввода
function ViaBot({ msg }) {
  const bot = msg.via_bot_user_id ? S.users.get(msg.via_bot_user_id) : null;
  const name = bot?.usernames?.active_usernames?.[0];
  if (!name) return null;
  return html` <span class="via-bot" onClick=${e => { e.stopPropagation(); const el = document.querySelector('.compose-input'); if (el) { el.value = `@${name} `; el.dispatchEvent(new Event('input', { bubbles: true })); el.focus(); } }}>via <b>@${name}</b></span>`;
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

// Число просмотров как в Telegram для macOS: 999, 1.2K, 12K, 1.2M.
function shortCount(n) {
  if (n < 1000) return String(n);
  if (n < 1e6) { const k = n / 1000; return `${k < 10 ? k.toFixed(1).replace(/\.0$/, '') : Math.floor(k)}K`; }
  const m = n / 1e6; return `${m < 10 ? m.toFixed(1).replace(/\.0$/, '') : Math.floor(m)}M`;
}
function metaInner(msg, chat) {
  const read = msg.is_outgoing && msg.id <= (chat.last_read_outbox_message_id || 0);
  const views = msg.interaction_info?.view_count;
  return html`${msg.edit_date ? html`<span class="edited">изм.</span>` : null}
    ${isChannel(chat) && views ? html`<span class="views">${MI('Icon_ChannelViews', 15)}${shortCount(views)}</span>` : null}
    ${hm(msg.date)}
    ${msg.is_outgoing && !isChannel(chat) && chat.id !== S.myId && (msg.sending_state ? (msg.sending_state['@type'] === 'messageSendingStateFailed' ? html`<span style="color:var(--red)">!</span>` : Icon.clock(12)) : read ? Icon.checks(13) : Icon.check(13))}`;
}
const Meta = ({ msg, chat }) => html`<span class="meta-inline">${metaInner(msg, chat)}</span>`;

// ── строка сообщения ──
// Ключ «внешнего» состояния сообщения: файлы, подсветка, выбор, плеер. Если он и само
// сообщение не изменились — строка не перерисовывается.
function collectFiles(o, out, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 6) return out;
  if (o['@type'] === 'file' || (typeof o.id === 'number' && o.local && typeof o.local === 'object')) { out.push(o.id); return out; }
  for (const k in o) { const v = o[k]; if (v && typeof v === 'object') collectFiles(v, out, depth + 1); }
  return out;
}
const fileKeys = new WeakMap();
export function msgDeps(m) {
  let ids = fileKeys.get(m.content);
  if (!ids) { ids = collectFiles(m.content, []); fileKeys.set(m.content, ids); }
  let f = '';
  for (const id of ids) {
    const x = S.files.get(id);
    if (!x) { f += '-'; continue; }
    f += x.local?.is_downloading_completed ? 'c' : Math.floor(20 * (x.local?.downloaded_size || 0) / (x.size || 1));
    f += x.remote?.is_uploading_completed ? 'u' : Math.floor(20 * (x.remote?.uploaded_size || 0) / (x.size || 1));
    f += ',';
  }
  const pl = S.player && S.player.chatId === m.chat_id && S.player.msgId === m.id ? (S.player.playing ? 'P' : 'p') : '';
  const sel = S.selection?.chatId === m.chat_id ? (S.selection.ids.has(m.id) ? 2 : 1) : 0;
  return `${f}|${S.highlight === m.id ? 1 : 0}|${sel}|${S.fresh.has(m.id) ? 1 : 0}|${pl}`;
}

export const MessageRow = memo(MessageRowView, ['chat']);
function MessageRowView({ msg, chat, first, last, inThread }) {
  const c = msg.content;
  const fresh = S.fresh.has(msg.id);
  useEffect(() => { if (fresh) setTimeout(() => S.fresh.delete(msg.id), 600); }, [fresh]);
  // Новое сообщение: лента поднимается на его высоту, как в TableAnimationInterface (macOS).
  useLayoutEffect(() => { if (fresh) insertAtBottom(document.querySelector(`.messages [data-mid="${msg.id}"]`)); }, []);
  if (isServiceType(c)) {
    const actor = senderName(msg.sender_id);
    const t = serviceText(c, id => userName(S.users.get(id)));
    return html`<div class="service" data-mid=${msg.id}><span>${['messageChatJoinByLink', 'messageChatJoinByRequest', 'messagePinMessage', 'messageChatChangePhoto', 'messageContactRegistered'].includes(c['@type']) ? `${actor} — ${t.toLowerCase()}` : t}</span></div>`;
  }
  const out = msg.is_outgoing && !isChannel(chat);
  const group = isGroup(chat);
  const showAvatar = group && !out;
  const jumbo = S.prefs.bigEmoji === false ? null : jumboEmoji(c);

  const onContext = e => {
    e.preventDefault();
    const chosen = new Set(reactionList(msg).filter(r => r.is_chosen).map(r => r.type?.emoji));
    // Только реакции, разрешённые в этом чате (иначе Telegram отвечает «реакция недоступна»).
    const ar = (S.chats.get(chat.id) || chat).available_reactions;
    const allowed = ar?.['@type'] === 'chatAvailableReactionsSome' ? ar.reactions.map(r => r.emoji).filter(Boolean) : null;
    const first = (allowed ? allowed : QUICK).slice(0, 8);
    const items = first.length ? [{ reactions: first, chosen, pick: emoji => toggleReaction(msg, emoji, chosen.has(emoji)) }] : [];
    // Точный список для этого сообщения — от TDLib (как в официальных клиентах); меню обновится само.
    send({ '@type': 'getMessageAvailableReactions', chat_id: msg.chat_id, message_id: msg.id, row_size: 8 }).then(r => {
      const list = [...(r.top_reactions || []), ...(r.recent_reactions || []), ...(r.popular_reactions || [])]
        .filter(x => x.type?.['@type'] === 'reactionTypeEmoji' && !x.needs_premium).map(x => x.type.emoji);
      const uniq = [...new Set(list)].slice(0, 8);
      if (!S.menu || S.menu.items !== items) return;
      if (uniq.length) { if (items[0]?.reactions) items[0].reactions = uniq; else items.unshift({ reactions: uniq, chosen, pick: emoji => toggleReaction(msg, emoji, chosen.has(emoji)) }); }
      else if (items[0]?.reactions) items.shift();
      changed();
    }).catch(() => {});
    const text = c.text?.text || c.caption?.text;
    if (canReply(chat)) items.push({ label: 'Ответить', icon: Icon.reply(), action: () => { S.reply = msg; S.editing = null; changed(); focusComposer(); } });
    if (msg.is_outgoing && c['@type'] === 'messageText' && Date.now() / 1000 - msg.date < 48 * 3600) {
      items.push({ label: 'Изменить', icon: Icon.edit(), action: () => { S.editing = msg; S.reply = null; changed(); focusComposer(msg.content.text.text); } });
    }
    if (text) items.push({ label: 'Копировать текст', icon: Icon.copy(), action: () => navigator.clipboard.writeText(text).then(() => showHud('Скопировано')) });
    if (msg.can_be_forwarded !== false) items.push({ label: 'Переслать', icon: Icon.forward(), action: () => openForward(chat.id, [msg.id]) });
    if (chat.type?.['@type'] === 'chatTypeSupergroup') items.push({ label: 'Копировать ссылку', icon: Icon.menu('menu_copy_link'), action: () => send({ '@type': 'getMessageLink', chat_id: chat.id, message_id: msg.id, media_timestamp: 0, for_album: false, in_message_thread: false })
      .then(r => navigator.clipboard.writeText(r.link)).then(() => showHud('Ссылка скопирована')).catch(err => showHud(err.message)) });
    items.push(msg.is_pinned
      ? { label: 'Открепить', icon: Icon.menu('menu_unpin'), action: () => send({ '@type': 'unpinChatMessage', chat_id: chat.id, message_id: msg.id }).catch(err => showHud(err.message)) }
      : { label: 'Закрепить', icon: Icon.menu('menu_pin'), action: () => send({ '@type': 'pinChatMessage', chat_id: chat.id, message_id: msg.id, disable_notification: false, only_for_self: false }).then(() => showHud('Сообщение закреплено')).catch(err => showHud(err.message?.includes('RIGHT') || err.message?.includes('ADMIN') ? 'Нет прав закреплять сообщения' : err.message)) });
    items.push({ label: 'Выбрать', icon: Icon.menu('menu_select_messages'), action: () => startSelection(chat.id, msg.id) });
    items.push('-');
    items.push({ label: 'Удалить', icon: Icon.trash(), danger: true, action: () => confirmDelete(chat, msg) });
    openMenu(e.clientX, e.clientY, items);
  };

  const body = jumbo
    ? html`<div class="bubble jumbo">${jumbo}<${Meta} msg=${msg} chat=${chat}/></div>`
    : html`<${Body} msg=${msg} chat=${chat} showName=${group && !out && first}/>`;
  // Комментарии к посту канала — полоска внизу пузыря, как в Telegram для macOS.
  // Для кружков, стикеров и крупных смайликов — маленькая кнопка сбоку (как ChannelCommentsSmallControl).
  const comments = isChannel(chat) && !inThread && msg.interaction_info?.reply_info && S.selection?.chatId !== chat.id;
  const compactComments = comments && (jumbo || ['messageVideoNote', 'messageSticker', 'messageAnimatedEmoji', 'messageDice'].includes(c['@type']));
  const content = comments && !compactComments ? html`<div class="with-comments">${body}<${CommentsBar} msg=${msg} chat=${chat}/></div>` : body;
  const reacts = reactionList(msg).some(r => r.total_count > 0);
  const sender = S.users.get(msg.sender_id?.user_id);
  const senderChat = msg.sender_id?.chat_id ? S.chats.get(msg.sender_id.chat_id) : null;
  const selecting = S.selection?.chatId === chat.id;
  const selected = selecting && S.selection.ids.has(msg.id);
  const kb = msg.reply_markup?.['@type'] === 'replyMarkupInlineKeyboard' ? html`<${InlineKeyboard} msg=${msg}/>` : null;
  // Кнопка «Переслать» рядом с постом канала — как в Telegram для macOS.
  const share = isChannel(chat) && !selecting && !inThread && msg.can_be_forwarded !== false;
  return html`<div data-mid=${msg.id}
      class=${`msg-row ${out ? 'out' : 'in'} ${first ? 'first' : ''} ${last ? 'last' : ''} ${fresh ? 'fresh' : ''} ${S.highlight === msg.id ? 'highlight' : ''} ${selecting ? 'selecting' : ''} ${selected ? 'selected' : ''}`}
      onClickCapture=${e => { if (selecting) { e.stopPropagation(); e.preventDefault(); toggleSelected(msg.id); } }}
      onContextMenu=${e => { if (selecting) { e.preventDefault(); return; } onContext(e); }} onDblClick=${() => { if (!selecting && canReply(chat)) { S.reply = msg; changed(); focusComposer(); } }}>
    ${selecting && html`<span class=${`sel-check ${selected ? 'on' : ''}`}>${selected && Icon.check(12)}</span>`}
    ${showAvatar && html`<div class="av-slot" onClick=${e => last && openSender(e, msg.sender_id)}>${last && (sender || senderChat) && html`<${Avatar} user=${sender} chat=${senderChat} size=${34}/>`}</div>`}
    ${reacts ? html`<div class="with-reactions">${content}<${Reactions} msg=${msg}/>${kb}</div>` : kb ? html`<div class="with-kb">${content}${kb}</div>` : content}
    ${(share || compactComments) && html`<div class="side-actions">
      ${share && html`<button class="share-btn glass" title="Переслать" onClick=${e => { e.stopPropagation(); openForward(chat.id, [msg.id]); }}>${Icon.forward(16)}</button>`}
      ${compactComments && html`<${CommentsBar} msg=${msg} chat=${chat} compact=${true}/>`}
    </div>`}
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
    const el = document.querySelector('.nav-next .compose-input') || document.querySelector('.compose-input');
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
