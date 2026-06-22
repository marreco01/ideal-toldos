const STORE = {
  groups: 'ideal_groups_v4',
  regions: 'ideal_regions_v4',
  models: 'ideal_models_v4',
  activity: 'ideal_activity_v4',
  clicks: 'ideal_clicks_v4'
};

let state = {
  groups: [],
  regions: [],
  models: ['', '', '', ''],
  activity: [],
  clicks: [],
  cycleQueue: [],
  cycleIndex: -1,
  currentGroup: null
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const normUrl = (url) => {
  url = String(url || '').trim();
  if(!url) return '';
  if(!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try { const u = new URL(url); return u.origin + u.pathname.replace(/\/$/,''); } catch { return ''; }
};

function loadLocal(){
  state.groups = JSON.parse(localStorage.getItem(STORE.groups) || '[]');
  state.regions = JSON.parse(localStorage.getItem(STORE.regions) || '[]');
  state.models = JSON.parse(localStorage.getItem(STORE.models) || '["","","",""]');
  state.activity = JSON.parse(localStorage.getItem(STORE.activity) || '[]');
  state.clicks = JSON.parse(localStorage.getItem(STORE.clicks) || '[]');
  if(!state.regions.length){
    ['Campo Grande','Santa Cruz','Paciência','Cosmos','Guaratiba','Sepetiba','Bangu','Realengo'].forEach(name => {
      state.regions.push({name, zone:'Zona Oeste', goal:100, count:0});
    });
    saveLocal();
  }
}

function saveLocal(){
  localStorage.setItem(STORE.groups, JSON.stringify(state.groups));
  localStorage.setItem(STORE.regions, JSON.stringify(state.regions));
  localStorage.setItem(STORE.models, JSON.stringify(state.models));
  localStorage.setItem(STORE.activity, JSON.stringify(state.activity.slice(0,80)));
  localStorage.setItem(STORE.clicks, JSON.stringify(state.clicks.slice(-5000)));
}

async function syncFromServer(){
  try{
    const r = await fetch('/api/groups');
    const d = await r.json();
    const serverGroups = Array.isArray(d.groups) ? d.groups : (Array.isArray(d) ? d : []);
    if(serverGroups.length){
      state.groups = mergeGroups(state.groups, serverGroups);
      rebuildRegionCounts();
      saveLocal();
    }
  }catch{}
}

function mergeGroups(a,b){
  const map = new Map();
  [...a,...b].forEach(g => {
    const url = normUrl(g.url || g.link);
    if(url) map.set(url, {...g, url, link:url, name:g.name||g.nome||'Grupo Facebook', region:g.region||g.bairro||''});
  });
  return [...map.values()];
}

function rebuildRegionCounts(){
  state.regions.forEach(r => r.count = state.groups.filter(g => (g.region||g.bairro||'').toLowerCase() === r.name.toLowerCase()).length);
}

function go(page){
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  $(page)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  const titles = {
    dashboard:['Dashboard','Resumo da ferramenta de divulgação'],
    grupos:['Banco de Grupos','Cadastro e organização dos grupos salvos'],
    regioes:['Controle de Região','Metas de grupos por bairro'],
    modelos:['Modelos de Postagem','Quatro mensagens com rotação automática'],
    ciclo:['Ciclo de Divulgação','Abrir, copiar e marcar postagens'],
    relatorios:['Relatórios','Acompanhamento por bairro e atividade'],
    galeria:['Galeria','Fotos por categoria'],
    clientes:['Clientes','Cadastros recebidos pelo site'],
    config:['Configurações','Exportação e persistência dos dados']
  };
  $('pageTitle').textContent = titles[page]?.[0] || 'Painel';
  $('pageSubtitle').textContent = titles[page]?.[1] || '';
}

function render(){
  rebuildRegionCounts();
  fillGroupRegionSelectFinal();
  renderStats(); renderRegions(); renderRegionsByZone(); fillGroupRegionSelect(); renderGroups(); renderModels(); renderCycle(); renderReports(); renderActivity(); fillSelects();
  saveLocal();
}

function renderStats(){
  $('statGroups').textContent = state.groups.length;
  $('statRegions').textContent = state.regions.length;
  const today = new Date().toISOString().slice(0,10);
  $('statPosted').textContent = state.groups.filter(g => (g.postedAt||'').slice(0,10) === today).length;
  const totalGoal = state.regions.reduce((s,r)=>s+Number(r.goal||100),0);
  $('statGoal').textContent = `${state.groups.length} / ${totalGoal}`;
  $('groupCountBadge') && ($('groupCountBadge').textContent = `${state.groups.length} grupos`);
}

function renderRegions(){
  const html = state.regions.map(r => {
    const pct = Math.min(100, Math.round((Number(r.count||0) / Number(r.goal||100))*100));
    return `<div class="region-item"><header><strong>${esc(r.name)}</strong><span>${r.count}/${r.goal}</span></header><div class="bar"><span style="width:${pct}%"></span></div></div>`;
  }).join('');
  $('dashRegions') && ($('dashRegions').innerHTML = html || '<p>Nenhum bairro.</p>');
  $('regionsGrid') && ($('regionsGrid').innerHTML = state.regions.map(r => `<div class="panel"><h3>${esc(r.name)}</h3><p>${esc(r.zone)} · ${r.count}/${r.goal} grupos</p><div class="bar"><span style="width:${Math.min(100,(r.count/r.goal)*100)}%"></span></div></div>`).join(''));
}

function renderGroups(){
  const filter = ($('filterGroups')?.value || '').toLowerCase();
  const list = state.groups.filter(g => `${g.name} ${g.region} ${g.url}`.toLowerCase().includes(filter));
  $('groupsTable') && ($('groupsTable').innerHTML = list.map(g => `<div class="data-row"><header><strong>${esc(g.name)}</strong><span>${esc(g.region)}</span></header><small>${esc(g.url)}</small><small class="track-link">Link rastreável: ${esc(location.origin + trackingUrlForGroup(g))}</small><div class="actions"><a class="btn blue" href="${esc(g.url)}" target="_blank">Abrir grupo</a><button class="btn blue" onclick="navigator.clipboard.writeText(location.origin + trackingUrlForGroup(g)); alert('Link rastreável copiado.')">Copiar link rastreável</button><button class="btn red" onclick="deleteGroup('${esc(g.url)}')">Excluir</button></div></div>`).join('') || '<p>Nenhum grupo cadastrado.</p>');
}

function renderModels(){
  const html = state.models.map((m,i)=>`<div class="model-item"><strong>Mensagem ${i+1}</strong><p>${esc(m || 'Vazia')}</p></div>`).join('');
  $('dashModels') && ($('dashModels').innerHTML = html);
  state.models.forEach((m,i)=>{ const el = $('model'+(i+1)); if(el && document.activeElement !== el) el.value = m; });
}

function fillSelects(){
  const opts = '<option value="">Todos os bairros</option>' + state.regions.map(r=>`<option value="${esc(r.name)}">${esc(r.name)}</option>`).join('');
  ['dashRegionSelect','cycleRegionSelect'].forEach(id => {
    const el = $(id); if(el && el.dataset.loaded !== String(state.regions.length)){ const val=el.value; el.innerHTML=opts; el.value=val; el.dataset.loaded=String(state.regions.length); }
  });
}

function groupsByRegion(region){
  return state.groups.filter(g => !region || (g.region||'') === region);
}

function startCycle(){
  const region = $('cycleRegionSelect').value;
  const limit = Math.max(1, Number($('cycleLimit').value || 20));
  state.cycleQueue = groupsByRegion(region).filter(g => g.status !== 'postado').slice(0, limit);
  state.cycleIndex = -1;
  state.currentGroup = null;
  renderCycle();
}

function nextGroup(){
  if(!state.cycleQueue.length) startCycle();
  if(!state.cycleQueue.length) return alert('Nenhum grupo disponível.');
  state.cycleIndex++;
  if(state.cycleIndex >= state.cycleQueue.length) return alert('Fim do ciclo.');
  state.currentGroup = state.cycleQueue[state.cycleIndex];
  state.currentGroup.status = 'aberto';
  window.open(trackingUrlForGroup(state.currentGroup), '_blank');
  renderCycle(); saveLocal();
}

function currentMessage(){
  const idx = Math.max(0, state.cycleIndex);
  const models = state.models.filter(x => x.trim());
  return models.length ? models[idx % models.length] : '';
}

function renderCycle(){
  const total = state.cycleQueue.length || groupsByRegion($('cycleRegionSelect')?.value || '').length;
  $('cycleProgress') && ($('cycleProgress').textContent = `${Math.max(0,state.cycleIndex+1)} / ${total}`);
  const groupHtml = state.currentGroup ? `<strong>${esc(state.currentGroup.name)}</strong><br><small>${esc(state.currentGroup.region)} · ${esc(state.currentGroup.url)}</small>` : 'Nenhum grupo no ciclo.';
  $('currentCycleGroup') && ($('currentCycleGroup').innerHTML = groupHtml);
  $('dashCurrentGroup') && ($('dashCurrentGroup').innerHTML = groupHtml);
  $('currentCycleMessage') && ($('currentCycleMessage').value = currentMessage());
  $('dashCurrentMessage') && ($('dashCurrentMessage').value = currentMessage());
  $('cycleList') && ($('cycleList').innerHTML = (state.cycleQueue.length?state.cycleQueue:groupsByRegion($('cycleRegionSelect')?.value || '')).map((g,i)=>`<div class="data-row"><header><strong>${esc(g.name)}</strong><span>${esc(g.status||'pendente')}</span></header><small>${esc(g.region)} · ${esc(g.url)}</small></div>`).join('') || '<p>Nenhum grupo.</p>');
}

async function copyCurrent(){
  const text = currentMessage();
  if(!text) return alert('Cadastre pelo menos uma mensagem.');
  await navigator.clipboard.writeText(text).catch(()=>{});
  alert('Mensagem copiada.');
}

function markPosted(){
  if(!state.currentGroup) return alert('Abra um grupo primeiro.');
  state.currentGroup.status = 'postado';
  state.currentGroup.postedAt = new Date().toISOString();
  state.activity.unshift({text:`Postagem marcada em ${state.currentGroup.name}`, at:new Date().toISOString()});
  render(); saveLocal();
}

function renderActivity(){
  const html = state.activity.slice(0,8).map(a=>`<div class="activity-item">✅ ${esc(a.text)}<br><small>${new Date(a.at).toLocaleString('pt-BR')}</small></div>`).join('');
  $('recentActivity') && ($('recentActivity').innerHTML = html || '<p>Nenhuma atividade recente.</p>');
}


function trackingUrlForGroup(g){
  const src = encodeURIComponent(g.id || g.url);
  const region = encodeURIComponent(g.region || '');
  return `/r?src=${src}&bairro=${region}`;
}

function renderClickReports(){
  const clicks = state.clicks || [];
  const byRegion = {};
  const byGroup = {};
  clicks.forEach(c=>{
    byRegion[c.region || 'Sem bairro'] = (byRegion[c.region || 'Sem bairro']||0)+1;
    byGroup[c.groupName || c.groupId || 'Sem grupo'] = (byGroup[c.groupName || c.groupId || 'Sem grupo']||0)+1;
  });
  const topRegion = Object.entries(byRegion).sort((a,b)=>b[1]-a[1])[0];
  const topGroup = Object.entries(byGroup).sort((a,b)=>b[1]-a[1])[0];
  if($('totalClicks')) $('totalClicks').textContent = clicks.length;
  if($('topClickRegion')) $('topClickRegion').textContent = topRegion ? `${topRegion[0]} (${topRegion[1]})` : '-';
  if($('topClickGroup')) $('topClickGroup').textContent = topGroup ? `${topGroup[0]} (${topGroup[1]})` : '-';
  if($('clickReportsList')){
    $('clickReportsList').innerHTML = Object.entries(byRegion).sort((a,b)=>b[1]-a[1]).map(([r,n])=>`<div class="data-row click-row"><strong>${esc(r)}</strong><span>${n} cliques</span></div>`).join('') || '<p>Nenhum clique registrado.</p>';
  }
}

async function loadClicks(){
  try{
    const res = await fetch('/api/clicks');
    const data = await res.json();
    if(Array.isArray(data.clicks)){
      state.clicks = data.clicks;
      saveLocal();
    }
  }catch{}
}

function renderReports(){
  renderClickReports();
  $('reportsList') && ($('reportsList').innerHTML = state.regions.map(r => {
    const postados = state.groups.filter(g => g.region === r.name && g.status === 'postado').length;
    return `<div class="data-row"><header><strong>${esc(r.name)}</strong><span>${r.count}/${r.goal}</span></header><small>${postados} postados · ${Math.max(0,r.count-postados)} pendentes</small></div>`;
  }).join(''));
}

function saveGroup(){
  const name = $('groupName').value.trim();
  const url = normUrl($('groupUrl').value);
  const region = $('groupRegion').value.trim();
  if(!name || !url || !region) return alert('Nome, link e bairro são obrigatórios.');
  if(state.groups.some(g => g.url === url)) return alert('Esse link já está cadastrado.');
  state.groups.push({id:Date.now().toString(36), name, url, region, status:'pendente', createdAt:new Date().toISOString()});
  ['groupName','groupUrl','groupRegion','groupMembers'].forEach(id => $(id).value = '');
  render();
}

function parseBulkLine(line){
  const m = line.match(/https?:\/\/(?:www\.)?(?:facebook|fb)\.com\/groups\/[^\s|]+/i) || line.match(/(?:www\.)?(?:facebook|fb)\.com\/groups\/[^\s|]+/i);
  const url = m ? normUrl(m[0]) : '';
  const clean = line.replace(m?m[0]:'','').replace(/[–—-]+/g,'|');
  const parts = clean.split('|').map(x=>x.trim()).filter(Boolean);
  const defaultRegion = $('bulkRegionDefault')?.value?.trim() || $('groupRegion')?.value?.trim() || '';
  return {name:parts[0]||'Grupo Facebook', url, region:parts[1]||parts[2]||defaultRegion};
}

function saveBulk(){
  const lines = $('bulkGroups').value.split(/\n+/).map(x=>x.trim()).filter(Boolean);
  let saved=0, duplicated=0, ignored=0;
  lines.forEach(line => {
    const g = parseBulkLine(line);
    if(!g.url){ ignored++; return; }
    if(!g.region){ ignored++; return; }
    if(state.groups.some(x=>x.url===g.url)){ duplicated++; return; }
    state.groups.push({...g,id:Date.now().toString(36)+Math.random().toString(36).slice(2),status:'pendente',createdAt:new Date().toISOString(),clicks:0});
    saved++;
  });
  $('bulkGroups').value = '';
  alert(`${saved} grupos salvos. ${duplicated} repetidos. ${ignored} ignorados.`);
  render();
}

function deleteGroup(url){
  if(!confirm('Excluir grupo?')) return;
  state.groups = state.groups.filter(g => g.url !== url);
  render();
}

function addRegion(){
  const name = $('newRegionName').value.trim();
  if(!name) return alert('Informe o bairro.');
  if(state.regions.some(r => r.name.toLowerCase() === name.toLowerCase())) return alert('Bairro já existe.');
  state.regions.push({name, zone:$('newRegionZone').value, goal:Number($('newRegionGoal').value||100), count:0});
  $('newRegionName').value = '';
  render();
}

function saveModels(){
  state.models = [1,2,3,4].map(i => $('model'+i).value || '');
  render();
  alert('Modelos salvos.');
}

function exportData(){
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ideal-toldos-backup.json';
  a.click();
}

document.addEventListener('DOMContentLoaded', async () => {
  loadLocal(); await syncFromServer(); await loadClicks(); if((state.regions||[]).length < 20) seedDefaultRegions(); render();

  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.page)));
  document.querySelectorAll('[data-page-go]').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.pageGo)));

  $('saveGroupBtn')?.addEventListener('click', saveGroup);
  $('saveBulkGroupsBtn')?.addEventListener('click', saveBulk);
  $('clearGroupFormBtn')?.addEventListener('click', () => ['groupName','groupUrl','groupRegion','groupMembers'].forEach(id => $(id).value=''));
  $('filterGroups')?.addEventListener('input', renderGroups);

  $('addRegionBtn')?.addEventListener('click', addRegion);
  $('resetRegionsBtn')?.addEventListener('click', () => { if(confirm('Zerar contagem das regiões?')){ state.regions.forEach(r=>r.count=0); render(); }});

  $('saveModelsBtn')?.addEventListener('click', saveModels);

  $('startCycleBtn')?.addEventListener('click', startCycle);
  $('openNextBtn')?.addEventListener('click', nextGroup);
  $('dashNextBtn')?.addEventListener('click', nextGroup);
  $('copyMessageBtn')?.addEventListener('click', copyCurrent);
  $('dashCopyBtn')?.addEventListener('click', copyCurrent);
  $('markPostedBtn')?.addEventListener('click', markPosted);
  $('dashPostedBtn')?.addEventListener('click', markPosted);
  $('resetCycleBtn')?.addEventListener('click', () => { state.groups.forEach(g=>{g.status='pendente';g.postedAt=null}); state.cycleQueue=[]; state.cycleIndex=-1; state.currentGroup=null; render(); });

  $('cycleRegionSelect')?.addEventListener('change', renderCycle);
  $('dashRegionSelect')?.addEventListener('change', () => { $('cycleRegionSelect').value = $('dashRegionSelect').value; startCycle(); renderCycle(); });

  $('exportDataBtn')?.addEventListener('click', exportData);

  $('loadDefaultRegionsBtn')?.addEventListener('click', seedDefaultRegions);
  $('exportGroupsBtn')?.addEventListener('click', exportGroupsDatabase);
  $('importGroupsFile')?.addEventListener('change', e => { if(e.target.files[0]) importGroupsDatabase(e.target.files[0]); });
  $('groupRegionSelect')?.addEventListener('change', e => { if(e.target.value) $('groupRegion').value = e.target.value; });

});

