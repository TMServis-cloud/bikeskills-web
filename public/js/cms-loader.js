/**
 * BIKESKILLS CMS Loader
 * Načítá akce, články a tým z Firebase Firestore a renderuje do Webflow HTML struktury.
 */

// ============================================================
// FIREBASE CONFIG
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyD-DnZA0IV6S7iGTAayrMdxSyndNJ8JqZM",
  authDomain: "bikeskills-web.firebaseapp.com",
  projectId: "bikeskills-web",
  storageBucket: "bikeskills-web.firebasestorage.app",
  messagingSenderId: "804622076781",
  appId: "1:804622076781:web:0cc99211c3c36f27842864",
  measurementId: "G-Y1GJE85WDX"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();

// ============================================================
// HELPERS
// ============================================================
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

function getWebflowList(containerSelector) {
  const list = document.querySelector(containerSelector);
  if (!list) return null;
  const itemsList = list.querySelector('.w-dyn-items');
  if (!itemsList) return null;
  const template = itemsList.querySelector('.w-dyn-item');
  if (!template) return null;
  const emptyEl = list.querySelector('.w-dyn-empty');
  return { itemsList, template, emptyEl };
}

function toggleEmpty(emptyEl, hasItems) {
  if (!emptyEl) return;
  emptyEl.style.display = hasItems ? 'none' : '';
}

/** Převede YouTube URL (libovolný formát) na embed URL */
function youtubeEmbedUrl(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

/** Normalizuje typAkce — sjednotí kapitalizaci (první písmeno velké) */
function normalizeTypAkce(val) {
  if (!val) return '';
  return val.charAt(0).toUpperCase() + val.slice(1);
}

function setPageMeta(title, description, imageUrl) {
  document.title = title;
  const stripped = (description || '').replace(/<[^>]*>/g, '').trim();
  const desc = stripped.length > 160 ? stripped.substring(0, 157) + '…' : stripped;
  const set = (sel, val) => { const el = document.querySelector(sel); if (el && val) el.setAttribute('content', val); };
  set('meta[name="description"]', desc);
  set('meta[property="og:title"]', title);
  set('meta[property="og:description"]', desc);
  set('meta[property="twitter:title"]', title);
  set('meta[property="twitter:description"]', desc);
  if (imageUrl) {
    set('meta[property="og:image"]', imageUrl);
    set('meta[property="twitter:image"]', imageUrl);
  }
}

/** Sestaví HTML pro YouTube embed */
function youtubeEmbedHtml(url) {
  const embedUrl = youtubeEmbedUrl(url);
  if (!embedUrl) return '';
  return `<div class="video-embed-wrapper" style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin:1.5rem 0;">
    <iframe src="${embedUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allowfullscreen loading="lazy"></iframe>
  </div>`;
}

/** Sestaví HTML pro galerii obrázků */
function galleryHtml(images) {
  if (!images || !images.length) return '';
  const items = images.filter(Boolean).map(url =>
    `<div class="gallery-item"><img src="${escapeHtml(url)}" loading="lazy" style="width:100%;height:200px;object-fit:cover;border-radius:4px;"></div>`
  ).join('');
  if (!items) return '';
  return `<div class="akce-galerie" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0.75rem;margin:1.5rem 0;">${items}</div>`;
}

// ============================================================
// LIGHTBOX
// ============================================================
(function initLightboxStyles() {
  const style = document.createElement('style');
  style.textContent = `
#bs-lightbox{display:none;position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:999999;align-items:center;justify-content:center;cursor:zoom-out}
#bs-lightbox.open{display:flex}
#bs-lightbox img{max-width:90vw;max-height:88vh;object-fit:contain;border-radius:4px;cursor:default;box-shadow:0 0 60px rgba(0,0,0,.9)}
#bs-lightbox .lb-close{position:absolute;top:.75rem;right:1.25rem;color:#fff;font-size:2.2rem;cursor:pointer;line-height:1;opacity:.8;user-select:none}
#bs-lightbox .lb-close:hover{opacity:1}
#bs-lightbox .lb-prev,#bs-lightbox .lb-next{position:absolute;top:50%;transform:translateY(-50%);color:#fff;font-size:3rem;cursor:pointer;padding:.5rem 1rem;user-select:none;opacity:.6;transition:opacity .2s}
#bs-lightbox .lb-prev{left:0}#bs-lightbox .lb-next{right:0}
#bs-lightbox .lb-prev:hover,#bs-lightbox .lb-next:hover{opacity:1}
#bs-lightbox .lb-counter{position:absolute;bottom:1rem;left:50%;transform:translateX(-50%);color:#fff;font-size:.85rem;opacity:.6}
  `;
  document.head.appendChild(style);
})();

let _lbImages = [], _lbIndex = 0;

function openLightbox(imgs, idx) {
  let lb = document.getElementById('bs-lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'bs-lightbox';
    lb.innerHTML = '<span class="lb-close">&times;</span><span class="lb-prev">&#8249;</span><img src="" alt=""><span class="lb-next">&#8250;</span><span class="lb-counter"></span>';
    document.body.appendChild(lb);
    lb.querySelector('.lb-close').addEventListener('click', () => lb.classList.remove('open'));
    lb.addEventListener('click', e => { if (e.target === lb) lb.classList.remove('open'); });
    lb.querySelector('.lb-prev').addEventListener('click', e => { e.stopPropagation(); lbNav(-1); });
    lb.querySelector('.lb-next').addEventListener('click', e => { e.stopPropagation(); lbNav(1); });
    document.addEventListener('keydown', e => {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') lb.classList.remove('open');
      if (e.key === 'ArrowLeft') lbNav(-1);
      if (e.key === 'ArrowRight') lbNav(1);
    });
  }
  _lbImages = imgs; _lbIndex = idx;
  lbShow();
  lb.classList.add('open');
}

function lbNav(dir) {
  _lbIndex = (_lbIndex + dir + _lbImages.length) % _lbImages.length;
  lbShow();
}

function lbShow() {
  const lb = document.getElementById('bs-lightbox');
  if (!lb) return;
  const img = lb.querySelector('img');
  const counter = lb.querySelector('.lb-counter');
  const prev = lb.querySelector('.lb-prev');
  const next = lb.querySelector('.lb-next');
  img.src = _lbImages[_lbIndex];
  if (counter) counter.textContent = _lbImages.length > 1 ? `${_lbIndex + 1} / ${_lbImages.length}` : '';
  const show = _lbImages.length > 1;
  if (prev) prev.style.display = show ? '' : 'none';
  if (next) next.style.display = show ? '' : 'none';
}

function attachLightbox(containerEl, imgSelector) {
  if (!containerEl) return;
  const allImgs = Array.from(containerEl.querySelectorAll(imgSelector || 'img'))
    .filter(el => el.src && !el.src.endsWith('#'));
  if (!allImgs.length) return;
  // Použij data-full-url (WP galerie) pokud existuje, jinak src
  const srcs = allImgs.map(el => el.getAttribute('data-full-url') || el.src);
  allImgs.forEach((el, i) => {
    el.style.cursor = 'zoom-in';
    el.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openLightbox(srcs, i); });
  });
}

