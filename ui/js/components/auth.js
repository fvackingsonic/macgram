import { html, useState, useRef, useEffect } from '../lib.js';
import { S, changed } from '../store.js';
import { send, shell } from '../td.js';
import { AppLogo, Icon } from '../icons.js';
import { Traffic, Spinner, dragHandlers } from './common.js';
import { qrSvg } from '../qr.js';

const ERRORS = {
  PHONE_NUMBER_INVALID: 'Неверный номер телефона',
  PHONE_NUMBER_BANNED: 'Этот номер заблокирован в Telegram',
  PHONE_CODE_INVALID: 'Неверный код',
  PHONE_CODE_EXPIRED: 'Срок действия кода истёк',
  PASSWORD_HASH_INVALID: 'Неверный пароль',
  FLOOD_WAIT: 'Слишком много попыток. Попробуйте позже',
  API_ID_INVALID: 'Неверные api_id или api_hash',
  EMAIL_CODE_INVALID: 'Неверный код из письма',
};
const humanError = e => {
  const m = e?.message || String(e);
  const key = Object.keys(ERRORS).find(k => m.includes(k));
  return key ? ERRORS[key] : m;
};

function useForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const run = async fn => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(humanError(e)); setShake(s => s + 1); }
    finally { setBusy(false); }
  };
  return { busy, error, shake, run };
}

function Field({ label, err, shake, ...props }) {
  const ref = useRef();
  useEffect(() => { if (props.autofocus) setTimeout(() => ref.current?.focus(), 60); }, []);
  return html`<div class=${`field ${err ? 'err' : ''} ${shake ? 'shake' : ''}`} key=${shake}>
    ${label && html`<label>${label}</label>`}
    <input ref=${ref} ...${props}/>
  </div>`;
}

function Shell({ children, back }) {
  return html`<div class="auth">
    <div class="auth-top" ...${dragHandlers()}><${Traffic}/>
      ${back && html`<button class="icon-btn" style="margin-left:14px" title="Назад" onClick=${back}>${Icon.reply(18)}</button>`}
    </div>
    <div class="auth-body"><div class="auth-card">${children}</div></div>
  </div>`;
}

function Credentials() {
  const [id, setId] = useState('');
  const [hash, setHash] = useState('');
  const f = useForm();
  const submit = e => {
    e.preventDefault();
    f.run(async () => {
      const apiId = Number(id.trim());
      if (!Number.isInteger(apiId) || apiId <= 0) throw new Error('api_id — это число');
      if (!/^[0-9a-f]{32}$/i.test(hash.trim())) throw new Error('api_hash — это 32 символа из цифр и букв a–f');
      await shell.saveCredentials(apiId, hash.trim());
      S.credsReady = true; changed();
      await shell.setParameters(navigator.language?.slice(0, 2) || 'ru');
    });
  };
  return html`<${Shell}>
    <div class="auth-logo"><${AppLogo} size=${84}/></div>
    <h1>Ключи приложения</h1>
    <p>Их выдаёт сам Telegram на сайте <a onClick=${() => shell.openUrl('https://my.telegram.org/apps')}>my.telegram.org</a>. Это нужно один раз.</p>
    <div class="lock-note">${Icon.lock()}<span>Ключи и ключ шифрования переписки хранятся в «Диспетчере учётных данных» Windows и никуда не передаются, кроме серверов Telegram.</span></div>
    <form style="width:100%" onSubmit=${submit}>
      <${Field} label="api_id" value=${id} onInput=${e => setId(e.target.value)} inputmode="numeric" autofocus placeholder="12345678"/>
      <${Field} label="api_hash" value=${hash} onInput=${e => setHash(e.target.value)} err=${f.error} shake=${f.shake} placeholder="0123456789abcdef0123456789abcdef" spellcheck="false" autocomplete="off"/>
      <div class="err-text">${f.error}</div>
      <button class="btn" disabled=${f.busy || !id || !hash}>${f.busy ? html`<${Spinner}/>` : 'Продолжить'}</button>
    </form>
  </${Shell}>`;
}

