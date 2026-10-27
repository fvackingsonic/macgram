// «Оформление» — как AppAppearanceViewController в Telegram для macOS:
// превью, тема, цвет акцента, тёмный режим, пузыри, фон чата, цвет имени, размер текста,
// автоночь, значок приложения. Плюс свои настройки macgram (стекло, шрифты).
import { html, useState, useEffect } from '../lib.js';
import { S, changed, setPref, showHud, effectiveTheme, baseTheme, autoNightMode, download, fileUrl } from '../store.js';
import { send, shell } from '../td.js';
import { Icon } from '../icons.js';
import { MI } from '../mac-icons.js';
import { Spinner } from './common.js';
import { fillCss } from './wallpaper.js';

const go = page => { S.settingsPage = page; changed(); };

export function Page({ title, back = null, backLabel = 'Настройки', children }) {
  return html`<div class="list settings-page" key=${title}>
    <div class="sp-head"><button class="sp-back" onClick=${() => go(back)}>${Icon.back(13)}<span class="sp-back-text">${backLabel}</span></button><span class="sp-title">${title}</span></div>
    ${children}
  </div>`;
}
const Switch = ({ on, onChange }) => html`<span class=${`switch ${on ? 'on' : ''}`} onClick=${e => { e.stopPropagation(); onChange(!on); }}><i/></span>`;

