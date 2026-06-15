(() => {
  const params = new URLSearchParams(window.location.search);
  const urlSource = params.get('src') || params.get('utm_source') || '';
  if (urlSource) localStorage.setItem('ideal_src', urlSource);

  const source = urlSource || localStorage.getItem('ideal_src') || 'direto';
  const page = window.location.pathname + window.location.search;
  const key = `ideal_tracked_${source}_${page}`;

  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, '1');
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, page, referrer: document.referrer || '', eventType: 'visita' }),
      keepalive: true
    }).catch(() => {});
  }

  window.idealTrack = function(eventType, extra = {}) {
    const currentSource = localStorage.getItem('ideal_src') || source || 'direto';
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: currentSource,
        page: window.location.pathname + window.location.search,
        referrer: document.referrer || '',
        eventType,
        ...extra
      }),
      keepalive: true
    }).catch(() => {});
  };
})();
