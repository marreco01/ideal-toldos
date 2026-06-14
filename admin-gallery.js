const GALLERY_LABELS = {
  'toldo-cortina': 'Toldo Cortina',
  'toldo-capota': 'Toldo Capota',
  'coberturas': 'Coberturas',
  'policarbonato': 'Policarbonato',
  'letreiros': 'Letreiros',
  'drywall': 'Drywall',
  'letras': 'Letras'
};

function safe(text) {
  return String(text ?? '').replace(/[&<>"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[ch]));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Erro ao ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

function formatGalleryDate(iso) {
  try { return new Date(iso).toLocaleString('pt-BR'); } catch { return '-'; }
}

async function loadGalleryAdmin() {
  const tbody = document.getElementById('galleryTableBody');
  if (!tbody) return;
  try {
    const res = await fetch('/api/gallery', { cache: 'no-store' });
    const data = await res.json();
    const photos = Array.isArray(data.photos) ? data.photos : [];
    if (!photos.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Nenhuma foto cadastrada.</td></tr>';
      return;
    }
    tbody.innerHTML = photos.map(photo => `<tr>
      <td><img class="gallery-admin-thumb" src="${safe(photo.src)}" alt="${safe(photo.title || 'Foto')}"></td>
      <td>${safe(photo.categoryLabel || GALLERY_LABELS[photo.category] || photo.category || '-')}</td>
      <td>${safe(photo.title || '-')}</td>
      <td>${formatGalleryDate(photo.createdAt)}</td>
      <td><button class="icon-btn" type="button" data-delete-gallery="${safe(photo.id)}" title="Excluir foto">🗑</button></td>
    </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Erro ao carregar galeria.</td></tr>';
  }
}

async function deleteGalleryPhoto(id) {
  if (!confirm('Excluir esta foto da galeria?')) return;
  const res = await fetch(`/api/gallery/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (res.ok) loadGalleryAdmin();
}

async function uploadGalleryPhotos(e) {
  e.preventDefault();
  const status = document.getElementById('galleryStatus');
  const category = document.getElementById('galleryCategory')?.value || 'toldo-cortina';
  const title = document.getElementById('galleryTitle')?.value || '';
  const input = document.getElementById('galleryFiles');
  const files = Array.from(input?.files || []);
  if (!files.length) { alert('Selecione as fotos.'); return; }
  if (status) status.textContent = 'Enviando fotos... aguarde.';

  const payloadFiles = [];
  for (const file of files.slice(0, 20)) {
    if (!file.type.startsWith('image/')) continue;
    if (file.size > 8 * 1024 * 1024) {
      if (status) status.textContent = `A imagem ${file.name} passa de 8MB.`;
      return;
    }
    payloadFiles.push({ name: file.name, title, data: await fileToDataUrl(file) });
  }

  try {
    const res = await fetch('/api/gallery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, title, files: payloadFiles })
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('Sessão expirada. Faça login novamente no admin.');
    if (!res.ok || data.ok === false) throw new Error(data.message || 'Erro ao enviar fotos.');
    if (status) status.textContent = `${data.saved?.length || payloadFiles.length} foto(s) enviada(s) para ${GALLERY_LABELS[category]}.`;
    if (input) input.value = '';
    const titleInput = document.getElementById('galleryTitle');
    if (titleInput) titleInput.value = '';
    loadGalleryAdmin();
  } catch (err) {
    if (status) status.textContent = err.message || 'Erro ao enviar fotos.';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('galleryUploadForm')?.addEventListener('submit', uploadGalleryPhotos);
  document.getElementById('reloadGalleryBtn')?.addEventListener('click', loadGalleryAdmin);
  document.body.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-delete-gallery]');
    if (btn) deleteGalleryPhoto(btn.dataset.deleteGallery);
  });
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    location.href = '/login.html';
  });
  loadGalleryAdmin();
});
