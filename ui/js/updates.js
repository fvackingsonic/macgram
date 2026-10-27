// Обновления: раз в несколько часов смотрим последний релиз macgram на GitHub. Если версия новее —
// показываем, что нового, и предлагаем скачать и установить прямо из программы.
import { html } from './lib.js';
import { S, changed, openModal, closeModal, showHud } from './store.js';
import { isNative } from './td.js';

export const REPO = 'fvackingsonic/macgram';
// Пока репозиторий не переименован, он доступен и по старому имени — пробуем оба.
const API = [`https://api.github.com/repos/${REPO}/releases/tags/latest`, 'https://api.github.com/repos/fvackingsonic/mactele/releases/tags/latest'];
async function fetchRelease() {
  let last = null;
  for (const url of API) {
    const r = await fetch(url, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (r.ok) return r.json();
    last = r.status;
  }
  throw new Error(last === 404 ? 'релиз не найден' : `GitHub ответил ${last}`);
}
const T = window.__TAURI__;

const parse = v => (String(v || '').match(/(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
const newer = (a, b) => { const x = parse(a), y = parse(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };

export async function currentVersion() {
  try { return T ? await T.app.getVersion() : '0.0.0'; } catch { return '0.0.0'; }
}

export async function checkUpdates({ manual = false } = {}) {
  try {
    const rel = await fetchRelease();
    const version = parse(rel.name || rel.tag_name).join('.');
    const asset = (rel.assets || []).find(a => /_x64-setup\.exe$/.test(a.name));
    const sha = asset?.digest || (rel.body || '').match(/SHA-?256:\s*([0-9a-f]{64})/i)?.[1] || '';
    const cur = await currentVersion();
    if (!asset || !version || !newer(version, cur)) {
      S.update = null; changed();
      if (manual) showHud(`У вас последняя версия — ${cur}`);
      return null;
    }
    S.update = { version, notes: notesOf(rel.body || ''), url: asset.browser_download_url, sha, size: asset.size, page: rel.html_url };
    changed();
    let skipped = ''; try { skipped = localStorage.getItem('skipUpdate') || ''; } catch {}
    if (manual || skipped !== version) showUpdate();
    return S.update;
  } catch (e) {
    if (manual) showHud(`Не удалось проверить обновления: ${e.message}`);
    return null;
  }
}

// Из описания релиза берём только список изменений (без технических строк).
function notesOf(body) {
  return body.split('\n').filter(l => !/^SHA-?256:|^Коммит|^commit/i.test(l.trim())).join('\n').trim();
}

function Notes({ text }) {
  const lines = text.split('\n');
  return html`<div class="upd-notes">${lines.map(l => {
    const t = l.trim();
    if (!t) return null;
    if (/^#+\s/.test(t)) return html`<div class="upd-h">${t.replace(/^#+\s*/, '')}</div>`;
    if (/^[-*•]\s/.test(t)) return html`<div class="upd-li">${t.replace(/^[-*•]\s*/, '')}</div>`;
    return html`<p>${t}</p>`;
  })}</div>`;
}

export function showUpdate() {
  const u = S.update; if (!u) return;
  openModal({
    icon: html`<div class="upd-icon"><img src="icons/macgram-logo.svg" width="64" height="64" alt=""/></div>`,
    title: `Вышла версия ${u.version}`,
    body: html`<${Notes} text=${u.notes || 'Исправления и улучшения.'}/>`,
    buttons: [
      { label: isNative ? 'Обновить сейчас' : 'Открыть страницу', action: () => { closeModal(); install(); } },
      { label: 'Позже', kind: 'second', action: () => { try { localStorage.setItem('skipUpdate', u.version); } catch {} closeModal(); } },
    ],
  });
}

export async function install() {
  const u = S.update; if (!u) return;
  if (!isNative) { window.open(u.page, '_blank'); return; }
  if (!u.sha) { showHud('У обновления нет контрольной суммы — скачайте его со страницы релиза'); T.core.invoke('plugin:opener|open_url', { url: u.page }).catch(() => {}); return; }
  S.updateProgress = { done: 0, total: u.size || 0 }; changed();
  const off = await T.event.listen('update-progress', e => { S.updateProgress = e.payload; changed(); });
  try {
    await T.core.invoke('update_install', { url: u.url, sha256: u.sha });
  } catch (e) {
    showHud(String(e)); S.updateProgress = null; changed();
  } finally { off(); }
}

// Плашка в списке чатов, пока обновление не установлено.
export function UpdateBanner() {
  const u = S.update; if (!u) return null;
  const p = S.updateProgress;
  const pct = p?.total ? Math.round(100 * p.done / p.total) : 0;
  return html`<button class="upd-banner" onClick=${() => (p ? null : showUpdate())}>
    <span class="upd-dot"/>
    <span class="upd-text">${p ? `Загрузка обновления… ${pct}%` : `Доступна версия ${u.version}`}</span>
    ${p ? html`<i class="upd-bar" style=${`width:${pct}%`}/>` : html`<span class="upd-go">Обновить</span>`}
  </button>`;
}

if (isNative) {
  setTimeout(() => checkUpdates(), 8000);
  setInterval(() => checkUpdates(), 6 * 3600e3);
}