// Vrátí true pokud je odkaz externí (jiná doména nebo subdoména)
function isExternalLink(href) {
  if (!href || !href.startsWith('http')) return false;
  try {
    const url = new URL(href);
    const h = url.hostname;
    // Interní: bikeskills.cz, www.bikeskills.cz, bikeskills-web.web.app, localhost
    if (h === 'bikeskills.cz' || h === 'www.bikeskills.cz') return false;
    if (h === window.location.hostname) return false;
    return true;
  } catch { return false; }
}

// Přidá target="_blank" rel="noopener" na všechny externí linky v kontejneru
function externalLinksNewTab(containerEl) {
  if (!containerEl) return;
  containerEl.querySelectorAll('a[href]').forEach(a => {
    if (isExternalLink(a.getAttribute('href') || '')) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

// ============================================================
// PAGE DETECTION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Globálně: všechny externí linky otevřít v novém okně
  externalLinksNewTab(document.body);

  const path = window.location.pathname;

  if (path === '/' || path === '/index.html' || path === '/index') {
    loadAkcePreview();
    loadClankyPreview();
  }

  if (path === '/akce-archive' || path === '/akce-archive.html' || path === '/akce-archive/'
      || path === '/akce' || path === '/akce/') {
    loadAkceList();
  }

  if (path === '/blog' || path === '/blog.html' || path === '/blog/') {
    loadClankyList();
  }

  if (path.startsWith('/blog/') && path.length > '/blog/'.length) {
    const slug = path.replace('/blog/', '').replace(/\/$/, '');
    if (slug) loadClanekDetail(slug);
  }

  if (path.startsWith('/detail_akce') || (path.startsWith('/akce/') && path.length > '/akce/'.length)) {
    const slug = path.includes('/akce/') ? path.replace('/akce/', '').replace(/\/$/, '') : null;
    if (slug) loadAkceDetail(slug);
  }

  if (path === '/team' || path === '/team.html' || path === '/team/') {
    loadTeamList();
  }

  if (path.startsWith('/detail_archive-team') || (path.startsWith('/team/') && path.length > '/team/'.length)) {
    const slug = path.includes('/team/') ? path.replace('/team/', '').replace(/\/$/, '') : null;
    if (slug) loadTeamDetail(slug);
  }
});

// ============================================================
// AKCE
// ============================================================
function renderAkceItem(template, data) {
  const item = template.cloneNode(true);

  const href = `/akce/${data.slug}/`;
  item.querySelectorAll('[item="permalink"], a.akce-box').forEach(el => { el.href = href; });

  const titleEl = item.querySelector('[item="title"], .akce-heading');
  if (titleEl) { titleEl.textContent = data.nazev || ''; titleEl.classList.remove('w-dyn-bind-empty'); }

  const datumEl = item.querySelector('.akce-datum, [acf\\:text="datum"]');
  if (datumEl) { datumEl.textContent = data.datumText || ''; datumEl.classList.remove('w-dyn-bind-empty'); }

  const levelEl = item.querySelector('.akce-level, [acf\\:text="akce-level"]');
  if (levelEl) { levelEl.textContent = data.uroven || ''; levelEl.classList.remove('w-dyn-bind-empty'); }

  const imgEl = item.querySelector('[item="featured-image"], img.image-55');
  if (imgEl) {
    if (data.imageUrl) {
      imgEl.src = data.imageUrl; imgEl.alt = data.nazev || '';
      imgEl.classList.remove('w-dyn-bind-empty');
    } else {
      const imgBlock = imgEl.closest('.akce-image-blok');
      if (imgBlock) imgBlock.style.display = 'none';
    }
  }

  const excerptEl = item.querySelector('.paragraph-2, [item="excerpt"]');
  if (excerptEl) {
    const popis = data.popis || '';
    const stripped = popis.replace(/<[^>]*>/g, '');
    excerptEl.textContent = stripped.length > 150 ? stripped.substring(0, 150) + '…' : stripped;
    excerptEl.classList.remove('w-dyn-bind-empty');
  }

  const ridersEl = item.querySelector('.akce-ridersnumber, [acf\\:text="riders-number"]');
  if (ridersEl) { ridersEl.textContent = data.stavLabel || data.stav || ''; ridersEl.classList.remove('w-dyn-bind-empty'); }

  const cenaEl = item.querySelector('.akce-cena, [acf\\:text="price"]');
  if (cenaEl) {
    if (data.cena) {
      cenaEl.textContent = data.cena.toLocaleString('cs-CZ');
      cenaEl.classList.remove('w-dyn-bind-empty');
    } else {
      // Nahraď cenu odkazem na individuální kurzy
      const after = cenaEl.nextElementSibling;
      if (after && after.classList.contains('akce-cena-after')) after.style.display = 'none';
      const popisEl = cenaEl.previousElementSibling;
      if (popisEl && popisEl.classList.contains('akce-popis')) popisEl.style.display = 'none';
      cenaEl.textContent = 'individuální kurzy →';
      cenaEl.style.cssText = 'font-size:0.8em;letter-spacing:0.03em;opacity:0.85;';
      cenaEl.classList.remove('w-dyn-bind-empty');
    }
  }

  return item;
}

async function loadAkcePreview() {
  const wfl = getWebflowList('.collection-list-wrappe-campy');
  if (!wfl) return;
  const { itemsList, template, emptyEl } = wfl;

  try {
    const snapshot = await db.collection('akce').get();
    const today = new Date();
    const todayStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

    const all = snapshot.docs.map(d => d.data()).filter(d => d.aktivni !== false);
    // Nejbližší nadcházející akce seřazené od nejbližšího data
    const upcoming = all
      .filter(d => String(d.datumSort || '0') >= todayStr)
      .sort((a, b) => String(a.datumSort || '0').localeCompare(String(b.datumSort || '0')));
    // Pokud je málo nadcházejících, doplníme nedávno proběhlé
    const past = all
      .filter(d => String(d.datumSort || '0') < todayStr)
      .sort((a, b) => String(b.datumSort || '0').localeCompare(String(a.datumSort || '0')));
    const docs = [...upcoming, ...past].slice(0, 8);

    if (!docs.length) { toggleEmpty(emptyEl, false); itemsList.innerHTML = ''; return; }

    toggleEmpty(emptyEl, true);
    itemsList.innerHTML = '';
    docs.forEach(data => itemsList.appendChild(renderAkceItem(template, data)));
  } catch (err) {
    console.error('Chyba načítání akce preview:', err);
  }
}

// ============================================================
// AKCE LIST — stránkování + filtr
// ============================================================
let allAkceData = [];
let currentAkcePage = 1;
let akceYearFilter = 'all';
let akceZamereniFilter = 'all';
let akceCenaFilter = 'all';

function getYearFromDatumSort(datumSort) {
  if (!datumSort) return null;
  const m = String(datumSort).match(/^(\d{4})/);
  return m ? m[1] : null;
}

function isAkceOdjeto(data) {
  if (!data.datumSort) return false;
  const today = new Date();
  const todayStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  return String(data.datumSort) < todayStr;
}

function injectFilterBar(id, beforeEl) {
  let bar = document.getElementById(id);
  if (!bar) {
    bar = document.createElement('div');
    bar.id = id;
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;padding:1rem 0 1.5rem;';
    beforeEl.parentNode.insertBefore(bar, beforeEl);
  }
  return bar;
}

const SELECT_STYLE = 'background:#1e2021;color:#d0d3c9;border:1.5px solid #545a4f;padding:0.4rem 0.8rem;font-family:inherit;font-size:0.85rem;cursor:pointer;margin-right:0.75rem;';
const BTN_STYLE = 'padding:0.35rem 1.1rem;border:1.5px solid #545a4f;background:transparent;color:#d0d3c9;cursor:pointer;font-size:0.85rem;font-family:inherit;letter-spacing:0.03em;transition:background 0.2s,color 0.2s;';
const BTN_ACTIVE_STYLE = 'padding:0.35rem 1.1rem;border:1.5px solid #545a4f;background:#545a4f;color:#fff;cursor:pointer;font-size:0.85rem;font-family:inherit;letter-spacing:0.03em;transition:background 0.2s,color 0.2s;';
const SEP_STYLE = 'width:1px;height:1.25rem;background:#545a4f;margin:0 0.25rem;align-self:center;flex-shrink:0;';

function makeYearSelect(years, currentYear, onChange) {
  const sel = document.createElement('select');
  sel.setAttribute('style', SELECT_STYLE);
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = 'Všechny roky';
  if (currentYear === 'all') allOpt.selected = true;
  sel.appendChild(allOpt);
  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === currentYear) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

function makeBtn(label, isActive, onClick) {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.setAttribute('style', isActive ? BTN_ACTIVE_STYLE : BTN_STYLE);
  btn.addEventListener('click', onClick);
  return btn;
}

function makeSep() {
  const s = document.createElement('span');
  s.setAttribute('style', SEP_STYLE);
  return s;
}

function makeGenericSelect(options, currentVal, onChange) {
  const sel = document.createElement('select');
  sel.setAttribute('style', SELECT_STYLE);
  options.forEach(([val, label]) => {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    if (val === currentVal) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

function buildAkceFilterBar(bar, years, typy) {
  bar.innerHTML = '';

  bar.appendChild(makeYearSelect(years, akceYearFilter, v => { akceYearFilter = v; currentAkcePage = 1; renderAkceListPage(); }));

  const zamereniOpts = [['all', 'Všechna zaměření'], ...typy.map(t => [t, t])];
  bar.appendChild(makeGenericSelect(zamereniOpts, akceZamereniFilter, v => { akceZamereniFilter = v; currentAkcePage = 1; renderAkceListPage(); }));

  const cenaOpts = [['all', 'Jakákoliv cena'], ['scena', 'S cenou'], ['zdarma', 'Zdarma / ind.']];
  bar.appendChild(makeGenericSelect(cenaOpts, akceCenaFilter, v => { akceCenaFilter = v; currentAkcePage = 1; renderAkceListPage(); }));
}

function buildClankyFilterBar(bar, years) {
  bar.innerHTML = '';
  bar.appendChild(makeYearSelect(years, clankyYearFilter, v => { clankyYearFilter = v; currentClankyPage = 1; renderClankyListPage(); }));
}

/**
 * Post-procesuje WP HTML obsah:
 * - Nahradí wp-block-embed YouTube figury za skutečné iframy
 */
function processWpContent(html) {
  if (!html) return html;
  // Najde <figure class="wp-block-embed..."><div class="wp-block-embed__wrapper">URL</div></figure>
  // a nahradí je responsive iframe wrapperem
  return html.replace(
    /<figure[^>]*wp-block-embed[^>]*>[\s\S]*?<div[^>]*wp-block-embed__wrapper[^>]*>\s*(https?:\/\/[^\s<]+)\s*<\/div>[\s\S]*?<\/figure>/gi,
    (match, url) => {
      const embedUrl = youtubeEmbedUrl(url.trim());
      if (!embedUrl) return match;
      return `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin:1.5rem 0;">` +
        `<iframe src="${embedUrl}" frameborder="0" allowfullscreen loading="lazy" ` +
        `style="position:absolute;top:0;left:0;width:100%;height:100%;"></iframe></div>`;
    }
  );
}

/** Pokud je text bez HTML tagů, zabalí odstavce do <p> */
function ensureHtml(text) {
  if (!text) return '';
  if (/<[a-z][^>]*>/i.test(text)) return text;
  return text.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

function wirePagination(prevBtn, nextBtn, getPage, setPage, getFiltered, render) {
  if (prevBtn) {
    prevBtn.style.cursor = 'pointer';
    prevBtn.addEventListener('click', e => {
      e.preventDefault();
      if (getPage() > 1) { setPage(getPage() - 1); render(); }
    });
  }
  if (nextBtn) {
    nextBtn.style.cursor = 'pointer';
    nextBtn.addEventListener('click', e => {
      e.preventDefault();
      const totalPages = Math.ceil(getFiltered().length / PAGE_SIZE);
      if (getPage() < totalPages) { setPage(getPage() + 1); render(); }
    });
  }
}

function updatePaginationState(prevBtn, nextBtn, currentPage, totalItems) {
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);
  if (prevBtn) prevBtn.style.display = currentPage > 1 ? '' : 'none';
  if (nextBtn) nextBtn.style.display = currentPage < totalPages ? '' : 'none';
}

const PAGE_SIZE = 12;

let _akceFilterBar = null;
let _akceYears = [];
let _akceTypy = [];
let _akcePrevBtn = null;
let _akceNextBtn = null;
let _akceItemsList = null;
let _akceTemplate = null;
let _akceEmptyEl = null;

function getFilteredAkce() {
  return allAkceData.filter(d => {
    const year = getYearFromDatumSort(d.datumSort);
    if (akceYearFilter !== 'all' && year !== akceYearFilter) return false;
    if (akceZamereniFilter !== 'all' && normalizeTypAkce(d.typAkce || '') !== akceZamereniFilter) return false;
    if (akceCenaFilter === 'scena' && !d.cena) return false;
    if (akceCenaFilter === 'zdarma' && d.cena) return false;
    return true;
  });
}

function renderAkceListPage() {
  if (!_akceItemsList || !_akceTemplate) return;

  buildAkceFilterBar(_akceFilterBar, _akceYears, _akceTypy);

  const filtered = getFilteredAkce();
  const start = (currentAkcePage - 1) * PAGE_SIZE;
  const page = filtered.slice(start, start + PAGE_SIZE);

  if (!page.length) {
    toggleEmpty(_akceEmptyEl, false);
    _akceItemsList.innerHTML = '';
  } else {
    toggleEmpty(_akceEmptyEl, true);
    _akceItemsList.innerHTML = '';
    page.forEach(data => _akceItemsList.appendChild(renderAkceItem(_akceTemplate, data)));
  }

  updatePaginationState(_akcePrevBtn, _akceNextBtn, currentAkcePage, filtered.length);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadAkceList() {
  const wfl = getWebflowList('.collection-list-wrappe-campy');
  if (!wfl) return;
  const { itemsList, template, emptyEl } = wfl;

  _akceItemsList = itemsList;
  _akceTemplate = template;
  _akceEmptyEl = emptyEl;

  const listWrapper = document.querySelector('.collection-list-wrappe-campy');
  _akceFilterBar = injectFilterBar('cms-akce-filters', listWrapper);

  const paginationWrapper = document.querySelector('.w-pagination-wrapper.pagination');
  _akcePrevBtn = paginationWrapper ? paginationWrapper.querySelector('.w-pagination-previous') : null;
  _akceNextBtn = paginationWrapper ? paginationWrapper.querySelector('.w-pagination-next') : null;

  wirePagination(
    _akcePrevBtn, _akceNextBtn,
    () => currentAkcePage,
    p => { currentAkcePage = p; },
    getFilteredAkce,
    renderAkceListPage
  );

  try {
    // Bez orderBy — Firestore vylučuje dokumenty bez indexovaného pole
    const snapshot = await db.collection('akce').get();
    allAkceData = snapshot.docs.map(d => d.data())
      .filter(d => d.aktivni !== false)
      .sort((a, b) => String(b.datumSort || '0').localeCompare(String(a.datumSort || '0')));

    const yearSet = new Set();
    const typSet = new Set();
    allAkceData.forEach(d => {
      const y = getYearFromDatumSort(d.datumSort);
      if (y) yearSet.add(y);
      if (d.typAkce) typSet.add(normalizeTypAkce(d.typAkce));
    });
    _akceYears = Array.from(yearSet).sort((a, b) => b - a);
    _akceTypy = Array.from(typSet).sort();

    renderAkceListPage();
  } catch (err) {
    console.error('Chyba načítání akce list:', err);
  }
}

async function loadAkceDetail(slug) {
  const wfl = getWebflowList('.collection-list-wrapper-5');
  if (!wfl) return;
  const { itemsList, template, emptyEl } = wfl;

  try {
    const snapshot = await db.collection('akce').where('slug', '==', slug).limit(1).get();
    if (snapshot.empty) {
      toggleEmpty(emptyEl, false);
      itemsList.innerHTML = '';
      return;
    }

    const data = snapshot.docs[0].data();
    const galerie = (data.galerie && data.galerie.length)
      ? data.galerie.filter(Boolean)
      : [data.galerie1, data.galerie2, data.galerie3, data.galerie4].filter(Boolean);

    const pageHeading = document.querySelector('.page-heading[acf\\:text="typ-akce"]');
    if (pageHeading) {
      pageHeading.textContent = normalizeTypAkce(data.typAkce) || data.nazev || '';
      pageHeading.classList.remove('w-dyn-bind-empty');
    }

    setPageMeta(`${data.nazev} | BikeSkills`, data.popis, data.imageUrl);

    toggleEmpty(emptyEl, true);
    itemsList.innerHTML = '';
    const item = template.cloneNode(true);

    const titleEl = item.querySelector('[item="title"]');
    if (titleEl) { titleEl.textContent = data.nazev || ''; titleEl.classList.remove('w-dyn-bind-empty'); }

    const datumEl = item.querySelector('[acf\\:text="datum"]');
    if (datumEl) { datumEl.textContent = data.datumText || ''; datumEl.classList.remove('w-dyn-bind-empty'); }

    const cenaEl = item.querySelector('[acf\\:text="price"]');
    if (cenaEl) {
      cenaEl.textContent = data.cena ? data.cena.toLocaleString('cs-CZ') : '';
      cenaEl.classList.remove('w-dyn-bind-empty');
    }

    const dobaEl = item.querySelector('[acf\\:text="doba-trvani"]');
    if (dobaEl) { dobaEl.textContent = normalizeTypAkce(data.typAkce || ''); dobaEl.classList.remove('w-dyn-bind-empty'); }

    const ridersEl = item.querySelector('[acf\\:text="riders-number"]');
    if (ridersEl) { ridersEl.textContent = data.stavLabel || data.stav || ''; ridersEl.classList.remove('w-dyn-bind-empty'); }

    const levelEl = item.querySelector('[acf\\:text="akce-level"]');
    if (levelEl) { levelEl.textContent = data.uroven || ''; levelEl.classList.remove('w-dyn-bind-empty'); }

    const imgEl = item.querySelector('img[item="featured-image"]');
    if (imgEl) {
      if (data.imageUrl) {
        imgEl.src = data.imageUrl;
        imgEl.alt = data.nazev || '';
        imgEl.classList.remove('w-dyn-bind-empty');
      } else {
        imgEl.style.display = 'none';
      }
    }

    const contentEl = item.querySelector('[item="content"]');
    if (contentEl) {
      contentEl.innerHTML = ensureHtml(data.popis);
      contentEl.classList.remove('w-dyn-bind-empty');
      contentEl.querySelectorAll('img').forEach(img => { img.onerror = function() { this.style.display = 'none'; }; });
    }

    const videoEl = item.querySelector('.video-4');
    if (videoEl) {
      const embedUrl = youtubeEmbedUrl(data.videoUrl);
      if (embedUrl) {
        videoEl.style.cssText = 'position:relative;padding-bottom:56.25%;height:0;overflow:hidden;';
        videoEl.innerHTML = `<iframe src="${embedUrl}" frameborder="0" allowfullscreen loading="lazy" style="position:absolute;top:0;left:0;width:100%;height:100%;"></iframe>`;
        videoEl.classList.remove('w-dyn-bind-empty');
      } else {
        videoEl.style.display = 'none';
      }
    }

    const galleryBlock = item.querySelector('.div-block-340');
    if (galleryBlock) {
      if (galerie.length) {
        const galItems = galleryBlock.querySelector('.collection-list-15');
        const galTemplate = galleryBlock.querySelector('.collection-item-8.w-dyn-item');
        if (galItems && galTemplate) {
          galItems.innerHTML = '';
          galerie.forEach(url => {
            const gi = galTemplate.cloneNode(true);
            const gImg = gi.querySelector('img');
            if (gImg) { gImg.src = url; gImg.alt = data.nazev || ''; }
            galItems.appendChild(gi);
          });
        }
      } else {
        galleryBlock.style.display = 'none';
      }
    }

    if (data.instagramUrl) {
      const igDiv = document.createElement('div');
      igDiv.style.cssText = 'margin:1.5rem 0;';
      igDiv.innerHTML = `<blockquote class="instagram-media" data-instgrm-captioned data-instgrm-permalink="${escapeHtml(data.instagramUrl)}" style="max-width:540px;margin:0 auto;"></blockquote>`;
      const akceDiv = item.querySelector('.akce');
      if (akceDiv) akceDiv.appendChild(igDiv);
      else item.appendChild(igDiv);

      if (!document.getElementById('ig-embed-script')) {
        const s = document.createElement('script');
        s.id = 'ig-embed-script';
        s.src = 'https://www.instagram.com/embed.js';
        s.async = true;
        document.body.appendChild(s);
      }
    }

    // Lightbox na galerii + obsah, externí linky v novém panelu
    attachLightbox(galleryBlock);
    const akceContentEl = item.querySelector('[item="content"]');
    if (akceContentEl) {
      attachLightbox(akceContentEl);
      externalLinksNewTab(akceContentEl);
    }

    itemsList.appendChild(item);
  } catch (err) {
    console.error('Chyba načítání akce detail:', err);
    toggleEmpty(emptyEl, false);
  }
}

// ============================================================
// ČLÁNKY
// ============================================================
function renderClanekItem(template, data) {
  const item = template.cloneNode(true);

  const href = `/blog/${data.slug}/`;
  item.querySelectorAll('[item="permalink"]').forEach(el => { el.href = href; });

  const titleEl = item.querySelector('[item="title"], .wrapper--text__title');
  if (titleEl) { titleEl.textContent = data.titulek || ''; titleEl.classList.remove('w-dyn-bind-empty'); }

  const imgEl = item.querySelector('[item="featured-image"], .wrapper-image__img');
  if (imgEl) {
    if (data.imageUrl) {
      imgEl.src = data.imageUrl; imgEl.alt = data.titulek || '';
      imgEl.classList.remove('w-dyn-bind-empty');
    } else {
      const imgWrap = imgEl.closest('.card-blog__wrapper-image');
      if (imgWrap) imgWrap.style.display = 'none';
    }
  }

  return item;
}

async function loadClankyPreview() {
  const wfl = getWebflowList('.collection-list-blog');
  if (!wfl) return;
  const { itemsList, template, emptyEl } = wfl;

  try {
    const snapshot = await db.collection('clanky').orderBy('datum', 'desc').limit(4).get();
    const docs = snapshot.docs.map(d => d.data()).filter(d => d.publikovano !== false);

    if (!docs.length) { toggleEmpty(emptyEl, false); itemsList.innerHTML = ''; return; }

    toggleEmpty(emptyEl, true);
    itemsList.innerHTML = '';
    docs.forEach(data => itemsList.appendChild(renderClanekItem(template, data)));
  } catch (err) {
    console.error('Chyba načítání clanky preview:', err);
  }
}

// ============================================================
// ČLÁNKY LIST — stránkování + filtr
// ============================================================
let allClankyData = [];
let currentClankyPage = 1;
let clankyYearFilter = 'all';

let _clankyFilterBar = null;
let _clankyYears = [];
let _clankyPrevBtn = null;
let _clankyNextBtn = null;
let _clankyItemsList = null;
let _clankyTemplate = null;
let _clankyEmptyEl = null;

function getYearFromTimestamp(datum) {
  if (!datum) return null;
  try {
    const d = datum.seconds ? new Date(datum.seconds * 1000) : new Date(datum);
    return String(d.getFullYear());
  } catch (e) { return null; }
}

function getFilteredClanky() {
  return allClankyData.filter(d => {
    if (clankyYearFilter === 'all') return true;
    return getYearFromTimestamp(d.datum) === clankyYearFilter;
  });
}

function renderClankyListPage() {
  if (!_clankyItemsList || !_clankyTemplate) return;

  buildClankyFilterBar(_clankyFilterBar, _clankyYears);

  const filtered = getFilteredClanky();
  const start = (currentClankyPage - 1) * PAGE_SIZE;
  const page = filtered.slice(start, start + PAGE_SIZE);

  if (!page.length) {
    toggleEmpty(_clankyEmptyEl, false);
    _clankyItemsList.innerHTML = '';
  } else {
    toggleEmpty(_clankyEmptyEl, true);
    _clankyItemsList.innerHTML = '';
    page.forEach(data => _clankyItemsList.appendChild(renderClanekItem(_clankyTemplate, data)));
  }

  updatePaginationState(_clankyPrevBtn, _clankyNextBtn, currentClankyPage, filtered.length);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadClankyList() {
  const wfl = getWebflowList('.collection-list-blog');
  if (!wfl) return;
  const { itemsList, template, emptyEl } = wfl;

  _clankyItemsList = itemsList;
  _clankyTemplate = template;
  _clankyEmptyEl = emptyEl;

  const listWrapper = document.querySelector('.collection-list-blog');
  _clankyFilterBar = injectFilterBar('cms-clanky-filters', listWrapper);

  const paginationWrapper = document.querySelector('.w-pagination-wrapper.pagination');
  _clankyPrevBtn = paginationWrapper ? paginationWrapper.querySelector('.w-pagination-previous') : null;
  _clankyNextBtn = paginationWrapper ? paginationWrapper.querySelector('.w-pagination-next') : null;

  wirePagination(
    _clankyPrevBtn, _clankyNextBtn,
    () => currentClankyPage,
    p => { currentClankyPage = p; },
    getFilteredClanky,
    renderClankyListPage
  );

  try {
    const snapshot = await db.collection('clanky').orderBy('datum', 'desc').get();
    allClankyData = snapshot.docs.map(d => d.data()).filter(d => d.publikovano !== false);

    const yearSet = new Set();
    allClankyData.forEach(d => {
      const y = getYearFromTimestamp(d.datum);
      if (y) yearSet.add(y);
    });
    _clankyYears = Array.from(yearSet).sort((a, b) => b - a);

    renderClankyListPage();
  } catch (err) {
    console.error('Chyba načítání clanky list:', err);
  }
}

async function loadClanekDetail(slug) {
  try {
    const snapshot = await db.collection('clanky').where('slug', '==', slug).limit(1).get();
    if (snapshot.empty) return;

    const data = snapshot.docs[0].data();
    const datum = data.datum
      ? new Date(data.datum.seconds ? data.datum.seconds * 1000 : data.datum).toLocaleDateString('cs-CZ')
      : '';
    const galerie = (data.galerie && data.galerie.length)
      ? data.galerie.filter(Boolean)
      : [data.galerie1, data.galerie2, data.galerie3, data.galerie4].filter(Boolean);

    setPageMeta(`${data.titulek} | BikeSkills`, data.popis || data.perex, galerie[0] || data.imageUrl);

    // Nadpis
    const titleEl = document.querySelector('[item="title"].heading-83, .div-block-325 [item="title"]');
    if (titleEl) { titleEl.textContent = data.titulek || ''; titleEl.classList.remove('w-dyn-bind-empty'); }

    // Datum
    const dateEl = document.querySelector('[item="date"].blog-date-author, .div-block-326 [item="date"]');
    if (dateEl) { dateEl.textContent = datum; dateEl.classList.remove('w-dyn-bind-empty'); }

    // Autor
    const authorEl = document.querySelector('[item="author-display-name"].blog-date-author, .div-block-326 [item="author-display-name"]');
    if (authorEl) { authorEl.textContent = data.autor || ''; authorEl.classList.remove('w-dyn-bind-empty'); }

    // Obsah
    const contentEl = document.querySelector('[item="content"].rich-text-block-3, .div-block-325 [item="content"]');
    if (contentEl) {
      contentEl.innerHTML = ensureHtml(processWpContent(data.obsah));
      contentEl.classList.remove('w-dyn-bind-empty');
      contentEl.querySelectorAll('img').forEach(img => { img.onerror = function() { this.style.display = 'none'; }; });
    }

    // Hlavní fotka
    const imgEl = document.querySelector('.div-block-324 img[item="featured-image"], img[item="featured-image"].image-53');
    if (imgEl) {
      if (data.imageUrl) {
        imgEl.src = data.imageUrl; imgEl.alt = data.titulek || '';
        imgEl.classList.remove('w-dyn-bind-empty');
        const wrap = imgEl.parentElement;
        if (wrap) wrap.style.display = '';
      } else {
        const wrap = imgEl.parentElement;
        if (wrap) wrap.style.display = 'none';
      }
    }

    // YouTube video — vložíme pod obsah jako plná šířka
    const divBlock328 = document.querySelector('.div-block-328');
    const embedUrl = youtubeEmbedUrl(data.videoUrl);
    if (embedUrl) {
      // Přesun videa pod obsah (div-block-325) místo do side sloupce
      const contentParent = document.querySelector('.div-block-325');
      if (contentParent) {
        const videoDiv = document.createElement('div');
        videoDiv.style.cssText = 'position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin-top:1.5rem;width:100%;';
        videoDiv.innerHTML = `<iframe src="${embedUrl}" frameborder="0" allowfullscreen loading="lazy" style="position:absolute;top:0;left:0;width:100%;height:100%;"></iframe>`;
        contentParent.appendChild(videoDiv);
      }
      if (divBlock328) divBlock328.style.display = 'none';
    } else {
      if (divBlock328) divBlock328.style.display = 'none';
    }

    // Galerie fotografií — zachová CSS grid z Webflow (1fr 1fr 1fr 1fr), opraví min-width
    const galItems = document.querySelector('.collection-list-wrapper-6 .collection-list-13.w-dyn-items');
    const galTemplate = galItems ? galItems.querySelector('.collection-item-7.w-dyn-item') : null;
    if (galItems && galTemplate) {
      if (galerie.length) {
        galItems.innerHTML = '';
        galerie.forEach(url => {
          const gi = galTemplate.cloneNode(true);
          gi.style.minWidth = '0';  // přebije min-width:100% z Webflow CSS
          const innerDiv = gi.querySelector('.div-block-342');
          if (innerDiv) innerDiv.style.minWidth = '0';
          const gImg = gi.querySelector('img.image-54, img');
          if (gImg) {
            gImg.src = url; gImg.alt = data.titulek || '';
            gImg.style.cssText = 'width:100%;aspect-ratio:4/3;object-fit:cover;display:block;min-width:0;';
            gImg.classList.remove('w-dyn-bind-empty');
          }
          galItems.appendChild(gi);
        });
        const emptyState = document.querySelector('.collection-list-wrapper-6 .w-dyn-empty');
        if (emptyState) emptyState.style.display = 'none';
      } else {
        const galBlock = document.querySelector('.div-block-341');
        if (galBlock) galBlock.style.display = 'none';
      }
    }

    // Related posts
    const relatedWfl = getWebflowList('.related-posts .collection-list-blog');
    if (relatedWfl) {
      try {
        const relSnapshot = await db.collection('clanky')
          .orderBy('datum', 'desc')
          .limit(5)
          .get();
        const relDocs = relSnapshot.docs
          .map(d => d.data())
          .filter(d => d.slug !== slug && d.publikovano !== false)
          .slice(0, 4);

        if (relDocs.length) {
          toggleEmpty(relatedWfl.emptyEl, true);
          relatedWfl.itemsList.innerHTML = '';
          relDocs.forEach(d => relatedWfl.itemsList.appendChild(renderClanekItem(relatedWfl.template, d)));
        }
      } catch (e) {
        console.warn('Related posts error:', e);
      }
    }

    if (data.instagramUrl && !document.getElementById('ig-embed-script')) {
      const s = document.createElement('script');
      s.id = 'ig-embed-script';
      s.src = 'https://www.instagram.com/embed.js';
      s.async = true;
      document.body.appendChild(s);
    }

    // Lightbox na fotky obsahu + externí linky v novém panelu
    attachLightbox(contentEl);
    externalLinksNewTab(document.querySelector('.div-block-325'));

  } catch (err) {
    console.error('Chyba načítání clanek detail:', err);
  }
}

// ============================================================
// TÝM
// ============================================================
function renderTeamItem(template, data) {
  const item = template.cloneNode(true);

  const href = `/team/${data.slug}/`;
  item.querySelectorAll('[item="permalink"]').forEach(el => { el.href = href; });

  const titleEl = item.querySelector('[item="title"], .text-block-135');
  if (titleEl) { titleEl.textContent = data.jmeno || ''; titleEl.classList.remove('w-dyn-bind-empty'); }

  const excerptEl = item.querySelector('[item="excerpt"], .text-block-136');
  if (excerptEl) {
    const bio = data.popis || '';
    excerptEl.textContent = bio.length > 120 ? bio.substring(0, 120) + '…' : bio;
    excerptEl.classList.remove('w-dyn-bind-empty');
  }

  const imgEl = item.querySelector('[item="featured-image"], .image-49');
  if (imgEl && data.imageUrl) {
    imgEl.src = data.imageUrl; imgEl.alt = data.jmeno || '';
    imgEl.classList.remove('w-dyn-bind-empty');
  }

  return item;
}

async function loadTeamList() {
  const wfl = getWebflowList('.collection-list-wrapper-3');
  if (!wfl) return;
  const { itemsList, template, emptyEl } = wfl;

  try {
    const snapshot = await db.collection('team').orderBy('poradi', 'asc').get();
    const docs = snapshot.docs.map(d => d.data()).filter(d => d.aktivni !== false);

    if (!docs.length) { toggleEmpty(emptyEl, false); itemsList.innerHTML = ''; return; }

    toggleEmpty(emptyEl, true);
    itemsList.innerHTML = '';
    docs.forEach(data => itemsList.appendChild(renderTeamItem(template, data)));
  } catch (err) {
    console.error('Chyba načítání týmu:', err);
  }
}

async function loadTeamDetail(slug) {
  const container = document.getElementById('Team-member-Section');
  if (!container) return;

  try {
    const snapshot = await db.collection('team').where('slug', '==', slug).limit(1).get();
    if (snapshot.empty) { container.innerHTML = '<p>Člen týmu nenalezen.</p>'; return; }

    const data = snapshot.docs[0].data();
    const galerie = (data.galerie && data.galerie.length)
      ? data.galerie.filter(Boolean)
      : [];

    setPageMeta(`${data.jmeno} | BikeSkills Team`, data.bio, data.imageUrl);

    // Jméno
    const titleEl = container.querySelector('[item="title"]');
    if (titleEl) { titleEl.textContent = data.jmeno || ''; titleEl.classList.remove('w-dyn-bind-empty'); }

    // Bio
    const contentEl = container.querySelector('[item="content"]');
    if (contentEl) { contentEl.innerHTML = data.popis || ''; contentEl.classList.remove('w-dyn-bind-empty'); }

    // Hlavní fotka
    const imgEl = container.querySelector('img[item="featured-image"]');
    if (imgEl) {
      if (data.imageUrl) {
        imgEl.src = data.imageUrl; imgEl.alt = data.jmeno || '';
        imgEl.classList.remove('w-dyn-bind-empty');
      } else {
        imgEl.style.display = 'none';
      }
    }

    // Sociální sítě
    const instaLink = container.querySelector('a[acf\\:url="instagram"]');
    if (instaLink) {
      if (data.instagram) { instaLink.href = data.instagram; instaLink.style.display = ''; }
      else instaLink.style.display = 'none';
    }
    const fbLink = container.querySelector('a[acf\\:url="facebook"]');
    if (fbLink) {
      if (data.facebook) { fbLink.href = data.facebook; fbLink.style.display = ''; }
      else fbLink.style.display = 'none';
    }
    const ytLink = container.querySelector('a[acf\\:url="youtube"]');
    if (ytLink) {
      if (data.youtube) { ytLink.href = data.youtube; ytLink.style.display = ''; }
      else ytLink.style.display = 'none';
    }

    // Galerie — 8 slotů
    for (let i = 1; i <= 8; i++) {
      const imgSlot = container.querySelector(`img[acf\\:image="fotografie-${i}"]`);
      const block = imgSlot ? imgSlot.closest('.photo-team-block') : null;
      const url = galerie[i - 1];
      if (imgSlot && url) {
        imgSlot.src = url;
        imgSlot.alt = data.jmeno || '';
        if (block) block.style.display = '';
      } else if (block) {
        block.style.display = 'none';
      }
    }
    // Skryj celý blok galerie pokud prázdný
    const photosBlock = container.querySelector('.collection-photos');
    if (photosBlock && !galerie.length) photosBlock.style.display = 'none';

    // Videa
    const videoUrls = [data.videoUrl, data.videoUrl2, data.videoUrl3].filter(Boolean);
    const videoSelectors = ['.video.w-video.w-embed', '.video-3.w-video.w-embed', '.video-2.w-video.w-embed'];

    videoSelectors.forEach((sel, idx) => {
      const videoEl = container.querySelector(sel);
      if (!videoEl) return;
      const url = videoUrls[idx];
      const embedUrl = url ? youtubeEmbedUrl(url) : null;
      if (embedUrl) {
        videoEl.style.cssText = 'position:relative;padding-bottom:56.25%;height:0;overflow:hidden;';
        videoEl.innerHTML = `<iframe src="${embedUrl}" frameborder="0" allowfullscreen loading="lazy" style="position:absolute;top:0;left:0;width:100%;height:100%;"></iframe>`;
        videoEl.classList.remove('w-dyn-bind-empty');
      } else {
        videoEl.style.display = 'none';
      }
    });

    // Lightbox na galerii týmu
    attachLightbox(container, 'img[acf\\:image], img[item="featured-image"]');
    externalLinksNewTab(container);

  } catch (err) {
    console.error('Chyba načítání člena týmu:', err);
  }
}

// Footer sociální ikony — Lottie hover animace (stejná jako top bar, a-96/a-97 z IX2)
// webflow.js vystavuje lottie jako window.bodymovin
window.addEventListener('load', function() {
  setTimeout(function() {
    var bm = window.bodymovin;
    if (!bm || !bm.getRegisteredAnimations) return;
    var allAnims = bm.getRegisteredAnimations();
    document.querySelectorAll('.footer-link-block .link-block-button').forEach(function(btn) {
      var lottieEl = btn.querySelector('[data-animation-type="lottie"]');
      if (!lottieEl) return;
      var anim = allAnims.find(function(a) { return a.wrapper === lottieEl || a.container === lottieEl; });
      if (!anim) return;
      anim.goToAndStop(0, true);
      btn.addEventListener('mouseenter', function() { anim.setDirection(1); anim.goToAndPlay(0, true); });
      btn.addEventListener('mouseleave', function() {
        anim.setDirection(-1);
        anim.goToAndPlay(anim.totalFrames - 1, true);
      });
    });
  }, 800);
});
