// Настройки — как в Telegram для macOS: главная страница и вложенные разделы.
import { html, useState, useEffect } from '../lib.js';
import { S, changed, setPref, showHud, openModal, closeModal, logOut, openMenu, fileUrl } from '../store.js';
import { send, shell } from '../td.js';
import { Icon } from '../icons.js';
import { setPasscode, lockNow } from '../passcode.js';
import { checkUpdates, showUpdate, REPO } from '../updates.js';
import { openLink } from '../links.js';
import { playTone, SOUND_NAMES } from '../sound.js';
import { toastLook } from '../notify.js';
import { FoldersSettings, FolderEdit } from './folders.js';
import { openAvatar } from './profile.js';
import { Appearance, AutoNight, NameColor, WallpaperSettings } from './appearance.js';

// Версия из сборки (tauri.conf.json → CI подставляет номер), в демо-режиме — заглушка.
let version = '';
window.__TAURI__?.app?.getVersion?.().then(v => { version = v; }).catch(() => {});
const appVersion = () => version || 'dev';
import { MI } from '../mac-icons.js';
import { userName, fileSize } from '../format.js';
import { Avatar, Spinner } from './common.js';

const go = page => { S.settingsPage = page; changed(); };
const back = () => go(null);

function Page({ title, back: to = null, children }) {
  return html`<div class="list settings-page" key=${title}>
    <div class="sp-head"><button class="sp-back" onClick=${() => go(to)}>${Icon.back(13)}<span class="sp-back-text">${to === 'appearance' ? 'Оформление' : 'Настройки'}</span></button><span class="sp-title">${title}</span></div>
    ${children}
  </div>`;
}
const Square = (bg, icon) => html`<span class="ic" style=${`background:${bg}`}>${icon}</span>`;
function Row({ icon, label, value, onClick, danger, chevron = true }) {
  return html`<button class=${`item ${danger ? 'danger' : ''}`} onClick=${onClick}>
    ${icon}<span class="lbl">${label}</span>${value != null && html`<span class="val">${value}</span>`}${chevron && onClick && html`<span class="chev">${Icon.chevron(11)}</span>`}
  </button>`;
}

export function SettingsPane() {
  switch (S.settingsPage) {
    case 'profile': return html`<${ProfileEdit}/>`;
    case 'notifications': return html`<${Notifications}/>`;
    case 'privacy': return html`<${Privacy}/>`;
    case 'sessions': return html`<${Sessions}/>`;
    case 'appearance': return html`<${Appearance}/>`;
    case 'autonight': return html`<${AutoNight}/>`;
    case 'namecolor': return html`<${NameColor}/>`;
    case 'wallpaper': return html`<${WallpaperSettings}/>`;
    case 'fonts': return html`<${Fonts}/>`;
    case 'storage': return html`<${Storage}/>`;
    case 'general': return html`<${General}/>`;
    case 'power': return html`<${PowerSaving}/>`;
    case 'about': return html`<${About}/>`;
    case 'stickers': return html`<${StickersSettings}/>`;
    case 'proxy': return html`<${ProxySettings}/>`;
    case 'folders': return html`<${FoldersSettings}/>`;
    case 'folder-edit': return html`<${FolderEdit}/>`;
    default: return html`<${Main}/>`;
  }
}

async function changePhoto() {
  try {
    const [path] = await shell.pickFiles(true);
    if (!path) return;
    showHud('Загружаю фото…');
    await send({ '@type': 'setProfilePhoto', photo: { '@type': 'inputChatPhotoStatic', photo: { '@type': 'inputFileLocal', path } }, is_public: false });
    showHud('Фото профиля обновлено');
  } catch (e) { showHud(e.message || String(e)); }
}

function Main() {
  const me = S.users.get(S.myId);
  const confirmLogout = () => openModal({
    icon: html`<div style="display:flex;justify-content:center;color:var(--red)">${MI('Icon_SettingsLogout', 40)}</div>`,
    title: 'Выйти из аккаунта?',
    text: 'Локальная зашифрованная база будет удалена с этого компьютера.',
    buttons: [
      { label: 'Выйти', kind: 'danger', action: () => { closeModal(); logOut().catch(e => showHud(e.message)); } },
      { label: 'Отмена', kind: 'second', action: closeModal },
    ],
  });
  const uname = me?.usernames?.active_usernames?.[0];
  return html`<div class="list list-anim">
    <div class="profile">
      <div class="avatar-edit">
        <button class="ae-photo" title=${me?.profile_photo ? 'Открыть фото' : 'Установить фото'} onClick=${() => me?.profile_photo ? openAvatar(null, me) : changePhoto()}>${me && html`<${Avatar} user=${me} size=${84}/>`}</button>
        <button class="ae-badge" title="Изменить фото" onClick=${changePhoto}>${MI('menu_camera', 14)}</button>
      </div>
      <div class="pname">${userName(me)}</div>
      <div class="psub">${me?.phone_number ? `+${me.phone_number}` : ''}${uname ? ` · @${uname}` : ''}</div>
    </div>
    <div class="group">
      <${Row} icon=${MI('Icon_SettingsProfile', 24)} label="Мой аккаунт" onClick=${() => go('profile')}/>
    </div>
    <div class="group">
      <${Row} icon=${MI('Icon_SettingsGeneral', 24)} label="Общие" onClick=${() => go('general')}/>
      <${Row} icon=${MI('Icon_SettingsNotifications', 24)} label="Уведомления и звуки" onClick=${() => go('notifications')}/>
      <${Row} icon=${MI('Icon_SettingsSecurity', 24)} label="Конфиденциальность" onClick=${() => go('privacy')}/>
      <${Row} icon=${MI('Icon_PrivacySettings_ActiveSessions', 24)} label="Активные сеансы" onClick=${() => go('sessions')}/>
      <${Row} icon=${Square('#5856d6', MI('menu_moon', 15))} label="Оформление" onClick=${() => go('appearance')}/>
      <${Row} icon=${MI('Icon_SettingsStorage', 24)} label="Данные и память" onClick=${() => go('storage')}/>
      <${Row} icon=${MI('Icon_SettingsStickers', 24)} label="Стикеры и эмодзи" onClick=${() => go('stickers')}/>
      <${Row} icon=${MI('Icon_SettingsFilters', 24)} label="Папки" value=${S.folders.length || null} onClick=${() => go('folders')}/>
      <${Row} icon=${Square('#ff9500', MI('menu_select_messages', 15))} label="Энергосбережение" onClick=${() => go('power')}/>
      <${Row} icon=${Square('#34aadc', MI('menu_link', 15))} label="Прокси" onClick=${() => go('proxy')}/>
      <${Row} icon=${MI('Icon_SettingsLanguage', 24)} label="Язык" value="Русский"/>
    </div>
    <div class="group">
      <${Row} icon=${Square('#34c759', MI('menu_lock', 15))} label="Локальная база" value="зашифрована" chevron=${false}/>
    </div>
    <div class="group">
      <${Row} icon=${Square('#007aff', html`<img src="icons/macgram-logo.svg" width="18" height="18" alt=""/>`)} label="О macgram" value=${S.update ? `есть ${S.update.version}` : appVersion()} onClick=${() => go('about')}/>
      <${Row} icon=${Square('#ff3b30', MI('menu_report', 15) || MI('menu_delete', 15))} label="Сообщить об ошибке" onClick=${openBugReport}/>
    </div>
    <div class="group">
      <${Row} icon=${Square('var(--red)', MI('menu_leave', 15))} label="Выйти" danger onClick=${confirmLogout} chevron=${false}/>
    </div>
    <div class="settings-foot">macgram ${appVersion()} pre-alpha · неофициальный клиент Telegram</div>
  </div>`;
}

