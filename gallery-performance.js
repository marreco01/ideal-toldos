(function () {
  const BATCH = 18;

  function isGalleryPage() {
    return /galeria/i.test(location.pathname) || document.querySelectorAll('img').length > 12;
  }

  function optimizeImages() {
    document.querySelectorAll('img').forEach((img) => {
      img.loading = 'lazy';
      img.decoding = 'async';
      img.onerror = function () {
        const card = img.closest('.gallery-item, .photo-card, .gallery-card, .admin-photo-card, .card');
        if (card) card.style.display = 'none';
        else img.style.display = 'none';
      };
    });
  }

  function setupLoadMore() {
    if (!isGalleryPage()) return;

    const selectors = [
      '.gallery-grid > *',
      '.photos-grid > *',
      '.admin-gallery-grid > *',
      '#galleryGrid > *',
      '#gallery-list > *',
      '.gallery-container > *'
    ];

    let items = [];
    for (const selector of selectors) {
      items = Array.from(document.querySelectorAll(selector)).filter(el => el.querySelector('img'));
      if (items.length > BATCH) break;
    }

    if (items.length <= BATCH || document.getElementById('btnLoadMoreGallery')) return;

    let visible = BATCH;

    function render() {
      items.forEach((item, index) => {
        item.style.display = index < visible ? '' : 'none';
      });
      btn.style.display = visible >= items.length ? 'none' : 'inline-flex';
      btn.textContent = `Ver mais fotos (${Math.max(0, items.length - visible)})`;
    }

    const btn = document.createElement('button');
    btn.id = 'btnLoadMoreGallery';
    btn.type = 'button';
    btn.className = 'load-more-gallery';
    btn.addEventListener('click', () => {
      visible += BATCH;
      render();
    });

    const parent = items[0].parentElement;
    parent.insertAdjacentElement('afterend', btn);
    render();
  }

  function init() {
    optimizeImages();
    setupLoadMore();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('load', init);

  const obs = new MutationObserver(() => {
    optimizeImages();
    setTimeout(setupLoadMore, 100);
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();