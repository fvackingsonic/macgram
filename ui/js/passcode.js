// Код-пароль (как «Код-пароль» в Telegram для macOS): блокирует окно, пока не введён код.
// Проверочный хэш — PBKDF2-SHA256, 310 000 итераций, случайная соль; хранится в «Диспетчере
// учётных данных» Windows. Автоблокировка — после бездействия, при сворачивании или по Ctrl+L.
import { S, changed } from './store.js';
import { shell } from './td.js';

const ITER = 310000;
const enc = new TextEncoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function derive(code, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
}
const sameBytes = (a, b) => { const x = new Uint8Array(a), y = new Uint8Array(b); if (x.length !== y.length) return false; let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]; return d === 0; };

let verifier = null;
export async function initPasscode() {
  try { verifier = await shell.passcodeGet(); } catch { verifier = null; }
  S.hasPasscode = !!verifier;
  if (verifier) S.locked = true;
  changed();
  setupAutoLock();
}

export async function setPasscode(code) {
  if (!code) { await shell.passcodeSet(null); verifier = null; S.hasPasscode = false; changed(); return; }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(code, salt, ITER);
  const v = `pbkdf2$${ITER}$${b64(salt)}$${b64(hash)}`;
  await shell.passcodeSet(v);
  verifier = v; S.hasPasscode = true; changed();
}

let fails = 0, blockedUntil = 0;
export async function unlock(code) {
  if (!verifier) { S.locked = false; changed(); return true; }
  if (Date.now() < blockedUntil) throw new Error(`Слишком много попыток. Подождите ${Math.ceil((blockedUntil - Date.now()) / 1000)} с`);
  const [, iter, salt, hash] = verifier.split('$');
  const got = await derive(code, unb64(salt), Number(iter));
  if (!sameBytes(got, unb64(hash))) {
    fails++;
    if (fails >= 5) { blockedUntil = Date.now() + Math.min(300, 15 * 2 ** (fails - 5)) * 1000; }
    throw new Error('Неверный код-пароль');
  }
  fails = 0; S.locked = false; changed();
  return true;
}

export function lockNow() { if (verifier) { S.locked = true; S.menu = null; S.viewer = null; S.storyView = null; changed(); } }

let idleTimer = null;
function setupAutoLock() {
  const arm = () => {
    clearTimeout(idleTimer);
    const min = S.prefs.autoLock ?? 60;
    if (!verifier || S.locked || !min) return;
    idleTimer = setTimeout(lockNow, min * 60000);
  };
  ['mousemove', 'keydown', 'mousedown', 'wheel'].forEach(t => window.addEventListener(t, arm, { passive: true }));
  window.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.code === 'KeyL' && verifier) { e.preventDefault(); lockNow(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.prefs.lockOnHide && verifier) lockNow(); });
  arm();
}