function Field({ label, value, onInput, max, hint, prefix }) {
  return html`<div class="sp-field">
    <label>${label}</label>
    <div class="sp-input">${prefix && html`<span class="sp-prefix">${prefix}</span>`}<input value=${value} maxlength=${max} onInput=${e => onInput(e.target.value)}/>
      ${max && html`<span class="sp-count">${max - value.length}</span>`}</div>
    ${hint && html`<div class="sp-hint">${hint}</div>`}
  </div>`;
}

function ProfileEdit() {
  const me = S.users.get(S.myId);
  const [first, setFirst] = useState(me?.first_name || '');
  const [last, setLast] = useState(me?.last_name || '');
  const [bio, setBio] = useState('');
  const [uname, setUname] = useState(me?.usernames?.editable_username || me?.usernames?.active_usernames?.[0] || '');
  const [busy, setBusy] = useState(false);
  const [bioLoaded, setBioLoaded] = useState(null);
  useEffect(() => { send({ '@type': 'getUserFullInfo', user_id: S.myId }).then(i => { const b = i.bio?.text || ''; setBio(b); setBioLoaded(b); }).catch(() => setBioLoaded('')); }, []);
  const save = async () => {
    setBusy(true);
    try {
      if (first.trim() !== (me?.first_name || '') || last.trim() !== (me?.last_name || '')) await send({ '@type': 'setName', first_name: first.trim(), last_name: last.trim() });
      if (bioLoaded !== null && bio !== bioLoaded) await send({ '@type': 'setBio', bio });
      const curU = me?.usernames?.editable_username || '';
      if (uname.trim() !== curU) await send({ '@type': 'setUsername', username: uname.trim() });
      showHud('Сохранено'); back();
    } catch (e) {
      const m = e.message || '';
      showHud(m.includes('USERNAME_OCCUPIED') ? 'Это имя пользователя уже занято' : m.includes('USERNAME_INVALID') ? 'Недопустимое имя пользователя' : m);
    } finally { setBusy(false); }
  };
  return html`<${Page} title="Мой аккаунт">
    <div class="profile" style="padding-top:4px">
      <button class="avatar-edit" onClick=${changePhoto}>${me && html`<${Avatar} user=${me} size=${72}/>`}<span class="ae-badge">${MI('menu_camera', 13)}</span></button>
      <button class="link-btn" onClick=${changePhoto}>Выбрать фото</button>
    </div>
    <div class="sp-form">
      <${Field} label="Имя" value=${first} onInput=${setFirst} max=${64}/>
      <${Field} label="Фамилия" value=${last} onInput=${setLast} max=${64}/>
      <${Field} label="О себе" value=${bio} onInput=${setBio} max=${70} hint="Например: 25 лет, дизайнер из Киева."/>
      <${Field} label="Имя пользователя" prefix="@" value=${uname} onInput=${v => setUname(v.replace(/[^a-zA-Z0-9_]/g, ''))} max=${32} hint="По этому имени вас смогут найти без номера телефона. Минимум 5 символов."/>
      <div class="sp-field"><label>Телефон</label><div class="sp-static">+${me?.phone_number || ''}</div></div>
      <button class="btn" disabled=${busy || !first.trim()} onClick=${save}>${busy ? html`<${Spinner}/>` : 'Сохранить'}</button>
    </div>
  </${Page}>`;
}

const SCOPES = [
  ['notificationSettingsScopePrivateChats', 'Личные чаты', 'Icon_SettingsNotifyPrivateChats'],
  ['notificationSettingsScopeGroupChats', 'Группы', 'Icon_SettingsNotifyGroupChats'],
  ['notificationSettingsScopeChannelChats', 'Каналы', 'Icon_SettingsNotifyChannels'],
];
function Switch({ on, onChange }) {
  return html`<span class=${`switch ${on ? 'on' : ''}`} onClick=${e => { e.stopPropagation(); onChange(!on); }}><i/></span>`;
}
// Живое превью баннера прямо в настройках.
function ToastPreview() {
  const l = toastLook();
  const me = S.users.get(S.myId);
  const sysDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const dark = l.theme === 'dark' || (l.theme !== 'light' && sysDark);
  const a = l.opacity ?? (dark ? .84 : .86);
  const bg = dark ? `rgba(38,38,42,${l.style === 'glass' ? a * .45 + .3 : a})` : `rgba(246,246,248,${l.style === 'glass' ? a * .45 + .3 : a})`;
  return html`<div class=${`toast-prev size-${l.size} ${dark ? 'dark' : ''} ${l.style}`} style=${`background:${bg}`}>
    ${l.avatar ? html`<span class="tp-av"><${Avatar} user=${me} size=${l.size === 's' ? 30 : l.size === 'l' ? 44 : 36}/><i/></span>` : html`<img class="tp-app" src="icons/macgram-logo.svg" alt=""/>`}
    <div class="tp-body"><div class="tp-top"><b>${me ? userName(me) : 'Мария'}</b><span>сейчас</span></div><div class="tp-text">Так выглядит уведомление macgram 👋</div></div>
  </div>`;
}

