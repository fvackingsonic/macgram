import { html } from './lib.js';
import { MENU_ANIMS } from './menu-anims.js';

// Простые собственные иконки в духе macOS (линии 1.6–1.8px, скруглённые концы).
const S = (size, body, opts = {}) => html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill=${opts.fill || 'none'}
  stroke=${opts.fill ? 'none' : 'currentColor'} stroke-width=${opts.sw || 1.8} stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const Icon = {
  search: (s = 15) => S(s, html`<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20"/>`),
  compose: (s = 20) => S(s, html`<path d="M12 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V12"/><path d="M17.8 3.7a1.9 1.9 0 0 1 2.7 2.7L12 14.9 8.5 15.5l.6-3.5z"/>`),
  contacts: (s = 26) => S(s, html`<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20c.8-3.7 3.9-6 7.5-6s6.7 2.3 7.5 6"/>`),
  calls: (s = 25) => S(s, html`<path d="M5.2 3.5h3l1.6 4.2-2 1.3a11.5 11.5 0 0 0 7.2 7.2l1.3-2 4.2 1.6v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3.2 5.7a2 2 0 0 1 2-2.2z"/>`),
  chats: (s = 26) => S(s, html`<path d="M12 4c4.7 0 8.5 3.1 8.5 7s-3.8 7-8.5 7c-1 0-2-.1-2.9-.4L5 19.5l1.2-3.4C4.5 14.8 3.5 13 3.5 11c0-3.9 3.8-7 8.5-7z"/>`),
  settings: (s = 26) => S(s, html`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>`, { sw: 1.6 }),
  attach: (s = 22) => S(s, html`<path d="m20 11.5-7.8 7.8a5 5 0 0 1-7.1-7.1l8.2-8.2a3.4 3.4 0 0 1 4.8 4.8l-8.2 8.2a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4"/>`),
  smile: (s = 22) => S(s, html`<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.2a4.2 4.2 0 0 0 7 0"/><path d="M9.2 9.6h.01M14.8 9.6h.01" stroke-width="2.6"/>`),
  send: (s = 24) => S(s, html`<path d="M12 3.5c.4 0 .8.2 1 .5l6.2 6.6a1.3 1.3 0 0 1-1.9 1.8L13.3 8.2V19a1.3 1.3 0 0 1-2.6 0V8.2l-4 4.2a1.3 1.3 0 1 1-1.9-1.8L11 4c.2-.3.6-.5 1-.5z"/>`, { fill: 'currentColor' }),
  sendCircle: (s = 30) => html`<svg width=${s} height=${s} viewBox="0 0 30 30"><circle cx="15" cy="15" r="14" fill="currentColor"/><path d="M15 8.5l5.2 5.4M15 8.5 9.8 13.9M15 8.8V21.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>`,
  mic: (s = 22) => S(s, html`<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>`),
  check: (s = 14) => S(s, html`<path d="m4 12.5 4.5 4.5L20 6"/>`, { sw: 2 }),
  checks: (s = 16) => html`<svg width=${s + 4} height=${s} viewBox="0 0 28 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 12.5 4.5 4.5L18 6"/><path d="m12.5 16.6.5.4L24.5 6"/></svg>`,
  clock: (s = 13) => S(s, html`<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>`),
  pin: (s = 14) => S(s, html`<path d="M15 3.5 20.5 9l-2.6.9-3.6 3.6.2 4-1.6 1.6-3.6-3.6-4.8 4.8M9.3 12.3 5.7 8.7l1.6-1.6 4 .2 3.6-3.6z"/>`, { sw: 1.6 }),
  muted: (s = 13) => S(s, html`<path d="M11 5 6.5 8.5H4v7h2.5L11 19z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>`),
  volume: (s = 15) => S(s, html`<path d="M11 5 6.5 8.5H4v7h2.5L11 19z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>`),
  expand: (s = 16) => S(s, html`<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>`),
  back: (s = 18) => S(s, html`<path d="M15 5l-7 7 7 7"/>`, { sw: 2.2 }),
  video: (s = 22) => S(s, html`<rect x="3" y="6.5" width="12.5" height="11" rx="2.5"/><path d="m15.5 10.5 5-3v9l-5-3z"/>`),
  archive: (s = 16) => S(s, html`<rect x="3.5" y="4.5" width="17" height="4.5" rx="1.2"/><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4"/>`),
  chevron: (s = 12) => S(s, html`<path d="m9 6 6 6-6 6"/>`, { sw: 2.2 }),
  more: (s = 22) => S(s, html`<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>`, { sw: 1.9 }),
  reply: (s = 15) => S(s, html`<path d="M10 5 4 11l6 6"/><path d="M4.5 11H14a6 6 0 0 1 6 6v2"/>`),
  copy: (s = 15) => S(s, html`<rect x="8.5" y="8.5" width="11" height="11" rx="2.2"/><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>`),
  trash: (s = 15) => S(s, html`<path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2a1.5 1.5 0 0 0 1.5 1.3h6.2a1.5 1.5 0 0 0 1.5-1.3L17.5 7"/>`),
  edit: (s = 15) => S(s, html`<path d="M16.8 3.7a1.9 1.9 0 0 1 2.7 2.7L8 17.9l-3.6.9.9-3.6z"/>`),
  close: (s = 16) => S(s, html`<path d="M6 6l12 12M18 6 6 18"/>`),
  bookmark: (s = 22) => S(s, html`<path d="M7 3.5h10a1 1 0 0 1 1 1v16l-6-4-6 4v-16a1 1 0 0 1 1-1z"/>`, { fill: 'currentColor' }),
  play: (s = 20) => S(s, html`<path d="M8 5.5v13l11-6.5z"/>`, { fill: 'currentColor' }),
  pause: (s = 20) => S(s, html`<rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/>`, { fill: 'currentColor' }),
  file: (s = 20) => S(s, html`<path d="M13.5 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5z"/><path d="M13.5 3.5v5h5"/>`),
  lock: (s = 16) => S(s, html`<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>`),
  key: (s = 16) => S(s, html`<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16.5 6.5l2.5 2.5M14.5 8.5 16 10"/>`),
  moon: (s = 16) => S(s, html`<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>`),
  textSize: (s = 16) => S(s, html`<path d="M4 18 9 6l5 12M5.6 14.2h6.8M15 18l3-7 3 7M15.8 16h4.4"/>`),
  logout: (s = 16) => S(s, html`<path d="M14 4.5H18a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M10 8l-4 4 4 4M6 12h10"/>`),
  user: (s = 16) => S(s, html`<circle cx="12" cy="8.5" r="3.6"/><path d="M5.5 19.5c.8-3.3 3.4-5.3 6.5-5.3s5.7 2 6.5 5.3"/>`),
  verified: (s = 15) => html`<svg width=${s} height=${s} viewBox="0 0 24 24"><path fill="var(--accent)" d="m12 1.8 2.4 1.8 3-.1.9 2.8 2.5 1.7-1 2.9 1 2.9-2.5 1.7-.9 2.8-3-.1L12 20.2l-2.4-1.8-3 .1-.9-2.8-2.5-1.7 1-2.9-1-2.9 2.5-1.7.9-2.8 3 .1z"/><path d="m8.2 11.8 2.6 2.6 5-5.1" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  megaphone: (s = 13) => S(s, html`<path d="M4 10v4h3l7 4V6L7 10z"/><path d="M17.5 9.5a4 4 0 0 1 0 5"/>`),
  group: (s = 13) => S(s, html`<circle cx="9" cy="9" r="3"/><path d="M3.5 18.5c.6-2.7 2.8-4.3 5.5-4.3s4.9 1.6 5.5 4.3"/><circle cx="17" cy="9.5" r="2.4"/><path d="M16 14.3c2.3-.2 4 1.2 4.6 3.7"/>`),
  plus: (s = 12) => S(s, html`<path d="M12 5v14M5 12h14"/>`, { sw: 2.4 }),
  minus: (s = 8) => S(s, html`<path d="M5 12h14"/>`, { sw: 3 }),
  // глифы для «светофора» окна
  tlClose: () => html`<svg width="8" height="8" viewBox="0 0 8 8"><path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="rgba(0,0,0,.55)" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  tlMin: () => html`<svg width="8" height="8" viewBox="0 0 8 8"><path d="M1.2 4h5.6" stroke="rgba(0,0,0,.55)" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  tlMax: () => html`<svg width="8" height="8" viewBox="0 0 8 8"><path d="M1.5 4.8V1.5h3.3zM6.5 3.2v3.3H3.2z" fill="rgba(0,0,0,.55)"/></svg>`,
};

// Собственный логотип приложения (облачко-сообщение), не логотип Telegram.
export const AppLogo = ({ size = 96 }) => html`
  <svg width=${size} height=${size} viewBox="0 0 96 96">
    <defs>
      <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4fb0f4"/><stop offset="1" stop-color="#1f7fd0"/>
      </linearGradient>
    </defs>
    <rect x="4" y="4" width="88" height="88" rx="22" fill="url(#lg)"/>
    <path d="M48 24c14.9 0 27 9.7 27 21.7S62.9 67.4 48 67.4c-2.9 0-5.7-.4-8.3-1.1L27 72.5l3.6-10.4C25 58.2 21 52.3 21 45.7 21 33.7 33.1 24 48 24z" fill="#fff"/>
    <circle cx="37.5" cy="46" r="3.4" fill="#2a8ad8"/><circle cx="48" cy="46" r="3.4" fill="#2a8ad8"/><circle cx="58.5" cy="46" r="3.4" fill="#2a8ad8"/>
  </svg>`;

// ── Заменяем свои иконки на настоящие из Telegram для macOS там, где они есть ──
import { MI } from './mac-icons.js';
Object.assign(Icon, {
  search: (s = 14) => MI('Icon_SearchField', s),
  compose: (s = 20) => MI('Icon_NewMessage', s),
  contacts: (s = 22) => MI('menu_open_profile', s),
  tabContacts: () => MI('Icon_TabContacts'),
  tabCalls: () => MI('Icon_TabRecentCalls'),
  tabChats: on => MI(on ? 'Icon_TabChatList_Highlighted' : 'Icon_TabChatList'),
  tabSettings: () => MI('Icon_TabSettings'),
  calls: (s = 22) => MI('menu_call', s),
  chats: (s = 22) => MI('menu_message', s),
  settings: (s = 22) => MI('menu_gear', s),
  attach: (s = 24) => MI('Icon_ChatAttach', s + 6),
  smile: (s = 24) => MI('Icon_Entertainments', s + 6),
  send: (s = 22) => MI('Icon_SendMessage', s),
  mic: (s = 24) => MI('Icon_RecordVoice', s + 6),
  check: (s = 13) => MI('Icon_MessageCheckMark1', s),
  checks: (s = 13) => html`<span class="mi-checks">${MI('Icon_MessageCheckMark1', s)}${MI('Icon_MessageCheckmark2', s)}</span>`,
  clock: (s = 12) => MI('Icon_ChatStateSending', s),
  pin: (s = 16) => MI('Icon_ChatListPinned', s + 2),
  muted: (s = 13) => MI('Icon_DialogMute', s),
  reply: (s = 18) => MI('menu_reply', s),
  copy: (s = 18) => MI('menu_copy', s),
  trash: (s = 18) => MI('menu_delete', s),
  edit: (s = 18) => MI('menu_edit', s),
  play: (s = 16) => MI('Icon_ChatMusicPlay', s),
  pause: (s = 16) => MI('Icon_ChatMusicPause', s),
  lock: (s = 16) => MI('menu_lock', s),
  volume: (s = 18) => MI('Icon_InlinePlayer_VolumeOn', s + 6),
  expand: (s = 18) => MI('Icon_VideoPlayer_EnterFullScreen', s + 8),
  back: (s = 14) => MI('Icon_ChatNavigationBack', s),
  archive: (s = 18) => MI('menu_archive', s),
  verified: (s = 15) => html`<span style=${`color:var(--accent);display:inline-flex`}>${MI('Icon_Verified_Telegram', s)}</span>`,
  forward: (s = 18) => MI('menu_forward', s),
  // Иконка пункта меню; для анимированных (как в macOS) помечаем имя Lottie-анимации.
  menu: name => { const v = MI(name, 18); if (v && MENU_ANIMS.has(name)) v.__anim = name; return v; },
});
