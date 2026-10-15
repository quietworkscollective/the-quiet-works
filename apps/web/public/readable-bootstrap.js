(() => {
  const route = window.location.pathname.replace(/\/+$/, '') || '/';
  if (['/agents', '/licences'].includes(route)) return;
  const html = document.documentElement;
  html.classList.add('tqw-app-loading');
  if (new URLSearchParams(window.location.search).get('mode') === 'text') html.classList.add('tqw-text-loading');
  // A failed or unavailable app must give the written page back.
  const restore = () => html.classList.remove('tqw-app-loading', 'tqw-text-loading');
  window.addEventListener('error', restore, { once: true });
  window.setTimeout(restore, 8000);
})();
