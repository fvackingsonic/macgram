import { useState, useEffect } from './lib.js';
import { send, onUpdate, shell } from './td.js';

// Всё состояние приложения в одном месте. Его наполняют обновления TDLib.
export const S = {
  auth: null,
  credsReady: null,
  myId: null,
  connection: 'connectionStateReady',
  users: new Map(),
  chats: new Map(),
  basicGroups: new Map(),
  supergroups: new Map(),
  files: new Map(),
  folders: [],
  folder: 'main',
  tab: 'chats',
  currentChatId: null,
  history: new Map(),   // chatId -> { list, byId, hasMore, loading }
  fresh: new Set(),     // id новых сообщений — для анимации появления
  typing: new Map(),    // chatId -> Map(senderKey -> {action, until})
  contacts: null,
  searchQuery: '',
  searchResults: null,
  reply: null,
  editing: null,
  menu: null,
  hud: null,
  modal: null,
  highlight: null,
  player: null,
  profile: false,
  viewer: null,
  pinned: new Map(),
  recording: null,
  settingsPage: null,
  stories: new Map(),
  storyView: null,
  newChat: null,
  forward: null,
  unreadMark: new Map(),
  chatSearch: null,
  selection: null,
  sendDialog: null,
  dragging: false,
  scopes: {},
  chatsVer: 0,
  prefs: loadPrefs(),
};

function loadPrefs() {
  try { return { theme: 'auto', fontSize: 14, ...JSON.parse(localStorage.getItem('prefs') || '{}') }; }
  catch { return { theme: 'auto', fontSize: 14 }; }
}
export function setPref(k, v) {
  S.prefs[k] = v;
  try { localStorage.setItem('prefs', JSON.stringify(S.prefs)); } catch {}
  applyPrefs();
  changed();
}
// Тема как в Telegram для macOS: дневная (classic/day) или ночная (night — синяя, dark — нейтральная),
// плюс «Автоночь»: по системе Windows, по расписанию или выключена.
const darkQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
const LEGACY = { light: 'classic', dark: 'night', auto: 'classic' };
export const baseTheme = () => LEGACY[S.prefs.theme] || S.prefs.theme || 'classic';
export const autoNightMode = () => S.prefs.autoNight ?? (S.prefs.theme === 'auto' || !S.prefs.theme ? 'system' : 'off');
const toMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
function inSchedule() {
  const now = new Date(), cur = now.getHours() * 60 + now.getMinutes();
  const a = toMin(S.prefs.nightFrom || '22:00'), b = toMin(S.prefs.nightTo || '07:00');
  return a <= b ? cur >= a && cur < b : cur >= a || cur < b;
}
// Итоговая тема с учётом автоночи: 'classic' | 'day' | 'night' | 'black' (нейтральная «Ночь»).
// ('dark' в старых настройках означал синюю ночь — поэтому нейтральная называется 'black'.)
export function effectiveTheme() {
  const base = baseTheme();
  if (base === 'night' || base === 'black') return base;
  const an = autoNightMode();
  if ((an === 'system' && darkQuery?.matches) || (an === 'schedule' && inSchedule())) return S.prefs.nightTheme === 'black' ? 'black' : 'night';
  return base;
}
export function palette() {
  const t = effectiveTheme();
  return t === 'black' ? 'night' : t;
}
const BASE_FONT = '"SF Pro Text", "Inter var", "Inter", "Segoe UI Variable Text", "Segoe UI", system-ui';
const BASE_EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", sans-serif';
const loadedFonts = {};
// Начертание по имени файла: SF-Pro-Display-Semibold.otf → 600, Italic → курсив.
const WEIGHTS = [['thin', 100], ['ultralight', 200], ['extralight', 200], ['light', 300], ['regular', 400], ['book', 400],
  ['medium', 500], ['semibold', 600], ['demibold', 600], ['extrabold', 800], ['heavy', 800], ['black', 900], ['bold', 700]];
