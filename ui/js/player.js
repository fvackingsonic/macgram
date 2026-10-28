// Общий аудиоплеер (голосовые и музыка). Живёт отдельно от экрана чата,
// поэтому звук не прерывается при переходе в другой чат.
import { S, changed, tick, download, fileUrl, fileOf } from './store.js';

const audio = new Audio();
audio.preload = 'auto';
let pendingFile = null;

// Обложка трека из Telegram: маленькая вшитая или большая из каталога обложек Telegram.
export const coverOf = a => a?.external_album_covers?.[0]?.file || a?.album_cover_thumbnail?.file || null;
const sameMsg = (a, b) => a && b && a.chat_id === b.chat_id && a.id === b.id;

export const player = {
  get state() { return S.player; },
  isCurrent: msg => S.player && S.player.chatId === msg.chat_id && S.player.msgId === msg.id,
  // queue — список треков мини-плеера (поиск, исполнитель, «музыка из чатов»): «вперёд/назад» идут по нему.
  play(msg, queue) {
    const c = msg.content;
    const isVoice = c['@type'] === 'messageVoiceNote';
    const file = isVoice ? c.voice_note.voice : c.audio.audio;
    if (player.isCurrent(msg)) { toggle(); return; }
    const q = isVoice ? null : queue || (S.player?.queue?.some(m => sameMsg(m, msg)) ? S.player.queue : null);
    S.player = {
      chatId: msg.chat_id, msgId: msg.id, kind: isVoice ? 'voice' : 'audio', file,
      title: isVoice ? 'Голосовое сообщение' : (c.audio.title || c.audio.file_name || 'Аудио'),
      performer: isVoice ? '' : (c.audio.performer || ''),
      duration: isVoice ? c.voice_note.duration : c.audio.duration,
      time: 0, playing: false, loading: true,
      rate: S.player?.rate || 1, volume: S.player?.volume ?? 1, repeat: S.player?.repeat || 'none',
      cover: isVoice ? null : coverOf(c.audio), queue: q, shuffle: !!S.player?.shuffle, msg,
    };
    if (S.player.cover) download(S.player.cover, 8);
    audio.pause();
    pendingFile = file.id;
    download(file, 32);
    tryStart();
    changed();
  },
  // Кружок играет в своём <video>, но управляется тем же плеером (полоска сверху), как на Mac.
  playNote(msg, el, author) {
    if (S.player?.el === el) { toggle(); return; }
    if (S.player && !S.player.el) { audio.pause(); }
    else if (S.player?.el) releaseNote(S.player.el);
    S.player = {
      chatId: msg.chat_id, msgId: msg.id, kind: 'note', el, file: msg.content.video_note.video,
      title: 'Видеосообщение', performer: author || '', duration: msg.content.video_note.duration,
      time: 0, playing: true, loading: false, rate: S.player?.rate || 1, volume: S.player?.volume ?? 1,
    };
    el.loop = false; el.currentTime = 0; el.muted = false; el.volume = S.player.volume; el.playbackRate = S.player.rate;
    el.ontimeupdate = () => { if (S.player?.el === el) { S.player.time = el.currentTime; tick(); } };
    el.onplay = () => { if (S.player?.el === el) { S.player.playing = true; changed(); } };
    el.onpause = () => { if (S.player?.el === el) { S.player.playing = false; changed(); } };
    el.onended = () => { if (S.player?.el === el) { releaseNote(el); S.player = null; changed(); } };
    el.play().catch(() => {});
    changed();
  },
  toggle: () => toggle(),
  // Соседние треки того же вида в этом чате (как «назад/вперёд» в плеере Mac).
  neighbor(dir) {
    const p = S.player; if (!p || p.kind === 'note') return null;
    if (p.queue?.length) {
      const q = p.queue, i = q.findIndex(m => m.chat_id === p.chatId && m.id === p.msgId);
      if (p.shuffle && dir > 0 && q.length > 1) {
        p.shuffleNext ||= q.filter((_, k) => k !== i)[Math.floor(Math.random() * (q.length - 1))];
        return p.shuffleNext;
      }
      return q[i + dir] || (p.repeat === 'all' ? q[dir > 0 ? 0 : q.length - 1] : null);
    }
    const type = p.kind === 'voice' ? 'messageVoiceNote' : 'messageAudio';
    const list = (S.history.get(p.chatId)?.list || []).filter(m => m.content['@type'] === type);
    const i = list.findIndex(m => m.id === p.msgId);
    return i < 0 ? null : list[i + dir] || null;
  },
  next() { const m = player.neighbor(1); if (m) player.play(m); },
  prev() {
    const m = media();
    if (m.currentTime > 3 || !player.neighbor(-1)) { m.currentTime = 0; return; }
    player.play(player.neighbor(-1));
  },
  setRepeat(r) { if (S.player) { S.player.repeat = r; changed(); } },
  setShuffle(on) { if (S.player) { S.player.shuffle = on; S.player.shuffleNext = null; changed(); } },
  toggleMute() { if (!S.player) return; const m = media(); m.muted = !m.muted; S.player.muted = m.muted; changed(); },
  seek(fraction) {
    if (!S.player) return;
    const m = media();
    const d = (isFinite(m.duration) && m.duration) || S.player.duration || 0;
    if (d) m.currentTime = Math.max(0, Math.min(d, fraction * d));
  },
  setRate(r) { if (S.player) { S.player.rate = r; media().playbackRate = r; changed(); } },
  setVolume(v) { if (S.player) { S.player.volume = v; media().volume = v; changed(); } },
  stop() {
    if (S.player?.el) releaseNote(S.player.el);
    else { audio.pause(); audio.removeAttribute('src'); }
    S.player = null; pendingFile = null; changed();
  },
};