// Пробное уведомление: показывает его и сообщает, удалось ли (помогает найти причину, если не видно).
async function testNotify() {
  const T = window.__TAURI__;
  if (S.prefs.notifySound !== false) playTone(S.prefs.notifyTone);
  if (!T) { showHud('Уведомления работают в программе для Windows'); return; }
  if (S.prefs.notifyStyle === 'windows') { shell.notify('macgram', 'Так выглядит уведомление Windows').then(() => showHud('Уведомление Windows отправлено')).catch(e => showHud(`Windows не показала уведомление: ${e}`)); return; }
  const me = S.users.get(S.myId);
  try {
    await T.core.invoke('toast_show', { payload: { chatId: 0, title: me ? userName(me) : 'macgram', body: 'Так выглядит уведомление macgram 👋', initials: 'm', color: 'linear-gradient(#5AC8FA,#1E6FE0)', photo: me?.profile_photo ? fileUrl(me.profile_photo.small) : '', look: toastLook() } });
  } catch (e) { showHud(`Окно уведомления не создалось: ${e}`); return; }
  setTimeout(async () => {
    const st = await T.core.invoke('toast_status').catch(() => null);
    if (!st) return;
    if (st.ack >= st.seq) showHud(st.visible ? 'Уведомление показано в правом нижнем углу' : 'Уведомление показано и уже скрыто');
    else showHud(`Окно уведомления не ответило (создано: ${st.created ? 'да' : 'нет'}, видно: ${st.visible ? 'да' : 'нет'}) — сообщите разработчику`);
  }, 2500);
}

// Выбор мелодии — всплывающее меню с галочкой, как в Telegram для macOS; выбранная сразу проигрывается.
function pickTone(e) {
  const r = e.currentTarget.getBoundingClientRect();
  const cur = S.prefs.notifyTone || 'in_app';
  openMenu(r.right - 190, r.top, SOUND_NAMES.map(([k, l]) => ({
    label: l, icon: k === cur ? Icon.check(13) : html`<span style="width:18px;display:inline-block"/>`,
    action: () => { setPref('notifyTone', k); setTimeout(() => playTone(k), 50); },
  })));
}
function Notifications() {
  const [, force] = useState(0);
  useEffect(() => {
    for (const [scope] of SCOPES) send({ '@type': 'getScopeNotificationSettings', scope: { '@type': scope } }).then(s => { S.scopes[scope] = s; force(x => x + 1); }).catch(() => {});
  }, []);
  const setScope = (scope, on) => {
    const cur = S.scopes[scope] || {};
    const ns = { ...cur, '@type': 'scopeNotificationSettings', mute_for: on ? 0 : 2147483647 };
    S.scopes[scope] = ns; changed();
    send({ '@type': 'setScopeNotificationSettings', scope: { '@type': scope }, notification_settings: ns }).catch(e => showHud(e.message));
  };
  return html`<${Page} title="Уведомления">
    <div class="group">
      <${Toggle} k="notifyAll" label="Уведомления" hint="Выключить все уведомления на этом компьютере (также в меню значка в трее)"/>
      <div class="item wrap"><span class="lbl">Вид уведомлений</span>${seg('notifyStyle', [['macgram', 'Как на Mac'], ['windows', 'Windows']], 'macgram')}</div>
      <button class="item" onClick=${testNotify}><span class="lbl" style="color:var(--accent)">Показать пробное уведомление</span></button>
    </div>
    ${S.prefs.notifyStyle !== 'windows' && html`<div class="pane-sec">Вид баннера</div>
    <div class="toast-prev-wrap"><${ToastPreview}/></div>
    <div class="group">
      <div class="item wrap"><span class="lbl">Стиль</span>${seg('toastStyle', [['mac', 'Как на Mac'], ['glass', 'Стекло Windows']], 'mac')}</div>
      <div class="item wrap"><span class="lbl">Где показывать</span>${seg('toastPos', [['tr', 'Справа сверху'], ['br', 'Справа снизу'], ['tl', 'Слева сверху'], ['bl', 'Слева снизу']], 'tr')}</div>
      <div class="item wrap"><span class="lbl">Размер</span>${seg('toastSize', [['s', 'Маленький'], ['m', 'Обычный'], ['l', 'Крупный']], 'm')}</div>
      <div class="item wrap"><span class="lbl">Сколько показывать</span>${seg('toastSecs', [[3, '3 с'], [6, '6 с'], [10, '10 с'], [0, 'Пока не закрою']], 6)}</div>
      <div class="item wrap"><span class="lbl">Тема</span>${seg('toastTheme', [['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']], 'auto')}</div>
      <div class="item ap-size"><span class="lbl" style="flex:none">Прозрачность</span><input type="range" min="55" max="100" value=${Math.round((S.prefs.toastOpacity ?? .86) * 100)} onInput=${e => setPref('toastOpacity', Number(e.target.value) / 100)} style="flex:1;accent-color:var(--accent)"/></div>
      <${Toggle} k="toastAvatar" label="Фото отправителя" hint="Выключите — будет значок macgram"/>
      <${Toggle} k="toastReply" label="Кнопка «Ответить»" hint="Быстрый ответ прямо из уведомления"/>
    </div>`}
    <div class="pane-sec">Уведомления о сообщениях</div>
    <div class="group">
      ${SCOPES.map(([scope, label, icon]) => html`<div class="item">${MI(icon, 24)}<span class="lbl">${label}</span>
        <${Switch} on=${!((S.scopes[scope]?.mute_for || 0) > 0)} onChange=${on => setScope(scope, on)}/></div>`)}
    </div>
    <div class="pane-sec">Звук</div>
    <div class="group">
      <div class="item"><span class="lbl">Звук уведомления</span><${Switch} on=${S.prefs.notifySound !== false} onChange=${v => setPref('notifySound', v)}/></div>
      ${S.prefs.notifySound !== false && html`<button class="item" onClick=${pickTone}><span class="lbl">Мелодия</span>
        <span class="val">${(SOUND_NAMES.find(([k]) => k === (S.prefs.notifyTone || 'in_app')) || SOUND_NAMES[0])[1]}</span><span class="chev">${Icon.chevron(11)}</span></button>`}
    </div>
    <div class="pane-sec">На этом компьютере</div>
    <div class="group">
      <div class="item"><span class="lbl">Показывать текст сообщения</span><${Switch} on=${S.prefs.notifyPreview !== false} onChange=${v => setPref('notifyPreview', v)}/></div>
      <div class="item"><span class="lbl">Показывать имя отправителя</span><${Switch} on=${S.prefs.notifyName !== false} onChange=${v => setPref('notifyName', v)}/></div>
      <div class="item"><span class="lbl">Уведомлять, когда macgram открыт</span><${Switch} on=${S.prefs.notifyActive !== false} onChange=${v => setPref('notifyActive', v)}/></div>
    </div>
    <div class="pane-sec">Счётчик на значке</div>
    <div class="group">
      <div class="item"><span class="lbl">Показывать счётчик</span><${Switch} on=${S.prefs.badge !== false} onChange=${v => setPref('badge', v)}/></div>
      <div class="item"><span class="lbl">Учитывать чаты без звука</span><${Switch} on=${S.prefs.badgeMuted === true} onChange=${v => setPref('badgeMuted', v)}/></div>
      <div class="item wrap"><span class="lbl">Считать</span>${seg('badgeMode', [['chats', 'чаты'], ['messages', 'сообщения']], 'chats')}</div>
    </div>
  </${Page}>`;
}