function faceInfo(name) {
  const n = name.toLowerCase().replace(/[\s_.-]/g, '');
  let weight = 400;
  for (const [k, w] of WEIGHTS) if (n.includes(k)) { weight = w; if (k !== 'bold' || !n.includes('semibold')) break; }
  if (n.includes('semibold')) weight = 600;
  else if (n.includes('extrabold')) weight = 800;
  return { weight, style: n.includes('italic') ? 'italic' : 'normal', display: n.includes('display') };
}
// Шрифт смайликов используется только для символов-смайликов: обычные буквы и цифры
// браузер в нём даже не ищет (иначе огромный цветной шрифт проверяется для каждого символа).
const EMOJI_RANGE = 'U+00A9, U+00AE, U+203C, U+2049, U+20E3, U+2122, U+2139, U+2194-21AA, U+231A-23FF, U+24C2, U+25AA-27BF, U+2934-2935, U+2B05-2B55, U+3030, U+303D, U+3297, U+3299, U+FE0F, U+200D, U+1F000-1FAFF, U+E0020-E007F';
async function loadFace(family, path, v, desc) {
  const key = `${family}|${path}|${v}|${desc.weight}|${desc.style}`;
  if (loadedFonts[key]) return true;
  try {
    const opts = { weight: String(desc.weight), style: desc.style };
    if (desc.emoji) opts.unicodeRange = EMOJI_RANGE;
    const face = new FontFace(family, `url("${shell.fileUrl(path)}?v=${v || 0}")`, opts);
    await face.load();
    document.fonts.add(face);
    loadedFonts[key] = true;
    return true;
  } catch (e) { console.warn('font', path, e); return false; }
}
// Свои шрифты: несколько файлов интерфейса (Text — для текста, Display — для заголовков) и шрифт смайликов.
async function loadUiFonts(pref) {
  const files = pref?.files || (pref?.path ? [{ path: pref.path, name: pref.name || pref.path }] : []);
  if (!files.length) return { text: false, display: false };
  let text = false, display = false;
  for (const f of files) {
    const info = faceInfo(f.name || f.path);
    if (await loadFace(info.display ? 'MacTeleDisplay' : 'MacTeleUI', f.path, pref.v, info)) {
      if (info.display) display = true; else text = true;
    }
  }
  if (!text && !display) showHud('Не удалось загрузить шрифт');
  return { text, display };
}
// Защита от «шрифта, который роняет программу»: перед загрузкой своих шрифтов ставим метку,
// снимаем её, когда окно несколько секунд проработало. Если при следующем запуске метка
// осталась — значит, прошлый запуск завис или упал на шрифтах: отключаем их и сообщаем.
const FONT_GUARD = 'fontGuard';
let fontGuardChecked = false;
function fontGuard() {
  if (fontGuardChecked) return true;
  fontGuardChecked = true;
  let crashed = false;
  try { crashed = localStorage.getItem(FONT_GUARD) === '1'; } catch {}
  if (crashed && (S.prefs.customFont || S.prefs.customEmoji)) {
    S.prefs.customFont = null; S.prefs.customEmoji = null;
    try { localStorage.setItem('prefs', JSON.stringify(S.prefs)); } catch {}
    try { localStorage.removeItem(FONT_GUARD); } catch {}
    setTimeout(() => showHud('Свои шрифты отключены: из-за них программа зависла при прошлом запуске'), 1500);
    return false;
  }
  return true;
}
function armFontGuard() {
  try { localStorage.setItem(FONT_GUARD, '1'); } catch {}
  setTimeout(() => { try { localStorage.removeItem(FONT_GUARD); } catch {} }, 8000);
}
let lastFontVars = '';
export async function applyFonts() {
  fontGuard();
  const hasCustom = !!(S.prefs.customFont || S.prefs.customEmoji);
  if (hasCustom) armFontGuard();
  const ui = await loadUiFonts(S.prefs.customFont);
  const emojiFiles = S.prefs.customEmoji?.files || (S.prefs.customEmoji?.path ? [S.prefs.customEmoji] : []);
  const emoji = emojiFiles.length ? await loadFace('MacTeleEmoji', emojiFiles[0].path, S.prefs.customEmoji.v, { weight: 400, style: 'normal', emoji: true }) : false;
  const root = document.documentElement;
  const emojiStack = `${emoji ? '"MacTeleEmoji", ' : ''}${BASE_EMOJI}`;
  // Если есть только Display (или только Text) — используем его для всего.
  const textFam = ui.text ? '"MacTeleUI", ' : ui.display ? '"MacTeleDisplay", ' : '';
  const dispFam = ui.display ? '"MacTeleDisplay", ' : ui.text ? '"MacTeleUI", ' : '';
  const font = `${textFam}${BASE_FONT}, ${emojiStack}`;
  const disp = `${dispFam}${BASE_FONT.replace('"SF Pro Text"', '"SF Pro Display"')}, ${emojiStack}`;
  // Переменные меняем только при настоящей смене — иначе пересчитываются стили всего окна.
  if (font + disp === lastFontVars) return;
  lastFontVars = font + disp;
  root.style.setProperty('--font', font);
  root.style.setProperty('--font-display', disp);
  root.style.setProperty('--font-emoji', emojiStack);
}
// Автоночь по расписанию — проверяем раз в минуту.
let lastTheme = '', appliedIcon = '';
setInterval(() => { if (autoNightMode() === 'schedule') { const t = effectiveTheme(); if (t !== lastTheme) { lastTheme = t; applyPrefs(); changed(); } } }, 60e3);
export function applyPrefs() {
  lastTheme = effectiveTheme();
  const root = document.documentElement;
  root.classList.toggle('lite', S.prefs.glass === false);
  root.dataset.palette = palette();
  root.dataset.variant = effectiveTheme() === 'black' ? 'dark' : '';
  root.classList.toggle('no-bubbles', S.prefs.bubbles === false);
  // Стекло как в iOS 26 — вид по умолчанию; прозрачность настраивается ползунком.
  root.classList.toggle('glass-bubbles', S.prefs.glassBubbles !== false);
  root.classList.toggle('lg-panels', S.prefs.glass !== false);
  // стекло можно оставить только у сообщений или только у панелей (Оформление → Жидкое стекло)
  root.classList.toggle('no-glass-panels', S.prefs.glassPanels === false);
  // стекло как в iOS: линза у краёв и размытый фон под пузырями — всегда (без лишних переключателей)
  root.classList.add('lg-lens-on', 'lg-frost');
  root.classList.remove('lg-copy');
  if (typeof S.prefs.glassTint === 'number') {
    const v = S.prefs.glassTint, dark = palette() === 'night';
    root.style.setProperty('--lg-tint', `rgba(255,255,255,${(dark ? v * .65 : v).toFixed(3)})`);
    root.style.setProperty('--mu-va', Math.min(.92, .06 + v * 5).toFixed(3)); // плеер с нотой — та же прозрачность
  } else { root.style.removeProperty('--lg-tint'); root.style.removeProperty('--mu-va'); }
  const icon = S.prefs.appIcon || 'blue';
  if (icon !== appliedIcon && (appliedIcon || icon !== 'blue')) window.__TAURI__?.core.invoke('set_app_icon', { name: icon }).catch(() => {});
  appliedIcon = icon;
  root.style.setProperty('--fs-msg', `${S.prefs.fontSize}px`);
  if (S.prefs.sidebarW) root.style.setProperty('--sidebar-w', `${S.prefs.sidebarW}px`); else root.style.removeProperty('--sidebar-w');
  // Трей: закрывать в трей и галочка «Уведомления» в меню значка.
  window.__TAURI__?.core.invoke('shell_prefs', { closeToTray: S.prefs.closeToTray !== false, notify: S.prefs.notifyAll !== false }).catch(() => {});
  // Цвет акцента (Оформление): кнопки, ссылки, выделение, счётчики.
  if (S.prefs.accent) {
    root.style.setProperty('--accent', S.prefs.accent);
    root.style.setProperty('--accent-select', S.prefs.accent);
    root.style.setProperty('--accent-soft', `color-mix(in srgb, ${S.prefs.accent} 14%, transparent)`);
  } else ['--accent', '--accent-select', '--accent-soft'].forEach(v => root.style.removeProperty(v));
  applyTint();
  applyOutColor();
  applyFonts();
}
// «Цвет ваших сообщений» (как «Сообщения» в выборе акцента Telegram для macOS): цвет своих пузырей,
// текст и подписи в них — тёмные или светлые по яркости цвета.
function applyOutColor() {
  const root = document.documentElement, c = S.prefs.outColor;
  const vars = ['--out-bg', '--out-border', '--out-text', '--out-gray', '--out-link', '--out-reply', '--out-ic-bg', '--out-ic-fg'];
  if (!c) { if (!S.prefs.tint) vars.forEach(v => root.style.removeProperty(v)); return; }
  const n = parseInt(c.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
  const light = (.2126 * r + .7152 * g + .0722 * b) / 255 > .62;
  const set = (k, v) => root.style.setProperty(k, v);
  set('--out-bg', c); set('--out-border', `color-mix(in srgb, ${c} 85%, #000)`);
  set('--out-text', light ? '#000' : '#fff'); set('--out-gray', light ? 'rgba(0,0,0,.5)' : 'rgba(255,255,255,.7)');
  set('--out-link', light ? '#0b5aa6' : '#fff'); set('--out-reply', light ? '#0b5aa6' : '#fff');
  set('--out-ic-bg', light ? '#0b5aa6' : '#fff'); set('--out-ic-fg', light ? '#fff' : c);
}

// ── Цвета под фон: акцент, исходящие пузыри и стекло подстраиваются под выбранный фон ──
// S.wallTint = { h, s, l } — главный цвет фона (считает wallpaper.js).
const TINT_VARS = ['--out-bg', '--out-border', '--out-text', '--out-gray', '--out-link', '--out-reply', '--out-ic-bg', '--out-ic-fg', '--in-bg', '--glass-bg', '--row-active', '--badge', '--link', '--in-link', '--in-reply'];
export function applyTint() {
  const root = document.documentElement;
  const t = S.prefs.tint || null; // включается кнопкой «Подобрать цвета под фон»
  const own = !!S.prefs.accent;
  if (!t) {
    TINT_VARS.forEach(v => root.style.removeProperty(v));
    if (!own) ['--accent', '--accent-select', '--accent-soft'].forEach(v => root.style.removeProperty(v));
    root.classList.remove('tinted');
    return;
  }
  const dark = palette() === 'night';
  const h = Math.round(t.h), s = Math.round(Math.max(18, Math.min(78, t.s)));
  const set = (k, v) => root.style.setProperty(k, v);
  const accent = dark ? `hsl(${h} ${Math.min(80, s + 10)}% 64%)` : `hsl(${h} ${Math.min(85, s + 15)}% 42%)`;
  if (!own) { set('--accent', accent); set('--accent-select', accent); set('--accent-soft', `color-mix(in srgb, ${accent} 15%, transparent)`); }
  const a = own ? S.prefs.accent : accent;
  if (dark) {
    set('--out-bg', `hsl(${h} ${Math.min(45, s)}% 30%)`); set('--out-border', `hsl(${h} ${Math.min(45, s)}% 34%)`);
    set('--out-text', '#ffffff'); set('--out-gray', 'rgba(255,255,255,.62)'); set('--out-link', '#ffffff'); set('--out-reply', '#ffffff');
    set('--out-ic-bg', '#ffffff'); set('--out-ic-fg', `hsl(${h} ${Math.min(45, s)}% 30%)`);
    set('--in-bg', `hsl(${h} ${Math.min(22, s)}% 16%)`);
    set('--glass-bg', `hsl(${h} ${Math.min(25, s)}% 16% / .55)`);
  } else {
    set('--out-bg', `hsl(${h} ${Math.min(75, s + 10)}% 89%)`); set('--out-border', `hsl(${h} ${Math.min(60, s)}% 82%)`);
    set('--out-text', '#000000'); set('--out-gray', `hsl(${h} ${Math.min(40, s)}% 36% / .85)`); set('--out-link', `hsl(${h} 70% 34%)`); set('--out-reply', `hsl(${h} 70% 34%)`);
    set('--out-ic-bg', `hsl(${h} 60% 42%)`); set('--out-ic-fg', '#ffffff');
    set('--in-bg', `hsl(${h} ${Math.min(30, s)}% 99%)`);
    set('--glass-bg', `hsl(${h} ${Math.min(40, s)}% 98% / .6)`);
  }
  set('--row-active', a); set('--badge', a); set('--link', a); set('--in-link', a); set('--in-reply', a);
  root.classList.add('tinted');
}
darkQuery?.addEventListener?.('change', () => { applyPrefs(); changed(); });

// ── перерисовка ──
const subs = new Set();
let version = 0, queued = false;
export function changed() {
  version++;
  if (queued) return;
  queued = true;
  const run = () => { queued = false; for (const f of subs) f(version); };
  document.hidden ? setTimeout(run, 50) : requestAnimationFrame(run);
}
// «Тик» — частые мелкие обновления (ход плеера, уровень микрофона). Перерисовывают только
// подписанные компоненты, а не всё окно.
const ticks = new Set();
let tickQueued = false;
export function tick() {
  if (tickQueued) return;
  tickQueued = true;
  requestAnimationFrame(() => { tickQueued = false; for (const f of ticks) f(); });
}
export function useTick() {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set(x => x + 1); ticks.add(f); return () => ticks.delete(f); }, []);
}