const media = () => S.player?.el || audio;
// Вернуть кружок в беззвучный повтор.
function releaseNote(el) {
  el.ontimeupdate = el.onplay = el.onpause = el.onended = null;
  el.muted = true; el.loop = true; el.playbackRate = 1;
  el.play().catch(() => {});
}

function toggle() {
  if (!S.player) return;
  const m = media();
  if (m.paused) m.play().catch(() => {}); else m.pause();
}

function tryStart() {
  const p = S.player;
  if (!p || pendingFile !== p.file.id) return;
  const url = fileUrl(p.file);
  if (!url) return;
  pendingFile = null;
  audio.src = url;
  audio.playbackRate = p.rate;
  audio.volume = p.volume;
  audio.play().catch(() => {});
}

// TDLib сообщает о скачивании через updateFile — пробуем стартовать, когда файл готов.
setInterval(() => { if (pendingFile) tryStart(); }, 250);

let lastTick = 0;
audio.addEventListener('timeupdate', () => {
  if (!S.player) return;
  S.player.time = audio.currentTime;
  const now = Date.now();
  if (now - lastTick > 100) { lastTick = now; tick(); }
});
audio.addEventListener('play', () => { if (S.player) { S.player.playing = true; S.player.loading = false; changed(); } });
audio.addEventListener('pause', () => { if (S.player) { S.player.playing = false; changed(); } });
audio.addEventListener('loadedmetadata', () => { if (S.player && audio.duration && isFinite(audio.duration)) { S.player.duration = audio.duration; changed(); } });
audio.addEventListener('ended', () => {
  const p = S.player;
  if (!p) return;
  if (p.repeat === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
  if (p.queue?.length) { const n = player.neighbor(1); if (n) player.play(n); else { p.playing = false; p.time = 0; changed(); } return; }
  // Как на Mac: после голосового сразу включается следующее голосовое в этом чате.
  const list = S.history.get(p.chatId)?.list || [];
  const next = list.find(m => m.id > p.msgId && m.content['@type'] === (p.kind === 'voice' ? 'messageVoiceNote' : 'messageAudio'));
  if (next) player.play(next); else { p.playing = false; p.time = 0; changed(); }
});

export const progress = () => {
  const p = S.player;
  if (!p) return 0;
  const m = media();
  const d = m.duration && isFinite(m.duration) ? m.duration : p.duration;
  return d ? Math.min(1, p.time / d) : 0;
};
export const downloadProgress = file => {
  const f = fileOf(file);
  return f?.size ? (f.local?.downloaded_size || 0) / f.size : 0;
};

// Одновременно играет только один звук: голосовое/музыка, видео, кружок со звуком или история.
// Беззвучные анимации (GIF, видеостикеры, кружки без звука) не трогаем.
document.addEventListener('play', e => {
  const t = e.target;
  if (!(t instanceof HTMLMediaElement) || t.muted) return;
  if (!audio.paused) audio.pause();
  if (S.player?.el && S.player.el !== t) { releaseNote(S.player.el); S.player = null; changed(); }
  document.querySelectorAll('audio, video').forEach(m => { if (m !== t && !m.muted && !m.paused) m.pause(); });
}, true);
audio.addEventListener('play', () => {
  document.querySelectorAll('audio, video').forEach(m => { if (!m.muted && !m.paused && m !== S.player?.el) m.pause(); });
  window.dispatchEvent(new CustomEvent('mg-play', { detail: 'chat' })); // плеер с нотой — на паузу
});
// заиграл плеер с нотой — музыка из чата на паузу
window.addEventListener('mg-play', e => { if (e.detail === 'music') { if (!audio.paused) audio.pause(); if (S.player?.el && !S.player.el.paused) S.player.el.pause(); } });
// Кружок, включённый со звуком, тоже ставит плеер на паузу (событие volumechange).
document.addEventListener('volumechange', e => {
  const t = e.target;
  if (t instanceof HTMLMediaElement && !t.muted && !t.paused && !audio.paused && t !== S.player?.el) audio.pause();
}, true);