// Темы Telegram для macOS: Day Classic, Day, Night Tinted, Night.
export const THEMES = [
  ['classic', 'Классика', { bg: 'linear-gradient(135deg,#dbddbb,#88b884)', inc: '#ffffff', out: '#eeffde' }],
  ['day', 'День', { bg: '#ffffff', inc: '#f1f1f4', out: '#4a95d6' }],
  ['night', 'Синяя ночь', { bg: '#0e1621', inc: '#1e2c3b', out: '#416ead' }],
  ['dark', 'Ночь', { bg: '#000000', inc: '#262628', out: '#3e88f7' }],
];
const ACCENTS = [null, '#007aff', '#5856d6', '#af52de', '#ff2d55', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#8e8e93'];
// Цвета имени, доступные всем (встроенные 0–6 в Telegram).
export const NAME_COLORS = [['#e17076', 'Красный'], ['#faa774', 'Оранжевый'], ['#a695e7', 'Фиолетовый'], ['#7bc862', 'Зелёный'], ['#6ec9cb', 'Бирюзовый'], ['#65aadd', 'Синий'], ['#ee7aae', 'Розовый']];
export const APP_ICONS = [['blue', 'Синий'], ['dark', 'Тёмный'], ['light', 'Светлый'], ['purple', 'Фиолетовый'], ['green', 'Зелёный'], ['sunset', 'Закат']];

function pickTheme(v) {
  const night = v === 'night' || v === 'dark';
  // Выбрали дневную тему, а сейчас ночь включила «Автоночь» — выключаем её, как в macOS.
  if (!night && effectiveTheme() !== baseTheme() && autoNightMode() !== 'off') { setPref('autoNight', 'off'); showHud('Автоночь выключена'); }
  if (night) setPref('nightTheme', v); else setPref('dayTheme', v);
  setPref('theme', v);
}

// Превью чата сверху, как в macOS.
function Preview() {
  const me = S.users.get(S.myId);
  const nc = NAME_COLORS[(me?.accent_color_id ?? 5) % 7]?.[0] || '#65aadd';
  return html`<div class="ap-preview">
    <div class="ap-msg in"><div class="ap-bubble"><div class="ap-reply" style=${`--nc:${nc}`}><b>${me?.first_name || 'Вы'}</b><span>Привет! Как тебе новое оформление?</span></div>Очень похоже на Mac 😍<span class="ap-time">12:41</span></div></div>
    <div class="ap-msg out"><div class="ap-bubble">Да, и шрифт удобный<span class="ap-time">12:42 ${Icon.checks(12)}</span></div></div>
  </div>`;
}

export function Appearance() {
  const eff = effectiveTheme();
  const dark = eff === 'night' || eff === 'dark';
  const an = autoNightMode();
  const me = S.users.get(S.myId);
  const nameColor = NAME_COLORS[(me?.accent_color_id ?? 5) % 7];
  return html`<${Page} title="Оформление">
    <div class="pane-sec">Цветовая тема</div>
    <div class="group ap-card"><${Preview}/></div>
    <div class="theme-grid">${THEMES.map(([v, l, c]) => html`<button class=${`theme-tile ${eff === v ? 'on' : ''}`} onClick=${() => pickTheme(v)}>
      <div class="tt-prev" style=${`background:${c.bg}`}><i style=${`background:${c.inc};align-self:flex-start`}/><i style=${`background:${c.out};align-self:flex-end`}/></div><span>${l}</span></button>`)}</div>
    <div class="accent-row">${ACCENTS.map(c => html`<button class=${`accent-dot ${(S.prefs.accent || null) === c ? 'on' : ''}`} style=${`background:${c || 'conic-gradient(#2481cc 0 50%, #2ea6ff 0)'}`} title=${c ? '' : 'Как в теме'} onClick=${() => setPref('accent', c)}/>`)}</div>

    <div class="group">
      <div class="item"><span class="lbl">Тёмный режим</span><${Switch} on=${dark} onChange=${v => pickTheme(v ? (S.prefs.nightTheme || 'night') : (['classic', 'day'].includes(S.prefs.dayTheme) ? S.prefs.dayTheme : 'classic'))}/></div>
      <div class="item"><span class="lbl">Пузыри сообщений<small>Выключите — сообщения будут списком, как в старом Telegram для Mac</small></span><${Switch} on=${S.prefs.bubbles !== false} onChange=${v => setPref('bubbles', v)}/></div>
      <button class="item" onClick=${() => go('wallpaper')}><span class="lbl">Фон чата</span><span class="chev">${Icon.chevron(11)}</span></button>
      <button class="item" onClick=${() => go('namecolor')}><span class="lbl">Цвет вашего имени</span><span class="ap-dot" style=${`background:${nameColor[0]}`}/><span class="chev">${Icon.chevron(11)}</span></button>
    </div>

    <div class="pane-sec">Размер текста</div>
    <div class="group"><div class="item ap-size">
      <span style="font-size:12px">A</span>
      <input type="range" min="12" max="20" step="1" value=${S.prefs.fontSize || 14} onInput=${e => setPref('fontSize', Number(e.target.value))}/>
      <span style="font-size:20px">A</span>
      <span class="val ap-size-val">${S.prefs.fontSize || 14}</span>
    </div></div>

    <div class="pane-sec">Автоночь</div>
    <div class="group">
      <button class="item" onClick=${() => go('autonight')}><span class="lbl">Автоматическая ночная тема</span><span class="val">${an === 'system' ? 'Как в системе' : an === 'schedule' ? `${S.prefs.nightFrom || '22:00'}–${S.prefs.nightTo || '07:00'}` : 'Выкл.'}</span><span class="chev">${Icon.chevron(11)}</span></button>
    </div>

    <div class="pane-sec">Значок приложения</div>
    <div class="icon-grid">${APP_ICONS.map(([k, l]) => html`<button class=${`icon-tile ${(S.prefs.appIcon || 'blue') === k ? 'on' : ''}`} onClick=${() => { setPref('appIcon', k); if (!window.__TAURI__) showHud('Значок меняется в программе для Windows'); }}>
      <img src=${`icons/alt/${k}.png`} width="56" height="56" alt=""/><span>${l}</span></button>`)}</div>
    <div class="sp-hint" style="padding:0 18px">Меняется значок окна, панели задач и трея. Ярлык на рабочем столе остаётся прежним.</div>

    <div class="pane-sec" style="margin-top:12px">macgram</div>
    <div class="group">
      <div class="item"><span class="lbl">Эффекты стекла и анимации<small>Если программа тормозит на слабом компьютере — выключите</small></span><${Switch} on=${S.prefs.glass !== false} onChange=${v => setPref('glass', v)}/></div>
      <button class="item" onClick=${() => go('fonts')}><span class="lbl">Свои шрифты</span><span class="chev">${Icon.chevron(11)}</span></button>
    </div>
  </${Page}>`;
}

// ── Автоночь ──
export function AutoNight() {
  const an = autoNightMode();
  const Opt = ({ v, label, hint }) => html`<button class="item" onClick=${() => setPref('autoNight', v)}><span class="lbl">${label}${hint && html`<small>${hint}</small>`}</span>${an === v && html`<span style="color:var(--accent)">${Icon.check(14)}</span>`}</button>`;
  return html`<${Page} title="Автоночь" back="appearance" backLabel="Оформление">
    <div class="group" style="margin-top:6px">
      <${Opt} v="off" label="Выключена"/>
      <${Opt} v="system" label="Как в системе" hint="Ночная тема включается вместе с тёмным режимом Windows"/>
      <${Opt} v="schedule" label="По расписанию"/>
    </div>
    ${an === 'schedule' && html`<div class="pane-sec">Расписание</div>
    <div class="group">
      <div class="item"><span class="lbl">С</span><input class="ap-time-in" type="time" value=${S.prefs.nightFrom || '22:00'} onChange=${e => setPref('nightFrom', e.target.value)}/></div>
      <div class="item"><span class="lbl">До</span><input class="ap-time-in" type="time" value=${S.prefs.nightTo || '07:00'} onChange=${e => setPref('nightTo', e.target.value)}/></div>
    </div>`}
    ${an !== 'off' && html`<div class="pane-sec">Ночная тема</div>
    <div class="group">
      ${[['night', 'Синяя ночь'], ['dark', 'Ночь']].map(([v, l]) => html`<button class="item" onClick=${() => setPref('nightTheme', v)}><span class="lbl">${l}</span>${(S.prefs.nightTheme || 'night') === v && html`<span style="color:var(--accent)">${Icon.check(14)}</span>`}</button>`)}
    </div>`}
  </${Page}>`;
}

// ── Цвет имени (setAccentColor, как «Your Name Color» в macOS) ──
export function NameColor() {
  const me = S.users.get(S.myId);
  const cur = (me?.accent_color_id ?? 5) % 7;
  const set = id => send({ '@type': 'setAccentColor', accent_color_id: id, background_custom_emoji_id: '0' })
    .then(() => { if (me) { S.users.set(me.id, { ...me, accent_color_id: id }); changed(); } showHud('Цвет имени изменён'); })
    .catch(e => showHud(e.message?.includes('PREMIUM') ? 'Этот цвет доступен только с Telegram Premium' : e.message));
  return html`<${Page} title="Цвет имени" back="appearance" backLabel="Оформление">
    <div class="group ap-card"><div class="ap-preview"><div class="ap-msg in"><div class="ap-bubble">
      <div class="ap-reply" style=${`--nc:${NAME_COLORS[cur][0]}`}><b>${me?.first_name || 'Вы'}</b><span>Так будет выглядеть ответ на ваше сообщение</span></div>
      <div class="ap-link" style=${`--nc:${NAME_COLORS[cur][0]}`}><b>macgram</b><span>Цвет имени виден всем в группах, ответах и ссылках</span></div>
      <span class="ap-time">12:41</span></div></div></div></div>
    <div class="accent-row" style="justify-content:center;padding-top:8px">${NAME_COLORS.map(([c, l], i) => html`<button class=${`accent-dot big ${cur === i ? 'on' : ''}`} style=${`background:${c}`} title=${l} onClick=${() => set(i)}/>`)}</div>
    <div class="sp-hint" style="padding:0 18px">Цвет имени виден всем: в группах, ответах и превью ссылок.</div>
  </${Page}>`;
}

// ── Фон чата (как WallpaperListController) ──
const PRESET_FILLS = [
  { '@type': 'backgroundFillFreeformGradient', colors: [0xdbddbb, 0x6ba587, 0xd5d88d, 0x88b884] },
  { '@type': 'backgroundFillFreeformGradient', colors: [0x8dc0eb, 0xb9d1ea, 0xc6b1ef, 0xebd7ef] },
  { '@type': 'backgroundFillFreeformGradient', colors: [0x97beeb, 0xb1e9ea, 0xc6b1ef, 0xefb7dc] },
  { '@type': 'backgroundFillFreeformGradient', colors: [0xeaa36e, 0xf0e486, 0xf29ebf, 0xe8c06e] },
  { '@type': 'backgroundFillFreeformGradient', colors: [0x7fa381, 0xfff5c5, 0x336f55, 0xfbe37d] },
  { '@type': 'backgroundFillFreeformGradient', colors: [0x1b2836, 0x121a22, 0x1d2a37, 0x111820] },
  { '@type': 'backgroundFillSolid', color: 0xe6ebee },
  { '@type': 'backgroundFillSolid', color: 0xd8e3d4 },
  { '@type': 'backgroundFillSolid', color: 0xf3e3c4 },
  { '@type': 'backgroundFillSolid', color: 0x232d3a },
];

function BgThumb({ bg }) {
  const t = bg.type?.['@type'];
  const th = bg.document?.thumbnail?.file;
  useEffect(() => { if (th) download(th, 1); }, [th?.id]);
  const url = th ? fileUrl(th) : '';
  if (t === 'backgroundTypeFill') return html`<div class="wp-tile-in" style=${`background:${fillCss(bg.type.fill, [0xdbddbb, 0x88b884, 0xd5d88d, 0x6ba587])}`}/>`;
  if (t === 'backgroundTypePattern') return html`<div class="wp-tile-in" style=${`background:${fillCss(bg.type.fill, [0xdbddbb, 0x88b884, 0xd5d88d, 0x6ba587])}`}>${url && html`<img src=${url} alt="" style="mix-blend-mode:multiply;opacity:.35"/>`}</div>`;
  return html`<div class="wp-tile-in">${url ? html`<img src=${url} alt=""/>` : html`<${Spinner}/>`}</div>`;
}

export function WallpaperSettings() {
  const dark = ['night', 'dark'].includes(effectiveTheme());
  const [list, setList] = useState(null);
  const cur = S.backgrounds?.[dark ? 'dark' : 'light'];
  useEffect(() => { send({ '@type': 'getInstalledBackgrounds', for_dark_theme: dark }).then(r => setList(r.backgrounds || [])).catch(() => setList([])); }, [dark]);
  const apply = (background, type) => send({ '@type': 'setDefaultBackground', background, type, for_dark_theme: dark })
    .then(() => showHud('Фон изменён')).catch(e => showHud(e.message));
  const pickRemote = bg => apply({ '@type': 'inputBackgroundRemote', background_id: bg.id }, bg.type);
  const pickFill = fill => apply(null, { '@type': 'backgroundTypeFill', fill });
  const pickFile = async () => {
    try {
      const [path] = await shell.pickFiles(true);
      if (!path) return;
      showHud('Загружаю фон…');
      await apply({ '@type': 'inputBackgroundLocal', background: { '@type': 'inputFileLocal', path } }, { '@type': 'backgroundTypeWallpaper', is_blurred: false, is_moving: false });
    } catch (e) { showHud(e.message || String(e)); }
  };
  const reset = () => send({ '@type': 'deleteDefaultBackground', for_dark_theme: dark }).then(() => showHud('Стандартный фон')).catch(e => showHud(e.message));
  const isPhoto = cur?.type?.['@type'] === 'backgroundTypeWallpaper';
  const setBlur = v => cur && apply({ '@type': 'inputBackgroundRemote', background_id: cur.id }, { ...cur.type, is_blurred: v });
  return html`<${Page} title="Фон чата" back="appearance" backLabel="Оформление">
    <div class="group">
      <button class="item" onClick=${pickFile}><span class="lbl" style="color:var(--accent)">Выбрать из файлов…</span></button>
      ${isPhoto && html`<div class="item"><span class="lbl">Размытие</span><${Switch} on=${!!cur.type.is_blurred} onChange=${setBlur}/></div>`}
      <button class="item" onClick=${reset}><span class="lbl" style="color:var(--accent)">Стандартный фон</span></button>
    </div>
    <div class="pane-sec">Цвета</div>
    <div class="wp-grid">${PRESET_FILLS.map((f, i) => html`<button class="wp-tile" key=${`f${i}`} onClick=${() => pickFill(f)}><div class="wp-tile-in" style=${`background:${fillCss(f, f.colors || [])}`}/></button>`)}</div>
    <div class="pane-sec">Ваши фоны</div>
    ${list === null ? html`<div style="display:grid;place-items:center;padding:20px"><${Spinner}/></div>`
      : !list.length ? html`<div class="sp-hint" style="padding:0 18px">Здесь появятся фоны, сохранённые в вашем аккаунте Telegram.</div>`
        : html`<div class="wp-grid">${list.map(bg => html`<button class=${`wp-tile ${cur?.id === bg.id ? 'on' : ''}`} key=${bg.id} onClick=${() => pickRemote(bg)}><${BgThumb} bg=${bg}/></button>`)}</div>`}
    <div class="sp-hint" style="padding:0 18px">Фон сохраняется в аккаунте Telegram — отдельно для дневной и ночной темы.</div>
  </${Page}>`;
}
