import { html, render, useEffect, useState } from './lib.js';
import { S, useStore, applyPrefs, selectChat, changed } from './store.js';
import { startTd } from './td.js';
import { Auth } from './components/auth.js';
import { Sidebar } from './components/sidebar.js';
import { Main } from './components/chat.js';
import { ContextMenu, Hud, Modal } from './components/common.js';
import { Viewer } from './components/profile.js';
import { Wallpaper } from './components/wallpaper.js';
import './notify.js';
import { SendDialog, DropOverlay } from './components/attach.js';
import { ForwardDialog } from './components/forward.js';

function App() {
  useStore();
  const [focused, setFocused] = useState(document.hasFocus());
  useEffect(() => {
    const f = () => setFocused(true), b = () => setFocused(false);
    window.addEventListener('focus', f); window.addEventListener('blur', b);
    const keys = e => {
      if (e.key === 'Escape' && S.selection && !S.modal && !S.forward) { S.selection = null; changed(); return; }
      if (e.key === 'Escape' && !S.menu && !S.modal && !S.viewer && !S.sendDialog && !S.forward && !S.selection && !S.reply && !S.editing && S.currentChatId && document.activeElement?.tagName !== 'INPUT') selectChat(null);
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyF' && S.currentChatId && !S.profile) {
        e.preventDefault(); S.chatSearch = { chatId: S.currentChatId, q: '', results: [], index: -1, total: 0 }; changed(); return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyK' || e.code === 'KeyF')) {
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
    ${ready ? html`<${Wallpaper}/><${Sidebar}/><${Main}/>` : html`<${Auth}/>`}
    <${DropOverlay}/>
    <${SendDialog}/>
    <${ForwardDialog}/>
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
