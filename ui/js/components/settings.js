// Настройки — как в Telegram для macOS: главная страница и вложенные разделы.
import { html, useState, useEffect } from '../lib.js';
import { S, changed, setPref, showHud, openModal, closeModal, logOut } from '../store.js';
import { send, shell } from '../td.js';
import { Icon } from '../icons.js';
import { MI } from '../mac-icons.js';
import { userName, fileSize } from '../format.js';
import { Avatar, Spinner } from './common.js';

const go = page => { S.settingsPage = page; changed(); };
const back = () => go(null);

function Page({ title, children }) {
  return html`<div class="list settings-page" key=${title}>
    <div class="sp-head"><button class="sp-back" onClick=${back}>${Icon.back(13)} Настройки</button><span class="sp-title">${title}</span></div>
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
    case 'storage': return html`<${Storage}/>`;
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
      <button class="avatar-edit" title="Изменить фото" onClick=${changePhoto}>${me && html`<${Avatar} user=${me} size=${84}/>`}<span class="ae-badge">${MI('menu_camera', 14)}</span></button>
      <div class="pname">${userName(me)}</div>
      <div class="psub">${me?.phone_number ? `+${me.phone_number}` : ''}${uname ? ` · @${uname}` : ''}</div>
    </div>
    <div class="group">
      <${Row} icon=${MI('Icon_SettingsProfile', 24)} label="Мой аккаунт" onClick=${() => go('profile')}/>
    </div>
    <div class="group">
      <${Row} icon=${MI('Icon_SettingsNotifications', 24)} label="Уведомления и звуки" onClick=${() => go('notifications')}/>
      <${Row} icon=${MI('Icon_SettingsSecurity', 24)} label="Конфиденциальность" onClick=${() => go('privacy')}/>
      <${Row} icon=${MI('Icon_PrivacySettings_ActiveSessions', 24)} label="Активные сеансы" onClick=${() => go('sessions')}/>
      <${Row} icon=${Square('#5856d6', MI('menu_moon', 15))} label="Оформление" onClick=${() => go('appearance')}/>
      <${Row} icon=${MI('Icon_SettingsStorage', 24)} label="Данные и память" onClick=${() => go('storage')}/>
      <${Row} icon=${MI('Icon_SettingsLanguage', 24)} label="Язык" value="Русский"/>
    </div>
    <div class="group">
      <${Row} icon=${Square('#34c759', MI('menu_lock', 15))} label="Локальная база" value="зашифрована" chevron=${false}/>
    </div>
    <div class="group">
      <${Row} icon=${Square('var(--red)', MI('menu_leave', 15))} label="Выйти" danger onClick=${confirmLogout} chevron=${false}/>
    </div>
    <div class="settings-foot">MacTele 0.2 · TDLib · интерфейс по Telegram для macOS</div>
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
    <div class="pane-sec">Уведомления о сообщениях</div>
    <div class="group">
      ${SCOPES.map(([scope, label, icon]) => html`<div class="item">${MI(icon, 24)}<span class="lbl">${label}</span>
        <${Switch} on=${!((S.scopes[scope]?.mute_for || 0) > 0)} onChange=${on => setScope(scope, on)}/></div>`)}
    </div>
    <div class="pane-sec">На этом компьютере</div>
    <div class="group">
      <div class="item"><span class="lbl">Показывать текст сообщения</span><${Switch} on=${S.prefs.notifyPreview !== false} onChange=${v => setPref('notifyPreview', v)}/></div>
      <div class="item"><span class="lbl">Счётчик на значке</span><${Switch} on=${S.prefs.badge !== false} onChange=${v => setPref('badge', v)}/></div>
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
  </${Page}>`;
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

function Appearance() {
  const seg = (key, opts) => html`<div class="seg">${opts.map(([v, l]) => html`
    <button class=${S.prefs[key] === v ? 'on' : ''} onClick=${() => setPref(key, v)}>${l}</button>`)}</div>`;
  const THEMES = [['auto', 'Авто', '#eeffde', '#ffffff'], ['classic', 'Classic', '#eeffde', '#ffffff'], ['day', 'День', '#5097cb', '#f7f7fa'], ['night', 'Ночь', '#416ead', '#1e2c3b']];
  return html`<${Page} title="Оформление">
    <div class="pane-sec">Тема</div>
    <div class="theme-grid">${THEMES.map(([v, l, out, inc]) => html`<button class=${`theme-tile ${S.prefs.theme === v ? 'on' : ''}`} onClick=${() => setPref('theme', v)}>
      <div class="tt-prev" style=${v === 'night' ? 'background:#0e1621' : v === 'day' ? 'background:#fff' : 'background:linear-gradient(135deg,#dbddbb,#88b884)'}>
        <i style=${`background:${inc};align-self:flex-start`}/><i style=${`background:${out};align-self:flex-end`}/>
      </div><span>${l}</span></button>`)}</div>
    <div class="pane-sec">Размер текста сообщений</div>
    <div class="group"><div class="item"><span class="lbl">Размер</span>${seg('fontSize', [[13, '13'], [14, '14'], [15, '15'], [16, '16'], [17, '17']])}</div></div>
    <div class="sp-hint" style="padding:0 18px">«Авто» переключает Day Classic и Ночь вместе с темой Windows. Обои берутся из вашего аккаунта Telegram.</div>
  </${Page}>`;
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
  </${Page}>`;
}
