// Окно всплывающего уведомления macgram. Получает событие «toast» из главного окна.
// Как баннер macOS: по щелчку открывает чат, при наведении — кнопка «Ответить» с полем ввода.
(() => {
  const T = window.__TAURI__;
  const $ = id => document.getElementById(id);
  const card = $('card'), input = $('input'), sendBtn = $('send'), replyBtn = $('reply');
  let cur = null, timer = 0, hover = false, replying = false;
  const setReply = on => {
    replying = on;
    card.classList.toggle('replying', on);
    T.core.invoke('toast_reply_mode', { on }).catch(() => {});
    if (on) { clearTimeout(timer); setTimeout(() => input.focus(), 60); } else { input.value = ''; sendBtn.disabled = true; }
  };
  const hide = () => {
    clearTimeout(timer);
    if (replying) { replying = false; card.classList.remove('replying'); input.value = ''; }
    card.classList.remove('in'); card.classList.add('out');
    setTimeout(() => T.core.invoke('toast_hide'), 260);
  };
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => { if (replying) return; if (!hover) hide(); else arm(); }, 5500); };
  card.addEventListener('mouseenter', () => { hover = true; });
  card.addEventListener('mouseleave', () => { hover = false; });
  card.addEventListener('click', e => {
    if (e.target.id === 'x') { e.stopPropagation(); hide(); return; }
    if (e.target.closest('.reply')) return;
    if (e.target.id === 'reply') { e.stopPropagation(); if (cur?.chatId) setReply(true); return; }
    if (cur) T.core.invoke('toast_open', { chatId: cur.chatId });
  });
  const send = () => {
    const text = input.value.trim();
    if (!text || !cur?.chatId) return;
    T.core.invoke('toast_send', { chatId: cur.chatId, text }).catch(() => {});
    hide();
  };
  input.addEventListener('input', () => { sendBtn.disabled = !input.value.trim(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    if (e.key === 'Escape') { e.preventDefault(); hide(); }
  });
  sendBtn.addEventListener('click', e => { e.stopPropagation(); send(); });
  let lastId = 0;
  const showToast = p => {
    if (p?.id) { if (p.id <= lastId) return; lastId = p.id; T.core.invoke('toast_ack', { id: p.id }).catch(() => {}); }
    if (replying && input.value.trim()) return; // не мешаем, пока человек пишет ответ
    if (replying) setReply(false);
    cur = p || {};
    $('title').textContent = cur.title || 'macgram';
    $('text').textContent = cur.body || '';
    replyBtn.style.display = cur.chatId ? '' : 'none';
    const av = $('av');
    av.textContent = cur.photo ? '' : (cur.initials || '');
    av.style.backgroundImage = cur.photo ? `url("${cur.photo}")` : (cur.color || 'linear-gradient(#72d5fd,#2a9ef1)');
    card.classList.remove('out', 'in');
    void card.offsetWidth;
    card.classList.add('in');
    arm();
  };
  // Ушли из поля ответа, ничего не написав, — уведомление закрывается, как в macOS.
  window.addEventListener('blur', () => { if (replying && !input.value.trim()) hide(); });
  window.__toast = showToast;
  T.event.listen('toast', e => showToast(e.payload));
  T.core.invoke('toast_last').then(p => { if (p && !cur) showToast(p); }).catch(() => {});
})();
