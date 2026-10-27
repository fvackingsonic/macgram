// Запись голосовых сообщений.
// WebView записывает только WebM/Opus, а голосовые Telegram — это OGG/Opus.
// Поэтому звук не перекодируем, а перекладываем те же Opus-пакеты из WebM в OGG.
import { S, changed, showHud } from './store.js';
import { send, shell } from './td.js';

import { webmToOpusPackets, packOgg, packWaveform, b64 } from './ogg.js';

// ── запись ──
let rec = null;
export async function startRecording(chatId) {
  if (rec) return;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch { showHud('Нет доступа к микрофону'); return; }
  const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32000 });
  const chunks = [];
  const ctx = new AudioContext();
  const an = ctx.createAnalyser(); an.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(an);
  const levels = [];
  const data = new Uint8Array(an.fftSize);
  const tick = setInterval(() => {
    an.getByteTimeDomainData(data);
    let sum = 0; for (const v of data) { const x = (v - 128) / 128; sum += x * x; }
    const lvl = Math.sqrt(sum / data.length);
    levels.push(lvl);
    if (S.recording) { S.recording.level = lvl; S.recording.time = (Date.now() - S.recording.started) / 1000; changed(); }
  }, 50);
  mr.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec = { mr, stream, ctx, tick, chunks, levels, chatId };
  S.recording = { chatId, started: Date.now(), time: 0, level: 0 };
  mr.start(250);
  changed();
}

function cleanup() {
  if (!rec) return;
  clearInterval(rec.tick);
  rec.stream.getTracks().forEach(t => t.stop());
  rec.ctx.close().catch(() => {});
  rec = null;
  S.recording = null; changed();
}

export function cancelRecording() {
  if (!rec) return;
  try { rec.mr.stop(); } catch {}
  cleanup();
}

export async function finishRecording() {
  if (!rec) return;
  const r = rec;
  const done = new Promise(res => { r.mr.onstop = res; });
  r.mr.stop();
  await done;
  const { chatId, chunks, levels } = r;
  cleanup();
  const blob = new Blob(chunks, { type: 'audio/webm' });
  const { packets, codecPrivate } = webmToOpusPackets(await blob.arrayBuffer());
  if (!packets.length) { showHud('Не удалось записать звук'); return; }
  const { bytes, duration } = packOgg(packets, codecPrivate);
  if (duration < 0.8) { showHud('Слишком короткое сообщение'); return; }
  try {
    const path = await shell.savePaste(b64(bytes), 'ogg');
    const reply = S.reply; S.reply = null; changed();
    await send({
      '@type': 'sendMessage', chat_id: chatId,
      reply_to: reply ? { '@type': 'inputMessageReplyToMessage', message_id: reply.id } : undefined,
      input_message_content: { '@type': 'inputMessageVoiceNote', voice_note: { '@type': 'inputVoiceNote', voice_note: { '@type': 'inputFileLocal', path }, duration: Math.round(duration), waveform: b64(packWaveform(levels)) }, caption: { '@type': 'formattedText', text: '', entities: [] } },
    });
  } catch (e) { showHud(e.message || String(e)); }
}
