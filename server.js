const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const root = __dirname;
const port = process.env.PORT || 8080;

const ADMIN_USER = process.env.ADMIN_USER || 'tiago';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Ideal@2026';

const sessions = new Set();
const persistRoot = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.PERSIST_DIR || root;
const dataDir = path.join(persistRoot, 'data');
const clicksFile = path.join(dataDir, 'clicks.json');
const groupsFile = path.join(dataDir, 'groups.json');
const clientsFile = path.join(dataDir, 'clients.json');
const galleryFile = path.join(dataDir, 'gallery.json');
const galleryLikesFile = path.join(dataDir, 'gallery-likes.json');
const uploadsDir = path.join(persistRoot, 'uploads');
const ignoredIpsFile = path.join(dataDir, 'ignored-ips.json');
const regionsFile = path.join(dataDir, 'regions.json');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function copySeedIfMissing(targetFile, seedName, fallback) {
  if (fs.existsSync(targetFile)) return;
  const seedFile = path.join(root, 'data', seedName);
  if (seedFile !== targetFile && fs.existsSync(seedFile)) {
    try { fs.copyFileSync(seedFile, targetFile); return; } catch {}
  }
  fs.writeFileSync(targetFile, fallback);
}

function ensureData() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  copySeedIfMissing(clicksFile, 'clicks.json', '[]');
  copySeedIfMissing(groupsFile, 'groups.json', '[]');
  copySeedIfMissing(clientsFile, 'clients.json', '[]');
  copySeedIfMissing(galleryFile, 'gallery.json', '[]');
  copySeedIfMissing(galleryLikesFile, 'gallery-likes.json', '{}');
  copySeedIfMissing(ignoredIpsFile, 'ignored-ips.json', '[]');
}

function readClicks() {
  ensureData();
  try { return JSON.parse(fs.readFileSync(clicksFile, 'utf8') || '[]'); }
  catch { return []; }
}

function writeClicks(items) {
  ensureData();
  fs.writeFileSync(clicksFile, JSON.stringify(items.slice(-10000), null, 2));
}

function readGroups() {
  ensureData();
  try { return JSON.parse(fs.readFileSync(groupsFile, 'utf8') || '[]'); }
  catch { return []; }
}

function writeGroups(items) {
  ensureData();
  fs.writeFileSync(groupsFile, JSON.stringify(items.slice(-3000), null, 2));
}

function readClients() {
  ensureData();
  try { return JSON.parse(fs.readFileSync(clientsFile, 'utf8') || '[]'); }
  catch { return []; }
}

function writeClients(items) {
  ensureData();
  fs.writeFileSync(clientsFile, JSON.stringify(items.slice(-5000), null, 2));
}

function normalizePhone(phone = '') {
  return String(phone || '').replace(/\D/g, '');
}

function readGallery() {
  ensureData();
  try { return JSON.parse(fs.readFileSync(galleryFile, 'utf8') || '[]'); }
  catch { return []; }
}

function writeGallery(items) {
  ensureData();
  fs.writeFileSync(galleryFile, JSON.stringify(items.slice(-2000), null, 2));
}

function readGalleryLikes() {
  ensureData();
  try {
    const data = JSON.parse(fs.readFileSync(galleryLikesFile, 'utf8') || '{}');
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function writeGalleryLikes(items) {
  ensureData();
  fs.writeFileSync(galleryLikesFile, JSON.stringify(items || {}, null, 2));
}

function withGalleryLikes(photos) {
  const likes = readGalleryLikes();
  return (photos || []).map(photo => ({
    ...photo,
    likes: Math.max(0, Number(likes[photo.id] || photo.likes || 0))
  }));
}

const GALLERY_CATEGORIES = {
  'toldo-cortina': 'Toldo Cortina',
  'toldo-capota': 'Toldo Capota',
  'coberturas': 'Coberturas',
  'policarbonato': 'Policarbonato',
  'letreiros': 'Letreiros',
  'drywall': 'Drywall',
  'letras': 'Letras'
};

function normalizeGalleryCategory(value = '') {
  const raw = String(value || '').trim();
  const aliases = {
    'toldo cortina': 'toldo-cortina',
    'toldocortina': 'toldo-cortina',
    'toldo-cortina': 'toldo-cortina',
    'toldo capota': 'toldo-capota',
    'toldocapota': 'toldo-capota',
    'toldo-capota': 'toldo-capota',
    'cobertura': 'coberturas',
    'coberturas': 'coberturas',
    'policarbonato': 'policarbonato',
    'letreiro': 'letreiros',
    'letreiros': 'letreiros',
    'drywall': 'drywall',
    'letra': 'letras',
    'letras': 'letras'
  };
  const key = slug(raw).replace(/_/g, '-');
  const soft = key.replace(/-/g, ' ');
  if (GALLERY_CATEGORIES[key]) return key;
  if (aliases[key]) return aliases[key];
  if (aliases[soft]) return aliases[soft];
  const found = Object.entries(GALLERY_CATEGORIES).find(([, label]) => slug(label).replace(/_/g, '-') === key);
  return found ? found[0] : '';
}

function galleryPhotoCategory(photo = {}) {
  return normalizeGalleryCategory(photo.category || photo.categoryLabel || photo.tipo || photo.type || photo.titulo || photo.title || '');
}

function publicGalleryPhoto(photo = {}) {
  const cat = galleryPhotoCategory(photo) || 'letreiros';
  return {
    ...photo,
    category: cat,
    categoryLabel: GALLERY_CATEGORIES[cat] || photo.categoryLabel || photo.category || 'Galeria',
    title: GALLERY_CATEGORIES[cat] || photo.categoryLabel || photo.category || 'Galeria'
  };
}

function recoverGalleryFromUploads() {
  ensureData();
  let gallery = readGallery();
  const known = new Set(gallery.map(item => item.src));
  const files = [];
  const dirs = [uploadsDir, path.join(root, 'assets', 'uploads')];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!/\.(png|jpe?g|webp)$/i.test(name)) continue;
      const isPersist = dir === uploadsDir;
      const src = isPersist ? `/assets/uploads/${name}` : `/assets/uploads/${name}`;
      if (known.has(src)) continue;
      const foundCat = Object.keys(GALLERY_CATEGORIES).find(cat => name.includes(cat)) || 'letreiros';
      files.push({ name, src, category: foundCat });
      known.add(src);
    }
  }
  if (!files.length) return gallery;
  const now = new Date().toISOString();
  for (const file of files) {
    const id = 'rec-' + crypto.createHash('md5').update(file.src).digest('hex').slice(0, 12);
    gallery.push({
      id,
      category: file.category,
      categoryLabel: GALLERY_CATEGORIES[file.category],
      title: GALLERY_CATEGORIES[file.category],
      src: file.src,
      createdAt: now
    });
  }
  writeGallery(gallery);
  return gallery;
}


