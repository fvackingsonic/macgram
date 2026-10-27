import { html, useState, useEffect, useRef } from '../lib.js';
import { S, changed, showHud } from '../store.js';
import { send, shell } from '../td.js';
import { Icon } from '../icons.js';
import { count } from '../format.js';

const IMG = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'bmp'];
const VIDEO = ['mp4', 'mov', 'webm', 'mkv', 'm4v'];
const AUDIO = ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'opus', 'aac'];
const ext = p => (p.split('.').pop() || '').toLowerCase();
const baseName = p => p.split(/[\\/]/).pop();

export function kindOf(path) {
  const e = ext(path);
  if (IMG.includes(e)) return 'photo';
  if (e === 'gif') return 'gif';
  if (VIDEO.includes(e)) return 'video';
  if (AUDIO.includes(e)) return 'audio';
  return 'file';
}

export function openSendDialog(paths) {
  if (!S.currentChatId || !paths?.length) return;
  const files = paths.slice(0, 50).map(p => ({ path: p, name: baseName(p), kind: kindOf(p) }));
  const old = S.sendDialog?.chatId === S.currentChatId ? S.sendDialog.files : [];
  S.sendDialog = { chatId: S.currentChatId, files: [...old, ...files], compress: true, out: false };
  changed();
}

export async function pickAndSend(media = false) {
  try {
    const paths = await shell.pickFiles(media);
    openSendDialog(paths);
  } catch (e) { showHud(String(e)); }
}

export async function pasteImage(file) {
  const e = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  const path = await shell.savePaste(btoa(bin), e);
  openSendDialog([path]);
}

const local = path => ({ '@type': 'inputFileLocal', path });
const caption = text => ({ '@type': 'formattedText', text: text || '', entities: [] });

function content(f, compress, cap) {
  if (compress && f.kind === 'photo') return { '@type': 'inputMessagePhoto', photo: local(f.path), caption: caption(cap) };
  if (compress && f.kind === 'gif') return { '@type': 'inputMessageAnimation', animation: local(f.path), caption: caption(cap) };
  if (compress && f.kind === 'video') return { '@type': 'inputMessageVideo', video: local(f.path), supports_streaming: true, caption: caption(cap) };
  if (f.kind === 'audio') return { '@type': 'inputMessageAudio', audio: local(f.path), caption: caption(cap) };
  return { '@type': 'inputMessageDocument', document: local(f.path), caption: caption(cap) };
}

export async function sendFiles(chatId, files, compress, text) {
  const reply = S.reply;
  S.reply = null; changed();
  const reply_to = reply ? { '@type': 'inputMessageReplyToMessage', message_id: reply.id } : undefined;
  const media = compress ? files.filter(f => f.kind === 'photo' || f.kind === 'video') : [];
  const rest = files.filter(f => !media.includes(f));
  try {
    // Фото и видео отправляем альбомами по 10, как это делает Telegram.
    let capUsed = false;
    for (let i = 0; i < media.length; i += 10) {
      const chunk = media.slice(i, i + 10);
      const cap = capUsed ? '' : text;
      capUsed = capUsed || !!text;
      if (chunk.length === 1) await send({ '@type': 'sendMessage', chat_id: chatId, reply_to, input_message_content: content(chunk[0], true, cap) });
      else await send({ '@type': 'sendMessageAlbum', chat_id: chatId, reply_to, input_message_contents: chunk.map((f, j) => content(f, true, j === 0 ? cap : '')) });
    }
    for (let i = 0; i < rest.length; i++) {
      const cap = !capUsed && i === rest.length - 1 ? text : '';
      if (cap) capUsed = true;
      await send({ '@type': 'sendMessage', chat_id: chatId, reply_to, input_message_content: content(rest[i], compress, cap) });
    }
    if (!capUsed && text?.trim()) await send({ '@type': 'sendMessage', chat_id: chatId, input_message_content: { '@type': 'inputMessageText', text: caption(text) } });
  } catch (e) {
    showHud(e.message || 'Не удалось отправить');
  }
}

function closeDialog() {
  if (!S.sendDialog) return;
  S.sendDialog.out = true; changed();
  setTimeout(() => { S.sendDialog = null; changed(); }, 180);
}

function Preview({ f, onRemove }) {
  const url = f.kind === 'photo' || f.kind === 'gif' ? shell.fileUrl(f.path) : '';
  const [bad, setBad] = useState(false);
  return html`<div class=${`sd-item ${url && !bad ? 'img' : ''}`}>
    ${url && !bad ? html`<img src=${url} alt="" onError=${() => setBad(true)}/>`
      : html`<div class="sd-file"><div class="file-ic" style="background:var(--accent);color:#fff">${f.kind === 'video' ? Icon.play(18) : f.kind === 'audio' ? Icon.play(18) : Icon.file(20)}</div><span>${f.name}</span></div>`}
    <button class="sd-remove" title="Убрать" onClick=${onRemove}>${Icon.close(11)}</button>
  </div>`;
}

export function SendDialog() {
  const d = S.sendDialog;
  const [text, setText] = useState('');
  const ref = useRef();
  useEffect(() => { if (d && !d.out) setTimeout(() => ref.current?.focus(), 50); else if (!d) setText(''); }, [!!d]);
  if (!d) return null;
  const hasMedia = d.files.some(f => f.kind === 'photo' || f.kind === 'video' || f.kind === 'gif');
  const n = d.files.length;
  const allPhotos = d.files.every(f => f.kind === 'photo');
  const title = d.compress && allPhotos ? `Отправить ${count(n, 'фото', 'фото', 'фото')}` : `Отправить ${count(n, 'файл', 'файла', 'файлов')}`;
  const go = () => { const { chatId, files, compress } = d; closeDialog(); sendFiles(chatId, files, compress, text); setText(''); };
  const remove = i => { d.files = d.files.filter((_, j) => j !== i); if (!d.files.length) closeDialog(); changed(); };
  return html`<div class=${`veil ${d.out ? 'out' : ''}`} onMouseDown=${e => e.target === e.currentTarget && closeDialog()}
      onKeyDown=${e => { if (e.key === 'Escape') closeDialog(); }}>
    <div class="sheet send-sheet">
      <div class="sd-title">${title}</div>
      <div class=${`sd-grid ${n === 1 ? 'one' : ''}`}>${d.files.map((f, i) => html`<${Preview} key=${f.path} f=${f} onRemove=${() => remove(i)}/>`)}</div>
      ${hasMedia && html`<label class="sd-check"><input type="checkbox" checked=${d.compress} onChange=${e => { d.compress = e.target.checked; changed(); }}/>Сжать (отправить как фото/видео)</label>`}
      <input ref=${ref} class="sd-caption" placeholder="Подпись" value=${text} onInput=${e => setText(e.target.value)}
        onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); go(); } }}/>
      <div class="sd-btns">
        <button class="btn second" onClick=${() => pickAndSend(false)}>Добавить</button>
        <span style="flex:1"/>
        <button class="btn second" onClick=${closeDialog}>Отмена</button>
        <button class="btn" onClick=${go}>Отправить</button>
      </div>
    </div>
  </div>`;
}

// Подсветка окна при перетаскивании файлов.
export function DropOverlay() {
  if (!S.dragging || !S.currentChatId) return null;
  return html`<div class="drop-overlay"><div class="drop-box">${Icon.attach(36)}<div>Отпустите, чтобы отправить</div></div></div>`;
}

shell.listen('files-dropped', paths => openSendDialog(paths));
shell.listen('drag-state', on => { S.dragging = !!on; changed(); });