window.deleteGroup = deleteGroup;


// === Gerador de buscas em massa ===
(function(){
  let massSearchLinks = [];
  const $ = (id) => document.getElementById(id);

  function buildQuery(term){
    const suffix = ($('massSearchSuffix')?.value || 'RJ').trim();
    const type = $('massSearchType')?.value || 'google-groups';
    let query = term.trim();
    if(suffix && !new RegExp('\b'+suffix+'\b','i').test(query)) query += ' ' + suffix;

    if(type === 'google-desapego') query = 'site:facebook.com/groups desapego ' + query;
    else if(type === 'google-compra-venda') query = 'site:facebook.com/groups compra e venda ' + query;
    else if(type === 'google-servicos') query = 'site:facebook.com/groups serviços ' + query;
    else query = 'site:facebook.com/groups ' + query;

    return query;
  }

  function buildUrl(term){
    return 'https://www.google.com/search?q=' + encodeURIComponent(buildQuery(term));
  }

  function generateMassSearch(){
    const raw = ($('massSearchTerms')?.value || '').split(/
+/).map(x=>x.trim()).filter(Boolean);
    massSearchLinks = raw.map(term => ({term, query: buildQuery(term), url: buildUrl(term)}));
    const box = $('massSearchResults');
    if(!box) return;

    box.innerHTML = massSearchLinks.length ? massSearchLinks.map(item => `
      <div class="search-result-row">
        <div><strong>${item.query}</strong><br><small>${item.url}</small></div>
        <a href="${item.url}" target="_blank" rel="noopener">Abrir</a>
      </div>
    `).join('') : '<p>Nenhuma busca gerada.</p>';
  }

  function openAllMassSearch(){
    if(!massSearchLinks.length) generateMassSearch();
    if(!massSearchLinks.length) return alert('Digite pelo menos um bairro.');

    massSearchLinks.forEach((item, index) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = item.url;
        a.target = '_blank';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, index * 650);
    });
  }

  async function copyAllMassSearch(){
    if(!massSearchLinks.length) generateMassSearch();
    const text = massSearchLinks.map(i => i.url).join('
');
    await navigator.clipboard.writeText(text).catch(()=>{});
    alert('Buscas copiadas.');
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    $('generateMassSearchBtn')?.addEventListener('click', generateMassSearch);
    $('openMassSearchBtn')?.addEventListener('click', openAllMassSearch);
    $('copyMassSearchBtn')?.addEventListener('click', copyAllMassSearch);
  });
})();


