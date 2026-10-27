// Окно всплывающего уведомления macgram. Получает событие «toast» из главного окна.
(() => {
  const T = window.__TAURI__;
  const card = document.getElementById('card');
  let cur = null, timer = 0, hover = false;
  const hide = () => {
    card.classList.remove('in'); card.classList.add('out');
    setTimeout(() => T.core.invoke('toast_hide'), 260);
  };
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => { if (!hover) hide(); else arm(); }, 5500); };
  card.addEventListener('mouseenter', () => { hover = true; });
  card.addEventListener('mouseleave', () => { hover = false; });
  card.addEventListener('click', e => {
    if (e.target.id === 'x') { e.stopPropagation(); hide(); return; }
    if (cur) T.core.invoke('toast_open', { chatId: cur.chatId });
  });
  const showToast = p => {
    cur = p || {};
    document.getElementById('title').textContent = cur.title || 'macgram';
    document.getElementById('text').textContent = cur.body || '';
    const av = document.getElementById('av');
    av.textContent = cur.photo ? '' : (cur.initials || '');
    av.style.backgroundImage = cur.photo ? `url("${cur.photo}")` : (cur.color || 'linear-gradient(#72d5fd,#2a9ef1)');
    card.classList.remove('out', 'in');
    void card.offsetWidth;
    card.classList.add('in');
    arm();
  };
  T.event.listen('toast', e => showToast(e.payload));
  T.core.invoke('toast_last').then(p => { if (p && !cur) showToast(p); }).catch(() => {});
})();