export function useStore() {
  const [, set] = useState(0);
  useEffect(() => { subs.add(set); return () => subs.delete(set); }, []);
  return S;
}

// ── вспомогательное ──
export const listKey = l => !l ? 'main' : l['@type'] === 'chatListMain' ? 'main' : l['@type'] === 'chatListArchive' ? 'archive' : `f${l.chat_folder_id}`;
export const listOf = key => key === 'main' ? { '@type': 'chatListMain' } : key === 'archive' ? { '@type': 'chatListArchive' } : { '@type': 'chatListFolder', chat_folder_id: Number(key.slice(1)) };
export const position = (chat, key) => chat.positions?.find(p => listKey(p.list) === key);
// Чат действительно в списке: позиция с order «0» означает, что TDLib убрал его из списка.
export const inList = (chat, key) => { const p = position(chat, key); return !!p && p.order !== '0'; };

// Отсортированные списки кэшируются до следующего изменения чатов.
const sortedCache = new Map();
export function sortedChats(key) {
  const hit = sortedCache.get(key);
  if (hit && hit.ver === S.chatsVer) return hit.list;
  const list = sortChats(key);
  sortedCache.set(key, { ver: S.chatsVer, list });
  return list;
}
function sortChats(key) {
  const out = [];
  for (const c of S.chats.values()) {
    const p = position(c, key);
    if (p && p.order !== '0') out.push([BigInt(p.order), c, p.is_pinned]);
  }
  out.sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
  return out.map(([, c, pinned]) => ({ chat: c, pinned }));
}