const PRIVACY = [
  ['userPrivacySettingShowPhoneNumber', 'Номер телефона'],
  ['userPrivacySettingShowStatus', 'Время захода'],
  ['userPrivacySettingShowProfilePhoto', 'Фотография профиля'],
  ['userPrivacySettingShowBio', 'О себе'],
  ['userPrivacySettingShowBirthdate', 'Дата рождения'],
  ['userPrivacySettingAllowChatInvites', 'Приглашения в группы'],
  ['userPrivacySettingAllowCalls', 'Звонки'],
  ['userPrivacySettingShowLinkInForwardedMessages', 'Пересылка сообщений'],
  ['userPrivacySettingAllowPrivateVoiceAndVideoNoteMessages', 'Голосовые и видеосообщения'],
  ['userPrivacySettingAllowPeerToPeerCalls', 'Звонки напрямую (P2P)'],
];
const ruleLabel = rules => {
  const t = rules?.map(r => r['@type']) || [];
  const base = t.includes('userPrivacySettingRuleAllowAll') ? 'Все' : t.includes('userPrivacySettingRuleAllowContacts') ? 'Мои контакты' : t.length ? 'Никто' : '…';
  const ex = t.filter(x => /Users|ChatMembers|Bots|Premium/.test(x)).length;
  return ex ? `${base} (+${ex})` : base;
};
function Privacy() {
  const [rules, setRules] = useState({});
  const [pw, setPw] = useState(null);
  const [blocked, setBlocked] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = key => send({ '@type': 'getUserPrivacySettingRules', setting: { '@type': key } }).then(r => setRules(x => ({ ...x, [key]: r.rules }))).catch(() => {});
  useEffect(() => {
    PRIVACY.forEach(([k]) => load(k));
    send({ '@type': 'getPasswordState' }).then(setPw).catch(() => {});
    send({ '@type': 'getBlockedMessageSenders', block_list: { '@type': 'blockListMain' }, offset: 0, limit: 1 }).then(r => setBlocked(r.total_count)).catch(() => {});
  }, []);
  const choose = async (key, rule) => {
    setEdit(null);
    try {
      await send({ '@type': 'setUserPrivacySettingRules', setting: { '@type': key }, rules: { '@type': 'userPrivacySettingRules', rules: [{ '@type': rule }] } });
      load(key); showHud('Сохранено');
    } catch (e) { showHud(e.message); }
  };
  return html`<${Page} title="Конфиденциальность">
    <div class="group">
      <${Row} icon=${MI('Icon_PrivacySettings_Blocked', 24)} label="Заблокированные" value=${blocked == null ? '…' : blocked}/>
      <${Row} icon=${MI('Icon_PrivacySettings_TwoStep', 24)} label="Облачный пароль" value=${pw == null ? '…' : pw.has_password ? 'Вкл.' : 'Выкл.'}/>
    </div>
    <${PasscodeSection}/>
    <div class="pane-sec">Кто может видеть</div>
    <div class="group">
      ${PRIVACY.map(([k, label]) => html`<div key=${k}>
        <${Row} label=${label} value=${ruleLabel(rules[k])} onClick=${() => setEdit(edit === k ? null : k)}/>
        ${edit === k && html`<div class="choice">
          ${[['userPrivacySettingRuleAllowAll', 'Все'], ['userPrivacySettingRuleAllowContacts', 'Мои контакты'], ['userPrivacySettingRuleRestrictAll', 'Никто']].map(([r, l]) => html`
            <button class=${rules[k]?.some(x => x['@type'] === r) ? 'on' : ''} onClick=${() => choose(k, r)}>${l}</button>`)}
        </div>`}
      </div>`)}
    </div>
    <div class="sp-hint" style="padding:0 18px">Исключения для отдельных людей сохраняются в Telegram; при смене варианта здесь они сбрасываются.</div>
    <${PrivacyExtras}/>
  </${Page}>`;
}

