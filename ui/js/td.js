// Мост к TDLib.
// В приложении запросы идут в Rust-часть (Tauri), которая общается с официальной библиотекой TDLib.
// Если страницу открыть в обычном браузере — включается демо-режим с вымышленными данными.
const T = window.__TAURI__;
export const isNative = !!T;

let mock = null;
let seq = 0;
const pending = new Map();
const handlers = new Set();

function dispatch(raw) {
  let obj;
  try { obj = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return; }
  const extra = obj['@extra'];
  if (extra != null && pending.has(extra)) {
    const p = pending.get(extra);
    pending.delete(extra);
    if (obj['@type'] === 'error') p.reject(obj); else p.resolve(obj);
    return;
  }
  for (const h of handlers) {
    try { h(obj); } catch (e) { console.error('update handler failed', obj['@type'], e); }
  }
}

export function onUpdate(fn) { handlers.add(fn); return () => handlers.delete(fn); }

export async function startTd() {
  if (T) {
    await T.event.listen('td-update', e => dispatch(e.payload));
    await T.core.invoke('td_start');
  } else {
    const { createMock } = await import('./mock.js');
    mock = createMock(dispatch);
  }
}

export function send(req) {
  const extra = `q${++seq}`;
  const payload = JSON.stringify({ ...req, '@extra': extra });
  return new Promise((resolve, reject) => {
    pending.set(extra, { resolve, reject });
    if (T) {
      T.core.invoke('td_send', { request: payload }).catch(err => {
        pending.delete(extra);
        reject({ '@type': 'error', code: 0, message: String(err) });
      });
    } else {
      mock.send(payload);
    }
  });
}

// Возможности оболочки (окно, ключи, файлы).
export const shell = {
  hasCredentials: () => T ? T.core.invoke('creds_status') : Promise.resolve(mock?.hasCreds ?? true),
  saveCredentials: (apiId, apiHash) => T ? T.core.invoke('creds_save', { apiId, apiHash }) : Promise.resolve(mock && (mock.hasCreds = true)),
  setParameters: lang => T ? T.core.invoke('td_set_parameters', { lang }) : send({ '@type': 'setTdlibParameters' }),
  restart: () => T ? T.core.invoke('td_restart') : Promise.resolve(mock.restart()),
  fileUrl: path => !path ? '' : T ? T.core.convertFileSrc(path) : path,
  openUrl: url => {
    if (!/^(https?:|mailto:|tg:)/i.test(url)) return;
    return T ? T.core.invoke('plugin:opener|open_url', { url }) : window.open(url, '_blank', 'noopener');
  },
  minimize: () => T?.window.getCurrentWindow().minimize(),
  toggleMaximize: () => T?.window.getCurrentWindow().toggleMaximize(),
  close: () => T ? T.window.getCurrentWindow().close() : null,
  startDrag: () => T?.window.getCurrentWindow().startDragging(),
  pickFont: kind => T ? T.core.invoke('pick_font', { kind }) : Promise.resolve([]),
  pickFiles: media => T ? T.core.invoke('pick_files', { media }) : Promise.resolve(['C:/Users/demo/Pictures/photo.jpg', 'C:/Users/demo/Documents/отчёт.pdf']),
  savePaste: (data, ext) => T ? T.core.invoke('save_paste', { data, ext }) : Promise.resolve(`C:/demo/paste.${ext}`),
  notify: (title, body) => T ? T.core.invoke('notify', { title, body }).catch(() => {}) : Promise.resolve(),
  setBadge: png => T ? T.core.invoke('set_badge', { png }).catch(() => {}) : Promise.resolve(),
  listen: (name, fn) => T ? T.event.listen(name, e => fn(e.payload)) : Promise.resolve(() => {}),
};