export function chatUser(chat) {
  const t = chat?.type;
  return t && (t['@type'] === 'chatTypePrivate' || t['@type'] === 'chatTypeSecret') ? S.users.get(t.user_id) : null;
}
const scopeOf = chat => {
  const t = chat?.type?.['@type'];
  if (t === 'chatTypePrivate' || t === 'chatTypeSecret') return 'notificationSettingsScopePrivateChats';
  if (t === 'chatTypeSupergroup' && chat.type.is_channel) return 'notificationSettingsScopeChannelChats';
  return 'notificationSettingsScopeGroupChats';
};
// Учитываем и личную настройку чата, и общую для типа чатов (каналы часто без звука по умолчанию).
export function isMuted(chat) {
  const ns = chat?.notification_settings;
  if (!ns) return false;
  if (ns.use_default_mute_for) return (S.scopes[scopeOf(chat)]?.mute_for || 0) > 0;
  return (ns.mute_for || 0) > 0;
}
// Открыта ветка комментариев или тема форума в этом чате — отправлять туда.
export const topicFor = chatId => (S.thread && !S.thread.closing && S.thread.chatId === chatId ? S.thread.topic || null : null);
export const isSaved = chat => chat && chat.id === S.myId;
export const isChannel = chat => chat?.type?.['@type'] === 'chatTypeSupergroup' && chat.type.is_channel;
export const isGroup = chat => chat?.type?.['@type'] === 'chatTypeBasicGroup' || (chat?.type?.['@type'] === 'chatTypeSupergroup' && !chat.type.is_channel);

export function senderName(sender) {
  if (!sender) return '';
  if (sender['@type'] === 'messageSenderUser') {
    const u = S.users.get(sender.user_id);
    return u ? [u.first_name, u.last_name].filter(Boolean).join(' ') : '';
  }
  return S.chats.get(sender.chat_id)?.title || '';
}
export const senderId = s => s ? (s.user_id ?? s.chat_id) : 0;

export function chatTitle(chat) {
  if (!chat) return '';
  if (isSaved(chat)) return 'Избранное';
  return chat.title || 'Удалённый аккаунт';
}

export function fileOf(f) { return f ? (S.files.get(f.id) || f) : null; }
// Подписка на один файл: компонент перерисуется, только когда изменится именно он
// (а не всё окно). Используется в панели стикеров и GIF.
const fileSubs = new Map();
function notifyFile(id) { const set = fileSubs.get(id); if (set) for (const fn of set) fn(); }
export function useFile(f) {
  const [, bump] = useState(0);
  const id = f?.id;
  useEffect(() => {
    if (id == null) return;
    const fn = () => bump(x => x + 1);
    if (!fileSubs.has(id)) fileSubs.set(id, new Set());
    fileSubs.get(id).add(fn);
    return () => { const set = fileSubs.get(id); set?.delete(fn); if (set && !set.size) fileSubs.delete(id); };
  }, [id]);
  return fileOf(f);
}
const requested = new Set();
export function download(f, priority = 1) {
  if (!f) return;
  const cur = fileOf(f);
  if (cur.local?.is_downloading_completed || requested.has(cur.id)) return;
  if (!cur.local?.can_be_downloaded && cur.local) return;
  requested.add(cur.id);
  send({ '@type': 'downloadFile', file_id: cur.id, priority, offset: 0, limit: 0, synchronous: false })
    .then(file => { S.files.set(file.id, file); notifyFile(file.id); changed(); })
    .catch(() => requested.delete(cur.id));
}
export function fileUrl(f) {
  const cur = fileOf(f);
  return cur?.local?.is_downloading_completed ? shell.fileUrl(cur.local.path) : '';
}

// ── HUD и меню ──
let hudTimer;
export function showHud(text) {
  clearTimeout(hudTimer);
  S.hud = { text, id: Math.random(), out: false };
  changed();
  hudTimer = setTimeout(() => {
    if (S.hud) { S.hud.out = true; changed(); }
    hudTimer = setTimeout(() => { S.hud = null; changed(); }, 260);
  }, 1500);
}
export function openMenu(x, y, items) { S.menu = { x, y, items }; changed(); }
export function closeMenu() {
  if (!S.menu) return;
  // Закрытие меню как в AppMenu (macOS): растворяется за 0.2 с. Копия остаётся на экране,
  // пока гаснет, а само меню убирается сразу, чтобы клики шли дальше.
  const el = document.querySelector('.ctx');
  if (el?.animate && S.prefs.glass !== false) {
    const ghost = el.cloneNode(true);
    ghost.style.pointerEvents = 'none';
    const src = el.querySelectorAll('canvas'), dst = ghost.querySelectorAll('canvas');
    src.forEach((c, i) => { try { dst[i].getContext('2d').drawImage(c, 0, 0); } catch {} });
    document.body.appendChild(ghost);
    ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out', fill: 'forwards' }).onfinish = () => ghost.remove();
  }
  S.menu = null; changed();
}
export function openModal(m) { S.modal = { ...m, out: false }; changed(); }
export function closeModal() {
  if (!S.modal) return;
  S.modal.out = true; changed();
  setTimeout(() => { S.modal = null; changed(); }, 180);
}