// Код-пароль: блокирует macgram на этом компьютере (данные в Telegram он не меняет).
function PasscodeSection() {
  const [mode, setMode] = useState(null); // 'set' | null
  const [a, setA] = useState(''); const [b, setB] = useState(''); const [err, setErr] = useState('');
  const save = async e => {
    e.preventDefault();
    if (a.length < 4) { setErr('Минимум 4 символа'); return; }
    if (a !== b) { setErr('Коды не совпадают'); return; }
    try { await setPasscode(a); setMode(null); setA(''); setB(''); setErr(''); showHud('Код-пароль включён'); } catch (x) { setErr(String(x.message || x)); }
  };
  const AUTO = [[1, '1 мин'], [5, '5 мин'], [60, '1 час'], [300, '5 часов'], [0, 'Никогда']];
  return html`<div class="pane-sec">Код-пароль</div>
    <div class="group">
      ${mode === 'set' ? html`<form class="pc-form" onSubmit=${save}>
          <input type="password" placeholder="Новый код-пароль" value=${a} onInput=${e => setA(e.target.value)} autofocus autocomplete="new-password"/>
          <input type="password" placeholder="Повторите код-пароль" value=${b} onInput=${e => setB(e.target.value)} autocomplete="new-password"/>
          ${err && html`<div class="err-text">${err}</div>`}
          <div class="pc-btns"><button class="btn" type="submit">Сохранить</button><button class="btn second" type="button" onClick=${() => { setMode(null); setErr(''); }}>Отмена</button></div>
        </form>`
      : S.hasPasscode ? html`
        <${Row} icon=${MI('menu_lock', 22)} label="Сменить код-пароль" onClick=${() => setMode('set')}/>
        <div class="item wrap"><span class="lbl">Автоблокировка</span><span class="choice inline">${AUTO.map(([m, l]) => html`<button class=${(S.prefs.autoLock ?? 60) === m ? 'on' : ''} onClick=${() => setPref('autoLock', m)}>${l}</button>`)}</span></div>
        <div class="item"><span class="lbl">Блокировать при сворачивании</span><${Switch} on=${!!S.prefs.lockOnHide} onChange=${v => setPref('lockOnHide', v)}/></div>
        <${Row} label="Заблокировать сейчас (Ctrl+L)" onClick=${lockNow}/>
        <${Row} label="Выключить код-пароль" danger onClick=${() => setPasscode(null).then(() => showHud('Код-пароль выключен'))}/>`
      : html`<${Row} icon=${MI('menu_lock', 22)} label="Включить код-пароль" onClick=${() => setMode('set')}/>`}
    </div>
    <div class="sp-hint" style="padding:0 18px">Код-пароль закрывает macgram на этом компьютере. Хранится только его проверочный отпечаток в «Диспетчере учётных данных» Windows. Если забудете код, на экране блокировки можно выйти из аккаунта и войти заново.</div>`;
}