function readIgnoredIps() {
  ensureData();
  try { return JSON.parse(fs.readFileSync(ignoredIpsFile, 'utf8') || '[]'); }
  catch { return []; }
}

function writeIgnoredIps(items) {
  ensureData();
  fs.writeFileSync(ignoredIpsFile, JSON.stringify(Array.from(new Set(items)).slice(-200), null, 2));
}


const DEFAULT_REGIONS = [
  { region: 'Zona Oeste', bairros: ['Campo Grande','Santa Cruz','Cosmos','Paciência','Bangu','Realengo','Guaratiba','Sepetiba','Inhoaíba','Senador Camará','Barra da Tijuca','Recreio','Jacarepaguá','Taquara'] },
  { region: 'Zona Norte', bairros: ['Méier','Lins','Engenho Novo','Madureira','Irajá','Penha','Tijuca','Bonsucesso','Ramos','Olaria','Vila Isabel','Engenho de Dentro'] },
  { region: 'Baixada', bairros: ['Nova Iguaçu','Duque de Caxias','Belford Roxo','Nilópolis','São João de Meriti','Mesquita','Queimados'] },
  { region: 'Centro', bairros: ['Centro','Lapa','Catete','Glória','Cidade Nova','Estácio'] },
  { region: 'Zona Sul', bairros: ['Copacabana','Botafogo','Flamengo','Ipanema','Leblon','Laranjeiras','Gávea'] }
];

function defaultRegionItems() {
  const now = new Date().toISOString();
  return DEFAULT_REGIONS.flatMap(group => group.bairros.map(bairro => ({
    id: slug(`${group.region}_${bairro}`),
    region: group.region,
    bairro,
    count: 0,
    goal: 10,
    status: 'pendente',
    updatedAt: now
  })));
}

function mergeDefaultRegions(items = []) {
  const current = Array.isArray(items) ? items.map(migrateRegionItem) : [];
  const seen = new Set(current.map(item => normalizeTextKey(`${item.region || ''}|${item.bairro || ''}`)));
  const now = new Date().toISOString();
  for (const def of defaultRegionItems()) {
    const key = normalizeTextKey(`${def.region}|${def.bairro}`);
    if (!seen.has(key)) {
      current.push({ ...def, updatedAt: now });
      seen.add(key);
    }
  }
  return current;
}

function readRegions() {
  ensureData();
  try {
    if (!fs.existsSync(regionsFile)) {
      const defaults = defaultRegionItems();
      writeRegions(defaults);
      return defaults;
    }
    const items = JSON.parse(fs.readFileSync(regionsFile, 'utf8') || '[]');
    if (!Array.isArray(items) || !items.length) {
      const defaults = defaultRegionItems();
      writeRegions(defaults);
      return defaults;
    }
    return mergeDefaultRegions(items.map(migrateRegionItem));
  } catch {
    const defaults = defaultRegionItems();
    writeRegions(defaults);
    return defaults;
  }
}

function writeRegions(items) {
  ensureData();
  fs.writeFileSync(regionsFile, JSON.stringify(items, null, 2));
}

function regionGoal(item) {
  const goal = Number(item?.goal || item?.meta || 10);
  return Number.isFinite(goal) && goal > 0 ? goal : 10;
}