// ── история сообщений ──
// list — загруженный отрезок истории (по возрастанию id). hasMore — есть ли старее,
// hasNewer — отрезок не доходит до последнего сообщения (после перехода к старому).
function hist(chatId) {
  let h = S.history.get(chatId);
  if (!h) { h = { list: [], byId: new Map(), hasMore: true, hasNewer: false, loading: false }; S.history.set(chatId, h); }
  return h;
}
function putMessage(m, { fresh = false } = {}) {
  const h = S.history.get(m.chat_id);
  if (!h) return;
  const exists = h.byId.has(m.id);
  if (!exists && h.hasNewer) {
    // Своё новое сообщение — возвращаемся к концу переписки, чтобы его было видно.
    if (m.is_outgoing && fresh) resetToLatest(m.chat_id).then(() => document.querySelector('.messages')?.scrollTo({ top: 0 }));
    return;
  }
  h.byId.set(m.id, m);
  if (exists) { h.list = h.list.map(x => (x.id === m.id ? m : x)); return; }
  if (!h.list.length || h.list[h.list.length - 1].id < m.id) h.list = [...h.list, m];
  else h.list = [...h.list, m].sort((a, b) => a.id - b.id);
  if (fresh) S.fresh.add(m.id);
}
function removeMessage(chatId, id) {
  const h = S.history.get(chatId);
  if (!h || !h.byId.has(id)) return;
  h.byId.delete(id);
  h.list = h.list.filter(x => x.id !== id);
}
function setList(h, msgs) {
  for (const m of msgs) h.byId.set(m.id, m);
  h.list = [...h.byId.values()].sort((a, b) => a.id - b.id);
}

export async function loadHistory(chatId, older = false) {
  const h = hist(chatId);
  if (h.loading || (older && !h.hasMore)) return;
  h.loading = true; changed();
  try {
    let from = older && h.list.length ? h.list[0].id : 0;
    let got = 0;
    for (let i = 0; i < 5 && got < 40; i++) {
      const r = await send({ '@type': 'getChatHistory', chat_id: chatId, from_message_id: from, offset: 0, limit: 50, only_local: false });
      const fresh = (r.messages || []).filter(m => !h.byId.has(m.id));
      if (!r.messages?.length || (!fresh.length && from)) { h.hasMore = false; break; }
      for (const m of fresh) { h.byId.set(m.id, m); got++; }
      from = r.messages[r.messages.length - 1].id;
    }
    h.list = [...h.byId.values()].sort((a, b) => a.id - b.id);
  } catch (e) {
    console.warn('history', e);
  } finally {
    h.loading = false; changed();
  }
}

// Подгрузка более новых сообщений, когда пользователь листает вниз после перехода к старому.
export async function loadNewer(chatId) {
  const h = hist(chatId);
  if (h.loading || !h.hasNewer || !h.list.length) return;
  h.loading = true;
  try {
    const last = h.list[h.list.length - 1].id;
    const r = await send({ '@type': 'getChatHistory', chat_id: chatId, from_message_id: last, offset: -49, limit: 50, only_local: false });
    const msgs = (r.messages || []).filter(m => m.id > last);
    setList(h, msgs);
    const chat = S.chats.get(chatId);
    if (!msgs.length || (chat?.last_message && h.byId.has(chat.last_message.id))) h.hasNewer = false;
  } catch {} finally { h.loading = false; changed(); }
}

// Загрузить отрезок вокруг сообщения (для перехода к ответу, закрепу, результату поиска).
export async function loadAround(chatId, msgId) {
  const h = hist(chatId);
  h.loading = true; changed();
  try {
    const r = await send({ '@type': 'getChatHistory', chat_id: chatId, from_message_id: msgId, offset: -25, limit: 50, only_local: false });
    h.byId = new Map(); h.list = [];
    setList(h, r.messages || []);
    const chat = S.chats.get(chatId);
    h.hasNewer = !(chat?.last_message && h.byId.has(chat.last_message.id));
    h.hasMore = true;
  } catch {} finally { h.loading = false; changed(); }
}

// Вернуться к последним сообщениям.
export async function resetToLatest(chatId) {
  const h = hist(chatId);
  if (h.hasNewer) {
    h.byId = new Map(); h.list = []; h.hasNewer = false; h.hasMore = true;
    await loadHistory(chatId);
  }
}

function flashMessage(id) {
  S.highlight = id; changed();
  setTimeout(() => { if (S.highlight === id) { S.highlight = null; changed(); } }, 1400);
}
export async function jumpTo(chatId, id) {
  if (chatId !== S.currentChatId) await selectChat(chatId, { noScrollToUnread: true });
  const scroll = () => {
    const el = document.querySelector(`[data-mid="${id}"]`);
    if (!el) return false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    flashMessage(id);
    return true;
  };
  if (scroll()) return;
  await loadAround(chatId, id);
  requestAnimationFrame(() => requestAnimationFrame(() => { if (!scroll()) showHud('Сообщение не найдено'); }));
}

// ── закреплённые сообщения ──
export async function loadPinned(chatId) {
  try {
    const r = await send({ '@type': 'searchChatMessages', chat_id: chatId, query: '', from_message_id: 0, offset: 0, limit: 50, filter: { '@type': 'searchMessagesFilterPinned' } });
    const list = r.messages || [];
    S.pinned.set(chatId, { list, index: 0 });
  } catch {
    try {
      const m = await send({ '@type': 'getChatPinnedMessage', chat_id: chatId });
      S.pinned.set(chatId, { list: [m], index: 0 });
    } catch { S.pinned.delete(chatId); }
  }
  changed();
}