// === Caçador de Links 2.0 ===
(function(){
  let hunter2Links = [];
  const $ = (id) => document.getElementById(id);

  function h2Esc(s){
    return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }

  function h2Normalize(url){
    url = String(url || '').trim();
    url = url.replace(/^https?:\/\/l\.facebook\.com\/l\.php\?u=/i, '');
    try { url = decodeURIComponent(url); } catch(e) {}
    if(!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try{
      const u = new URL(url);
      if(!u.hostname.includes('facebook.com') && !u.hostname.includes('fb.com')) return '';
      if(!u.pathname.includes('/groups/')) return '';
      return 'https://www.facebook.com' + u.pathname.replace(/\/$/, '');
    }catch(e){ return ''; }
  }

  function h2NameFromUrl(url){
    const raw = String(url).split('/groups/')[1] || '';
    const clean = raw.split(/[/?#]/)[0].replace(/[-_]+/g,' ').trim();
    if(!clean || /^\d+$/.test(clean)) return 'Grupo Facebook';
    return clean.replace(/\b\w/g, l => l.toUpperCase());
  }

  function h2Extract(){
    const text = $('hunter2PasteBox')?.value || '';
    const region = ($('hunter2DefaultRegion')?.value || '').trim();

    const rawMatches = [
      ...text.matchAll(/https?:\/\/(?:www\.)?(?:facebook|fb)\.com\/groups\/[^\s<>"')]+/gi),
      ...text.matchAll(/(?:www\.)?(?:facebook|fb)\.com\/groups\/[^\s<>"')]+/gi)
    ].map(m=>m[0]);

    const unique = new Map();
    rawMatches.forEach(raw => {
      const url = h2Normalize(raw);
      if(url && !unique.has(url)){
        unique.set(url, {
          id: 'h2_' + Math.random().toString(36).slice(2),
          name: h2NameFromUrl(url),
          url,
          region,
          selected: true
        });
      }
    });

    hunter2Links = [...unique.values()];
    h2Render();
  }

  function h2Render(){
    const box = $('hunter2Results');
    const status = $('hunter2Status');
    if(status) status.textContent = `${hunter2Links.length} links extraídos.`;
    if(!box) return;
    if(!hunter2Links.length){
      box.innerHTML = '<p>Nenhum link encontrado. Cole links do tipo facebook.com/groups/...</p>';
      return;
    }
    box.innerHTML = hunter2Links.map((item, i)=>`
      <div class="hunter2-row">
        <input type="checkbox" ${item.selected?'checked':''} onchange="window.hunter2Toggle(${i}, this.checked)">
        <div>
          <strong contenteditable="true" onblur="window.hunter2EditName(${i}, this.textContent)">${h2Esc(item.name)}</strong>
          <small>${h2Esc(item.url)}</small>
          <input value="${h2Esc(item.region)}" placeholder="Bairro" oninput="window.hunter2EditRegion(${i}, this.value)">
        </div>
        <span class="tag">${h2Esc(item.region || 'Sem bairro')}</span>
      </div>
    `).join('');
  }

  window.hunter2Toggle = (i, checked) => { if(hunter2Links[i]) hunter2Links[i].selected = checked; };
  window.hunter2EditName = (i, name) => { if(hunter2Links[i]) hunter2Links[i].name = name.trim() || 'Grupo Facebook'; };
  window.hunter2EditRegion = (i, region) => { if(hunter2Links[i]) { hunter2Links[i].region = region.trim(); h2Render(); } };

  function h2SelectAll(){
    hunter2Links.forEach(x => x.selected = true);
    h2Render();
  }

  function h2Clear(){
    hunter2Links = [];
    if($('hunter2PasteBox')) $('hunter2PasteBox').value = '';
    h2Render();
  }

  function h2Save(){
    const selected = hunter2Links.filter(x => x.selected && x.url);
    if(!selected.length) return alert('Nenhum link selecionado.');

    let saved = 0, repeated = 0, noRegion = 0;
    selected.forEach(item => {
      if(!item.region){ noRegion++; return; }
      if(state.groups.some(g => g.url === item.url)){ repeated++; return; }
      state.groups.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        name: item.name || 'Grupo Facebook',
        url: item.url,
        region: item.region,
        status: 'pendente',
        createdAt: new Date().toISOString(),
        clicks: 0
      });
      saved++;
    });
    rebuildRegionCounts();
    render();
    alert(`${saved} grupos salvos. ${repeated} repetidos. ${noRegion} sem bairro.`);
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    $('hunter2ExtractBtn')?.addEventListener('click', h2Extract);
    $('hunter2SelectAllBtn')?.addEventListener('click', h2SelectAll);
    $('hunter2SaveBtn')?.addEventListener('click', h2Save);
    $('hunter2ClearBtn')?.addEventListener('click', h2Clear);
  });
})();


// === PATCH 2.1: Controle de Cliques + IP Admin + Link rastreável ===
(function(){
  const $21 = (id) => document.getElementById(id);
  const esc21 = (s) => String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

  window.idealTrackingUrl21 = function(g){
    const id = encodeURIComponent(g.id || g.url || g.link || '');
    const bairro = encodeURIComponent(g.region || g.bairro || '');
    return location.origin + '/r?src=' + id + '&bairro=' + bairro;
  };

  async function fetchClicks21(){
    try{
      const res = await fetch('/api/clicks');
      if(!res.ok) throw new Error('api');
      const data = await res.json();
      return Array.isArray(data.clicks) ? data.clicks : [];
    }catch(e){
      return JSON.parse(localStorage.getItem('ideal_clicks_cache_21') || '[]');
    }
  }

  function renderClicks21(clicks){
    localStorage.setItem('ideal_clicks_cache_21', JSON.stringify(clicks || []));
    const byRegion = {};
    const byGroup = {};
    (clicks||[]).forEach(c=>{
      const r = c.region || c.bairro || 'Sem bairro';
      const g = c.groupName || c.group || 'Sem grupo';
      byRegion[r] = (byRegion[r]||0)+1;
      byGroup[g] = (byGroup[g]||0)+1;
    });

    const topRegion = Object.entries(byRegion).sort((a,b)=>b[1]-a[1])[0];
    const topGroup = Object.entries(byGroup).sort((a,b)=>b[1]-a[1])[0];

    if($21('clicksTotal21')) $21('clicksTotal21').textContent = (clicks||[]).length;
    if($21('clicksTopRegion21')) $21('clicksTopRegion21').textContent = topRegion ? `${topRegion[0]} (${topRegion[1]})` : '-';
    if($21('clicksTopGroup21')) $21('clicksTopGroup21').textContent = topGroup ? `${topGroup[0]} (${topGroup[1]})` : '-';

    if($21('clicksByRegion21')){
      $21('clicksByRegion21').innerHTML = Object.entries(byRegion).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`
        <div class="data-row click-row21"><strong>${esc21(k)}</strong><span>${v} cliques</span></div>
      `).join('') || '<p>Nenhum clique registrado.</p>';
    }

    if($21('clicksByGroup21')){
      $21('clicksByGroup21').innerHTML = Object.entries(byGroup).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`
        <div class="data-row click-row21"><strong>${esc21(k)}</strong><span>${v} cliques</span></div>
      `).join('') || '<p>Nenhum clique registrado.</p>';
    }
  }

  async function refreshClicks21(){
    renderClicks21(await fetchClicks21());
  }

  async function saveIgnoredIp21(){
    const ip = ($21('ignoredIp21')?.value || '').trim();
    localStorage.setItem('ideal_ignored_ip_21', ip);
    try{
      await fetch('/api/settings/ignored-ip', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ip})
      });
    }catch(e){}
    alert(ip ? 'IP ignorado salvo: ' + ip : 'IP ignorado removido.');
  }

  async function resetClicks21(){
    if(!confirm('Zerar relatório de cliques?')) return;
    localStorage.setItem('ideal_clicks_cache_21', '[]');
    try{ await fetch('/api/clicks/reset', {method:'POST'}); }catch(e){}
    renderClicks21([]);
  }

  function injectTrackingLinks21(){
    // Adiciona botão de copiar link rastreável na lista de grupos, se houver grupos renderizados pelo painel.
    document.querySelectorAll('.bank-row, .data-row, .cycle-row').forEach(row=>{
      if(row.dataset.track21 === 'ok') return;
      const linkEl = row.querySelector('a[href*="facebook.com/groups"], small');
      const text = row.textContent || '';
      const urlMatch = text.match(/https?:\/\/(?:www\.)?facebook\.com\/groups\/[^\s]+/i);
      if(!urlMatch) return;
      const url = urlMatch[0].replace(/[),.]+$/,'');
      const name = (row.querySelector('strong')?.textContent || 'Grupo Facebook').trim();
      const region = (text.match(/Campo Grande|Cosmos|Paciência|Santa Cruz|Bangu|Realengo|Méier|Guaratiba|Jacarepaguá|Recreio|Barra da Tijuca/i)||[''])[0];
      const fake = {id:url, url, region};
      const track = window.idealTrackingUrl21(fake);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn blue';
      btn.textContent = 'Copiar link rastreável';
      btn.onclick = async()=>{ await navigator.clipboard.writeText(track).catch(()=>{}); alert('Link rastreável copiado.'); };
      const actions = row.querySelector('.actions') || row;
      actions.appendChild(btn);
      row.dataset.track21 = 'ok';
    });
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    const ip = localStorage.getItem('ideal_ignored_ip_21') || '';
    if($21('ignoredIp21')) $21('ignoredIp21').value = ip;
    $21('saveIgnoredIp21')?.addEventListener('click', saveIgnoredIp21);
    $21('refreshClicks21')?.addEventListener('click', refreshClicks21);
    $21('resetClicks21')?.addEventListener('click', resetClicks21);
    refreshClicks21();
    setInterval(injectTrackingLinks21, 1200);
  });
})();
