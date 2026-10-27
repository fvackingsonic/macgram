// Звуки уведомлений Telegram (из Telegram для macOS, Resources/notifies, GPL-2.0).
export const SOUND_NAMES = [['in_app', 'Telegram'], ['100', 'Note'], ['101', 'Aurora'], ['102', 'Bamboo'], ['103', 'Chord'], ['104', 'Circles'],
  ['105', 'Complete'], ['106', 'Hello'], ['107', 'Input'], ['108', 'Keys'], ['109', 'Popcorn'], ['110', 'Pulse'], ['111', 'Synth']];
const cache = new Map();
let last = 0;
export function playTone(name, volume = .8) {
  const key = SOUND_NAMES.some(([k]) => k === name) ? name : 'in_app';
  const now = Date.now();
  if (now - last < 900) return; // пачка сообщений — один звук
  last = now;
  try {
    let a = cache.get(key);
    if (!a) { a = new Audio(`sounds/${key}.ogg`); cache.set(key, a); }
    a.volume = volume; a.currentTime = 0;
    a.play().catch(() => {});
  } catch {}
}