function Phone() {
  const [phone, setPhone] = useState('+');
  const f = useForm();
  const submit = e => {
    e.preventDefault();
    f.run(() => send({ '@type': 'setAuthenticationPhoneNumber', phone_number: phone.replace(/[^\d+]/g, ''), settings: null }));
  };
  const onInput = e => {
    let v = e.target.value.replace(/[^\d+\s()-]/g, '');
    if (!v.startsWith('+')) v = `+${v.replace(/\+/g, '')}`;
    setPhone(v);
  };
  return html`<${Shell}>
    <div class="auth-logo"><${AppLogo} size=${96}/></div>
    <h1>macgram</h1>
    <p>Войдите с вашим номером Telegram — введите его с кодом страны.</p>
    <form style="width:100%" onSubmit=${submit}>
      <${Field} value=${phone} onInput=${onInput} err=${f.error} shake=${f.shake} autofocus placeholder="+380 00 000 0000" inputmode="tel"/>
      <div class="err-text">${f.error}</div>
      <button class="btn" disabled=${f.busy || phone.replace(/\D/g, '').length < 7}>${f.busy ? html`<${Spinner}/>` : 'Далее'}</button>
    </form>
    <button class="link-btn" type="button" onClick=${() => { S.authByPhone = false; changed(); if (S.auth?.['@type'] !== 'authorizationStateWaitOtherDeviceConfirmation') f.run(() => send({ '@type': 'requestQrCodeAuthentication', other_user_ids: [] })); }}>Быстрый вход по QR-коду</button>
    <div class="hint">Вход выполняется напрямую через серверы Telegram.<br/>Код придёт в приложение Telegram на другом устройстве или по SMS.<br/><span style="opacity:.7">macgram — неофициальный клиент Telegram.</span></div>
  </${Shell}>`;
}

// Вход по QR-коду (как на первом экране Telegram для macOS): ссылку-токен TDLib обновляет сама.
function QrLogin({ link }) {
  const dark = document.documentElement.dataset.palette === 'night';
  let svg = '';
  try { svg = qrSvg(link, { size: 220, color: dark ? '#fff' : '#000' }); } catch {}
  return html`<${Shell}>
    <div class="qr-box">
      <div class="qr-img" dangerouslySetInnerHTML=${{ __html: svg }}/>
      <div class="qr-logo"><${AppLogo} size=${34}/></div>
    </div>
    <h1>Вход по QR-коду</h1>
    <ol class="qr-steps">
      <li>Откройте Telegram на телефоне</li>
      <li>Откройте <b>Настройки</b> → <b>Устройства</b> → <b>Подключить устройство</b></li>
      <li>Наведите камеру телефона на этот код</li>
    </ol>
    <button class="link-btn" onClick=${() => { S.authByPhone = true; changed(); }}>Войти по номеру телефона</button>
  </${Shell}>`;
}

function codeHint(info) {
  const t = info?.type?.['@type'];
  if (t === 'authenticationCodeTypeTelegramMessage') return 'Мы отправили код в приложение Telegram на другом вашем устройстве.';
  if (t === 'authenticationCodeTypeSms' || t === 'authenticationCodeTypeSmsWord' || t === 'authenticationCodeTypeSmsPhrase') return 'Мы отправили SMS с кодом.';
  if (t === 'authenticationCodeTypeCall') return 'Вам позвонят и продиктуют код.';
  if (t === 'authenticationCodeTypeFragment') return 'Код отправлен на Fragment.';
  return 'Введите код подтверждения.';
}

function Code({ state }) {
  const [code, setCode] = useState('');
  const f = useForm();
  const len = state.code_info?.type?.length || 5;
  const check = v => f.run(() => send({ '@type': 'checkAuthenticationCode', code: v }));
  const onInput = e => {
    const v = e.target.value.replace(/\D/g, '').slice(0, len);
    setCode(v);
    if (v.length === len) check(v);
  };
  const resend = () => f.run(() => send({ '@type': 'resendAuthenticationCode', reason: null }));
  return html`<${Shell} back=${() => send({ '@type': 'logOut' }).catch(() => {})}>
    <div class="auth-logo"><${AppLogo} size=${84}/></div>
    <h1>${state.code_info?.phone_number ? `+${state.code_info.phone_number.replace(/^\+/, '')}` : 'Код'}</h1>
    <p>${codeHint(state.code_info)}</p>
    <${Field} class="code-input" value=${code} onInput=${onInput} err=${f.error} shake=${f.shake} autofocus inputmode="numeric" autocomplete="one-time-code" placeholder=${'–'.repeat(len)}/>
    <div class="err-text">${f.error}</div>
    ${f.busy && html`<div style="color:var(--accent);margin-top:6px"><${Spinner}/></div>`}
    ${state.code_info?.next_type && html`<button class="btn plain" onClick=${resend}>Отправить код другим способом</button>`}
  </${Shell}>`;
}

