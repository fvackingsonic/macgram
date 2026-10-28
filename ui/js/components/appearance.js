// «Оформление» — как AppAppearanceViewController в Telegram для macOS:
// превью с настоящим фоном, темы, цвет акцента (и свой цвет), тёмный режим, пузыри, фон чата
// (с предпросмотром, размытием, узором и его яркостью), цвет имени и профиля, размер текста
// с делениями 11–18, автоночь, значок приложения, сброс. Плюс свои настройки macgram.
import { html, useState, useEffect, useRef } from '../lib.js';
import { S, changed, setPref, showHud, effectiveTheme, baseTheme, autoNightMode, download, fileUrl, openMenu, openModal, closeModal } from '../store.js';
import { send, shell } from '../td.js';
import { Icon } from '../icons.js';
import { MI } from '../mac-icons.js';
import { Spinner } from './common.js';
import { fillCss, Wallpaper } from './wallpaper.js';

const go = page => { S.settingsPage = page; changed(); };

export function Page({ title, back = null, right, children }) {
  return html`<div class="list settings-page" key=${title}>
    <div class="sp-head"><button class="sp-back" title="Назад" onClick=${() => go(back)}>${Icon.back(13)}</button><span class="sp-title">${title}</span>${right}</div>
    ${children}
  </div>`;
}
const Switch = ({ on, onChange }) => html`<span class=${`switch ${on ? 'on' : ''}`} onClick=${e => { e.stopPropagation(); onChange(!on); }}><i/></span>`;
const Tog = ({ k, label, hint, def = true }) => html`<div class="item"><span class="lbl">${label}${hint && html`<small>${hint}</small>`}</span><${Switch} on=${(S.prefs[k] ?? def) === true} onChange=${v => setPref(k, v)}/></div>`;
const seg = (k, opts, def) => html`<div class="seg">${opts.map(([v, l]) => html`<button class=${(S.prefs[k] ?? def) === v ? 'on' : ''} onClick=${() => setPref(k, v)}>${l}</button>`)}</div>`;
// «Сообщения» в выборе акцента Telegram для macOS — цвет своих пузырей
const OUT_COLORS = [null, '#4a95d6', '#2ea6ff', '#8e6ff7', '#e86b9f', '#f08a4b', '#3fb46d', '#3e4a5c'];
const Check = () => html`<span style="color:var(--accent);display:flex">${Icon.check(14)}</span>`;