function Sessions() {
  const [list, setList] = useState(null);
  const load = () => send({ '@type': 'getActiveSessions' }).then(r => setList(r.sessions || [])).catch(e => { showHud(e.message); setList([]); });
  useEffect(() => { load(); }, []);
  const when = ts => { const d = new Date(ts * 1000); return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  const terminate = s => openModal({
    title: 'Завершить сеанс?', text: `${s.application_name} на ${s.device_model}`,
    buttons: [
      { label: 'Завершить', kind: 'danger', action: () => { closeModal(); send({ '@type': 'terminateSession', session_id: s.id }).then(load).catch(e => showHud(e.message)); } },
      { label: 'Отмена', kind: 'second', action: closeModal },
    ],
  });
  const terminateAll = () => openModal({
    title: 'Завершить все другие сеансы?', text: 'Вы выйдете из аккаунта на всех устройствах, кроме этого.',
    buttons: [
      { label: 'Завершить', kind: 'danger', action: () => { closeModal(); send({ '@type': 'terminateAllOtherSessions' }).then(() => { showHud('Готово'); load(); }).catch(e => showHud(e.message)); } },
      { label: 'Отмена', kind: 'second', action: closeModal },
    ],
  });
  const card = (s, cur) => html`<div class="session" key=${s.id}>
    <div class="ss-main">
      <div class="ss-name">${s.application_name} ${s.application_version}</div>
      <div class="ss-dev">${s.device_model}${s.platform ? `, ${s.platform}` : ''} ${s.system_version || ''}</div>
      <div class="ss-loc">${[s.location || s.country, s.ip_address].filter(Boolean).join(' · ')}${cur ? '' : ` · ${when(s.last_active_date)}`}</div>
    </div>
    ${cur ? html`<span class="ss-online">в сети</span>` : html`<button class="sel-btn danger" onClick=${() => terminate(s)}>Завершить</button>`}
  </div>`;
  const cur = list?.find(s => s.is_current);
  const others = list?.filter(s => !s.is_current) || [];
  return html`<${Page} title="Активные сеансы">
    ${!list ? html`<div class="empty"><${Spinner}/></div>` : html`
      <div class="pane-sec">Этот компьютер</div>
      <div class="group">${cur && card(cur, true)}</div>
      ${others.length > 0 && html`<div class="group"><${Row} icon=${Square('var(--red)', MI('menu_leave', 15))} label="Завершить все другие сеансы" danger onClick=${terminateAll} chevron=${false}/></div>`}
      <div class="pane-sec">Другие сеансы · ${others.length}</div>
      <div class="group">${others.length ? others.map(s => card(s, false)) : html`<div class="item" style="color:var(--gray-text)">Нет других сеансов</div>`}</div>
      <div class="sp-hint" style="padding:0 18px">Если видите незнакомое устройство — завершите сеанс и включите облачный пароль.</div>`}
  </${Page}>`;
}

const ACCENTS = [null, '#007aff', '#5856d6', '#af52de', '#ff2d55', '#ff3b30', '#ff9500', '#34c759', '#00c7be', '#8e8e93'];
function seg(key, opts, def) {
  const cur = S.prefs[key] ?? def;
  return html`<div class="seg">${opts.map(([v, l]) => html`<button class=${cur === v ? 'on' : ''} onClick=${() => setPref(key, v)}>${l}</button>`)}</div>`;
}
const Toggle = ({ k, label, def = true, hint }) => html`<div class="item"><span class="lbl">${label}${hint && html`<small>${hint}</small>`}</span><${Switch} on=${(S.prefs[k] ?? def) === true} onChange=${v => setPref(k, v)}/></div>`;

// «Общие» — как в Telegram для macOS.
function General() {
  return html`<${Page} title="Общие">
    <div class="pane-sec">Отправка сообщений</div>
    <div class="group">
      <div class="item wrap"><span class="lbl">Отправлять по</span>${seg('sendKey', [['enter', 'Enter'], ['ctrl', 'Ctrl + Enter']], 'enter')}</div>
    </div>
    <div class="sp-hint" style="padding:0 18px">${S.prefs.sendKey === 'ctrl' ? 'Enter — новая строка, Ctrl + Enter — отправить.' : 'Shift + Enter — новая строка.'}</div>
    <div class="pane-sec">Сообщения</div>
    <div class="group">
      <${Toggle} k="bigEmoji" label="Большие смайлики" hint="Сообщение из 1–3 смайликов без текста — крупно"/>
      <${Toggle} k="linkPreview" label="Предпросмотр ссылок" hint="Карточка ссылки в отправленных сообщениях"/>
      <${Toggle} k="spellcheck" label="Проверка орфографии"/>
    </div>
    <div class="pane-sec">Интерфейс</div>
    <div class="group">
      <${Toggle} k="callsTab" label="Вкладка «Звонки»"/>
      <${Toggle} k="smoothScroll" label="Плавная прокрутка" hint="Выключите, если привычнее системная прокрутка Windows"/>
      <${Toggle} k="closeToTray" label="Закрывать в трей" hint="Крестик прячет macgram к часам; выйти — правой кнопкой по значку"/>
      <div class="item"><span class="lbl">Ширина списка чатов</span><button class="sel-btn" onClick=${() => setPref('sidebarW', null)}>Сбросить</button></div>
    </div>
    <div class="sp-hint" style="padding:0 18px">Ширину списка чатов можно менять, потянув за его правый край.</div>
  </${Page}>`;
}

// «Энергосбережение» — меньше нагрузки на слабых ноутбуках, без потери функций.
function PowerSaving() {
  return html`<${Page} title="Энергосбережение">
    <div class="group">
      <${Toggle} k="animStickers" label="Анимированные стикеры" hint="Выкл. — оживают только под курсором"/>
      <${Toggle} k="autoplayGif" label="Автовоспроизведение GIF"/>
      <${Toggle} k="autoplayNotes" label="Автовоспроизведение кружочков"/>
      <${Toggle} k="glass" label="Эффекты стекла и анимации интерфейса"/>
    </div>
    <div class="sp-hint" style="padding:0 18px">Если ноутбук работает от батареи или программа подтормаживает — выключите то, что не нужно.</div>
  </${Page}>`;
}

function Fonts() {
  return html`<${Page} title="Свои шрифты" back="appearance">
    <div class="pane-sec">Шрифты</div>
    <div class="group">
      ${[['customFont', 'ui', 'Шрифт интерфейса', 'Aa'], ['customEmoji', 'emoji', 'Смайлики', '😀']].map(([key, kind, label, sample]) => html`
        <div class="item font-item">
          <span class="font-sample" style=${kind === 'emoji' ? 'font-family:var(--font-emoji)' : ''}>${sample}</span>
          <span class="lbl">${label}<small>${fontLabel(S.prefs[key])}</small></span>
          ${S.prefs[key] && html`<button class="sel-btn" onClick=${() => { setPref(key, null); }}>Сбросить</button>`}
          <button class="sel-btn" onClick=${() => pickFont(key, kind)}>Выбрать…</button>
        </div>`)}
    </div>
    <div class="sp-hint" style="padding:0 18px">Для интерфейса можно выбрать сразу несколько файлов (зажмите Ctrl или выделите все): начертание определяется по имени — Regular, Medium, Semibold, Bold. Файлы с «Display» в имени идут на крупные заголовки, с «Text» — на обычный текст. Подходят .ttf, .otf, .woff2 (не .ttc).</div>
  </${Page}>`;
}

const baseName = p => p.split(/[\\/]/).pop();
const fontLabel = pref => {
  const files = pref?.files || (pref?.path ? [pref] : []);
  if (!files.length) return 'стандартный';
  return files.length === 1 ? baseName(files[0].name || files[0].path) : `${files.length} файлов: ${files.map(f => baseName(f.name || f.path).replace(/\.(otf|ttf|woff2?)$/i, '').replace(/^SF-Pro-/, '')).join(', ')}`;
};
async function pickFont(key, kind) {
  try {
    const paths = await shell.pickFont(kind);
    if (!paths?.length) return;
    setPref(key, { files: paths.map(p => ({ path: p, name: baseName(p) })), v: Date.now() });
    showHud(paths.length > 1 ? `Шрифты применены: ${paths.length}` : 'Шрифт применён');
  } catch (e) { showHud(String(e)); }
}

function Storage() {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => send({ '@type': 'getStorageStatisticsFast' }).then(setSt).catch(() => setSt({}));
  useEffect(() => { load(); }, []);
  const clear = () => openModal({
    title: 'Очистить кэш?', text: 'Фото, видео и файлы удалятся с компьютера, но останутся в Telegram — их можно будет снова скачать.',
    buttons: [
      { label: 'Очистить', kind: 'danger', action: async () => {
        closeModal(); setBusy(true);
        try { await send({ '@type': 'optimizeStorage', size: 0, ttl: 0, count: 0, immunity_delay: 0, file_types: [], chat_ids: [], exclude_chat_ids: [], return_deleted_file_statistics: false, chat_limit: 0 }); showHud('Кэш очищен'); }
        catch (e) { showHud(e.message); }
        setBusy(false); load();
      } },
      { label: 'Отмена', kind: 'second', action: closeModal },
    ],
  });
  return html`<${Page} title="Данные и память">
    <div class="group">
      <div class="item"><span class="lbl">Медиа и файлы</span><span class="val">${st ? fileSize(st.files_size || 0) || '0 Б' : '…'}</span></div>
      <div class="item"><span class="lbl">Количество файлов</span><span class="val">${st ? st.file_count || 0 : '…'}</span></div>
      <div class="item"><span class="lbl">База сообщений</span><span class="val">${st ? fileSize(st.database_size || 0) || '0 Б' : '…'}</span></div>
    </div>
    <div class="group"><${Row} icon=${Square('var(--red)', MI('menu_delete', 15))} label=${busy ? 'Очищаю…' : 'Очистить кэш'} danger onClick=${busy ? null : clear} chevron=${false}/></div>
    <div class="pane-sec">Автозагрузка и автовоспроизведение</div>
    <div class="group">
      <div class="item"><span class="lbl">Загружать фото автоматически</span><${Switch} on=${S.prefs.autoPhoto !== false} onChange=${v => setPref('autoPhoto', v)}/></div>
      <div class="item"><span class="lbl">Проигрывать GIF</span><${Switch} on=${S.prefs.autoplayGif !== false} onChange=${v => setPref('autoplayGif', v)}/></div>
      <div class="item"><span class="lbl">Проигрывать кружочки без звука</span><${Switch} on=${S.prefs.autoplayNotes !== false} onChange=${v => setPref('autoplayNotes', v)}/></div>
    </div>
    <div class="pane-sec">Хранить медиа</div>
    <div class="group">
      <div class="item wrap"><span class="lbl">Удалять неоткрытые файлы через</span>${seg('cacheTtl', [[3, '3 дня'], [7, 'неделю'], [30, 'месяц'], [0, 'никогда']], 0)}</div>
    </div>
    <div class="sp-hint" style="padding:0 18px">Удалённые из кэша файлы остаются в Telegram и скачаются снова, когда понадобятся.</div>
  </${Page}>`;
}

// «О macgram»: версия, обновления, ссылки на страницу проекта.
function About() {
  const [busy, setBusy] = useState(false);
  const check = async () => { setBusy(true); await checkUpdates({ manual: true }); setBusy(false); };
  return html`<${Page} title="О macgram">
    <div class="profile" style="padding-top:6px">
      <img src="icons/macgram-logo.svg" width="84" height="84" alt=""/>
      <div class="pname">macgram</div>
      <div class="psub">версия ${appVersion()} · pre-alpha</div>
    </div>
    <div class="group">
      ${S.update ? html`<${Row} label=${`Установить версию ${S.update.version}`} onClick=${showUpdate}/>`
        : html`<${Row} label=${busy ? 'Проверяю…' : 'Проверить обновления'} onClick=${busy ? null : check}/>`}
      <${Row} label="Что нового" onClick=${() => openLink(`https://github.com/${REPO}/blob/main/CHANGELOG.md`)}/>
      <${Row} label="Страница проекта" onClick=${() => openLink(`https://github.com/${REPO}`)}/>
      <${Row} label="Сообщить об ошибке" onClick=${openBugReport}/>
    </div>
    <div class="sp-hint" style="padding:0 18px">macgram — неофициальный клиент Telegram с открытым исходным кодом. Работает через официальную библиотеку TDLib; переписка идёт напрямую между вашим компьютером и серверами Telegram.</div>
  </${Page}>`;
}

// Сообщить об ошибке: короткая форма → готовая заявка на GitHub с версией и системой.
export function openBugReport() {
  let title = '', what = '', steps = '';
  const send_ = () => {
    if (!title.trim()) { showHud('Опишите проблему в двух словах'); return; }
    closeModal();
    const body = [
      '### Что случилось', what || '—', '', '### Как повторить', steps || '—', '',
      '### Система', `- macgram ${appVersion()}`, `- ${navigator.userAgent.match(/Windows NT [\d.]+/)?.[0]?.replace('Windows NT 10.0', 'Windows 10/11') || navigator.platform}`,
      `- тема: ${S.prefs.theme || 'auto'}, стекло: ${S.prefs.glass === false ? 'выкл' : 'вкл'}`,
    ].join('\n');
    const url = `https://github.com/${REPO}/issues/new?labels=bug&title=${encodeURIComponent(title.trim())}&body=${encodeURIComponent(body)}`;
    openLink(url);
    showHud('Откроется GitHub — проверьте текст и нажмите «Create»');
  };
  openModal({
    title: 'Сообщить об ошибке',
    body: html`<div class="bug-form">
      <input placeholder="Коротко: что не так" onInput=${e => { title = e.target.value; }} autofocus/>
      <textarea rows="3" placeholder="Что произошло и что вы ожидали" onInput=${e => { what = e.target.value; }}/>
      <textarea rows="2" placeholder="Как повторить (по шагам), если знаете" onInput=${e => { steps = e.target.value; }}/>
      <div class="sp-hint">Версия программы и Windows добавятся сами. Ни переписка, ни номер телефона не отправляются. Нужен аккаунт GitHub.</div>
    </div>`,
    buttons: [
      { label: 'Отправить', action: send_ },
      { label: 'Отмена', kind: 'second', action: closeModal },
    ],
  });
}

