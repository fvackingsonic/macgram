import { html, useEffect, useState, useRef } from '../lib.js';
import { S, changed, useTick, jumpTo, download, fileUrl, fileOf, senderName, senderId, openMenu, openModal, closeModal, showHud, deleteMessages, isGroup, isChannel, chatUser } from '../store.js';
import { send, shell } from '../td.js';
import { Icon } from '../icons.js';
import { hm, renderFormatted, contentSummary, fileSize, duration, peerIndex, nameColor, jumboEmoji, userName, serviceText, count } from '../format.js';
import { openForward, startSelection, toggleSelected } from './forward.js';
import { Avatar } from './common.js';
import { player, progress } from '../player.js';
import { Tgs } from './tgs.js';

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
  const openViewer = e => { e.stopPropagation(); S.viewer = { video }; changed(); };
  return html`<div class="photo" style=${`width:${W}px;height:${H}px;cursor:pointer`} onClick=${e => !gif && openViewer(e)}>
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
  if (fmt === 'stickerFormatTgs') return html`<${Tgs} file=${sticker.sticker} size=${160} fallback=${sticker.emoji || '🙂'}/>`;
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
  useEffect(() => { if (visible) download(note.video, 1); }, [visible]);
  const src = fileUrl(note.video);
  const active = S.player?.kind === 'note' && S.player.msgId === msg.id && S.player.chatId === msg.chat_id;
  useEffect(() => {
    const v = ref.current; if (!v || active) return;
    if (visible) v.play().catch(() => {}); else v.pause();
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
    ${mini && html`<img class="blur" src=${`data:image/jpeg;base64,${mini}`} alt=""/>`}
    ${thumb && !src && html`<img src=${thumb} alt="" onError=${e => e.target.remove()}/>`}
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
    ${url && !big && html`<img class="lp-thumb" src=${url} alt=""/>`}
    ${url && big && html`<img class="lp-big" src=${url} alt=""/>`}
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
    ${info.mini && html`<img class="blur" src=${`data:image/jpeg;base64,${info.mini}`} alt=""/>`}
    ${url && html`<img class="full" src=${url} alt="" draggable="false"/>`}
    ${info.kind === 'video' && html`<div class="play-badge" style="width:36px;height:36px">${Icon.play(14)}</div>`}
    <${Upload} msg=${m}/>
  </div>`;
}
export function AlbumRow({ msgs, chat, first, last }) {
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
    ${group && !out && html`<div class="av-slot">${last && sender && html`<${Avatar} user=${sender} size=${34}/>`}</div>`}
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
  const nameEl = showName && html`<div class="sender" style=${`color:${nameColor(peerIndex(senderId(msg.sender_id)))}`}>${senderName(msg.sender_id) || chat.title}</div>`;
  const fwd = msg.forward_info && html`<div class="sender" style="font-weight:500;opacity:.85">Переслано от ${forwardName(msg.forward_info)}</div>`;
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
  send(req).catch(e => showHud(e.message?.includes('REACTION') ? 'Эта реакция недоступна в чате' : e.message));
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
    const chosen = new Set(reactionList(msg).filter(r => r.is_chosen).map(r => r.type?.emoji));
    const items = [{ reactions: QUICK, chosen, pick: emoji => toggleReaction(msg, emoji, chosen.has(emoji)) }];
    const text = c.text?.text || c.caption?.text;
    if (canReply(chat)) items.push({ label: 'Ответить', icon: Icon.reply(), action: () => { S.reply = msg; S.editing = null; changed(); focusComposer(); } });
    if (msg.is_outgoing && c['@type'] === 'messageText' && Date.now() / 1000 - msg.date < 48 * 3600) {
      items.push({ label: 'Изменить', icon: Icon.edit(), action: () => { S.editing = msg; S.reply = null; changed(); focusComposer(msg.content.text.text); } });
    }
    if (text) items.push({ label: 'Копировать текст', icon: Icon.copy(), action: () => navigator.clipboard.writeText(text).then(() => showHud('Скопировано')) });
    if (msg.can_be_forwarded !== false) items.push({ label: 'Переслать', icon: Icon.forward(), action: () => openForward(chat.id, [msg.id]) });
    items.push(msg.is_pinned
      ? { label: 'Открепить', icon: Icon.menu('menu_unpin'), action: () => send({ '@type': 'unpinChatMessage', chat_id: chat.id, message_id: msg.id }).catch(err => showHud(err.message)) }
      : { label: 'Закрепить', icon: Icon.menu('menu_pin'), action: () => send({ '@type': 'pinChatMessage', chat_id: chat.id, message_id: msg.id, disable_notification: false, only_for_self: false }).then(() => showHud('Сообщение закреплено')).catch(err => showHud(err.message?.includes('RIGHT') || err.message?.includes('ADMIN') ? 'Нет прав закреплять сообщения' : err.message)) });
    items.push({ label: 'Выбрать', icon: Icon.menu('menu_select_messages'), action: () => startSelection(chat.id, msg.id) });
    items.push('-');
    items.push({ label: 'Удалить', icon: Icon.trash(), danger: true, action: () => confirmDelete(chat, msg) });
    openMenu(e.clientX, e.clientY, items);
  };

  const content = jumbo
    ? html`<div class="bubble jumbo">${jumbo}<${Meta} msg=${msg} chat=${chat}/></div>`
    : html`<${Body} msg=${msg} chat=${chat} showName=${group && !out && first}/>`;
  const reacts = reactionList(msg).some(r => r.total_count > 0);
  const sender = S.users.get(msg.sender_id?.user_id);
  const senderChat = msg.sender_id?.chat_id ? S.chats.get(msg.sender_id.chat_id) : null;
  const selecting = S.selection?.chatId === chat.id;
  const selected = selecting && S.selection.ids.has(msg.id);
  return html`<div data-mid=${msg.id}
      class=${`msg-row ${out ? 'out' : 'in'} ${first ? 'first' : ''} ${last ? 'last' : ''} ${fresh ? 'fresh' : ''} ${S.highlight === msg.id ? 'highlight' : ''} ${selecting ? 'selecting' : ''} ${selected ? 'selected' : ''}`}
      onClickCapture=${e => { if (selecting) { e.stopPropagation(); e.preventDefault(); toggleSelected(msg.id); } }}
      onContextMenu=${e => { if (selecting) { e.preventDefault(); return; } onContext(e); }} onDblClick=${() => { if (!selecting && canReply(chat)) { S.reply = msg; changed(); focusComposer(); } }}>
    ${selecting && html`<span class=${`sel-check ${selected ? 'on' : ''}`}>${selected && Icon.check(12)}</span>`}
    ${showAvatar && html`<div class="av-slot">${last && (sender || senderChat) && html`<${Avatar} user=${sender} chat=${senderChat} size=${34}/>`}</div>`}
    ${reacts ? html`<div class="with-reactions">${content}<${Reactions} msg=${msg}/></div>` : content}
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
