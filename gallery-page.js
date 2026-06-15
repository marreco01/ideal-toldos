const CATEGORY_LABELS = {
  'toldo-cortina': 'Toldo Cortina',
  'toldo-capota': 'Toldo Capota',
  'coberturas': 'Coberturas',
  'policarbonato': 'Policarbonato',
  'letreiros': 'Letreiros',
  'drywall': 'Drywall',
  'letras': 'Letras'
};
const params = new URLSearchParams(location.search);
const bodyCat = document.body.dataset.category || params.get('category') || '';
const titleEl = document.getElementById('galleryTitle');
const grid = document.getElementById('galleryGrid');
const empty = document.getElementById('galleryEmpty');
const categoryLinks = document.getElementById('categoryLinks');


function likedIds() {
  try { return JSON.parse(localStorage.getItem('idealGalleryLiked') || '[]'); }
  catch { return []; }
}

function saveLikedId(id) {
  const list = Array.from(new Set([...likedIds(), id]));
  localStorage.setItem('idealGalleryLiked', JSON.stringify(list.slice(-1000)));
}

function card(photo) {
  const liked = likedIds().includes(photo.id);
  const total = Number(photo.likes || 0);
  return `<article class="site-photo-card">
    <img loading="lazy" decoding="async" src="${photo.src}" alt="${photo.categoryLabel || 'Foto da galeria'}" loading="lazy" onerror="this.closest('.site-photo-card')?.remove()">
    <div class="site-photo-info clean-like-only">
      <button class="gallery-like-btn ${liked ? 'liked' : ''}" type="button" data-like-id="${photo.id}" ${liked ? 'disabled' : ''} aria-label="Curtir foto">
        <b>${liked ? '♥' : '♡'}</b> <small data-like-count="${photo.id}">${total}</small>
      </button>
    </div>
  </article>`;
}

function bindLikeButtons() {
  document.querySelectorAll('[data-like-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.likeId;
      if (!id || button.disabled) return;
      button.disabled = true;
      try {
        const res = await fetch(`/api/gallery-like/${encodeURIComponent(id)}`, { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) throw new Error(data.message || 'Erro ao curtir.');
        saveLikedId(id);
        button.classList.add('liked');
        const icon = button.querySelector('b');
        if (icon) icon.textContent = '♥';
        const count = button.querySelector('[data-like-count]');
        if (count) count.textContent = data.likes || 1;
      } catch (e) {
        button.disabled = false;
        alert('Não foi possível registrar o amei agora.');
      }
    });
  });
}

async function imageWorks(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src + (src.includes('?') ? '&' : '?') + 'v=' + Date.now();
  });
}

async function loadGallery() {
  const qs = bodyCat ? `?category=${encodeURIComponent(bodyCat)}` : '';
  try {
    const res = await fetch(`/api/gallery${qs}`, { cache: 'no-store' });
    const data = await res.json();
    let photos = Array.isArray(data.photos) ? data.photos : [];
    const checked = [];
    for (const p of photos) { const u = p.src || p.url; if (u && await imageWorks(u)) checked.push(p); }
    photos = checked;
    if (titleEl) titleEl.textContent = bodyCat ? (CATEGORY_LABELS[bodyCat] || 'Galeria') : 'Galeria Ideal Toldos';
    if (categoryLinks) {
      categoryLinks.innerHTML = Object.entries(CATEGORY_LABELS).map(([key, label]) => `<a href="/galeria.html?category=${key}" data-category-link="${key}">${label}</a>`).join('');
      categoryLinks.querySelectorAll('[data-category-link]').forEach(a => { if (a.dataset.categoryLink === bodyCat) a.classList.add('active'); });
    }
    if (!photos.length) {
      if (grid) grid.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    if (grid) {
      grid.innerHTML = photos.map(card).join('');
      bindLikeButtons();
    }
  } catch (e) {
    if (grid) grid.innerHTML = '';
    if (empty) { empty.textContent = 'Não foi possível carregar a galeria.'; empty.style.display = 'block'; }
  }
}
loadGallery();