// ── действия ──
// Профиль человека или канала поверх текущего чата (нажали на имя, аватар или «Переслано от»).
export async function openPeerProfile({ user, chat }) {
  try {
    let id = chat;
    if (user) { const c = await send({ '@type': 'createPrivateChat', user_id: user, force: false }); id = c.id; }
    if (!id) return;
    if (!S.chats.get(id)) { const c = await send({ '@type': 'getChat', chat_id: id }); if (c?.id) S.chats.set(c.id, c); }
    S.thread = null;
    S.profilePeer = id === S.currentChatId ? null : id;
    S.profile = true; S.profileClosing = false;
    changed();
  } catch (e) { showHud(/PRIVACY|not found|USER_ID/i.test(e.message || '') ? 'Профиль недоступен' : (e.message || 'Профиль недоступен')); }
}
export async function selectChat(chatId, opts = {}) {
  if (S.currentChatId === chatId) return;
  const prev = S.currentChatId;
  if (prev) send({ '@type': 'closeChat', chat_id: prev }).catch(() => {});
  S.currentChatId = chatId;
  S.reply = null; S.editing = null; S.highlight = null; S.profile = false; S.profileClosing = false; S.profilePeer = null; S.thread = null; S.chatSearch = null; S.selection = null;
  changed();
  if (!chatId) return;
  send({ '@type': 'openChat', chat_id: chatId }).catch(() => {});
  const chat = S.chats.get(chatId);
  const h = hist(chatId);
  // Разделитель «Непрочитанные сообщения» и переход к первому непрочитанному — как в Telegram.
  const lastRead = chat?.last_read_inbox_message_id || 0;
  S.unreadMark.set(chatId, chat?.unread_count > 0 ? lastRead : null);
  loadPinned(chatId);
  if (chat?.unread_count > 0 && lastRead && !opts.noScrollToUnread) {
    await loadAround(chatId, lastRead);
    requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector('.unread-sep')?.scrollIntoView({ block: 'start' })));
  } else if (!h.list.length) await loadHistory(chatId);
  markRead(chatId);
}

let readTimer;
export function markRead(chatId = S.currentChatId) {
  clearTimeout(readTimer);
  readTimer = setTimeout(() => {
    const chat = S.chats.get(chatId);
    const h = S.history.get(chatId);
    if (!chat || !h || document.hidden || chatId !== S.currentChatId) return;
    // Форум показан списком тем — читаем по темам, а не весь чат сразу.
    if (chat.type?.['@type'] === 'chatTypeSupergroup' && S.supergroups.get(chat.type.supergroup_id)?.is_forum && !S.forumAsChat?.has(chatId)) return;
    const ids = h.list.slice(-50).map(m => m.id);
    if (!ids.length) return;
    if (chat.unread_count > 0 || chat.unread_mention_count > 0 || chat.is_marked_as_unread) {
      send({ '@type': 'viewMessages', chat_id: chatId, message_ids: ids, force_read: true }).catch(() => {});
      if (chat.is_marked_as_unread) send({ '@type': 'toggleChatIsMarkedAsUnread', chat_id: chatId, is_marked_as_unread: false }).catch(() => {});
    }
    // Дочитали до конца — упоминания и реакции тоже прочитаны (как в официальных клиентах).
    if (chat.unread_mention_count > 0) send({ '@type': 'readAllChatMentions', chat_id: chatId }).catch(() => {});
    if (chat.unread_reaction_count > 0) send({ '@type': 'readAllChatReactions', chat_id: chatId }).catch(() => {});
  }, 250);
}
document.addEventListener('visibilitychange', () => markRead());
window.addEventListener('focus', () => markRead());