// Темы Telegram для macOS: Day Classic, Day, Night Tinted, Night.
export const THEMES = [
  ['classic', 'Классика', { bg: 'linear-gradient(135deg,#dbddbb,#88b884)', inc: '#ffffff', out: '#eeffde' }],
  ['day', 'День', { bg: '#ffffff', inc: '#f1f1f4', out: '#4a95d6' }],
  ['night', 'Синяя ночь', { bg: '#0e1621', inc: '#1e2c3b', out: '#416ead' }],
  ['black', 'Ночь', { bg: '#000000', inc: '#262628', out: '#3e88f7' }],
];
const ACCENTS = [null, '#007aff', '#5856d6', '#af52de', '#ff2d55', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#8e8e93'];
// Цвета имени, доступные всем (встроенные 0–6 в Telegram).
export const NAME_COLORS = [['#e17076', 'Красный'], ['#faa774', 'Оранжевый'], ['#a695e7', 'Фиолетовый'], ['#7bc862', 'Зелёный'], ['#6ec9cb', 'Бирюзовый'], ['#65aadd', 'Синий'], ['#ee7aae', 'Розовый']];
export const APP_ICONS = [['blue', 'Синий'], ['dark', 'Тёмный'], ['light', 'Светлый'], ['purple', 'Фиолетовый'], ['green', 'Зелёный'], ['sunset', 'Закат']];
const SIZES = [11, 12, 13, 14, 15, 16, 17, 18];
const hex = n => `#${(n >>> 0 & 0xffffff).toString(16).padStart(6, '0')}`;

function pickTheme(v) {
  const night = v === 'night' || v === 'black';
  // Выбрали дневную тему, а сейчас ночь включила «Автоночь» — выключаем её, как в macOS.
  if (!night && effectiveTheme() !== baseTheme() && autoNightMode() !== 'off') { setPref('autoNight', 'off'); showHud('Автоночь выключена'); }
  if (night) setPref('nightTheme', v); else setPref('dayTheme', v);
  setPref('theme', v);
}

// Превью чата с настоящим фоном, как ThemePreviewRowItem в macOS.
function Preview() {
  const me = S.users.get(S.myId);
  const nc = NAME_COLORS[(me?.accent_color_id ?? 5) % 7]?.[0] || '#65aadd';
  return html`<div class="ap-preview">
    <${Wallpaper}/>
    <div class="ap-msg in"><div class="ap-bubble"><div class="ap-reply" style=${`--nc:${nc}`}><b>${me?.first_name || 'Вы'}</b><span>Привет! Как тебе новое оформление?</span></div>Очень похоже на Mac 😍<span class="ap-time">12:41</span></div></div>
    <div class="ap-msg out"><div class="ap-bubble">Да, и цвета подходят к фону<span class="ap-time">12:42 ${Icon.checks(12)}</span></div></div>
  </div>`;
}

function resetAppearance() {
  openModal({
    title: 'Сбросить оформление?', text: 'Тема, цвета, размер текста, пузыри, автоночь и значок вернутся к стандартным.',
    buttons: [
      { label: 'Сбросить', kind: 'danger', action: () => { closeModal(); for (const k of ['theme', 'dayTheme', 'nightTheme', 'accent', 'bubbles', 'fontSize', 'autoNight', 'nightFrom', 'nightTo', 'appIcon', 'autoTint', 'glassBubbles', 'glassPanels', 'glassLens', 'glassCopy', 'glassTint', 'wallFit', 'tint', 'outColor']) setPref(k, k === 'fontSize' ? 14 : k === 'appIcon' ? 'blue' : undefined); showHud('Оформление сброшено'); } },
      { label: 'Отмена', kind: 'second', action: closeModal },
    ],
  });
}

export function Appearance() {
  const eff = effectiveTheme();
  const dark = eff === 'night' || eff === 'black';
  const an = autoNightMode();
  const me = S.users.get(S.myId);
  const nameColor = NAME_COLORS[(me?.accent_color_id ?? 5) % 7];
  const colorRef = useRef();
  const custom = S.prefs.accent && !ACCENTS.includes(S.prefs.accent) ? S.prefs.accent : null;
  const outRef = useRef();
  const outCustom = S.prefs.outColor && !OUT_COLORS.includes(S.prefs.outColor) ? S.prefs.outColor : null;
  const size = S.prefs.fontSize || 14;
  const more = e => { const r = e.currentTarget.getBoundingClientRect(); openMenu(r.right - 210, r.bottom + 4, [{ label: 'Сбросить оформление', icon: Icon.menu('menu_clear_history'), danger: true, action: resetAppearance }]); };
  return html`<${Page} title="Оформление" right=${html`<button class="sp-more" title="Ещё" onClick=${more}>${Icon.more(18)}</button>`}>
    <div class="pane-sec">Цветовая тема</div>
    <div class="group ap-card"><${Preview}/></div>
    <div class="theme-grid">${THEMES.map(([v, l, c]) => html`<button class=${`theme-tile ${eff === v ? 'on' : ''}`} onClick=${() => pickTheme(v)}>
      <div class="tt-prev" style=${`background:${c.bg}`}><i style=${`background:${c.inc};align-self:flex-start`}/><i style=${`background:${c.out};align-self:flex-end`}/></div><span>${l}</span></button>`)}</div>
    <div class="accent-row">
      ${ACCENTS.map(c => html`<button class=${`accent-dot ${(S.prefs.accent || null) === c ? 'on' : ''}`} style=${`background:${c || 'conic-gradient(#2481cc 0 50%, #2ea6ff 0)'}`} title=${c ? '' : 'Как в теме'} onClick=${() => setPref('accent', c)}/>`)}
      <button class=${`accent-dot custom ${custom ? 'on' : ''}`} title="Свой цвет" style=${custom ? `background:${custom}` : ''} onClick=${() => colorRef.current?.click()}>${!custom && Icon.plus(12)}</button>
      <input ref=${colorRef} type="color" class="hidden-input" value=${custom || '#2481cc'} onInput=${e => setPref('accent', e.target.value)}/>
    </div>

    <div class="group">
      <div class="item"><span class="lbl">Тёмный режим</span><${Switch} on=${dark} onChange=${v => pickTheme(v ? (S.prefs.nightTheme === 'black' ? 'black' : 'night') : (['classic', 'day'].includes(S.prefs.dayTheme) ? S.prefs.dayTheme : 'classic'))}/></div>
      <div class="item"><span class="lbl">Пузыри сообщений</span><${Switch} on=${S.prefs.bubbles !== false} onChange=${v => setPref('bubbles', v)}/></div>
      ${S.prefs.bubbles !== false && html`<div class="item wrap"><span class="lbl">Фон-картинка</span><div class="seg">${[['cover', 'Заполнить'], ['contain', 'Целиком'], ['width', 'По ширине'], ['center', 'Как есть']].map(([v, l]) => html`<button class=${(S.prefs.wallFit || 'cover') === v ? 'on' : ''} onClick=${() => setPref('wallFit', v)}>${l}</button>`)}</div></div>`}
      ${S.prefs.bubbles !== false && html`<button class="item" onClick=${() => go('wallpaper')}><span class="lbl">Фон чата</span><span class="chev">${Icon.chevron(11)}</span></button>`}
      <div class="item"><span class="lbl">Цвета под фон<small>${S.prefs.tint ? 'Цвета темы подобраны под ваш фон' : S.wallTint ? 'Подобрать акцент, свои сообщения и панели под цвет фона' : 'Сначала поставьте свой фон'}</small></span>
        ${S.prefs.tint && html`<span class="ap-dot" style=${`background:hsl(${Math.round(S.prefs.tint.h)} ${Math.round(Math.min(85, S.prefs.tint.s + 15))}% 50%)`}/>`}
        ${S.prefs.tint ? html`<button class="sel-btn" onClick=${() => { setPref('tint', null); showHud('Цвета темы — стандартные'); }}>Сбросить</button>`
          : html`<button class="sel-btn" disabled=${!S.wallTint} onClick=${() => { setPref('tint', S.wallTint); showHud('Цвета подобраны под фон'); }}>Подобрать</button>`}</div>
      <button class="item" onClick=${() => go('namecolor')}><span class="lbl">Цвет вашего имени</span><span class="ap-dot" style=${`background:${nameColor[0]}`}/><span class="chev">${Icon.chevron(11)}</span></button>
    </div>

    <div class="pane-sec">Жидкое стекло</div>
    <div class="group">
      ${S.prefs.bubbles !== false && html`<div class="item"><span class="lbl">Стекло в сообщениях<small>Пузыри, кнопки ботов и «Переслать» — как Liquid Glass в iOS 26${S.glassBake && S.glassBake !== 'ok' ? ` · ${S.glassBake}` : ''}</small></span><${Switch} on=${S.prefs.glassBubbles !== false} onChange=${v => setPref('glassBubbles', v)}/></div>`}
      ${S.prefs.bubbles !== false && S.prefs.glassBubbles !== false && html`<div class="item"><span class="lbl">Линза у краёв сообщений<small>Фон у края пузыря изгибается, как в толстом стекле. Нагружает видеокарту — включайте, если прокрутка остаётся плавной</small></span><${Switch} on=${S.prefs.glassLens === true} onChange=${v => setPref('glassLens', v)}/></div>`}
      <div class="item"><span class="lbl">Стекло на панелях и кнопках<small>Шапка чата, поле ввода, кнопки сверху и снизу, плеер с нотой</small></span><${Switch} on=${S.prefs.glassPanels !== false} onChange=${v => setPref('glassPanels', v)}/></div>
      ${S.prefs.glassPanels !== false && html`<div class="item"><span class="lbl">Совместимое стекло<small>Включите, только если стекло на шапке и кнопках мигает или пропадает. Работает медленнее</small></span><${Switch} on=${S.prefs.glassCopy === true} onChange=${v => setPref('glassCopy', v)}/></div>`}
      ${(S.prefs.glassBubbles !== false || S.prefs.glassPanels !== false) && html`<div class="item ap-glass">
        <div class="ap-glass-top"><span class="lbl">Прозрачность стекла</span>${typeof S.prefs.glassTint === 'number' && html`<button class="sel-btn" onClick=${() => setPref('glassTint', undefined)}>Стандарт</button>`}</div>
        <input type="range" min="0" max="45" step="1" value=${Math.round(45 - (S.prefs.glassTint ?? .06) * 100)} onInput=${e => setPref('glassTint', (45 - Number(e.target.value)) / 100)}/>
      </div>`}
    </div>
    <div class="sp-hint" style="padding:0 18px">Можно оставить стекло только у сообщений или только у панелей. Если программа всё равно подтормаживает — выключите «Эффекты стекла и анимации» внизу.</div>

    <div class="pane-sec">Цвет ваших сообщений</div>
    <div class="accent-row">
      ${OUT_COLORS.map(c => html`<button class=${`accent-dot ${(S.prefs.outColor || null) === c ? 'on' : ''}`} style=${`background:${c || 'conic-gradient(var(--out-bg) 0 50%, #eeffde 0)'}`} title=${c ? '' : 'Как в теме'} onClick=${() => setPref('outColor', c)}/>`)}
      <button class=${`accent-dot custom ${outCustom ? 'on' : ''}`} title="Свой цвет" style=${outCustom ? `background:${outCustom}` : ''} onClick=${() => outRef.current?.click()}>${!outCustom && Icon.plus(12)}</button>
      <input ref=${outRef} type="color" class="hidden-input" value=${outCustom || '#4a95d6'} onInput=${e => setPref('outColor', e.target.value)}/>
    </div>

    <div class="pane-sec">Чаты</div>
    <div class="group">
      <div class="item wrap"><span class="lbl">Отправлять по</span>${seg('sendKey', [['enter', 'Enter'], ['ctrl', 'Ctrl + Enter']], 'enter')}</div>
      <${Tog} k="bigEmoji" label="Большие смайлики" hint="Сообщение из 1–3 смайликов без текста — крупно"/>
      <${Tog} k="animStickers" label="Анимированные стикеры"/>
      <${Tog} k="autoplayGif" label="Автовоспроизведение GIF"/>
      <${Tog} k="autoplayNotes" label="Автовоспроизведение кружочков"/>
      <${Tog} k="linkPreview" label="Предпросмотр ссылок" hint="Карточка ссылки в отправленных сообщениях"/>
      <${Tog} k="spellcheck" label="Проверка орфографии"/>
    </div>

    <div class="pane-sec">Размер текста</div>
    <div class="group"><div class="item ap-size">
      <span style="font-size:11px">A</span>
      <div class="ap-slider">
        <input type="range" min="0" max=${SIZES.length - 1} step="1" value=${Math.max(0, SIZES.indexOf(size))} onInput=${e => setPref('fontSize', SIZES[Number(e.target.value)])}/>
        <div class="ap-ticks">${SIZES.map(x => html`<i class=${x <= size ? 'on' : ''}/>`)}</div>
      </div>
      <span style="font-size:19px">A</span>
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
  const Opt = ({ v, label, hint }) => html`<button class="item" onClick=${() => setPref('autoNight', v)}><span class="lbl">${label}${hint && html`<small>${hint}</small>`}</span>${an === v && html`<${Check}/>`}</button>`;
  return html`<${Page} title="Автоночь" back="appearance">
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
      ${[['night', 'Синяя ночь'], ['black', 'Ночь']].map(([v, l]) => html`<button class="item" onClick=${() => setPref('nightTheme', v)}><span class="lbl">${l}</span>${(S.prefs.nightTheme === 'black' ? 'black' : 'night') === v && html`<${Check}/>`}</button>`)}
    </div>`}
  </${Page}>`;
}

// ── Цвет имени и профиля (как PeerColors в macOS) ──
export function NameColor() {
  const me = S.users.get(S.myId);
  const cur = (me?.accent_color_id ?? 5) % 7;
  const prof = me?.profile_accent_color_id ?? -1;
  const dark = effectiveTheme() === 'night' || effectiveTheme() === 'black';
  const premiumErr = e => showHud(/PREMIUM|BOOST/i.test(e.message || '') ? 'Этот цвет доступен только с Telegram Premium' : e.message);
  const set = id => send({ '@type': 'setAccentColor', accent_color_id: id, background_custom_emoji_id: '0' })
    .then(() => { if (me) { S.users.set(me.id, { ...me, accent_color_id: id }); changed(); } showHud('Цвет имени изменён'); }).catch(premiumErr);
  const setProf = id => send({ '@type': 'setProfileAccentColor', profile_accent_color_id: id, profile_background_custom_emoji_id: '0' })
    .then(() => { if (me) { S.users.set(me.id, { ...me, profile_accent_color_id: id }); changed(); } showHud(id < 0 ? 'Цвет профиля убран' : 'Цвет профиля изменён'); }).catch(premiumErr);
  const profColors = Object.values(S.profileColors || {}).map(c => ({ id: c.id, cols: ((dark ? c.dark_theme_colors : c.light_theme_colors)?.background_colors || []).map(hex) })).filter(c => c.cols.length);
  const profCur = profColors.find(c => c.id === prof);
  return html`<${Page} title="Цвет имени" back="appearance">
    <div class="group ap-card"><div class="ap-preview"><${Wallpaper}/><div class="ap-msg in"><div class="ap-bubble">
      <div class="ap-reply" style=${`--nc:${NAME_COLORS[cur][0]}`}><b>${me?.first_name || 'Вы'}</b><span>Так будет выглядеть ответ на ваше сообщение</span></div>
      <div class="ap-link" style=${`--nc:${NAME_COLORS[cur][0]}`}><b>macgram</b><span>Цвет имени виден всем в группах, ответах и ссылках</span></div>
      <span class="ap-time">12:41</span></div></div></div></div>
    <div class="accent-row" style="justify-content:center;padding-top:8px">${NAME_COLORS.map(([c, l], i) => html`<button class=${`accent-dot big ${cur === i ? 'on' : ''}`} style=${`background:${c}`} title=${l} onClick=${() => set(i)}/>`)}</div>
    <div class="sp-hint" style="padding:0 18px">Цвет имени виден всем: в группах, ответах и превью ссылок.</div>
    ${profColors.length > 0 && html`<div class="pane-sec" style="margin-top:12px">Цвет профиля</div>
      <div class="group ap-card"><div class="ap-prof" style=${profCur ? `background:radial-gradient(circle at 50% 35%, ${profCur.cols[0]}, ${profCur.cols[profCur.cols.length - 1]})` : ''}>
        <b>${me?.first_name || 'Вы'}</b><span>в сети</span></div></div>
      <div class="accent-row" style="justify-content:center;padding-top:8px">
        <button class=${`accent-dot big none ${prof < 0 ? 'on' : ''}`} title="Без цвета" onClick=${() => setProf(-1)}>${Icon.close(14)}</button>
        ${profColors.map(c => html`<button class=${`accent-dot big ${prof === c.id ? 'on' : ''}`} style=${`background:linear-gradient(135deg, ${c.cols[0]}, ${c.cols[c.cols.length - 1]})`} onClick=${() => setProf(c.id)}/>`)}
      </div>
      <div class="sp-hint" style="padding:0 18px">Цвет шапки вашего профиля. Telegram даёт его выбрать подписчикам Premium.</div>`}
  </${Page}>`;
}

// ── Фон чата (как WallpaperListController + предпросмотр) ──
const PRESET_FILLS = [
  { '@type': 'backgroundFillFreeformGradient', colors: [0xdbddbb, 0x6ba587, 0xd5d88d, 0x88b884] },
  { '@type': 'backgroundFillFreeformGradient', colors: [0x8dc0eb, 0xb9d1ea, 0xc6b1ef, 0xebd7ef] },
  { '@type': 'backgroundFillFreeformGradient', colors: [0x97beeb, 0xb1e9ea, 0xc6b1ef, 0xefb7dc] },
  { '@type': 'backgroundFillFreeformGradient', colors: [0xeaa36e, 0xf0e486, 0xf29ebf, 0xe8c06e] },
  { '@type': 'backgroundFillFreeformGradient', colors: [0x7fa381, 0xfff5c5, 0x336f55, 0xfbe37d] },
  { '@type': 'backgroundFillFreeformGradient', colors: [0xe4b2ea, 0x8376c2, 0xeab9d9, 0xb493e6] },
  { '@type': 'backgroundFillFreeformGradient', colors: [0x1b2836, 0x121a22, 0x1d2a37, 0x111820] },
  { '@type': 'backgroundFillFreeformGradient', colors: [0x2c2a46, 0x1f2939, 0x40325a, 0x1b1d33] },
  { '@type': 'backgroundFillSolid', color: 0xe6ebee },
  { '@type': 'backgroundFillSolid', color: 0xd8e3d4 },
  { '@type': 'backgroundFillSolid', color: 0xf3e3c4 },
  { '@type': 'backgroundFillSolid', color: 0x232d3a },
];
const FALLBACK = [0xdbddbb, 0x88b884, 0xd5d88d, 0x6ba587];

function useThumb(bg) {
  const th = bg?.document?.thumbnail?.file;
  useEffect(() => { if (th) download(th, 1); }, [th?.id]);
  return th ? fileUrl(th) : '';
}
function BgThumb({ bg }) {
  const t = bg.type?.['@type'];
  const url = useThumb(bg);
  if (t === 'backgroundTypeFill') return html`<div class="wp-tile-in" style=${`background:${fillCss(bg.type.fill, FALLBACK)}`}/>`;
  if (t === 'backgroundTypePattern') return html`<div class="wp-tile-in" style=${`background:${fillCss(bg.type.fill, FALLBACK)}`}>${url && html`<img src=${url} alt="" style="mix-blend-mode:multiply;opacity:.4"/>`}</div>`;
  return html`<div class="wp-tile-in">${url ? html`<img src=${url} alt=""/>` : html`<${Spinner}/>`}</div>`;
}

// Применить фон. Фото ставим сразу для дневной и ночной темы — иначе при смене темы
// казалось, что «фон сбросился» (у Telegram фон хранится отдельно для каждой).
async function applyBg(background, type, both) {
  const dark = effectiveTheme() === 'night' || effectiveTheme() === 'black';
  const bg = await send({ '@type': 'setDefaultBackground', background, type, for_dark_theme: dark });
  if (both && bg?.id) {
    const darkType = type?.['@type'] === 'backgroundTypePattern' ? { ...type, is_inverted: true } : type;
    await send({ '@type': 'setDefaultBackground', background: { '@type': 'inputBackgroundRemote', background_id: bg.id }, type: darkType, for_dark_theme: !dark }).catch(() => {});
  }
  return bg;
}

// Предпросмотр рисуется поверх всего окна (из main.js), иначе его обрезает список настроек.
export function BgPreviewHost() {
  const pv = S.bgPreview;
  if (!pv) return null;
  return html`<${BgPreview} key=${pv.key} pv=${pv} onClose=${() => { S.bgPreview = null; changed(); pv.onDone?.(); }}/>`;
}
function BgPreview({ pv, onClose }) {
  const [blur, setBlur] = useState(!!pv.type?.is_blurred);
  const [intensity, setIntensity] = useState(Math.abs(pv.type?.intensity ?? 50));
  const [fill, setFill] = useState(pv.type?.fill || PRESET_FILLS[0]);
  const [both, setBoth] = useState(true);
  const [tint, setTint] = useState(false);
  const [busy, setBusy] = useState(false);
  const url = useThumb(pv.bg);
  const t = pv.kind === 'fill' ? 'fill' : pv.kind === 'live' ? 'live' : pv.type?.['@type'];
  const pattern = t === 'backgroundTypePattern';
  const photo = t === 'backgroundTypeWallpaper' || pv.kind === 'local';
  const live = pv.kind === 'live';
  const me = S.users.get(S.myId);
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  const apply = async () => {
    setBusy(true);
    try {
      if (live) {
        const path = await window.__TAURI__.core.invoke('set_live_wallpaper', { path: pv.path });
        setPref('liveWall', { path, kind: pv.video ? 'video' : 'gif', blur });
      } else {
        if (S.prefs.liveWall) { setPref('liveWall', null); window.__TAURI__?.core.invoke('clear_live_wallpaper').catch(() => {}); }
        if (pv.kind === 'fill') await applyBg(null, { '@type': 'backgroundTypeFill', fill: pv.fill }, both);
        else if (pv.kind === 'local') await applyBg({ '@type': 'inputBackgroundLocal', background: { '@type': 'inputFileLocal', path: pv.path } }, { '@type': 'backgroundTypeWallpaper', is_blurred: blur, is_moving: false }, both);
        else {
          const type = photo ? { ...pv.type, is_blurred: blur } : pattern ? { ...pv.type, fill, intensity } : pv.type;
          await applyBg({ '@type': 'inputBackgroundRemote', background_id: pv.bg.id }, type, both);
        }
      }
      if (tint) S.pendingTint = true; // цвета подберутся, когда фон загрузится
      showHud('Фон установлен'); onClose();
    } catch (e) { showHud(e.message || String(e)); }
    setBusy(false);
  };
  const bgCss = pv.kind === 'fill' ? fillCss(pv.fill, FALLBACK) : pattern ? fillCss(fill, FALLBACK) : '#222';
  const img = pv.kind === 'local' || live ? pv.url : url;
  const Chip = ({ on, label, onClick }) => html`<button class=${`wp-chip ${on ? 'on' : ''}`} onClick=${onClick}>${on && Icon.check(11)}${label}</button>`;
  return html`<div class="veil" onMouseDown=${e => e.target === e.currentTarget && onClose()}>
    <div class="sheet wp-sheet">
      <div class="wp-prev" style=${`background:${bgCss}`}>
        ${img && !pattern && (pv.video ? html`<video src=${img} autoplay loop muted playsinline style=${blur ? 'filter:blur(14px);transform:scale(1.1)' : ''}/>` : html`<img src=${img} alt="" style=${blur ? 'filter:blur(14px);transform:scale(1.1)' : ''}/>`)}
        ${img && pattern && html`<img src=${img} alt="" style=${`mix-blend-mode:multiply;opacity:${intensity / 100 * .8}`}/>`}
        <div class="wp-prev-head glass"><span class="wp-av">${(me?.first_name || 'm')[0]}</span><div><b>Предпросмотр фона</b><small>${live ? 'живой фон' : pattern ? 'узор' : photo ? 'фото' : 'цвет'}</small></div></div>
        <div class="wp-prev-msgs">
          <div class="ap-msg in"><div class="ap-bubble">Так будет выглядеть чат с этим фоном<span class="ap-time">12:41</span></div></div>
          <div class="ap-msg out"><div class="ap-bubble">Красиво 😍<span class="ap-time">12:42 ${Icon.checks(12)}</span></div></div>
        </div>
        <div class="wp-chips">
          ${(photo || live) && html`<${Chip} on=${blur} label="Размытие" onClick=${() => setBlur(!blur)}/>`}
          ${!live && html`<${Chip} on=${both} label="Для дневной и ночной" onClick=${() => setBoth(!both)}/>`}
          <${Chip} on=${tint} label="Цвета под фон" onClick=${() => setTint(!tint)}/>
        </div>
      </div>
      ${pattern && html`<div class="wp-ctrl"><span>Яркость узора</span><input type="range" min="10" max="100" value=${intensity} onInput=${e => setIntensity(Number(e.target.value))}/></div>
        <div class="wp-colors">${PRESET_FILLS.slice(0, 8).map((f, i) => html`<button class=${`accent-dot ${fill === f ? 'on' : ''}`} style=${`background:${fillCss(f, FALLBACK)}`} onClick=${() => setFill(f)} key=${i}/>`)}</div>`}
      ${live && html`<div class="sp-hint">GIF и видео-фоны хранятся только на этом компьютере — Telegram такие фоны не поддерживает.</div>`}
      <button class="btn wp-apply" disabled=${busy} onClick=${apply}>${busy ? html`<${Spinner}/>` : 'Установить фон'}</button>
      <button class="wp-cancel" onClick=${onClose}>Отмена</button>
    </div>
  </div>`;
}

export function WallpaperSettings() {
  const dark = ['night', 'black'].includes(effectiveTheme());
  const [list, setList] = useState(null);
  const setPv = p => { S.bgPreview = p ? { ...p, key: Date.now(), onDone: load } : null; changed(); };
  const cur = S.prefs.liveWall ? null : S.backgrounds?.[dark ? 'dark' : 'light'];
  const load = () => send({ '@type': 'getInstalledBackgrounds', for_dark_theme: dark }).then(r => setList(r.backgrounds || [])).catch(() => setList([]));
  useEffect(() => { load(); }, [dark]);
  const pickFile = async () => {
    try {
      const [path] = await shell.pickFiles(true);
      if (!path) return;
      const ext = path.split('.').pop().toLowerCase();
      const T = window.__TAURI__;
      const staged = T ? await T.core.invoke('stage_wallpaper', { path }) : path;
      const url = T?.core?.convertFileSrc ? `${T.core.convertFileSrc(staged)}?v=${Date.now()}` : '';
      if (['gif', 'mp4', 'webm', 'mov'].includes(ext)) setPv({ kind: 'live', path: staged, url, video: ext !== 'gif' });
      else setPv({ kind: 'local', path: staged, url });
    } catch (e) { showHud(e.message || String(e)); }
  };
  const reset = () => {
    if (S.prefs.liveWall) { setPref('liveWall', null); window.__TAURI__?.core.invoke('clear_live_wallpaper').catch(() => {}); }
    Promise.all([send({ '@type': 'deleteDefaultBackground', for_dark_theme: false }), send({ '@type': 'deleteDefaultBackground', for_dark_theme: true })])
      .then(() => showHud('Стандартный фон')).catch(e => showHud(e.message));
  };
  const removeBg = (e, bg) => { e.preventDefault(); openMenu(e.clientX, e.clientY, [{ label: 'Удалить фон', icon: Icon.trash(), danger: true, action: () => send({ '@type': 'removeInstalledBackground', background_id: bg.id }).then(load).catch(err => showHud(err.message)) }]); };
  return html`<${Page} title="Фон чата" back="appearance">
    <div class="group">
      <button class="item" onClick=${pickFile}><span class="ic" style="background:#007aff">${MI('menu_camera', 15)}</span><span class="lbl" style="color:var(--accent)">Загрузить изображение, GIF или видео</span></button>
      <button class="item" onClick=${reset}><span class="ic" style="background:#8e8e93">${MI('menu_clear_history', 15)}</span><span class="lbl" style="color:var(--accent)">Стандартный фон</span></button>
    </div>
    ${S.prefs.liveWall && html`<div class="sp-hint" style="padding:0 18px 8px">Сейчас стоит живой фон (${S.prefs.liveWall.kind === 'video' ? 'видео' : 'GIF'}).</div>`}
    <div class="pane-sec">Ваши фоны</div>
    ${list === null ? html`<div style="display:grid;place-items:center;padding:20px"><${Spinner}/></div>`
      : !list.length ? html`<div class="sp-hint" style="padding:0 18px 8px">Здесь появятся фоны, сохранённые в вашем аккаунте Telegram.</div>`
        : html`<div class="wp-grid">${list.map(bg => html`<button class=${`wp-tile ${cur?.id === bg.id ? 'on' : ''}`} key=${bg.id} onClick=${() => setPv({ kind: 'remote', bg, type: bg.type })} onContextMenu=${e => removeBg(e, bg)}><${BgThumb} bg=${bg}/></button>`)}</div>`}
    <div class="pane-sec">Цвета и градиенты</div>
    <div class="wp-grid">${PRESET_FILLS.map((f, i) => html`<button class=${`wp-tile ${cur?.type?.fill && JSON.stringify(cur.type.fill.colors || cur.type.fill.color) === JSON.stringify(f.colors || f.color) ? 'on' : ''}`} key=${`f${i}`} onClick=${() => setPv({ kind: 'fill', fill: f })}><div class="wp-tile-in" style=${`background:${fillCss(f, FALLBACK)}`}/></button>`)}</div>
    <div class="sp-hint" style="padding:0 18px">Фон хранится в аккаунте Telegram. Правый клик по своему фону — удалить.</div>
  </${Page}>`;
}