// Дополнительные настройки конфиденциальности (как в Telegram для macOS).
function PrivacyExtras() {
  const [ttl, setTtl] = useState(null);
  const [arch, setArch] = useState(null);
  const [top, setTop] = useState(null);
  useEffect(() => {
    send({ '@type': 'getAccountTtl' }).then(r => setTtl(r.days)).catch(() => setTtl(0));
    send({ '@type': 'getArchiveChatListSettings' }).then(setArch).catch(() => setArch(false));
    send({ '@type': 'getOption', name: 'disable_top_chats' }).then(r => setTop(!r.value)).catch(() => setTop(true));
  }, []);
  const saveTtl = d => send({ '@type': 'setAccountTtl', ttl: { '@type': 'accountTtl', days: d } }).then(() => { setTtl(d); showHud('Сохранено'); }).catch(e => showHud(e.message));
  const saveArch = v => { const n = { ...(arch || {}), '@type': 'archiveChatListSettings', archive_and_mute_new_chats_from_unknown_users: v }; send({ '@type': 'setArchiveChatListSettings', settings: n }).then(() => setArch(n)).catch(e => showHud(e.message?.includes('PREMIUM') ? 'Доступно не всем аккаунтам' : e.message)); };
  const saveTop = v => send({ '@type': 'setOption', name: 'disable_top_chats', value: { '@type': 'optionValueBoolean', value: !v } }).then(() => setTop(v)).catch(e => showHud(e.message));
  const clearDrafts = () => openModal({ title: 'Удалить все черновики?', text: 'Неотправленный текст пропадёт во всех чатах на всех устройствах.',
    buttons: [{ label: 'Удалить', kind: 'danger', action: () => { closeModal(); send({ '@type': 'clearAllDraftMessages', exclude_secret_chats: false }).then(() => showHud('Черновики удалены')).catch(e => showHud(e.message)); } }, { label: 'Отмена', kind: 'second', action: closeModal }] });
  const TTL = [[30, '1 мес'], [90, '3 мес'], [180, '6 мес'], [365, '1 год']];
  return html`<div class="pane-sec">Чаты</div>
    <div class="group">
      <div class="item"><span class="lbl">Архивировать новые чаты от незнакомцев<small>и выключать в них звук</small></span><${Switch} on=${!!arch?.archive_and_mute_new_chats_from_unknown_users} onChange=${saveArch}/></div>
      <div class="item"><span class="lbl">Предлагать частых собеседников<small>в поиске</small></span><${Switch} on=${top !== false} onChange=${saveTop}/></div>
      <${Row} label="Удалить все черновики" danger onClick=${clearDrafts} chevron=${false}/>
    </div>
    <div class="pane-sec">Удалить мой аккаунт</div>
    <div class="group">
      <div class="item wrap"><span class="lbl">Если меня нет больше</span><div class="seg">${TTL.map(([d, l]) => html`<button class=${ttl === d ? 'on' : ''} onClick=${() => saveTtl(d)}>${l}</button>`)}</div></div>
    </div>
    <div class="sp-hint" style="padding:0 18px">Если вы не заходите в Telegram ни с одного устройства столько времени, аккаунт удалится вместе со всеми сообщениями.</div>`;
}

