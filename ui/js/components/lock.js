// Экран блокировки по код-паролю (как в Telegram для macOS).
import { html, useState, useRef, useEffect } from '../lib.js';
import { S, openModal, closeModal } from '../store.js';
import { send } from '../td.js';
import { AppLogo } from '../icons.js';
import { Traffic, Spinner, dragHandlers } from './common.js';
import { unlock, setPasscode } from '../passcode.js';

export function LockScreen() {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const ref = useRef();
  useEffect(() => { setTimeout(() => ref.current?.focus(), 80); }, []);
  const submit = async e => {
    e.preventDefault();
    if (!code || busy) return;
    setBusy(true); setErr('');
    try { await unlock(code); } catch (x) { setErr(x.message); setShake(s => s + 1); setCode(''); }
    setBusy(false);
  };
  const forgot = () => openModal({
    title: 'Забыли код-пароль?',
    text: 'Можно выйти из аккаунта на этом компьютере и войти заново. Переписка останется в Telegram, но секретные чаты на этом устройстве пропадут.',
    buttons: [
      { label: 'Выйти', kind: 'danger', action: async () => { closeModal(); await setPasscode(null); S.locked = false; send({ '@type': 'logOut' }).catch(() => {}); } },
      { label: 'Отмена', kind: 'second', action: closeModal },
    ],
  });
  return html`<div class="lock">
    <div class="auth-top" ...${dragHandlers()}><${Traffic}/></div>
    <form class="lock-card" onSubmit=${submit}>
      <div class="lock-logo"><${AppLogo} size=${72}/></div>
      <h2>Введите код-пароль</h2>
      <div class=${`field ${err ? 'err' : ''} ${shake ? 'shake' : ''}`} key=${shake}>
        <input ref=${ref} type="password" value=${code} onInput=${e => setCode(e.target.value)} placeholder="Код-пароль" autocomplete="current-password"/>
      </div>
      <div class="err-text">${err}</div>
      <button class="btn" disabled=${busy || !code}>${busy ? html`<${Spinner}/>` : 'Разблокировать'}</button>
      <button type="button" class="lock-forgot" onClick=${forgot}>Забыли код-пароль?</button>
    </form>
  </div>`;
}