function regionCount(item) {
  const count = Number(item?.count || item?.total || 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function regionStatus(item) {
  return regionCount(item) >= regionGoal(item) ? 'divulgando' : 'pendente';
}

function regionStats(items) {
  const normal = (items || []).map(item => ({ ...item, status: regionStatus(item) }));
  const divulgando = normal.filter(i => i.status === 'divulgando').length;
  const pendentes = normal.length - divulgando;
  return { total: normal.length, divulgando, pendentes, meta: 10 };
}

function normalizeTextKey(text = '') {
  return String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function migrateRegionItem(item) {
  const count = regionCount(item);
  const goal = regionGoal(item);
  return {
    ...item,
    count,
    goal,
    status: count >= goal ? 'divulgando' : 'pendente'
  };
}

function findRegionForText(regions, text = '') {
  const clean = normalizeTextKey(text);
  if (!clean) return null;

  let best = null;
  let bestSize = 0;
  for (const item of regions || []) {
    const bairroKey = normalizeTextKey(item.bairro);
    if (!bairroKey) continue;
    const found = clean === bairroKey || clean.includes(bairroKey) || bairroKey.includes(clean);
    if (found && bairroKey.length > bestSize) {
      best = item;
      bestSize = bairroKey.length;
    }
  }
  return best;
}

function resetRegionCycle(regions) {
  const now = new Date().toISOString();
  return (regions || []).map(item => ({
    ...item,
    count: 0,
    goal: regionGoal(item),
    status: 'pendente',
    updatedAt: now
  }));
}

function findRegionsForText(regions, text = '') {
  const clean = normalizeTextKey(text);
  if (!clean) return [];
  const matches = [];
  for (const item of regions || []) {
    const bairroKey = normalizeTextKey(item.bairro);
    if (!bairroKey) continue;
    const found = clean === bairroKey || clean.includes(bairroKey) || bairroKey.includes(clean);
    if (found && !matches.some(m => m.id === item.id)) matches.push(item);
  }
  return matches;
}

function incrementRegionByText(text = '') {
  let regions = readRegions().map(migrateRegionItem);
  const matches = findRegionsForText(regions, text);
  if (!matches.length) return { matched: false, cycleReset: false, regions, items: [], stats: regionStats(regions) };

  const now = new Date().toISOString();
  const ids = new Set(matches.map(item => item.id));
  regions = regions.map(region => {
    const normal = migrateRegionItem(region);
    if (!ids.has(normal.id)) return normal;
    const nextCount = Math.min(regionCount(normal) + 1, regionGoal(normal));
    return {
      ...normal,
      count: nextCount,
      goal: regionGoal(normal),
      status: nextCount >= regionGoal(normal) ? 'divulgando' : 'pendente',
      updatedAt: now
    };
  });

  let cycleReset = false;
  if (regions.length && regions.every(region => regionCount(region) >= regionGoal(region))) {
    cycleReset = true;
    regions = resetRegionCycle(regions);
  }

  writeRegions(regions);
  const items = regions.filter(region => ids.has(region.id));
  return { matched: true, cycleReset, regions, items, item: items[0] || null, stats: regionStats(regions) };
}


function slug(text) {
  return String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'grupo';
}


function formatNumber(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return '';
  return String(Math.round(n));
}

function normalizeGroupUrl(urlText = '') {
  let clean = String(urlText || '').trim();
  clean = clean.replace(/&amp;/g, '&').replace(/[)\].,;]+$/g, '');
  const decoded = clean.match(/[?&]u=([^&]+)/);
  if (decoded) {
    try { clean = decodeURIComponent(decoded[1]); } catch {}
  }
  clean = clean.replace(/^http:\/\//i, 'https://');
  if (clean.startsWith('//')) clean = `https:${clean}`;
  if (/^facebook\.com/i.test(clean)) clean = `https://${clean}`;
  if (/^www\.facebook\.com/i.test(clean)) clean = `https://${clean}`;
  clean = clean.replace('m.facebook.com', 'www.facebook.com');
  const m = clean.match(/https:\/\/(?:www\.)?facebook\.com\/groups\/[^\s"'<>]+/i);
  if (!m) return '';
  clean = m[0].split('?')[0].replace(/\/$/, '');
  return clean;
}

function canonicalGroupUrl(urlText = '') {
  const fb = normalizeGroupUrl(urlText);
  let clean = fb || String(urlText || '').trim();
  clean = clean.replace(/&amp;/g, '&').replace(/[)\].,;]+$/g, '').replace(/^http:\/\//i, 'https://');
  if (clean.startsWith('//')) clean = `https:${clean}`;
  clean = clean.split('?')[0].replace(/\/$/, '');
  clean = clean.replace(/^https:\/\/www\./i, 'https://');
  return clean.toLowerCase();
}

function inferRegion(text = '') {
  const clean = String(text || '').toLowerCase();
  const regions = [
    'Campo Grande','Cosmos','Paciência','Santa Cruz','Bangu','Realengo','Guaratiba','Sepetiba','Inhoaíba','Senador Camará',
    'Jacarepaguá','Taquara','Curicica','Barra da Tijuca','Recreio','Madureira','Irajá','Méier','Tijuca','Centro',
    'Niterói','Duque de Caxias','Nova Iguaçu','São Gonçalo','Belford Roxo','Nilópolis','São João de Meriti','Queimados'
  ];
  return regions.find(r => clean.includes(r.toLowerCase())) || 'Rio de Janeiro';
}

function inferCategory(text = '') {
  const clean = String(text || '').toLowerCase();
  if (/compra|venda|desapego|classificados|baz(ar|ar)/.test(clean)) return 'Compra e Venda';
  if (/servi[cç]os|obra|reforma|constru[cç][aã]o|pedreiro|serralheiro|toldo/.test(clean)) return 'Serviços';
  if (/moradores|bairro|comunidade|not[ií]cias/.test(clean)) return 'Moradores';
  if (/emprego|vagas|trabalho/.test(clean)) return 'Empregos';
  return 'Geral';
}

function parseMembers(text = '') {
  const clean = String(text || '').toLowerCase().replace(/\s+/g, ' ');
  const m = clean.match(/([0-9]+(?:[\.,][0-9]+)?)\s*(mil|mi|k)?\s*(?:membros|members)/i);
  if (!m) return 0;
  let n = parseFloat(m[1].replace(',', '.')) || 0;
  if (m[2] === 'mil' || m[2] === 'k') n *= 1000;
  if (m[2] === 'mi') n *= 1000000;
  return Math.round(n);
}

function stripHtml(text = '') {
  return String(text || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function fetchText(targetUrl) {
  return new Promise((resolve) => {
    const req = https.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.6'
      },
      timeout: 12000
    }, (resp) => {
      let data = '';
      resp.on('data', chunk => { data += chunk; if (data.length > 2500000) req.destroy(); });
      resp.on('end', () => resolve(data));
    });
    req.on('timeout', () => { req.destroy(); resolve(''); });
    req.on('error', () => resolve(''));
  });
}

async function searchPublicFacebookGroups({ query = '', limit = 30 } = {}) {
  const baseTerms = [
    'site:facebook.com/groups Rio de Janeiro membros grupo',
    'site:facebook.com/groups Campo Grande RJ membros grupo',
    'site:facebook.com/groups Zona Oeste RJ compra venda membros',
    'site:facebook.com/groups serviços Rio de Janeiro membros',
    'site:facebook.com/groups moradores Rio de Janeiro membros'
  ];
  const terms = String(query || '').trim()
    ? [`site:facebook.com/groups ${String(query).slice(0, 80)} Rio de Janeiro membros`, ...baseTerms]
    : baseTerms;

  const found = new Map();
  for (const term of terms.slice(0, 6)) {
    if (found.size >= limit) break;
    const html = await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(term)}&count=20&setlang=pt-BR`);
    if (!html) continue;

    const linkMatches = html.match(/https?:\/\/(?:www\.)?facebook\.com\/groups\/[^\s"'<>]+/gi) || [];
    for (const rawLink of linkMatches) {
      const url = normalizeGroupUrl(rawLink);
      if (!url || found.has(url)) continue;
      found.set(url, { url, name: friendlyNameFromUrl(url), region: inferRegion(term), categoria: inferCategory(term), membros: 0, status: 'publico', snippet: '' });
    }

    const blocks = html.split(/<li class="b_algo"|<h2/i).slice(1);
    for (const block of blocks) {
      const url = normalizeGroupUrl(block);
      if (!url || found.has(url)) continue;
      const title = stripHtml((block.match(/<a[^>]*>([\s\S]*?)<\/a>/i) || [,''])[1]);
      const snippet = stripHtml((block.match(/<p[^>]*>([\s\S]*?)<\/p>/i) || [,''])[1]);
      const text = `${title} ${snippet}`;
      found.set(url, {
        url,
        name: title && !/facebook|entrar|login/i.test(title) ? title.slice(0, 120) : friendlyNameFromUrl(url),
        region: inferRegion(text || term),
        categoria: inferCategory(text || term),
        membros: parseMembers(text),
        status: /privado|private/i.test(text) ? 'privado' : 'publico',
        snippet: snippet.slice(0, 220)
      });
    }
  }
  return Array.from(found.values()).slice(0, limit);
}

function friendlyNameFromUrl(url = '') {
  const id = String(url).match(/groups\/([^/?#]+)/i)?.[1] || '';
  const clean = decodeURIComponent(id).replace(/[-_]+/g, ' ').trim();
  if (clean && !/^\d+$/.test(clean)) return clean.replace(/\b\w/g, c => c.toUpperCase()).slice(0, 120);
  return clean ? `Grupo Facebook ${clean}` : 'Grupo Facebook RJ';
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 80e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { resolve({}); }
    });
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(header.split(';').filter(Boolean).map(part => {
    const index = part.indexOf('=');
    if (index === -1) return [part.trim(), ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }));
}

function isLogged(req) {
  const cookies = parseCookies(req);
  return cookies.ideal_admin && sessions.has(cookies.ideal_admin);
}

function deviceFromUA(ua = '') {
  const text = ua.toLowerCase();
  if (/tablet|ipad/.test(text)) return 'Tablet';
  if (/mobile|android|iphone/.test(text)) return 'Mobile';
  return 'Desktop';
}

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .toString()
    .split(',')[0]
    .trim()
    .replace('::ffff:', '');
}

function maskIp(ip = '') {
  const clean = String(ip || '').trim();
  if (!clean) return 'Não identificado';
  if (clean.includes(':')) {
    const parts = clean.split(':').filter(Boolean);
    return parts.length ? `${parts.slice(0, 3).join(':')}:***` : 'IP protegido';
  }
  const parts = clean.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.***`;
  return clean.slice(0, 7) + '***';
}

function normalizeSource(source) {
  const clean = String(source || 'direto').trim().slice(0, 90);
  return clean || 'direto';
}

function registerEvent(req, body, eventType = 'visita') {
  const clicks = readClicks();
  const ip = getClientIp(req);
  const ignoredIps = readIgnoredIps();
  // Não contabiliza visitas do admin logado nem IPs marcados como ignorados.
  if (isLogged(req) || ignoredIps.includes(ip)) {
    return clicks;
  }
  const ua = req.headers['user-agent'] || '';
  const url = String(body.page || '/').slice(0, 180);
  const source = normalizeSource(body.source);
  const eventName = String(eventType || body.eventType || 'visita').slice(0, 40);
  const ipHash = crypto.createHash('sha256').update(ip + 'ideal-toldos').digest('hex').slice(0, 12);
  const today = new Date().toISOString().slice(0, 10);
  const repeatToday = clicks.some(c =>
    (c.createdAt || '').slice(0, 10) === today &&
    c.ipHash === ipHash &&
    c.source === source &&
    (c.eventType || 'visita') === eventName
  );

  clicks.push({
    createdAt: new Date().toISOString(),
    eventType: eventName,
    source,
    page: url,
    referrer: String(body.referrer || '').slice(0, 220),
    device: deviceFromUA(ua),
    ipMasked: maskIp(ip),
    ipHash,
    repeatToday
  });
  writeClicks(clicks);
  return clicks;
}

function countBy(items, key) {
  const out = {};
  for (const item of items) out[item[key] || 'Não identificado'] = (out[item[key] || 'Não identificado'] || 0) + 1;
  return Object.entries(out).sort((a,b)=>b[1]-a[1]).map(([name,total])=>({ name, total }));
}

function statsFromClicks(clicks) {
  const today = new Date().toISOString().slice(0, 10);
  const visits = clicks.filter(c => c.eventType === 'visita' || !c.eventType);
  const whatsapp = clicks.filter(c => c.eventType === 'whatsapp');
  const quote = clicks.filter(c => c.eventType === 'orcamento');
  const todayItems = clicks.filter(c => (c.createdAt || '').slice(0, 10) === today);
  const uniqueToday = new Set(todayItems.map(c => c.ipHash)).size;

  const bySource = countBy(clicks, 'source').map(i => ({ source: i.name, total: i.total }));
  const byDevice = countBy(clicks, 'device').map(i => ({ device: i.name, total: i.total }));
  const byEvent = countBy(clicks, 'eventType').map(i => ({ eventType: i.name, total: i.total }));
  const byIp = countBy(clicks, 'ipHash').map(i => {
    const found = clicks.slice().reverse().find(c => c.ipHash === i.name) || {};
    return {
      ipHash: i.name,
      ipMasked: found.ipMasked || 'IP protegido',
      total: i.total,
      lastSource: found.source || '-',
      lastAccess: found.createdAt || ''
    };
  });

  const byDayMap = {};
  for (const c of clicks) {
    const day = (c.createdAt || '').slice(0, 10) || 'sem-data';
    byDayMap[day] = (byDayMap[day] || 0) + 1;
  }

  return {
    total: clicks.length,
    visitsTotal: visits.length,
    today: todayItems.length,
    uniqueToday,
    whatsappTotal: whatsapp.length,
    quoteTotal: quote.length,
    bySource,
    byDevice,
    byEvent,
    byIp,
    byDay: Object.entries(byDayMap).sort((a,b)=>a[0].localeCompare(b[0])).map(([day,total])=>({day,total})),
    recent: clicks.slice(-120).reverse()
  };
}


function statsFromGroups(groups) {
  const totalMembers = groups.reduce((sum, g) => sum + (Number(g.membros || g.members || 0) || 0), 0);
  return {
    totalGroups: groups.length,
    totalMembers,
    byRegion: countBy(groups.map(g => ({ region: g.region || g.bairro || 'Rio de Janeiro' })), 'region'),
    byCategory: countBy(groups.map(g => ({ categoria: g.categoria || g.category || 'Geral' })), 'categoria')
  };
}

function serveFile(req, res) {
  const safeUrl = decodeURIComponent(req.url.split('?')[0]);
  let requested = safeUrl === '/' ? 'index.html' : safeUrl.replace(/^\/+/, '');
  if (safeUrl === '/admin') requested = 'admin.html';
  if (safeUrl === '/login') requested = 'login.html';

  if ((requested === 'admin.html' || requested === 'admin-galeria.html' || requested.startsWith('data/')) && !isLogged(req)) {
    res.writeHead(302, { Location: '/login.html' });
    return res.end();
  }

  let filePath;
  if (requested.startsWith('assets/uploads/')) {
    const uploadName = path.basename(requested);
    filePath = path.join(uploadsDir, uploadName);
    if (!fs.existsSync(filePath)) filePath = path.join(root, requested);
  } else {
    filePath = path.join(root, requested);
  }
  if (!filePath.startsWith(root) && !filePath.startsWith(uploadsDir)) filePath = path.join(root, 'index.html');

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});
      return res.end('Arquivo não encontrado');
    }
    res.writeHead(200, {
      'Content-Type': types[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': requested.endsWith('.html') ? 'no-store' : 'public, max-age=3600'
    });
    res.end(data);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'POST' && url.pathname === '/api/login') {
    const body = await readBody(req);
    if (body.user === ADMIN_USER && body.password === ADMIN_PASS) {
      const token = crypto.randomBytes(32).toString('hex');
      sessions.add(token);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': `ideal_admin=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`
      });
      return res.end(JSON.stringify({ ok: true }));
    }
    return sendJson(res, 401, { ok: false, message: 'Usuário ou senha inválidos' });
  }

  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const token = parseCookies(req).ideal_admin;
    if (token) sessions.delete(token);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': 'ideal_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'
    });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/ip') {
    if (!isLogged(req)) return sendJson(res, 401, { ok: false });
    const ip = getClientIp(req);
    const ignored = readIgnoredIps().includes(ip);
    return sendJson(res, 200, { ok: true, ip, ipMasked: maskIp(ip), ignored });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/ignore-my-ip') {
    if (!isLogged(req)) return sendJson(res, 401, { ok: false });
    const ip = getClientIp(req);
    const items = readIgnoredIps();
    if (!items.includes(ip)) items.push(ip);
    writeIgnoredIps(items);
    return sendJson(res, 200, { ok: true, ipMasked: maskIp(ip), message: 'Seu IP foi marcado para não contar como visita.' });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/unignore-my-ip') {
    if (!isLogged(req)) return sendJson(res, 401, { ok: false });
    const ip = getClientIp(req);
    writeIgnoredIps(readIgnoredIps().filter(item => item !== ip));
    return sendJson(res, 200, { ok: true, ipMasked: maskIp(ip), message: 'Seu IP voltou a contar visitas.' });
  }

  if (req.method === 'POST' && url.pathname === '/api/track') {
    const body = await readBody(req);
    registerEvent(req, body, body.eventType || 'visita');
    return sendJson(res, 200, { ok: true });
  }



  if (req.method === 'POST' && url.pathname === '/api/clients') {
    const body = await readBody(req);
    const nome = String(body.nome || body.name || '').trim().slice(0, 120);
    const telefoneRaw = String(body.telefone || body.phone || body.whatsapp || '').trim().slice(0, 60);
    const telefone = normalizePhone(telefoneRaw);
    const bairro = String(body.bairro || '').trim().slice(0, 120);
    const servico = String(body.servico || body.service || '').trim().slice(0, 120);
    const observacao = String(body.observacao || body.obs || '').trim().slice(0, 600);

    if (!nome || !telefone) {
      return sendJson(res, 400, { ok: false, message: 'Nome e telefone são obrigatórios.' });
    }

    const clients = readClients();
    const duplicated = clients.find(c =>
      normalizePhone(c.telefone) === telefone &&
      String(c.nome || '').trim().toLowerCase() === nome.toLowerCase()
    );

    if (duplicated) {
      return sendJson(res, 409, { ok: false, message: 'Cliente já cadastrado com esse nome e telefone.', client: duplicated });
    }

    const item = {
      id: crypto.randomBytes(8).toString('hex'),
      nome,
      telefone,
      bairro,
      servico,
      observacao,
      origem: 'site',
      createdAt: new Date().toISOString()
    };

    clients.push(item);
    writeClients(clients);
    registerEvent(req, { eventType: 'cadastro_cliente', source: 'site' }, 'cadastro_cliente');
    return sendJson(res, 200, { ok: true, client: item, message: 'Cliente cadastrado com sucesso.' });
  }

  if (req.method === 'GET' && url.pathname === '/api/clients') {
    if (!isLogged(req)) return sendJson(res, 401, { ok: false });
    return sendJson(res, 200, { ok: true, clients: readClients() });
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/clients/')) {
    if (!isLogged(req)) return sendJson(res, 401, { ok: false });
    const id = decodeURIComponent(url.pathname.replace('/api/clients/', ''));
    writeClients(readClients().filter(c => c.id !== id));
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/groups') {
    if (!isLogged(req)) return sendJson(res, 401, { ok: false });
    return sendJson(res, 200, { ok: true, groups: readGroups() });
  }


  if (req.method === 'GET' && url.pathname === '/api/groups/stats') {
    if (!isLogged(req)) return sendJson(res, 401, { ok: false });
    return sendJson(res, 200, { ok: true, ...statsFromGroups(readGroups()) });
  }

  if (req.method === 'POST' && url.pathname === '/api/groups/search') {
    if (!isLogged(req)) return sendJson(res, 401, { ok: false });
    const body = await readBody(req);
    const query = String(body.query || '').trim();
    const limit = Math.min(Math.max(Number(body.limit || 30) || 30, 5), 80);
    const results = await searchPublicFacebookGroups({ query, limit });
    return sendJson(res, 200, { ok: true, results, total: results.length, message: results.length ? 'Busca concluída.' : 'Nenhum grupo público encontrado nessa busca.' });
  }

  if (req.method === 'POST' && url.pathname === '/api/groups') {
    if (!isLogged(req)) return sendJson(res, 401, { ok: false });
    const body = await readBody(req);
    const name = String(body.name || '').trim().slice(0, 120);
    const groupUrlRaw = String(body.url || '').trim().slice(0, 500);
    const groupUrl = normalizeGroupUrl(groupUrlRaw) || groupUrlRaw.replace(/\/$/, '');
    const region = String(body.region || body.bairro || '').trim().slice(0, 120);
    const membros = Number(body.membros || body.members || 0) || 0;
    const categoria = String(body.categoria || body.category || inferCategory(name + ' ' + region)).trim().slice(0, 80);
    const status = String(body.status || 'publico').trim().slice(0, 40);
    if (!name || !groupUrl) return sendJson(res, 400, { ok: false, message: 'Nome e link são obrigatórios' });
    if (!/^https?:\/\//i.test(groupUrl)) return sendJson(res, 400, { ok: false, message: 'Link inválido. Use um link completo com https://.' });
    const groups = readGroups();
    const newKey = canonicalGroupUrl(groupUrl);
    const duplicated = groups.find(g => canonicalGroupUrl(g.url) === newKey);
    if (duplicated) return sendJson(res, 409, { ok: false, message: 'Esse link já está cadastrado. Link repetido não será aceito.', group: duplicated });
    const sourceBase = `grupo_${slug(name)}`;
    let source = sourceBase;
    let count = 2;
    while (groups.some(g => g.source === source)) source = `${sourceBase}_${count++}`;
    const item = {
      id: crypto.randomBytes(8).toString('hex'),
      name,
      url: groupUrl,
      region,
      membros,
      categoria,
      status,
      source,
      ultimaAtualizacao: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    groups.push(item);
    writeGroups(groups);
    return sendJson(res, 200, { ok: true, group: item, message: 'Grupo salvo com sucesso.' });
  }


  if (req.method === 'POST' && url.pathname === '/api/groups/import') {
    if (!isLogged(req)) return sendJson(res, 401, { ok: false });
    const body = await readBody(req);
    const incoming = Array.isArray(body.groups) ? body.groups : [];
    const groups = readGroups();
    let imported = 0;
    let duplicates = 0;


    for (const raw of incoming.slice(0, 300)) {
      const name = String(raw.name || '').trim().slice(0, 120);
      const groupUrlRaw = String(raw.url || '').trim().slice(0, 500);
      const groupUrl = normalizeGroupUrl(groupUrlRaw) || groupUrlRaw.replace(/\/$/, '');
      const region = String(raw.region || raw.bairro || '').trim().slice(0, 120);
      const membros = Number(raw.membros || raw.members || 0) || 0;
      const categoria = String(raw.categoria || raw.category || inferCategory(name + ' ' + region)).trim().slice(0, 80);
      const status = String(raw.status || 'publico').trim().slice(0, 40);
      if (!name || !/^https?:\/\//i.test(groupUrl)) continue;
      const key = canonicalGroupUrl(groupUrl);
      if (groups.some(g => canonicalGroupUrl(g.url) === key)) { duplicates++; continue; }

      const sourceBase = `grupo_${slug(name)}`;
      let source = sourceBase;
      let count = 2;
      while (groups.some(g => g.source === source)) source = `${sourceBase}_${count++}`;

      groups.push({
        id: crypto.randomBytes(8).toString('hex'),
        name,
        url: groupUrl,
        region,
        membros,
        categoria,
        status,
        source,
        ultimaAtualizacao: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });
      imported++;
    }

    writeGroups(groups);
    const message = `${imported} grupo(s) importado(s). ${duplicates} repetido(s) ignorado(s).`;
    return sendJson(res, 200, { ok: true, imported, duplicates, total: groups.length, message });
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/groups/') && url.pathname.endsWith('/posted')) {
    if (!isLogged(req)) return sendJson(res, 401, { ok: false });
    const id = decodeURIComponent(url.pathname.replace('/api/groups/', '').replace('/posted', ''));
    const groups = readGroups();
    const index = groups.findIndex(g => g.id === id);
    if (index === -1) return sendJson(res, 404, { ok: false, message: 'Grupo não encontrado.' });

    const now = new Date().toISOString();
    groups[index] = { ...groups[index], lastPostedAt: now, ultimaPostagem: now, ultimaAtualizacao: now };
    writeGroups(groups);

    const group = groups[index];
    const regionText = `${group.region || ''} ${group.name || ''}`;
    const regionUpdate = incrementRegionByText(regionText);
    const bairros = (regionUpdate.items || []).map(item => item.bairro).join(', ');
    const message = regionUpdate.cycleReset
      ? 'Postagem marcada. Todas as regiões bateram a meta e o ciclo foi reiniciado.'
      : (regionUpdate.matched ? `Postagem marcada. Bairro(s) contabilizado(s): ${bairros}.` : 'Postagem marcada. Nenhum bairro correspondente foi encontrado no controle de região.');

    return sendJson(res, 200, { ok: true, group: groups[index], regionUpdate, message });
  }

  if (req.method === 'PUT' && url.pathname.startsWith('/api/groups/')) {
    if (!isLogged(req)) return sendJson(res, 401, { ok: false });
    const id = decodeURIComponent(url.pathname.replace('/api/groups/', ''));
    const body = await readBody(req);
    const groups = readGroups();
    const index = groups.findIndex(g => g.id === id);
    if (index === -1) return sendJson(res, 404, { ok: false, message: 'Grupo não encontrado.' });

    const name = String(body.name || '').trim().slice(0, 120);
    const groupUrlRaw = String(body.url || '').trim().slice(0, 500);
    const groupUrl = normalizeGroupUrl(groupUrlRaw) || groupUrlRaw.replace(/\/$/, '');
    const region = String(body.region || body.bairro || '').trim().slice(0, 120);
    const membros = Number(body.membros || body.members || 0) || 0;
    const categoria = String(body.categoria || body.category || inferCategory(name + ' ' + region)).trim().slice(0, 80);
    const status = String(body.status || 'publico').trim().slice(0, 40);

    if (!name || !groupUrl) return sendJson(res, 400, { ok: false, message: 'Nome e link são obrigatórios' });
    if (!/^https?:\/\//i.test(groupUrl)) return sendJson(res, 400, { ok: false, message: 'Link inválido. Use um link completo com https://.' });

    const newKey = canonicalGroupUrl(groupUrl);
    const duplicated = groups.find(g => g.id !== id && canonicalGroupUrl(g.url) === newKey);
    if (duplicated) return sendJson(res, 409, { ok: false, message: 'Esse link já está cadastrado em outro grupo. Link repetido não será aceito.', group: duplicated });

    groups[index] = {
      ...groups[index],
      name,
      url: groupUrl,
      region,
      membros,
      categoria,
      status,
      ultimaAtualizacao: new Date().toISOString()
    };
    writeGroups(groups);
    return sendJson(res, 200, { ok: true, group: groups[index] });
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/groups/')) {
    if (!isLogged(req)) return sendJson(res, 401, { ok: false });
    const id = decodeURIComponent(url.pathname.replace('/api/groups/', ''));
    writeGroups(readGroups().filter(g => g.id !== id));
    return sendJson(res, 200, { ok: true });
  }


  if (req.method === 'GET' && url.pathname === '/api/regions') {
    if (!isLogged(req)) return sendJson(res, 401, { ok: false });
    const regions = readRegions();
    return sendJson(res, 200, { ok: true, regions, ...regionStats(regions) });
  }

  if (req.method === 'PUT' && url.pathname.startsWith('/api/regions/')) {
    if (!isLogged(req)) return sendJson(res, 401, { ok: false });
    const id = decodeURIComponent(url.pathname.replace('/api/regions/', ''));
    const body = await readBody(req);
    const regions = readRegions();
    const index = regions.findIndex(item => item.id === id);
    if (index === -1) return sendJson(res, 404, { ok: false, message: 'Região/bairro não encontrado.' });
    const status = body.status === 'divulgando' ? 'divulgando' : 'pendente';
    const goal = regionGoal(regions[index]);
    const count = status === 'divulgando' ? goal : 0;
    regions[index] = { ...regions[index], count, goal, status, updatedAt: new Date().toISOString() };
    writeRegions(regions);
    return sendJson(res, 200, { ok: true, item: regions[index], regions, ...regionStats(regions) });
  }

  if (req.method === 'POST' && url.pathname === '/api/regions/reset') {
    if (!isLogged(req)) return sendJson(res, 401, { ok: false });
    const body = await readBody(req);
    const status = body.status === 'divulgando' ? 'divulgando' : 'pendente';
    const now = new Date().toISOString();
    const regions = readRegions().map(item => {
      const goal = regionGoal(item);
      const count = status === 'divulgando' ? goal : 0;
      return { ...item, count, goal, status, updatedAt: now };
    });
    writeRegions(regions);
    return sendJson(res, 200, { ok: true, regions, ...regionStats(regions) });
  }

  if (req.method === 'GET' && url.pathname === '/api/gallery') {
    const category = url.searchParams.get('category');
    let photos = recoverGalleryFromUploads().map(publicGalleryPhoto).slice().reverse();
    if (category) {
      const cat = normalizeGalleryCategory(category);
      if (cat) photos = photos.filter(item => galleryPhotoCategory(item) === cat);
    }
    return sendJson(res, 200, { ok: true, categories: GALLERY_CATEGORIES, photos: withGalleryLikes(photos) });
  }

  if (req.method === 'POST' && url.pathname === '/api/gallery') {
    if (!isLogged(req)) return sendJson(res, 401, { ok: false });
    const body = await readBody(req);
    const category = normalizeGalleryCategory(body.category || 'toldo-cortina');
    const title = String(body.title || GALLERY_CATEGORIES[category]).trim().slice(0, 120);
    const files = Array.isArray(body.files) ? body.files.slice(0, 12) : [];
    if (!files.length) return sendJson(res, 400, { ok: false, message: 'Selecione pelo menos uma foto.' });
    const gallery = readGallery();
    const saved = [];
    for (const file of files) {
      const dataUrl = String(file.data || '');
      const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
      if (!match) continue;
      const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
      const buffer = Buffer.from(match[2], 'base64');
      if (!buffer.length || buffer.length > 8 * 1024 * 1024) continue;
      const id = crypto.randomBytes(8).toString('hex');
      const filename = `galeria-${category}-${Date.now()}-${id}.${ext}`;
      const filepath = path.join(uploadsDir, filename);
      fs.writeFileSync(filepath, buffer);
      const item = {
        id,
        category,
        categoryLabel: GALLERY_CATEGORIES[category],
        title: String(file.title || title || GALLERY_CATEGORIES[category]).trim().slice(0, 120),
        src: `/assets/uploads/${filename}`,
        createdAt: new Date().toISOString()
      };
      gallery.push(item);
      saved.push(item);
    }
    if (!saved.length) return sendJson(res, 400, { ok: false, message: 'Nenhuma imagem válida foi enviada. Use JPG, PNG ou WEBP com até 8MB.' });
    writeGallery(gallery);
    return sendJson(res, 200, { ok: true, saved, photos: readGallery().slice().reverse() });
  }


  if (req.method === 'POST' && url.pathname.startsWith('/api/gallery-like/')) {
    const id = decodeURIComponent(url.pathname.replace('/api/gallery-like/', ''));
    const gallery = readGallery();
    const item = gallery.find(photo => photo.id === id);
    if (!item) return sendJson(res, 404, { ok: false, message: 'Foto não encontrada.' });
    const likes = readGalleryLikes();
    likes[id] = Math.max(0, Number(likes[id] || item.likes || 0)) + 1;
    writeGalleryLikes(likes);
    return sendJson(res, 200, { ok: true, id, likes: likes[id] });
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/gallery/')) {
    if (!isLogged(req)) return sendJson(res, 401, { ok: false });
    const id = decodeURIComponent(url.pathname.replace('/api/gallery/', ''));
    const gallery = readGallery();
    const item = gallery.find(photo => photo.id === id);
    if (item && item.src && item.src.startsWith('/assets/uploads/')) {
      const filePath = path.join(uploadsDir, path.basename(item.src));
      if (filePath.startsWith(uploadsDir) && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    }
    writeGallery(gallery.filter(photo => photo.id !== id));
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/stats') {
    if (!isLogged(req)) return sendJson(res, 401, { ok: false });
    return sendJson(res, 200, { ok: true, ...statsFromClicks(readClicks()) });
  }

  if (req.method === 'POST' && url.pathname === '/api/clear-stats') {
    if (!isLogged(req)) return sendJson(res, 401, { ok: false });
    writeClicks([]);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method !== 'GET') return sendJson(res, 405, { ok: false });
  serveFile(req, res);
}).listen(port, () => console.log(`Ideal Toldos site running on ${port}`));
