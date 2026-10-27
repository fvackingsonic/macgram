import { html, render, useEffect, useState } from './lib.js';
import { S, useStore, applyPrefs, selectChat, changed } from './store.js';
import { startTd } from './td.js';
import { Auth } from './components/auth.js';
import { Sidebar } from './components/sidebar.js';
import { Main } from './components/chat.js';
import { ContextMenu, Hud, Modal } from './components/common.js';
import { Viewer } from './components/profile.js';
import './notify.js';
import { SendDialog, DropOverlay } from './components/attach.js';

function App() {
  useStore();
  const [focused, setFocused] = useState(document.hasFocus());
  useEffect(() => {
    const f = () => setFocused(true), b = () => setFocused(false);
    window.addEventListener('focus', f); window.addEventListener('blur', b);
    const keys = e => {
      if (e.key === 'Escape' && !S.menu && !S.modal && !S.viewer && !S.sendDialog && !S.reply && !S.editing && S.currentChatId && document.activeElement?.tagName !== 'INPUT') selectChat(null);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault(); S.tab = 'chats'; changed();
        setTimeout(() => document.querySelector('.search input')?.focus(), 0);
      }
    };
    window.addEventListener('keydown', keys);
    return () => { window.removeEventListener('focus', f); window.removeEventListener('blur', b); window.removeEventListener('keydown', keys); };
  }, []);
  // Своё контекстное меню вместо системного (кроме полей ввода).
  useEffect(() => {
    const block = e => { if (!e.target.closest('input, textarea, .selectable')) e.preventDefault(); };
    window.addEventListener('contextmenu', block);
    return () => window.removeEventListener('contextmenu', block);
  }, []);

  const ready = S.auth?.['@type'] === 'authorizationStateReady';
  return html`<div class=${`window ${focused ? '' : 'blurred'}`}>
    ${ready ? html`<${Sidebar}/><${Main}/>` : html`<${Auth}/>`}
    <${DropOverlay}/>
    <${SendDialog}/>
    <${Viewer}/>
    <${ContextMenu}/>
    <${Modal}/>
    <${Hud}/>
  </div>`;
}

applyPrefs();
render(html`<${App}/>`, document.getElementById('app'));
startTd().catch(e => {
  console.error(e);
  document.getElementById('app').insertAdjacentHTML('beforeend',
    `<div style="position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#ff3b30;color:#fff;padding:10px 16px;border-radius:10px;font-weight:600">Не удалось запустить TDLib: ${String(e).replace(/[<>&]/g, '')}</div>`);
});
