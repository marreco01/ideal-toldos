const siteOrigin = window.location.origin;
const LOCAL_GROUPS_KEY = 'ideal_toldos_campaign_groups_v2';
const POSTED_KEY = 'ideal_toldos_posted_groups_48h_v1';
const POSTED_DAY_KEY = 'ideal_toldos_posted_day_v1';
const POST_CYCLE_HOURS = 48;
const POST_CYCLE_MS = POST_CYCLE_HOURS * 60 * 60 * 1000;
const CAMPAIGN_IMAGE_KEY = 'ideal_toldos_campaign_image_v1';
const CAMPAIGN_IMAGE_NAME_KEY = 'ideal_toldos_campaign_image_name_v1';

let campaignGroups = [];
let currentStats = null;
let scraperResults = [];
let editingGroupId = '';

const $ = (id) => document.getElementById(id);

function slug(text) {
  return String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/https?:\/\//g, '')
    .replace(/www\./g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'campanha';
}

function safe(text) {
  return String(text ?? '').replace(/[&<>"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[c]));
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function isWithinPostCycle(iso) {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) && (Date.now() - time) < POST_CYCLE_MS;
}

function loadPostedMap() {
  try {
    const data = JSON.parse(localStorage.getItem(POSTED_KEY) || '{}');
    if (!data || typeof data !== 'object') return {};
    const clean = {};
    Object.entries(data).forEach(([key, info]) => {
      if (info?.at && isWithinPostCycle(info.at)) clean[key] = info;
    });
    if (Object.keys(clean).length !== Object.keys(data).length) localStorage.setItem(POSTED_KEY, JSON.stringify(clean));
    return clean;
  } catch {
    return {};
  }
}

function savePostedMap(map) {
  localStorage.setItem(POSTED_KEY, JSON.stringify(map || {}));
}

function normalizeUrl(url) {
  let clean = String(url || '').trim();
  if (!clean) return '';
  if (clean.startsWith('www.')) clean = `https://${clean}`;
  if (clean.startsWith('facebook.com')) clean = `https://${clean}`;
  if (clean.startsWith('m.facebook.com')) clean = `https://${clean}`;
  return clean;
}

function uniqueId() {
  return `${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
}

function friendlyGroupName(name, url) {
  const rawName = String(name || '').trim();
  const rawUrl = String(url || '').trim();
  const looksLikeUrl = /^(https?:\/\/)?(www\.)?(m\.)?(facebook|fb)\.com\//i.test(rawName);
  if (rawName && !looksLikeUrl) return rawName;
  const idMatch = rawUrl.match(/groups\/(\d+)/i) || rawName.match(/groups\/(\d+)/i);
  if (idMatch) return `Grupo Facebook ${idMatch[1]}`;
  return rawName || rawUrl.replace(/^https?:\/\//, '').replace(/^www\./, '') || 'Grupo Facebook';
}

function normalizeGroup(raw) {
  const url = normalizeUrl(raw?.url || raw?.link || '');
  const name = friendlyGroupName(raw?.name || '', url);
  const region = String(raw?.region || raw?.bairro || '').trim();
  const membros = Number(raw?.membros || raw?.members || 0) || 0;
  const categoria = String(raw?.categoria || raw?.category || 'Geral').trim();
  const status = String(raw?.status || 'publico').trim();

  if (!name || !url) return null;

  return {
    id: raw?.id || uniqueId(),
    name,
    url,
    region,
    membros,
    categoria,
    status,
    snippet: raw?.snippet || '',
    ultimaAtualizacao: raw?.ultimaAtualizacao || raw?.updatedAt || new Date().toISOString(),
    source: raw?.source || `grupo_${slug(name)}`,
    createdAt: raw?.createdAt || new Date().toISOString()
  };
}

function mergeGroups(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const raw of list || []) {
      const group = normalizeGroup(raw);
      if (!group) continue;
      const key = normalizeUrl(group.url).toLowerCase();
      if (!map.has(key)) map.set(key, group);
      else map.set(key, { ...map.get(key), ...group, membros: group.membros || map.get(key).membros || 0 });
    }
  }
  return Array.from(map.values());
}

function loadLocalGroups() {
  try {
    const items = JSON.parse(localStorage.getItem(LOCAL_GROUPS_KEY) || '[]');
    return Array.isArray(items) ? items.map(normalizeGroup).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveLocalGroups() {
  localStorage.setItem(LOCAL_GROUPS_KEY, JSON.stringify(campaignGroups));
}

function groupKey(group) {
  if (!group) return '';
  return normalizeUrl(group.url || '').toLowerCase() || String(group.source || '').toLowerCase() || String(group.id || '');
}

function linkForGroup(group) {
  return `${siteOrigin}/?src=${encodeURIComponent(group.source || `grupo_${slug(group.name)}`)}`;
}

function getSelectedGroup() {
  const id = $('groupSelect')?.value || '';
  return campaignGroups.find(g => g.id === id) || null;
}

function getPostedInfo(group) {
  if (!group) return null;
  if (group.lastPostedAt && isWithinPostCycle(group.lastPostedAt)) {
    return { at: group.lastPostedAt, name: group.name, url: group.url, server: true };
  }
  const map = loadPostedMap();
  const info = map[groupKey(group)] || map[group?.id] || null;
  return info?.at && isWithinPostCycle(info.at) ? info : null;
}

async function markPosted(group) {
  if (!group) return;
  const now = new Date().toISOString();
  const map = loadPostedMap();
  const info = { at: now, name: group.name, url: group.url };
  map[groupKey(group)] = info;
  if (group.id) map[group.id] = info;
  savePostedMap(map);

  try {
    const res = await fetch(`/api/groups/${encodeURIComponent(group.id)}/posted`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      await syncGroupsFromServer();
      if (!data.regionUpdate || data.regionUpdate.matched === false) {
        await incrementRegionControlForGroup(group);
      } else {
        await loadRegionControl();
      }
      return data;
    }
  } catch {}

  // Quando o grupo existe só no navegador/localStorage, o servidor não acha o ID.
  // Mesmo assim a região precisa contabilizar no painel.
  await incrementRegionControlForGroup(group);
  group.lastPostedAt = now;
  renderGroups();
  updateSelectedGroupUI();
  return { ok: true };
}

function formatNumber(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return '-';
  return n.toLocaleString('pt-BR');
}

function formatDate(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  } catch {
    return '-';
  }
}

function clicksForSource(source) {
  const item = currentStats?.bySource?.find(s => s.source === source);
  return item?.total || 0;
}

function clicksTodayForSource(source) {
  const today = todayKey();
  const recent = currentStats?.recent || [];
  return recent.filter(i => (i.createdAt || '').slice(0,10) === today && i.source === source).length;
}

function updateCampaignTotals() {
  const postedMap = loadPostedMap();
  const total = campaignGroups.length;
  const posted = campaignGroups.filter(g => getPostedInfo(g)).length;

  if ($('campaignTotalGroups')) $('campaignTotalGroups').textContent = total;
  if ($('campaignPostedToday')) $('campaignPostedToday').textContent = posted;
  if ($('campaignPendingToday')) $('campaignPendingToday').textContent = Math.max(total - posted, 0);
  const members = campaignGroups.reduce((sum, g) => sum + (Number(g.membros || 0) || 0), 0);
  if ($('totalMembersBox')) $('totalMembersBox').textContent = members.toLocaleString('pt-BR');
  if ($('tableInfo')) $('tableInfo').textContent = `Mostrando ${total} grupo${total === 1 ? '' : 's'}`;
}

function renderGroupSelect() {
  const select = $('groupSelect');
  if (!select) return;
  const current = select.value;
  const term = ($('groupSearch')?.value || '').toLowerCase().trim();

  const filtered = campaignGroups.filter(g =>
    !term ||
    g.name.toLowerCase().includes(term) ||
    (g.region || '').toLowerCase().includes(term) ||
    g.url.toLowerCase().includes(term)
  );

  select.innerHTML = filtered.length
    ? filtered.map(g => `<option value="${safe(g.id)}">${safe(g.name)}</option>`).join('')
    : '<option value="">Nenhum grupo encontrado</option>';

  if (filtered.some(g => g.id === current)) select.value = current;
  else if (filtered[0]) select.value = filtered[0].id;

  updateSelectedGroupUI();
}

function renderGroups() {
  updateCampaignTotals();
  renderGroupSelect();

  const tbody = $('groupsTableBody');
  if (!tbody) return;

  if (!campaignGroups.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Nenhum grupo cadastrado.</td></tr>';
    return;
  }

  tbody.innerHTML = campaignGroups.map(group => {
    const posted = getPostedInfo(group);
    const badge = posted
      ? '<span class="badge posted">✓ POSTADO 48H</span>'
      : '<span class="badge pending">⌛ PENDENTE</span>';

    return `<tr>
      <td>${badge}</td>
      <td><strong>${safe(group.name)}</strong><br><small>${safe(group.url.replace(/^https?:\/\//,''))}</small></td>
      <td>${safe(group.region || '-')}</td>
      <td><strong>${safe(formatNumber(group.membros))}</strong></td>
      <td>${safe(group.categoria || 'Geral')}</td>
      <td>${clicksTodayForSource(group.source) || clicksForSource(group.source) || 0}</td>
      <td>${posted ? formatDate(posted.at) : '-'}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" title="Selecionar" onclick="selectGroup('${safe(group.id)}')">✓</button>
          <button class="icon-btn" title="Editar" onclick="editGroup('${safe(group.id)}')">✎</button>
          <button class="icon-btn" title="Abrir" onclick="openGroupById('${safe(group.id)}')">↗</button>
          <button class="icon-btn" title="Copiar postagem" onclick="copyPostById('${safe(group.id)}')">▣</button>
          <button class="icon-btn" title="Marcar como postado" onclick="markPostedById('${safe(group.id)}')">✅</button>
          <button class="icon-btn" title="Excluir" onclick="deleteGroup('${safe(group.id)}')">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function updateSelectedGroupUI() {
  const group = getSelectedGroup();
  const link = group ? linkForGroup(group) : '';

  if ($('trackLink')) $('trackLink').value = link;

  const status = $('selectedGroupStatus');
  const last = $('selectedLastPost');

  if (!group) {
    if (status) status.textContent = 'Nenhum grupo selecionado';
    if (last) last.textContent = 'Selecione um grupo para começar.';
    updateGeneratedPost(false);
    return;
  }

  const posted = getPostedInfo(group);
  if (posted) {
    if (status) status.textContent = '✓ POSTADO 48H';
    if (last) last.textContent = `Última postagem: ${formatDate(posted.at)}`;
  } else {
    if (status) status.textContent = 'PENDENTE';
    if (last) last.textContent = 'Ainda não foi postado nas últimas 48 horas.';
  }

  updateGeneratedPost(false);
}

function updateGeneratedPost(force = false) {
  const group = getSelectedGroup();
  const output = $('generatedPost');
  if (!output) return;

  if (!group) {
    output.value = 'Selecione um grupo para gerar a postagem.';
    return;
  }

  if (!force && !output.value.includes('Selecione um grupo')) return;

  const template = $('postTemplate')?.value || '';
  const link = linkForGroup(group);
  output.value = template.includes('{LINK}') ? template.replaceAll('{LINK}', link) : `${template.trim()}\n\n${link}`;
}

async function copyText(text, button) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const temp = document.createElement('textarea');
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand('copy');
    temp.remove();
  }

  if (button) {
    const old = button.textContent;
    button.textContent = 'Copiado!';
    setTimeout(() => button.textContent = old, 1300);
  }
}

function showButtonFeedback(button, text = 'Salvo ✓') {
  if (!button) return;
  const old = button.textContent;
  button.textContent = text;
  button.classList.add('clicked-ok');
  setTimeout(() => {
    button.textContent = old;
    button.classList.remove('clicked-ok');
  }, 1800);
}

function loadCampaignImage() {
  const img = $('campaignImagePreview');
  const empty = $('campaignImageEmpty');
  const data = localStorage.getItem(CAMPAIGN_IMAGE_KEY) || '';
  const name = localStorage.getItem(CAMPAIGN_IMAGE_NAME_KEY) || '';

  if (!img) return;

  if (data && data.startsWith('data:image/')) {
    img.src = data;
    img.style.display = 'block';
    if (empty) {
      empty.textContent = name ? `Imagem carregada: ${name}` : '';
      empty.style.display = name ? 'block' : 'none';
    }
  } else {
    img.removeAttribute('src');
    img.style.display = 'none';
    if (empty) {
      empty.textContent = 'Nenhuma imagem selecionada';
      empty.style.display = 'grid';
    }
  }
}

function saveCampaignImage(file) {
  if (!file || !file.type.startsWith('image/')) {
    alert('Selecione uma imagem válida.');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const originalData = String(reader.result || '');
    const preview = $('campaignImagePreview');
    const empty = $('campaignImageEmpty');

    if (preview) {
      preview.src = originalData;
      preview.style.display = 'block';
    }
    if (empty) {
      empty.textContent = `Imagem carregada: ${file.name}`;
      empty.style.display = 'block';
    }

    const image = new Image();
    image.onload = () => {
      const maxWidth = 1400;
      let width = image.width;
      let height = image.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(image, 0, 0, width, height);

      const compressed = canvas.toDataURL('image/jpeg', 0.84);
      try {
        localStorage.setItem(CAMPAIGN_IMAGE_KEY, compressed);
        localStorage.setItem(CAMPAIGN_IMAGE_NAME_KEY, file.name);
        if (preview) preview.src = compressed;
      } catch {
        alert('A imagem é grande demais para ficar salva no navegador. Use uma imagem menor.');
      }
    };
    image.src = originalData;
  };
  reader.readAsDataURL(file);
}

function parseBulkLine(line) {
  const clean = String(line || '').trim();
  if (!clean) return null;

  let parts = clean.includes('|')
    ? clean.split('|').map(p => p.trim())
    : clean.split(/\s+-\s+/).map(p => p.trim());

  let name = parts[0] || '';
  let url = parts.find(p => /(facebook|fb)\.com\/groups/i.test(p)) || '';
  let region = parts.find((p, idx) => idx > 0 && p !== url) || '';

  if (!url) {
    const match = clean.match(/https?:\/\/\S+|(?:www\.)?facebook\.com\/groups\/\S+/i);
    if (match) url = match[0];
  }

  if (!url) return null;
  if (!name || /(facebook|fb)\.com\/groups/i.test(name)) name = friendlyGroupName('', url);

  return normalizeGroup({ name, url, region });
}


function renderScraperResults() {
  const box = $('scraperResults');
  if (!box) return;
  if (!scraperResults.length) {
    box.innerHTML = '<p class="empty-scraper">Nenhum resultado carregado.</p>';
    if ($('scraperFound')) $('scraperFound').textContent = '0';
    return;
  }
  if ($('scraperFound')) $('scraperFound').textContent = scraperResults.length;
  box.innerHTML = scraperResults.map((g, index) => `
    <div class="scraper-item">
      <label><input type="checkbox" class="scraper-check" data-index="${index}" checked /> <strong>${safe(g.name)}</strong></label>
      <small>${safe(g.region || 'Rio de Janeiro')} • ${safe(g.categoria || 'Geral')} • ${safe(formatNumber(g.membros))} membros</small>
      <a href="${safe(g.url)}" target="_blank" rel="noopener">${safe(g.url.replace(/^https?:\/\//,''))}</a>
    </div>
  `).join('');
}

async function searchGroupsRJ() {
  const btn = $('searchGroupsBtn');
  const status = $('scraperStatus');
  const query = $('scraperQuery')?.value || '';
  if (status) status.textContent = 'Buscando grupos públicos...';
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/groups/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 40 })
    });
    if (res.status === 401) return window.location.href = '/login.html';
    const data = await res.json();
    scraperResults = (data.results || []).map(normalizeGroup).filter(Boolean);
    renderScraperResults();
    if (status) status.textContent = scraperResults.length ? `Busca concluída: ${scraperResults.length} grupo(s).` : (data.message || 'Nenhum grupo encontrado.');
  } catch {
    if (status) status.textContent = 'Falha na busca. Tente outra palavra-chave.';
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function importScraperResults() {
  const checks = Array.from(document.querySelectorAll('.scraper-check:checked'));
  const selected = checks.map(ch => scraperResults[Number(ch.dataset.index)]).filter(Boolean);
  if (!selected.length) return alert('Selecione pelo menos um grupo encontrado.');
  const novos = selected.filter(g => !hasDuplicateGroupUrl(g.url));
  const repetidos = selected.length - novos.length;
  if (!novos.length) return alert('Todos os links selecionados já estão cadastrados. Link repetido não será aceito.');
  campaignGroups = mergeGroups(campaignGroups, novos);
  saveLocalGroups();
  const result = await importGroupsToServer(novos);
  await syncGroupsFromServer();
  await loadRegionControl();
  renderScraperResults();
  alert(result?.message || `${result?.imported ?? novos.length} grupo(s) salvo(s). ${repetidos ? repetidos + ' repetido(s) ignorado(s).' : ''}`);
}

function hasDuplicateGroupUrl(url, ignoreId = '') {
  const key = normalizeUrl(url).toLowerCase();
  return !!key && campaignGroups.some(g => g.id !== ignoreId && normalizeUrl(g.url).toLowerCase() === key);
}

async function syncGroupsFromServer() {
  try {
    const res = await fetch('/api/groups', { cache: 'no-store' });
    if (res.status === 401) return window.location.href = '/login.html';
    const data = await res.json();
    campaignGroups = mergeGroups(data.groups || [], loadLocalGroups());
    saveLocalGroups();
  } catch {
    campaignGroups = mergeGroups(loadLocalGroups());
  }
  renderGroups();
}

async function saveGroupToServer(group) {
  try {
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(group)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Falha ao salvar grupo.');
    return data;
  } catch (err) {
    alert(err.message || 'Falha ao salvar grupo.');
    return null;
  }
}


async function updateGroupToServer(id, group) {
  try {
    const res = await fetch(`/api/groups/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(group)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Falha ao editar grupo.');
    return data;
  } catch (err) {
    alert(err.message || 'Falha ao editar grupo.');
    return null;
  }
}

function setGroupFormMode(group = null) {
  editingGroupId = group?.id || '';
  if ($('editingGroupId')) $('editingGroupId').value = editingGroupId;
  if ($('groupFormTitle')) $('groupFormTitle').textContent = group ? 'Editar grupo' : 'Cadastrar grupo';
  if ($('saveGroupBtn')) $('saveGroupBtn').textContent = group ? 'Salvar edição' : 'Salvar grupo';
  if ($('cancelEditGroupBtn')) $('cancelEditGroupBtn').style.display = group ? 'inline-flex' : 'none';
  if (!group) {
    $('groupForm')?.reset();
    return;
  }
  if ($('groupName')) $('groupName').value = group.name || '';
  if ($('groupUrl')) $('groupUrl').value = group.url || '';
  if ($('groupRegion')) $('groupRegion').value = group.region || '';
  if ($('groupMembers')) $('groupMembers').value = group.membros || '';
  const box = $('groupManager');
  if (box) box.classList.add('open');
  if ($('toggleGroupManager')) $('toggleGroupManager').textContent = 'Ocultar cadastro';
  document.getElementById('grupos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function editGroup(id) {
  const group = campaignGroups.find(g => g.id === id);
  if (!group) return alert('Grupo não encontrado.');
  setGroupFormMode(group);
}


async function importGroupsToServer(groups) {
  try {
    const res = await fetch('/api/groups/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups })
    });
    return await res.json().catch(() => ({}));
  } catch {
    return { ok: false, imported: 0 };
  }
}

async function deleteGroup(id) {
  const group = campaignGroups.find(g => g.id === id);
  if (!group) return;
  if (!confirm(`Excluir o grupo "${group.name}"?`)) return;

  campaignGroups = campaignGroups.filter(g => g.id !== id);
  saveLocalGroups();

  try { await fetch(`/api/groups/${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch {}

  renderGroups();
}

function selectGroup(id) {
  if ($('groupSelect')) $('groupSelect').value = id;
  updateSelectedGroupUI();
  document.getElementById('postagens')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openGroupById(id) {
  const group = campaignGroups.find(g => g.id === id);
  if (!group) return;
  selectGroup(id);
  window.open(group.url, '_blank');
}

function copyPostById(id) {
  const group = campaignGroups.find(g => g.id === id);
  if (!group) return;
  selectGroup(id);
  updateGeneratedPost(true);
  copyText($('generatedPost')?.value || '');
}

async function markPostedById(id) {
  const group = campaignGroups.find(g => g.id === id);
  if (!group) return;
  const result = await markPosted(group);
  alert(result?.message || `Grupo marcado como postado: ${group.name}`);
}

async function loadStats() {
  try {
    const res = await fetch('/api/stats', { cache: 'no-store' });
    if (res.status === 401) return window.location.href = '/login.html';
    const data = await res.json();
    currentStats = data;

    if ($('todayClicks')) $('todayClicks').textContent = data.today || 0;
    if ($('quoteTotal')) $('quoteTotal').textContent = data.quoteTotal || 0;

    if ($('sourceList')) {
      $('sourceList').innerHTML = (data.bySource || []).slice(0, 12).map(i =>
        `<div class="list-row"><span>${safe(i.source)}</span><strong>${safe(i.total)}</strong></div>`
      ).join('') || '<p>Nenhum clique ainda.</p>';
    }

    if ($('ipList')) {
      $('ipList').innerHTML = (data.byIp || []).slice(0, 12).map(i =>
        `<div class="ip-row"><div><strong>${safe(i.ipMasked || 'IP protegido')}</strong><small>${safe(i.lastSource || '-')}</small></div><strong>${safe(i.total || 0)}</strong></div>`
      ).join('') || '<p>Nenhum IP monitorado.</p>';
    }

    if ($('deviceList')) {
      $('deviceList').innerHTML = (data.byDevice || []).map(i =>
        `<div class="list-row"><span>${safe(i.device)}</span><strong>${safe(i.total)}</strong></div>`
      ).join('') || '<p>Nenhum dado ainda.</p>';
    }

    if ($('eventList')) {
      $('eventList').innerHTML = (data.byEvent || []).map(i =>
        `<div class="list-row"><span>${safe(i.eventType || 'visita')}</span><strong>${safe(i.total)}</strong></div>`
      ).join('') || '<p>Nenhum evento ainda.</p>';
    }

    renderGroups();
  } catch {
    console.warn('Não foi possível carregar estatísticas.');
  }
}

window.selectGroup = selectGroup;
window.openGroupById = openGroupById;
window.copyPostById = copyPostById;
window.markPostedById = markPostedById;
window.deleteGroup = deleteGroup;


let regionControlItems = [];


function normalizeRegionText(text = '') {
  return String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findMatchingRegionItems(group, items = []) {
  const text = normalizeRegionText(`${group?.region || ''} ${group?.name || ''}`);
  if (!text) return [];
  return (items || []).filter(item => {
    const bairro = normalizeRegionText(item?.bairro || '');
    if (!bairro) return false;
    return text === bairro || text.includes(bairro) || bairro.includes(text);
  });
}

async function incrementRegionControlForGroup(group) {
  try {
    let items = regionControlItems || [];
    if (!items.length) {
      const res = await fetch('/api/regions', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      items = Array.isArray(data.regions) ? data.regions : [];
      regionControlItems = items;
    }

    const matches = findMatchingRegionItems(group, items);
    if (!matches.length) return { matched: false };

    let latestData = null;
    for (const item of matches) {
      const goal = Number(item.goal || 10) || 10;
      const current = Number(item.count || 0) || 0;
      const nextCount = Math.min(current + 1, goal);
      const res = await fetch(`/api/regions/${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: nextCount })
      });
      latestData = await res.json().catch(() => ({}));
    }

    await loadRegionControl();
    return { matched: true, data: latestData };
  } catch (err) {
    console.warn('Falha ao contabilizar região localmente:', err);
    return { matched: false, error: err };
  }
}

function regionStatusLabel(status) {
  return status === 'divulgando' ? 'Meta batida' : 'Pendente';
}

function regionProgress(item) {
  const count = Number(item?.count || 0);
  const goal = Number(item?.goal || 10) || 10;
  return `${Math.min(count, goal)}/${goal}`;
}

function normalizedRegionStatus(item) {
  const count = Number(item?.count || 0);
  const goal = Number(item?.goal || 10) || 10;
  return count >= goal ? 'divulgando' : 'pendente';
}

function groupRegionsByName(items) {
  return (items || []).reduce((acc, item) => {
    const region = item.region || 'Outras regiões';
    if (!acc[region]) acc[region] = [];
    acc[region].push(item);
    return acc;
  }, {});
}

async function loadRegionControl() {
  try {
    const res = await fetch('/api/regions', { cache: 'no-store' });
    if (res.status === 401) return window.location.href = '/login.html';
    const data = await res.json();
    regionControlItems = Array.isArray(data.regions) ? data.regions : [];
    renderRegionControl(data);
  } catch (err) {
    const grid = $('regionGrid');
    if (grid) grid.innerHTML = '<p class="empty-row">Erro ao carregar controle de região.</p>';
  }
}

function renderRegionControl(data = {}) {
  const items = regionControlItems || [];
  const total = data.total ?? items.length;
  const active = data.divulgando ?? items.filter(i => normalizedRegionStatus(i) === 'divulgando').length;
  const pending = data.pendentes ?? (total - active);

  if ($('regionTotal')) $('regionTotal').textContent = total;
  if ($('regionActive')) $('regionActive').textContent = active;
  if ($('regionPending')) $('regionPending').textContent = pending;

  const grid = $('regionGrid');
  if (!grid) return;

  const grouped = groupRegionsByName(items);
  const html = Object.entries(grouped).map(([region, bairros]) => `
    <article class="region-box">
      <h3>${safe(region)}</h3>
      <div class="bairro-list">
        ${bairros.map(item => `
          <button
            type="button"
            class="bairro-btn ${normalizedRegionStatus(item) === 'divulgando' ? 'divulgando' : 'pendente'}"
            data-region-id="${safe(item.id)}"
            title="Clique para alternar o status">
            <span>${safe(item.bairro)}</span>
            <small>${regionProgress(item)} • ${regionStatusLabel(normalizedRegionStatus(item))}</small>
          </button>
        `).join('')}
      </div>
    </article>
  `).join('');

  grid.innerHTML = html || '<p class="empty-row">Nenhum bairro cadastrado.</p>';
}

async function toggleRegionStatus(id, button) {
  const item = regionControlItems.find(i => i.id === id);
  if (!item) return;
  const nextStatus = normalizedRegionStatus(item) === 'divulgando' ? 'pendente' : 'divulgando';

  button?.classList.add('saving');
  try {
    const res = await fetch(`/api/regions/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Falha ao salvar região.');
    const index = regionControlItems.findIndex(i => i.id === id);
    if (index >= 0 && data.item) regionControlItems[index] = data.item;
    renderRegionControl(data);
  } catch (err) {
    alert(err.message || 'Falha ao salvar controle de região.');
  } finally {
    button?.classList.remove('saving');
  }
}

async function setAllRegions(status) {
  try {
    const res = await fetch('/api/regions/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Falha ao atualizar controle.');
    regionControlItems = Array.isArray(data.regions) ? data.regions : [];
    renderRegionControl(data);
  } catch (err) {
    alert(err.message || 'Falha ao atualizar controle de região.');
  }
}


document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('ideal_admin_logged') !== 'yes') {
    // O servidor também protege. Mantém compatibilidade com login antigo.
  }

  $('logoutBtn')?.addEventListener('click', async () => {
    try { await fetch('/api/logout', { method: 'POST' }); } catch {}
    localStorage.removeItem('ideal_admin_logged');
    window.location.href = '/login.html';
  });

  $('toggleGroupManager')?.addEventListener('click', () => {
    const box = $('groupManager');
    if (!box) return;
    box.classList.toggle('open');
    $('toggleGroupManager').textContent = box.classList.contains('open') ? 'Ocultar cadastro' : 'Mostrar cadastro';
  });

  $('groupSearch')?.addEventListener('input', renderGroupSelect);
  $('groupSelect')?.addEventListener('change', updateSelectedGroupUI);
  $('postTemplate')?.addEventListener('input', () => updateGeneratedPost(true));

  $('groupForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = $('editingGroupId')?.value || editingGroupId || '';
    const group = normalizeGroup({
      name: $('groupName')?.value,
      url: $('groupUrl')?.value,
      region: $('groupRegion')?.value,
      membros: $('groupMembers')?.value
    });

    if (!group) return alert('Preencha nome e link do grupo.');
    if (hasDuplicateGroupUrl(group.url, editId)) return alert('Esse link já está cadastrado. Link repetido não será aceito.');

    const saved = editId ? await updateGroupToServer(editId, group) : await saveGroupToServer(group);
    if (!saved?.ok) return;
    await syncGroupsFromServer();
    await loadRegionControl();
    setGroupFormMode(null);
    renderGroups();
    if (saved.message) showButtonFeedback($('saveGroupBtn'), saved.message.includes('reiniciado') ? 'Ciclo reiniciado ✓' : 'Grupo salvo ✓');
  });

  $('cancelEditGroupBtn')?.addEventListener('click', () => setGroupFormMode(null));

  $('importGroupsBtn')?.addEventListener('click', async () => {
    const lines = ($('bulkGroups')?.value || '').split('\n');
    const imported = lines.map(parseBulkLine).filter(Boolean);
    if (!imported.length) return alert('Cole os grupos no formato correto.');

    const novos = imported.filter(g => !hasDuplicateGroupUrl(g.url));
    const repetidos = imported.length - novos.length;
    if (!novos.length) return alert('Todos os links já estão cadastrados. Link repetido não será aceito.');
    const result = await importGroupsToServer(novos);
    await syncGroupsFromServer();
    await loadRegionControl();
    $('bulkGroups').value = '';
    renderGroups();
    alert(result?.message || `${result?.imported ?? novos.length} grupo(s) importado(s). ${repetidos ? repetidos + ' repetido(s) ignorado(s).' : ''}`);
  });

  $('campaignImageInput')?.addEventListener('change', (e) => saveCampaignImage(e.target.files?.[0]));

  $('clearCampaignImageBtn')?.addEventListener('click', () => {
    localStorage.removeItem(CAMPAIGN_IMAGE_KEY);
    localStorage.removeItem(CAMPAIGN_IMAGE_NAME_KEY);
    if ($('campaignImageInput')) $('campaignImageInput').value = '';
    loadCampaignImage();
  });

  $('generatePostBtn')?.addEventListener('click', () => updateGeneratedPost(true));

  $('copyPostBtn')?.addEventListener('click', async (e) => {
    const group = getSelectedGroup();
    if (!group) return alert('Selecione um grupo.');
    updateGeneratedPost(true);
    await copyText($('generatedPost')?.value || '', e.currentTarget);
  });

  $('copyTrackLinkBtn')?.addEventListener('click', async (e) => {
    const group = getSelectedGroup();
    if (!group) return alert('Selecione um grupo.');
    await copyText(linkForGroup(group), e.currentTarget);
  });

  $('markPostedBtn')?.addEventListener('click', async () => {
    const group = getSelectedGroup();
    if (!group) return alert('Selecione um grupo.');
    const result = await markPosted(group);
    alert(result?.message || `Grupo marcado como postado: ${group.name}`);
  });

  $('openGroupBtn')?.addEventListener('click', () => {
    const group = getSelectedGroup();
    if (!group) return alert('Selecione um grupo.');
    window.open(group.url, '_blank');
  });

  $('regionGrid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-region-id]');
    if (!btn) return;
    toggleRegionStatus(btn.dataset.regionId, btn);
  });

  $('markAllPendingBtn')?.addEventListener('click', () => {
    if (confirm('Marcar todos os bairros como vermelho / não iniciado?')) setAllRegions('pendente');
  });

  $('markAllActiveBtn')?.addEventListener('click', () => {
    if (confirm('Marcar todos os bairros como verde / em divulgação?')) setAllRegions('divulgando');
  });

  loadCampaignImage();
  syncGroupsFromServer();
  loadRegionControl();
  loadStats();
  setInterval(loadStats, 30000);
});

// Sem recarregamento automático: evita perder preenchimento e ações do painel.
const lastUpdateEl=document.getElementById('lastUpdate'); if(lastUpdateEl) lastUpdateEl.textContent=new Date().toLocaleString('pt-BR');
async function loadAdminIpStatus() {
  try {
    const res = await fetch('/api/admin/ip', { cache: 'no-store' });
    if (res.status === 401) return window.location.href = '/login.html';
    const data = await res.json();
    const e = document.getElementById('myIp');
    if (e) e.textContent = data.ipMasked || data.ip || 'Não identificado';
    const s = document.getElementById('ipIgnoreStatus');
    if (s) s.textContent = data.ignored
      ? 'Seu IP está configurado para NÃO contar como visita.'
      : 'Admin logado não conta. Clique em “Não contar meu IP” para bloquear este IP também.';
  } catch {}
}

async function setMyIpIgnored(ignore) {
  try {
    const res = await fetch(ignore ? '/api/admin/ignore-my-ip' : '/api/admin/unignore-my-ip', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Falha ao salvar configuração de IP.');
    await loadAdminIpStatus();
    alert(data.message || 'Configuração atualizada.');
  } catch (err) {
    alert(err.message || 'Falha ao salvar configuração de IP.');
  }
}

document.getElementById('ignoreMyIpBtn')?.addEventListener('click', () => setMyIpIgnored(true));
document.getElementById('unignoreMyIpBtn')?.addEventListener('click', () => setMyIpIgnored(false));
loadAdminIpStatus();

setInterval(()=>{const e=document.getElementById('lastUpdate'); if(e)e.textContent=new Date().toLocaleString('pt-BR');},1000);


// === bairros-select-auto ===
const IDEAL_FALLBACK_REGIONS = {"Zona Oeste": ["Campo Grande", "Santa Cruz", "Cosmos", "Paciência", "Bangu", "Realengo", "Guaratiba", "Sepetiba", "Inhoaíba", "Senador Camará", "Barra da Tijuca", "Recreio", "Jacarepaguá", "Taquara"], "Zona Norte": ["Méier", "Madureira", "Irajá", "Penha", "Tijuca", "Bonsucesso", "Ramos", "Olaria", "Vila Isabel", "Engenho de Dentro"], "Baixada": ["Nova Iguaçu", "Duque de Caxias", "Belford Roxo", "Nilópolis", "São João de Meriti", "Mesquita", "Queimados"], "Centro": ["Centro", "Lapa", "Catete", "Glória", "Cidade Nova", "Estácio"], "Zona Sul": ["Copacabana", "Botafogo", "Flamengo", "Ipanema", "Leblon", "Laranjeiras", "Gávea"]};

function normalizeRegionsToOptions(data) {
  const out = [];
  if (Array.isArray(data)) {
    data.forEach(item => {
      if (typeof item === 'string') out.push({name:item, region:'Outros', count:0, target:10});
      else if (item) out.push({
        name: item.name || item.nome || item.bairro || '',
        region: item.region || item.regiao || item.zona || 'Outros',
        count: Number(item.count || item.total || item.progress || 0),
        target: Number(item.target || item.meta || 10)
      });
    });
  } else if (data && typeof data === 'object') {
    const source = Array.isArray(data.regions) ? data.regions : data;
    if (Array.isArray(source)) {
      source.forEach(item => {
        if (typeof item === 'string') out.push({name:item, region:'Outros', count:0, target:10});
        else if (item) out.push({
          name: item.name || item.nome || item.bairro || '',
          region: item.region || item.regiao || item.zona || 'Outros',
          count: Number(item.count || item.total || item.progress || 0),
          target: Number(item.target || item.meta || item.goal || 10)
        });
      });
    } else {
      Object.entries(source).forEach(([region, bairros]) => {
        const arr = Array.isArray(bairros) ? bairros : (bairros.bairros || bairros.items || []);
        arr.forEach(item => {
          if (typeof item === 'string') out.push({name:item, region, count:0, target:10});
          else if (item) out.push({
            name: item.name || item.nome || item.bairro || '',
            region: item.region || region,
            count: Number(item.count || item.total || item.progress || 0),
            target: Number(item.target || item.meta || item.goal || 10)
          });
        });
      });
    }
  }
  const seen = new Set();
  return out.filter(x => x.name).filter(x => {
    const key = (x.region + '|' + x.name).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a,b) => (a.region+a.name).localeCompare(b.region+b.name, 'pt-BR'));
}

async function carregarBairrosNoCadastroGrupo() {
  const select = document.getElementById('groupRegion');
  if (!select) return;
  let data = IDEAL_FALLBACK_REGIONS;
  try {
    const r = await fetch('/api/regions');
    if (r.ok) data = await r.json();
  } catch (e) {}
  const options = normalizeRegionsToOptions(data);
  select.innerHTML = '<option value="">Selecione o bairro cadastrado</option>';
  let currentRegion = '';
  options.forEach(o => {
    if (o.region !== currentRegion) {
      currentRegion = o.region;
      const group = document.createElement('option');
      group.disabled = true;
      group.textContent = '── ' + currentRegion + ' ──';
      select.appendChild(group);
    }
    const opt = document.createElement('option');
    opt.value = o.name;
    opt.dataset.region = o.region;
    opt.textContent = `${o.name} (${o.count}/${o.target})`;
    select.appendChild(opt);
  });
}

document.addEventListener('DOMContentLoaded', carregarBairrosNoCadastroGrupo);




// === clientes cadastrados ===
function formatClientDate(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch { return '-'; }
}

async function loadClients() {
  const tbody = document.getElementById('clientsTableBody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/clients');
    const data = await res.json();
    const clients = Array.isArray(data.clients) ? data.clients : [];

    const info = document.getElementById('clientsInfo');
    if (info) info.textContent = `Mostrando ${clients.length} cliente${clients.length === 1 ? '' : 's'}`;

    if (!clients.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Nenhum cliente cadastrado.</td></tr>';
      return;
    }

    tbody.innerHTML = clients.slice().reverse().map(client => {
      const phone = String(client.telefone || '').replace(/\D/g, '');
      const wa = phone ? `https://wa.me/55${phone.startsWith('55') ? phone.slice(2) : phone}` : '#';
      return `<tr>
        <td><strong>${safe(client.nome || '-')}</strong><br><small>${safe(client.observacao || '')}</small></td>
        <td>${safe(client.telefone || '-')}</td>
        <td>${safe(client.bairro || '-')}</td>
        <td>${safe(client.servico || '-')}</td>
        <td>${formatClientDate(client.createdAt)}</td>
        <td>
          <div class="row-actions">
            <a class="icon-btn" href="${wa}" target="_blank" rel="noopener" title="Chamar no WhatsApp">💬</a>
            <button class="icon-btn" type="button" onclick="deleteClient('${safe(client.id)}')" title="Excluir">🗑</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Erro ao carregar clientes.</td></tr>';
  }
}

async function deleteClient(id) {
  if (!confirm('Excluir este cliente?')) return;
  const res = await fetch(`/api/clients/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (res.ok) loadClients();
}


// === galeria do site ===
const GALLERY_LABELS = {
  'toldo-cortina': 'Toldo Cortina',
  'toldo-capota': 'Toldo Capota',
  'coberturas': 'Coberturas',
  'policarbonato': 'Policarbonato',
  'letreiros': 'Letreiros',
  'drywall': 'Drywall',
  'letras': 'Letras'
};

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
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
      <td><img class="gallery-admin-thumb" src="${photo.src}" alt="${safe(photo.title || 'Foto')}"></td>
      <td>${safe(photo.categoryLabel || GALLERY_LABELS[photo.category] || photo.category || '-')}</td>
      <td>${safe(photo.title || '-')}</td>
      <td>${formatGalleryDate(photo.createdAt)}</td>
      <td><button class="icon-btn" type="button" onclick="deleteGalleryPhoto('${safe(photo.id)}')" title="Excluir foto">🗑</button></td>
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
  if (!files.length) return alert('Selecione as fotos.');
  if (status) status.textContent = 'Enviando fotos...';
  const payloadFiles = [];
  for (const file of files.slice(0, 12)) {
    if (!file.type.startsWith('image/')) continue;
    payloadFiles.push({ name: file.name, title, data: await fileToDataUrl(file) });
  }
  try {
    const res = await fetch('/api/gallery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, title, files: payloadFiles })
    });
    const data = await res.json().catch(() => ({}));
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
  loadGalleryAdmin();
});