function Password({ state }) {
  const [pw, setPw] = useState('');
  const f = useForm();
  const submit = e => { e.preventDefault(); f.run(() => send({ '@type': 'checkAuthenticationPassword', password: pw })); };
  return html`<${Shell} back=${() => send({ '@type': 'logOut' }).catch(() => {})}>
    <div class="auth-logo" style="color:var(--accent)">${Icon.lock(64)}</div>
    <h1>Облачный пароль</h1>
    <p>У вас включена двухэтапная проверка. Введите пароль.</p>
    <form style="width:100%" onSubmit=${submit}>
      <${Field} type="password" value=${pw} onInput=${e => setPw(e.target.value)} err=${f.error} shake=${f.shake} autofocus placeholder=${state.password_hint ? `Подсказка: ${state.password_hint}` : 'Пароль'}/>
      <div class="err-text">${f.error}</div>
      <button class="btn" disabled=${f.busy || !pw}>${f.busy ? html`<${Spinner}/>` : 'Войти'}</button>
    </form>
  </${Shell}>`;
}

function Email({ state }) {
  const [v, setV] = useState('');
  const f = useForm();
  const isCode = state['@type'] === 'authorizationStateWaitEmailCode';
  const submit = e => {
    e.preventDefault();
    f.run(() => isCode
      ? send({ '@type': 'checkAuthenticationEmailCode', code: { '@type': 'emailAddressAuthenticationCode', code: v.trim() } })
      : send({ '@type': 'setAuthenticationEmailAddress', email_address: v.trim() }));
  };
  return html`<${Shell}>
    <div class="auth-logo"><${AppLogo} size=${84}/></div>
    <h1>${isCode ? 'Код из письма' : 'Электронная почта'}</h1>
    <p>${isCode ? `Мы отправили код на ${state.code_info?.email_address_pattern || 'вашу почту'}.` : 'Telegram просит привязать почту для входа.'}</p>
    <form style="width:100%" onSubmit=${submit}>
      <${Field} value=${v} onInput=${e => setV(e.target.value)} err=${f.error} shake=${f.shake} autofocus/>
      <div class="err-text">${f.error}</div>
      <button class="btn" disabled=${f.busy || !v}>${f.busy ? html`<${Spinner}/>` : 'Далее'}</button>
    </form>
  </${Shell}>`;
}

function Register() {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const f = useForm();
  const submit = e => { e.preventDefault(); f.run(() => send({ '@type': 'registerUser', first_name: first.trim(), last_name: last.trim(), disable_notification: false })); };
  return html`<${Shell}>
    <div class="auth-logo"><${AppLogo} size=${84}/></div>
    <h1>Новый аккаунт</h1>
    <p>Введите имя, его увидят ваши собеседники.</p>
    <form style="width:100%" onSubmit=${submit}>
      <${Field} value=${first} onInput=${e => setFirst(e.target.value)} placeholder="Имя" autofocus/>
      <${Field} value=${last} onInput=${e => setLast(e.target.value)} placeholder="Фамилия (необязательно)" err=${f.error} shake=${f.shake}/>
      <div class="err-text">${f.error}</div>
      <button class="btn" disabled=${f.busy || !first.trim()}>${f.busy ? html`<${Spinner}/>` : 'Создать'}</button>
    </form>
  </${Shell}>`;
}

function Loading({ text }) {
  return html`<${Shell}>
    <div class="auth-logo"><${AppLogo} size=${84}/></div>
    <div style="color:var(--gray-text);display:flex;gap:8px;align-items:center"><${Spinner}/>${text}</div>
  </${Shell}>`;
}

export function Auth() {
  const st = S.auth;
  const t = st?.['@type'];
  if (!st) return html`<${Loading} text="Запуск…"/>`;
  if (t === 'authorizationStateWaitTdlibParameters') {
    if (S.credsReady === false) return html`<${Credentials}/>`;
    return html`<${Loading} text="Подготовка…"/>`;
  }
  if (t === 'authorizationStateWaitOtherDeviceConfirmation' && !S.authByPhone) return html`<${QrLogin} link=${st.link}/>`;
  if (t === 'authorizationStateWaitPhoneNumber' || t === 'authorizationStateWaitOtherDeviceConfirmation') return html`<${Phone}/>`;
  if (t === 'authorizationStateWaitCode') return html`<${Code} state=${st}/>`;
  if (t === 'authorizationStateWaitPassword') return html`<${Password} state=${st}/>`;
  if (t === 'authorizationStateWaitEmailAddress' || t === 'authorizationStateWaitEmailCode') return html`<${Email} key=${t} state=${st}/>`;
  if (t === 'authorizationStateWaitRegistration') return html`<${Register}/>`;
  if (t === 'authorizationStateLoggingOut') return html`<${Loading} text="Выход…"/>`;
  return html`<${Loading} text="Загрузка…"/>`;
}
