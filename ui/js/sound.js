// Звук уведомления (как «Звук» в настройках уведомлений Telegram для macOS). Звуки синтезируются
// здесь же через WebAudio — без чужих аудиофайлов.
const TONES = {
  note: [[880, 0, .09], [1318.5, .09, .16]],
  glass: [[1567.98, 0, .22], [2093, .05, .25]],
  pop: [[660, 0, .06]],
  chime: [[1046.5, 0, .14], [1318.5, .12, .14], [1568, .24, .2]],
};
export const SOUND_NAMES = [['note', 'Нота'], ['glass', 'Стекло'], ['pop', 'Хлопок'], ['chime', 'Колокольчик']];
let ctx = null;
export function playTone(name = 'note', volume = .35) {
  try {
    ctx = ctx || new AudioContext();
    const t0 = ctx.currentTime + .01;
    for (const [f, at, dur] of TONES[name] || TONES.note) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + at);
      g.gain.linearRampToValueAtTime(volume, t0 + at + .008);
      g.gain.exponentialRampToValueAtTime(.0001, t0 + at + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + at); o.stop(t0 + at + dur + .02);
    }
  } catch {}
}