// «Стикеры и эмодзи».
function StickersSettings() {
  return html`<${Page} title="Стикеры и эмодзи">
    <div class="group">
      <${Toggle} k="animStickers" label="Анимированные стикеры"/>
      <${Toggle} k="loopStickers" label="Зацикливать анимированные стикеры"/>
      <${Toggle} k="bigEmoji" label="Большие смайлики"/>
    </div>
    <div class="sp-hint" style="padding:0 18px">Свой шрифт смайликов можно выбрать в разделе «Оформление».</div>
  </${Page}>`;
}

// «Прокси» — SOCKS5 и MTProto через TDLib (как в Telegram для macOS).
function ProxySettings() {
  const [list, setList] = useState(null);
  const [form, setForm] = useState(null);
  const [ping, setPing] = useState({});
  const load = () => send({ '@type': 'getProxies' }).then(r => setList(r.proxies || [])).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const test = p => send({ '@type': 'pingProxy', proxy_id: p.id }).then(r => setPing(x => ({ ...x, [p.id]: `${Math.round(r.seconds * 1000)} мс` }))).catch(() => setPing(x => ({ ...x, [p.id]: 'нет связи' })));
  useEffect(() => { (list || []).forEach(test); }, [list?.length]);
  const toggle = p => send(p.is_enabled ? { '@type': 'disableProxy' } : { '@type': 'enableProxy', proxy_id: p.id }).then(load).catch(e => showHud(e.message));
  const remove = p => send({ '@type': 'removeProxy', proxy_id: p.id }).then(load).catch(e => showHud(e.message));
  const save = async e => {
    e.preventDefault();
    const f = form; const port = Number(f.port);
    if (!f.server || !port) { showHud('Укажите сервер и порт'); return; }
    const type = f.kind === 'mtproto' ? { '@type': 'proxyTypeMtproto', secret: f.secret || '' } : { '@type': 'proxyTypeSocks5', username: f.user || '', password: f.pass || '' };
    try { await send({ '@type': 'addProxy', server: f.server.trim(), port, enable: true, type }); setForm(null); load(); showHud('Прокси добавлен и включён'); }
    catch (x) { showHud(x.message); }
  };
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  return html`<${Page} title="Прокси">
    <div class="group">
      ${list === null ? html`<div class="item"><${Spinner}/></div>` : !list.length ? html`<div class="item"><span class="lbl" style="color:var(--gray-text)">Прокси не добавлены</span></div>`
        : list.map(p => html`<div class="item" key=${p.id}>
          <span class="lbl">${p.server}:${p.port}<small>${p.type['@type'] === 'proxyTypeMtproto' ? 'MTProto' : p.type['@type'] === 'proxyTypeSocks5' ? 'SOCKS5' : 'HTTP'} · ${ping[p.id] || 'проверка…'}</small></span>
          <button class="sel-btn" onClick=${() => remove(p)}>Удалить</button>
          <${Switch} on=${p.is_enabled} onChange=${() => toggle(p)}/>
        </div>`)}
    </div>
    ${form ? html`<form class="pc-form group" onSubmit=${save}>
        <div class="seg">${[['socks5', 'SOCKS5'], ['mtproto', 'MTProto']].map(([k, l]) => html`<button type="button" class=${form.kind === k ? 'on' : ''} onClick=${() => setForm(f => ({ ...f, kind: k }))}>${l}</button>`)}</div>
        <input placeholder="Сервер" value=${form.server || ''} onInput=${set('server')}/>
        <input placeholder="Порт" inputmode="numeric" value=${form.port || ''} onInput=${set('port')}/>
        ${form.kind === 'mtproto' ? html`<input placeholder="Секрет" value=${form.secret || ''} onInput=${set('secret')}/>`
          : html`<input placeholder="Имя пользователя (необязательно)" value=${form.user || ''} onInput=${set('user')}/><input type="password" placeholder="Пароль (необязательно)" value=${form.pass || ''} onInput=${set('pass')}/>`}
        <div class="pc-btns"><button class="btn" type="submit">Сохранить</button><button class="btn second" type="button" onClick=${() => setForm(null)}>Отмена</button></div>
      </form>`
      : html`<div class="group"><${Row} label="Добавить прокси" onClick=${() => setForm({ kind: 'socks5' })}/></div>`}
    <div class="sp-hint" style="padding:0 18px">Прокси нужен, если Telegram недоступен в вашей сети. Подключайте только серверы, которым доверяете.</div>
  </${Page}>`;
}