// Разметка как в Telegram: **жирный**, __курсив__, ~~зачёркнутый~~, ||спойлер||, `код`, ```блок```.
export async function parseText(text) {
  const plain = { '@type': 'formattedText', text, entities: [] };
  if (!/(\*\*|__|~~|\|\||`)/.test(text)) return plain;
  try { return await send({ '@type': 'parseMarkdown', text: plain }); } catch { return plain; }
}

export async function sendText(chatId, text, opts = {}) {
  const body = text.replace(/\s+$/, '');
  if (!body.trim()) return;
  const editing = S.editing, reply = S.reply;
  S.editing = null; S.reply = null; changed();
  const content = { '@type': 'inputMessageText', text: await parseText(body) };
  if (S.prefs.linkPreview === false) content.link_preview_options = { '@type': 'linkPreviewOptions', is_disabled: true };
  try {
    if (editing) {
      await send({ '@type': 'editMessageText', chat_id: chatId, message_id: editing.id, input_message_content: content });
    } else {
      const req = { '@type': 'sendMessage', chat_id: chatId, input_message_content: content };
      if (reply) req.reply_to = { '@type': 'inputMessageReplyToMessage', message_id: reply.id };
      // Сообщение в ветку комментариев или в тему форума.
      if (opts.topic) req.topic_id = opts.topic;
      // «Без звука» и «Отложить» — как в меню кнопки отправки в Telegram для macOS.
      if (opts.silent || opts.sendAt) {
        req.options = { '@type': 'messageSendOptions', disable_notification: !!opts.silent };
        if (opts.sendAt) req.options.scheduling_state = { '@type': 'messageSchedulingStateSendAtDate', send_date: opts.sendAt };
      }
      const m = await send(req);
      if (opts.sendAt) { showHud('Сообщение отложено'); return; }
      putMessage(m, { fresh: true }); changed();
      opts.onSent?.(m);
    }
  } catch (e) {
    showHud(e.message || 'Не удалось отправить');
  }
}

export function deleteMessages(chatId, ids, revoke) {
  return send({ '@type': 'deleteMessages', chat_id: chatId, message_ids: ids, revoke });
}

export async function loadContacts() {
  try {
    const r = await send({ '@type': 'getContacts' });
    S.contacts = r.user_ids;
  } catch { S.contacts = []; }
  changed();
}

export async function openPrivate(userId) {
  try {
    const chat = await send({ '@type': 'createPrivateChat', user_id: userId, force: false });
    S.chats.set(chat.id, { ...(S.chats.get(chat.id) || {}), ...chat }); S.chatsVer++;
    S.tab = 'chats';
    selectChat(chat.id);
  } catch (e) { showHud(e.message); }
}

let searchSeq = 0;
export async function search(q) {
  S.searchQuery = q;
  const my = ++searchSeq;
  if (!q.trim()) { S.searchResults = null; changed(); return; }
  changed();
  try {
    const [local, global] = await Promise.all([
      send({ '@type': 'searchChats', query: q, limit: 50 }),
      send({ '@type': 'searchChatsOnServer', query: q, limit: 50 }).catch(() => ({ chat_ids: [] })),
    ]);
    if (my !== searchSeq) return;
    S.searchResults = [...new Set([...local.chat_ids, ...global.chat_ids])];
  } catch {
    if (my !== searchSeq) return;
    const lq = q.toLowerCase();
    S.searchResults = [...S.chats.values()].filter(c => chatTitle(c).toLowerCase().includes(lq)).map(c => c.id);
  }
  changed();
}

export async function loadChats(key = 'main') {
  for (let i = 0; i < 20; i++) {
    try { await send({ '@type': 'loadChats', chat_list: listOf(key), limit: 100 }); }
    catch { break; } // 404 — все чаты загружены
  }
}

export function logOut() { return send({ '@type': 'logOut' }); }

// ── обработка обновлений TDLib ──
function setPositions(chat, positions) {
  for (const p of positions || []) {
    const k = listKey(p.list);
    chat.positions = (chat.positions || []).filter(x => listKey(x.list) !== k);
    if (p.order !== '0') chat.positions.push(p);
  }
}
const patchChat = (id, fn) => { const c = S.chats.get(id); if (c) { const n = { ...c }; fn(n); S.chats.set(id, n); } };

function setTyping(chatId, sender, action) {
  let m = S.typing.get(chatId);
  const key = senderId(sender);
  if (action['@type'] === 'chatActionCancel') { m?.delete(key); }
  else {
    if (!m) { m = new Map(); S.typing.set(chatId, m); }
    m.set(key, { action, sender, until: Date.now() + 6000 });
    setTimeout(() => { const e = S.typing.get(chatId)?.get(key); if (e && e.until <= Date.now()) { S.typing.get(chatId).delete(key); changed(); } }, 6100);
  }
}
export function typingText(chatId) {
  const m = S.typing.get(chatId);
  if (!m || !m.size) return null;
  const [first] = m.values();
  const a = first.action['@type'];
  const verb = a === 'chatActionRecordingVoiceNote' ? 'записывает голосовое'
    : a === 'chatActionUploadingPhoto' ? 'отправляет фото'
      : a === 'chatActionUploadingVideo' || a === 'chatActionRecordingVideo' ? 'отправляет видео'
        : a === 'chatActionChoosingSticker' ? 'выбирает стикер'
          : a === 'chatActionUploadingDocument' ? 'отправляет файл' : 'печатает';
  const chat = S.chats.get(chatId);
  if (chat && isGroup(chat)) {
    const n = senderName(first.sender).split(' ')[0];
    return m.size > 1 ? `${m.size} печатают` : `${n} ${verb}`;
  }
  return verb;
}

// Доп. обработчики обновлений (ветки комментариев, темы форумов): возвращают true, если что-то изменили.
export const updateHooks = new Set();

onUpdate(u => {
  const ut = u['@type'];
  let hooked = false;
  for (const f of updateHooks) { try { if (f(u)) hooked = true; } catch (e) { console.warn(e); } }
  if (ut === 'updateNewChat' || ut.startsWith('updateChat') || ut === 'updateScopeNotificationSettings') S.chatsVer++;
  switch (ut) {
    case 'updateAuthorizationState': {
      S.auth = u.authorization_state;
      const t = S.auth['@type'];
      if (t === 'authorizationStateWaitTdlibParameters') {
        shell.hasCredentials().then(ok => {
          S.credsReady = ok; changed();
          if (ok) shell.setParameters(navigator.language?.slice(0, 2) || 'ru').catch(e => { console.error(e); showHud(String(e)); });
        });
      } else if (t === 'authorizationStateReady') {
        loadChats('main');
        loadChats('archive');
        send({ '@type': 'getMe' }).then(me => { S.myId = me.id; S.users.set(me.id, me); changed(); }).catch(() => {});
      } else if (t === 'authorizationStateClosed') {
        for (const k of ['users', 'chats', 'basicGroups', 'supergroups', 'files', 'history', 'typing']) S[k].clear();
        S.chatsVer++;
        S.currentChatId = null; S.folders = []; S.folder = 'main'; S.contacts = null; S.myId = null;
        shell.restart();
      }
      break;
    }
    case 'updateConnectionState': S.connection = u.state['@type']; break;
    case 'updateOption': if (u.name === 'my_id' && u.value?.value) S.myId = Number(u.value.value); break;
    case 'updateUser': S.users.set(u.user.id, u.user); break;
    case 'updateUserStatus': { const usr = S.users.get(u.user_id); if (usr) S.users.set(u.user_id, { ...usr, status: u.status }); break; }
    case 'updateBasicGroup': S.basicGroups.set(u.basic_group.id, u.basic_group); break;
    case 'updateSupergroup': S.supergroups.set(u.supergroup.id, u.supergroup); break;
    case 'updateFile': {
      // Прогресс скачивания приходит очень часто — перерисовываем только на заметных шагах.
      const prev = S.files.get(u.file.id), f = u.file;
      S.files.set(f.id, f);
      if (!prev || prev.local?.is_downloading_completed !== f.local?.is_downloading_completed) notifyFile(f.id);
      const pct = x => x?.size ? Math.floor(20 * (x.local?.downloaded_size || 0) / x.size) : 0;
      const upct = x => x?.size ? Math.floor(20 * (x.remote?.uploaded_size || 0) / x.size) : 0;
      const significant = !prev || prev.local?.is_downloading_completed !== f.local?.is_downloading_completed
        || prev.local?.is_downloading_active !== f.local?.is_downloading_active
        || prev.remote?.is_uploading_completed !== f.remote?.is_uploading_completed
        || pct(prev) !== pct(f) || upct(prev) !== upct(f);
      if (!significant) return;
      break;
    }
    case 'updateNewChat': {
      const c = { ...u.chat, positions: [...(u.chat.positions || [])] };
      S.chats.set(c.id, c);
      break;
    }
    case 'updateChatTitle': patchChat(u.chat_id, c => { c.title = u.title; }); break;
    case 'updateChatPhoto': patchChat(u.chat_id, c => { c.photo = u.photo; }); break;
    case 'updateChatAccentColors': patchChat(u.chat_id, c => { c.accent_color_id = u.accent_color_id; }); break;
    case 'updateChatPermissions': patchChat(u.chat_id, c => { c.permissions = u.permissions; }); break;
    case 'updateChatLastMessage': patchChat(u.chat_id, c => { c.last_message = u.last_message; setPositions(c, u.positions); }); break;
    case 'updateChatPosition': patchChat(u.chat_id, c => setPositions(c, [u.position])); break;
    case 'updateChatDraftMessage': patchChat(u.chat_id, c => { c.draft_message = u.draft_message; setPositions(c, u.positions); }); break;
    // Точные счётчики непрочитанного от TDLib (их же используют официальные клиенты).
    case 'updateUnreadChatCount': S.unreadChats = { ...(S.unreadChats || {}), [listKey(u.chat_list)]: u }; break;
    case 'updateChatReadInbox': patchChat(u.chat_id, c => { c.last_read_inbox_message_id = u.last_read_inbox_message_id; c.unread_count = u.unread_count; }); break;
    case 'updateChatReadOutbox': patchChat(u.chat_id, c => { c.last_read_outbox_message_id = u.last_read_outbox_message_id; }); break;
    case 'updateChatUnreadMentionCount': patchChat(u.chat_id, c => { c.unread_mention_count = u.unread_mention_count; }); break;
    // Упоминание прочитано — TDLib сообщает новый счётчик именно так (без этого «собачка» висела).
    case 'updateMessageMentionRead': patchChat(u.chat_id, c => { c.unread_mention_count = u.unread_mention_count; }); break;
    case 'updateChatUnreadReactionCount': patchChat(u.chat_id, c => { c.unread_reaction_count = u.unread_reaction_count; }); break;
    case 'updateMessageUnreadReactions': patchChat(u.chat_id, c => { c.unread_reaction_count = u.unread_reaction_count; }); break;
    case 'updateChatNotificationSettings': patchChat(u.chat_id, c => { c.notification_settings = u.notification_settings; }); break;
    case 'updateChatAvailableReactions': patchChat(u.chat_id, c => { c.available_reactions = u.available_reactions; }); break;
    case 'updateChatIsMarkedAsUnread': patchChat(u.chat_id, c => { c.is_marked_as_unread = u.is_marked_as_unread; }); break;
    case 'updateChatFolders': case 'updateChatFilters': {
      const arr = u.chat_folders || u.chat_filters || [];
      S.folders = arr.map(f => ({ id: f.id, title: f.name?.text?.text ?? f.title ?? 'Папка', icon: f.icon?.name, color: f.color_id }));
      for (const f of S.folders) loadChats(`f${f.id}`);
      if (S.folder !== 'main' && !S.folders.some(f => `f${f.id}` === S.folder)) S.folder = 'main';
      break;
    }
    case 'updateNewMessage': {
      putMessage(u.message, { fresh: true });
      if (u.message.chat_id === S.currentChatId && !u.message.is_outgoing) markRead();
      const m = S.typing.get(u.message.chat_id); m?.delete(senderId(u.message.sender_id));
      break;
    }
    case 'updateMessageSendSucceeded': case 'updateMessageSendFailed': {
      const h = S.history.get(u.message.chat_id);
      if (h && h.byId.has(u.old_message_id)) {
        h.byId.delete(u.old_message_id);
        h.byId.set(u.message.id, u.message);
        h.list = h.list.map(x => (x.id === u.old_message_id ? u.message : x)).sort((a, b) => a.id - b.id);
        // временный id сменился на настоящий — строка пересоздаётся, повторно не анимируем
      } else putMessage(u.message);
      if (u['@type'] === 'updateMessageSendFailed') showHud(u.error?.message || 'Сообщение не отправлено');
      break;
    }
    case 'updateMessageContent': {
      const h = S.history.get(u.chat_id), m = h?.byId.get(u.message_id);
      if (m) putMessage({ ...m, content: u.new_content });
      break;
    }
    case 'updateMessageEdited': {
      const h = S.history.get(u.chat_id), m = h?.byId.get(u.message_id);
      if (m) putMessage({ ...m, edit_date: u.edit_date, reply_markup: u.reply_markup });
      break;
    }
    case 'updateMessageInteractionInfo': {
      const h = S.history.get(u.chat_id), m = h?.byId.get(u.message_id);
      if (m) putMessage({ ...m, interaction_info: u.interaction_info });
      break;
    }
    case 'updateMessageIsPinned':
      if (u.chat_id === S.currentChatId) loadPinned(u.chat_id);
      { const h = S.history.get(u.chat_id), m = h?.byId.get(u.message_id); if (m) putMessage({ ...m, is_pinned: u.is_pinned }); }
      break;
    case 'updateChatReplyMarkup': patchChat(u.chat_id, c => { c.reply_markup_message_id = u.reply_markup_message_id; }); break;
    case 'updateDeleteMessages': {
      if (u.from_cache) break;
      // Как удаление строки в TableView (macOS): сообщение гаснет и схлопывается за 0.2 с,
      // соседние плавно съезжают; только потом убираем его из данных.
      const rows = u.chat_id === S.currentChatId && S.prefs.glass !== false
        ? u.message_ids.map(id => document.querySelector(`.messages [data-mid="${id}"]`)).filter(Boolean) : [];
      if (!rows.length || !rows[0].animate) { for (const id of u.message_ids) removeMessage(u.chat_id, id); break; }
      for (const r of rows) {
        const h = r.getBoundingClientRect().height;
        r.style.overflow = 'hidden';
        r.animate([{ opacity: 1, height: `${h}px` }, { opacity: 0, height: `${h}px`, offset: .5 }, { opacity: 0, height: '0px', marginTop: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px' }],
          { duration: 400, easing: 'ease-out', fill: 'forwards' });
      }
      setTimeout(() => { for (const id of u.message_ids) removeMessage(u.chat_id, id); changed(); }, 400);
      return;
    }
    case 'updateChatAction': setTyping(u.chat_id, u.sender_id, u.action); break;
    case 'updateProfileAccentColors': S.profileColors = Object.fromEntries((u.colors || []).map(c => [c.id, c])); break;
    case 'updateScopeNotificationSettings': S.scopes[u.scope['@type']] = u.notification_settings; break;
    default: if (hooked) changed(); return;
  }
  changed();
});
