
const categoryEl = document.getElementById('galleryCategory');
const form = document.getElementById('galleryUploadForm');
const grid = document.getElementById('galleryAdminGrid');
const statusEl = document.getElementById('galleryStatus');
const fileInput = document.getElementById('galleryPhotos');

const CATEGORY_KEY = 'idealGalleryCategoryLocked';

function getUrlCategory(){
  try { return new URLSearchParams(location.search).get('category') || ''; } catch { return ''; }
}

function categoryExists(value){
  return !!categoryEl && [...categoryEl.options].some(opt => opt.value === value);
}

function currentCategory(){
  const selected = categoryEl?.value || '';
  if (categoryExists(selected)) return selected;
  const saved = localStorage.getItem(CATEGORY_KEY) || '';
  if (categoryExists(saved)) return saved;
  return 'toldo-cortina';
}

function lockCategory(category){
  if (!categoryExists(category)) return;
  categoryEl.value = category;
  localStorage.setItem(CATEGORY_KEY, category);
  try {
    const url = new URL(location.href);
    url.searchParams.set('category', category);
    history.replaceState(null, '', url.toString());
  } catch {}
}

function restoreCategory(){
  const fromUrl = getUrlCategory();
  const saved = localStorage.getItem(CATEGORY_KEY) || '';
  const category = categoryExists(fromUrl) ? fromUrl : (categoryExists(saved) ? saved : currentCategory());
  lockCategory(category);
}

async function loadGalleryAdmin(){
  restoreCategory();
  const category = currentCategory();
  const res = await fetch('/api/gallery?category=' + encodeURIComponent(category), { cache: 'no-store' });
  const data = await res.json();
  const photos = data.photos || [];
  grid.innerHTML = photos.length ? photos.map(p => `
    <div class="gallery-card">
      <img loading="lazy" decoding="async" src="${p.url || p.src}" alt="" onerror="this.closest('.gallery-card')?.remove()">
      <button onclick="deletePhoto('${p.category || category}','${p.filename || ''}')">Excluir</button>
    </div>
  `).join('') : '<p>Nenhuma foto nessa categoria.</p>';
}

async function deletePhoto(category, filename){
  const locked = currentCategory();
  
  await fetch('/api/gallery/photo?category=' + encodeURIComponent(category || locked) + '&filename=' + encodeURIComponent(filename), {method:'DELETE'});
  lockCategory(locked);
  loadGalleryAdmin();
}

form?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  e.stopPropagation();

  const selectedCategory = currentCategory();
  lockCategory(selectedCategory);

  const files = [...(fileInput?.files || [])];
  if (!files.length) {
    statusEl.textContent = 'Selecione as fotos.';
    return;
  }

  const fd = new FormData();
  fd.append('category', selectedCategory);
  files.forEach(file => fd.append('photos', file));

  statusEl.textContent = 'Enviando...';
  const res = await fetch('/api/gallery/upload', {method:'POST', body:fd});
  const data = await res.json().catch(()=>({}));
  statusEl.textContent = data.ok ? 'Fotos enviadas com sucesso.' : (data.message || 'Erro ao enviar.');

  // Não troca categoria e não reseta o formulário todo.
  if (fileInput) fileInput.value = '';
  lockCategory(selectedCategory);
  await loadGalleryAdmin();
});

categoryEl?.addEventListener('change', ()=>{
  lockCategory(categoryEl.value);
  loadGalleryAdmin();
});

document.addEventListener('DOMContentLoaded', ()=>{
  restoreCategory();
  loadGalleryAdmin();
});
