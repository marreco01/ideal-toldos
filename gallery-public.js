
const map = {
 'galeria-toldo-cortina.html':'toldo-cortina',
 'galeria-toldo-capota.html':'toldo-capota',
 'galeria-letreiros.html':'letreiros',
 'galeria-drywall.html':'drywall',
 'galeria-letras.html':'letras',
 'galeria-coberturas.html':'coberturas',
 'galeria-policarbonato.html':'policarbonato'
};
const labels = {
 'toldo-cortina':'Toldo Cortina','toldo-capota':'Toldo Capota','letreiros':'Letreiros',
 'drywall':'Drywall','letras':'Letras','coberturas':'Coberturas','policarbonato':'Policarbonato'
};
async function loadPublicGallery(){
 const page = location.pathname.split('/').pop();
 const cat = map[page] || new URLSearchParams(location.search).get('categoria') || 'toldo-cortina';
 document.title = 'Galeria - ' + labels[cat];
 document.getElementById('galleryTitle').textContent = labels[cat];
 const res = await fetch('/api/gallery?category=' + encodeURIComponent(cat));
 const data = await res.json();
 const photos = data.photos || [];
 const grid = document.getElementById('galleryGrid');
 grid.innerHTML = photos.length ? photos.map(p => { const u = p.src || p.url; return `<a href="${u}" target="_blank" class="photo-link"><img loading="lazy" decoding="async" src="${u}" alt="${labels[cat]}" onerror="this.closest('.photo-link')?.remove()"></a>`; }).join('') : '<p>Nenhuma foto cadastrada nessa categoria.</p>';
}
document.addEventListener('DOMContentLoaded', loadPublicGallery);
