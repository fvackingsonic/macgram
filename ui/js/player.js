// Общий аудиоплеер (голосовые и музыка). Живёт отдельно от экрана чата,
// поэтому звук не прерывается при переходе в другой чат.
import { S, changed, download, fileUrl, fileOf } from './store.js';

const audio = new Audio();
audio.preload = 'auto';
let pendingFile = null;

export const player = {
  get state() { return S.player; },
  isCurrent: msg => S.player && S.player.chatId === msg.chat_id && S.player.msgId === msg.id,
  play(msg) {
    const c = msg.content;
    const isVoice = c['@type'] === 'messageVoiceNote';
    const file = isVoice ? c.voice_note.voice : c.audio.audio;
    if (player.isCurrent(msg)) { toggle(); return; }
    S.player = {
      chatId: msg.chat_id, msgId: msg.id, kind: isVoice ? 'voice' : 'audio', file,
      title: isVoice ? 'Голосовое сообщение' : (c.audio.title || c.audio.file_name || 'Аудио'),
      performer: isVoice ? '' : (c.audio.performer || ''),
      duration: isVoice ? c.voice_note.duration : c.audio.duration,
      time: 0, playing: false, loading: true,
      rate: S.player?.rate || 1, volume: S.player?.volume ?? 1,
    };
    audio.pause();
    pendingFile = file.id;
    download(file, 32);
    tryStart();
    changed();
  },
  toggle: () => toggle(),
  seek(fraction) {
    if (!S.player) return;
    const d = audio.duration || S.player.duration || 0;
    if (d) audio.currentTime = Math.max(0, Math.min(d, fraction * d));
  },
  setRate(r) { if (S.player) { S.player.rate = r; audio.playbackRate = r; changed(); } },
  setVolume(v) { if (S.player) { S.player.volume = v; audio.volume = v; changed(); } },
  stop() { audio.pause(); audio.removeAttribute('src'); S.player = null; pendingFile = null; changed(); },
};

function toggle() {
  if (!S.player) return;
  if (audio.paused) audio.play().catch(() => {}); else audio.pause();
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
  if (now - lastTick > 200) { lastTick = now; changed(); }
});
audio.addEventListener('play', () => { if (S.player) { S.player.playing = true; S.player.loading = false; changed(); } });
audio.addEventListener('pause', () => { if (S.player) { S.player.playing = false; changed(); } });
audio.addEventListener('loadedmetadata', () => { if (S.player && audio.duration && isFinite(audio.duration)) { S.player.duration = audio.duration; changed(); } });
audio.addEventListener('ended', () => {
  const p = S.player;
  if (!p) return;
  // Как на Mac: после голосового сразу включается следующее голосовое в этом чате.
  const list = S.history.get(p.chatId)?.list || [];
  const next = list.find(m => m.id > p.msgId && m.content['@type'] === (p.kind === 'voice' ? 'messageVoiceNote' : 'messageAudio'));
  if (next) player.play(next); else { p.playing = false; p.time = 0; changed(); }
});

export const progress = () => {
  const p = S.player;
  if (!p) return 0;
  const d = audio.duration && isFinite(audio.duration) ? audio.duration : p.duration;
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
  document.querySelectorAll('audio, video').forEach(m => { if (m !== t && !m.muted && !m.paused) m.pause(); });
}, true);
audio.addEventListener('play', () => {
  document.querySelectorAll('audio, video').forEach(m => { if (!m.muted && !m.paused) m.pause(); });
});
// Кружок, включённый со звуком, тоже ставит плеер на паузу (событие volumechange).
document.addEventListener('volumechange', e => {
  const t = e.target;
  if (t instanceof HTMLMediaElement && !t.muted && !t.paused && !audio.paused) audio.pause();
}, true);
