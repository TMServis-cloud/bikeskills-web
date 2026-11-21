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
// I18N — jazyk podle <html lang>. EN stránky leží v /en/ (scripts/build-en.js),
// překlady obsahu jsou ve Firestore v poli `en` (titulek/obsah/perex/slug, nazev/popis/…).
// ============================================================
const LANG = (document.documentElement.getAttribute('lang') || 'cs').toLowerCase().indexOf('en') === 0 ? 'en' : 'cs';
const IS_EN = LANG === 'en';
const LOCALE = IS_EN ? 'en-GB' : 'cs-CZ';
const SITE_URL = 'https://bikeskills.cz';
const HOME_PATH = IS_EN ? '/en' : '/';
const BLOG_BASE = IS_EN ? '/en/blog/' : '/blog/';
const AKCE_BASE = IS_EN ? '/en/events/' : '/akce/';
const TEAM_BASE = IS_EN ? '/en/team/' : '/team/';
const BLOG_LIST = IS_EN ? '/en/blog' : '/blog';
const AKCE_LIST = IS_EN ? '/en/courses-and-events' : '/akce-archive';
const TEAM_LIST = IS_EN ? '/en/team' : '/team';
const I18N_EN = {
  'Camp': 'Camp', 'Kurz': 'Course', 'Trialový kurz': 'Trial course', 'Dětský kurz': 'Kids course', 'Workshop': 'Workshop', 'Jiné': 'Other',
  'individuální kurzy →': 'individual courses →',
  'Všechny roky': 'All years', 'Vše': 'All', 'Rok': 'Year', 'Cena': 'Price', 'Zrušit filtry': 'Clear filters', 'Žádná akce neodpovídá vybraným filtrům.': 'No events match the selected filters.', 'Žádný článek neodpovídá vybranému roku.': 'No articles match the selected year.', 'Řadit': 'Sort', 'Termín': 'Date', 'Nadcházející': 'Upcoming', 'Proběhlé': 'Past', 'Odebrat filtr': 'Remove filter', 'Od nejnovějších': 'Newest first', 'Od nejbližšího termínu': 'Soonest first', 'Od nejlevnějších': 'Price: low to high', 'Od nejdražších': 'Price: high to low', 'Zdarma / individuální': 'Free / individual', 'do 2 000 Kč': 'up to CZK 2,000', '2 000 – 3 500 Kč': 'CZK 2,000 – 3,500', 'nad 3 500 Kč': 'over CZK 3,500', 'Typ akce': 'Event type', 'Jakákoliv cena': 'Any price', 'S cenou': 'Paid', 'Zdarma / ind.': 'Free / individual',
  'Domů': 'Home', 'Akce': 'Events', 'Blog': 'Blog', 'Tým': 'Team', 'Článek': 'Article', 'Člen týmu': 'Team member',
  'Člen týmu nenalezen.': 'Team member not found.',
  'Vyplňte prosím jméno a příjmení.': 'Please enter your full name.',
  'Zadejte platný e-mail.': 'Please enter a valid e-mail address.',
  'Pro odeslání je nutný souhlas se zásadami ochrany osobních údajů.': 'You must agree to the privacy policy to send the form.',
  'Odesílám…': 'Sending…', 'ODESLAT': 'SEND',
  'Nepodařilo se odeslat. Zkuste to prosím znovu nebo nás kontaktujte na info@bikeskills.cz.': 'Sending failed. Please try again or contact us at info@bikeskills.cz.',
  'Registrace: ': 'Registration: ', 'akce': 'event',
};
function t(s) { return IS_EN && I18N_EN[s] != null ? I18N_EN[s] : s; }
// Anglické verze CMS obsahu jsou ve Firestore ve stejném dokumentu v polích *_en
// (titulek_en, obsah_en, slug_en, …) – zakládá je administrace (tlačítko „Přeložit do AJ"
// / automatický překlad při uložení). Definice polí: functions/lib/en-fields.js.
const EN_FIELDS = {
  clanky: ['titulek', 'perex', 'obsah', 'slug', 'metaTitle', 'metaDescription'],
  akce: ['nazev', 'popis', 'uroven', 'datumText', 'dobaTrvani', 'ridersNumberWp', 'stavLabel', 'typAkce', 'slug', 'metaTitle', 'metaDescription'],
  team: ['popis'],
};
const EN_KEY = { clanky: 'titulek', akce: 'nazev', team: 'popis' };
function colOf(d) { return d.titulek !== undefined ? 'clanky' : d.nazev !== undefined ? 'akce' : d.jmeno !== undefined ? 'team' : null; }
/** Přepíše CZ data EN poli. V EN bez překladu označí _noEn (položka se nezobrazí). */
function loc(d) {
  if (!d || !IS_EN) return d;
  const c = colOf(d);
  if (!c || !d[EN_KEY[c] + '_en']) return Object.assign({}, d, { _noEn: true });
  const e = { slugCs: d.slug };
  for (const f of EN_FIELDS[c]) { const v = d[f + '_en']; if (v != null && v !== '') e[f] = v; }
  return Object.assign({}, d, e);
}
async function locDetail(raw) { return loc(raw); }
/** Detail: najde dokument podle slugu z URL (na /en/ podle slug_en). */
function findBySlug(col, slug) {
  const field = IS_EN && col !== 'team' ? 'slug_en' : 'slug';
  return db.collection(col).where(field, '==', slug).limit(1).get();
}
/** Přepínač jazyka na detailu → protějšek v druhém jazyce (nebo výpis, když protějšek není). */
function setDetailLangSwitch(raw, col) {
  try {
    const a = document.querySelector('a.bs-lang-switch');
    if (!a || !raw) return;
    const base = { clanky: ['/blog/', '/en/blog/'], akce: ['/akce/', '/en/events/'], team: ['/team/', '/en/team/'] }[col];
    const list = { clanky: ['/blog', '/en/blog'], akce: ['/akce-archive', '/en/courses-and-events'], team: ['/team', '/en/team'] }[col];
    let href;
    if (IS_EN) href = base[0] + raw.slug + (col === 'clanky' ? '/' : '');
    else {
      const en = col === 'team' ? (raw.popis_en ? raw.slug : null) : raw.slug_en;
      href = en ? base[1] + en : list[1];
    }
    a.setAttribute('href', href);
  } catch (_) {}
}
function hasLang(d) { return !d._noEn; }

// ============================================================
// PROGRESSIVE ENHANCEMENT — pre-rendered (SSG) detection
// Build-time skript scripts/prerender.js značí pre-renderovaný DOM:
//   - Listings: <div class="...w-dyn-items..." data-prerendered="true"> kolem karet
//   - Detail:   <html data-prerendered="true">
// Když je obsah pre-renderovaný, JS přeskakuje DOM mutace a jen
// dotahuje data potřebná pro filtry/paginaci/galerii/lightbox.
// ============================================================
const PAGE_PRERENDERED = (function() {
  try { return document.documentElement.getAttribute('data-prerendered') === 'true'; }
  catch (e) { return false; }
})();
function isPrerenderedList(el) {
  if (!el) return false;
  return el.getAttribute && el.getAttribute('data-prerendered') === 'true';
}

// ============================================================
// SKELETON LOADER
// ============================================================
(function injectSkeletonCSS() {
  if (document.getElementById('cms-skeleton-css')) return;
  const s = document.createElement('style');
  s.id = 'cms-skeleton-css';
  s.textContent = `
@keyframes cms-shimmer {
  0%   { background-position: -600px 0; }
  100% { background-position:  600px 0; }
}
.cms-skeleton-item {
  pointer-events: none;
  border-radius: 6px;
  overflow: hidden;
}
.cms-skeleton-img {
  width: 100%; aspect-ratio: 4/3; border-radius: 4px;
  background: linear-gradient(90deg, #2a2e31 25%, #353b3f 50%, #2a2e31 75%);
  background-size: 600px 100%;
  animation: cms-shimmer 1.4s infinite linear;
}
.cms-skeleton-line {
  border-radius: 3px; margin-top: 10px;
  background: linear-gradient(90deg, #2a2e31 25%, #353b3f 50%, #2a2e31 75%);
  background-size: 600px 100%;
  animation: cms-shimmer 1.4s infinite linear;
}
.cms-skeleton-line.wide  { height: 14px; width: 90%; }
.cms-skeleton-line.short { height: 11px; width: 60%; margin-top: 6px; }
`;
  document.head.appendChild(s);
})();

function buildSkeletonItem(count) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const div = document.createElement('div');
    div.className = 'cms-skeleton-item w-dyn-item';
    div.innerHTML = `
      <div class="cms-skeleton-img"></div>
      <div class="cms-skeleton-line wide"></div>
      <div class="cms-skeleton-line short"></div>`;
    frag.appendChild(div);
  }
  return frag;
}

function showSkeleton(itemsList, count) {
  if (!itemsList) return;
  itemsList.innerHTML = '';
  itemsList.appendChild(buildSkeletonItem(count));
}

// ============================================================
// AKCE GALLERY GRID CSS
// ============================================================
(function injectAkceGalleryCSS() {
  if (document.getElementById('cms-akce-gallery-css')) return;
  const s = document.createElement('style');
  s.id = 'cms-akce-gallery-css';
  s.textContent = `
.collection-list-15 {
  display: grid !important;
  grid-template-columns: repeat(4, 1fr) !important;
  grid-template-rows: auto !important;
  gap: 8px !important;
}
.collection-list-15 .image-60 {
  width: 100% !important;
  height: 594px !important;
  object-fit: cover !important;
  display: block !important;
  margin: 0 !important;
}
/* 1 obrázek — přes celou šířku */
.collection-list-15.akce-gal-1 .collection-item-8 { grid-column: span 4; }
/* 2 obrázky — každý přes 2 sloupce */
.collection-list-15.akce-gal-2 .collection-item-8 { grid-column: span 2; }
/* 3 obrázky — první 2 normálně, třetí přes 2 sloupce */
.collection-list-15.akce-gal-3 .collection-item-8:nth-child(3) { grid-column: span 2; }
@media (max-width: 767px) {
  .collection-list-15 { grid-template-columns: repeat(2, 1fr) !important; }
  .collection-list-15.akce-gal-1 .collection-item-8 { grid-column: span 2; }
  .collection-list-15.akce-gal-2 .collection-item-8 { grid-column: span 1; }
  .collection-list-15.akce-gal-3 .collection-item-8:nth-child(3) { grid-column: span 2; }
  .collection-list-15 .image-60 { height: 378px !important; }
}
@media (max-width: 479px) {
  .collection-list-15 { grid-template-columns: 1fr !important; }
  .collection-list-15 .collection-item-8 { grid-column: span 1 !important; }
  .collection-list-15 .image-60 { height: 351px !important; }
}
`;
  document.head.appendChild(s);
})();

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

/** Prázdný stav výpisu s filtrem – česká hláška místo Webflow „No items found.“ (styl .bs-empty v overrides.css) */
function setFilterEmptyText(emptyEl, text) {
  if (!emptyEl) return;
  emptyEl.classList.add('bs-empty');
  emptyEl.textContent = text;
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

const KATEGORIE_LABELS = {
  'camp':     'Camp',
  'kurz':     'Kurz',
  'trialovy': 'Trialový kurz',
  'deti':     'Dětský kurz',
  'workshop': 'Workshop',
  'jine':     'Jiné',
};

/** Vrátí zobrazovaný typ akce — primárně z kategorie, pak z typAkce (starý WP import). */
function resolveAkceLabel(d) {
  if (d.kategorie && KATEGORIE_LABELS[d.kategorie]) return t(KATEGORIE_LABELS[d.kategorie]);
  const typ = (d.typAkce || '').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (typ === 'pro deti' || typ === 'detsky kurz') return t('Dětský kurz');
  return normalizeTypAkce(d.typAkce || '');
}



function computeAkceISOStart(data) {
  if (data && data.datum) {
    try {
      var ms = data.datum.seconds ? data.datum.seconds * 1000 : data.datum;
      var iso = new Date(ms).toISOString();
      return iso.split('T')[0];
    } catch (_) {}
  }
  if (data && data.datumSort) {
    var s = String(data.datumSort);
    var m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
  }
  if (data && data.datumText) {
    var t = String(data.datumText);
    var m2 = t.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
    if (m2) {
      var dd = m2[1].length < 2 ? '0' + m2[1] : m2[1];
      var mm = m2[2].length < 2 ? '0' + m2[2] : m2[2];
      return m2[3] + '-' + mm + '-' + dd;
    }
  }
  return null;
}

function injectJsonLd(schema, id) {
  const elId = id || 'json-ld-schema';
  const existing = document.getElementById(elId);
  if (existing) existing.remove();
  const s = document.createElement('script');
  s.id = elId;
  s.type = 'application/ld+json';
  s.textContent = JSON.stringify(schema);
  document.head.appendChild(s);
}

function injectBreadcrumb(items) {
  injectJsonLd({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': items.map((item, i) => ({
      '@type': 'ListItem',
      'position': i + 1,
      'name': item.name,
      'item': item.item
    }))
  }, 'json-ld-breadcrumb');
}

const PATH_TO_SEO_KEY = {
  '/':                    'homepage',
  '/index.html':          'homepage',
  '/blog.html':           'blog',
  '/blog':                'blog',
  '/akce-archive.html':   'akce',
  '/akce-archive':        'akce',
  '/akce-archive/':       'akce',
  '/team.html':           'team',
  '/team':                'team',
  '/team/':               'team',
};

async function applySeoFromSettings(path) {
  if (IS_EN) return; // SEO nastavení v adminu je české
  const key = PATH_TO_SEO_KEY[path];
  if (!key) return;
  try {
    const snap = await db.collection('settings').doc('seo').get();
    if (!snap.exists) return;
    const cfg = (snap.data() || {})[key];
    if (!cfg) return;
    const setM = (sel, val) => { const el = document.querySelector(sel); if (el && val) el.setAttribute('content', val); };
    if (cfg.title) {
      document.title = cfg.title;
      setM('meta[property="og:title"]', cfg.title);
      setM('meta[property="twitter:title"]', cfg.title);
    }
    if (cfg.description) {
      setM('meta[name="description"]', cfg.description);
      setM('meta[property="og:description"]', cfg.description);
      setM('meta[property="twitter:description"]', cfg.description);
    }
    if (cfg.ogImage) {
      setM('meta[property="og:image"]', cfg.ogImage);
      setM('meta[property="twitter:image"]', cfg.ogImage);
    }
  } catch (_) {}
}

function setPageMeta(title, description, imageUrl, ogType) {
  document.title = title;
  const stripped = (description || '').replace(/<[^>]*>/g, '').trim();
  const desc = stripped.length > 160 ? stripped.substring(0, 157) + '…' : stripped;
  const setMeta = (sel, val) => { const el = document.querySelector(sel); if (el && val) el.setAttribute('content', val); };
  setMeta('meta[name="description"]', desc);
  setMeta('meta[property="og:title"]', title);
  setMeta('meta[property="og:description"]', desc);
  setMeta('meta[property="og:type"]', ogType || 'website');
  setMeta('meta[property="twitter:title"]', title);
  setMeta('meta[property="twitter:description"]', desc);
  if (imageUrl) {
    setMeta('meta[property="og:image"]', imageUrl);
    setMeta('meta[property="twitter:image"]', imageUrl);
  }
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.setAttribute('content', window.location.href);
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
  canonical.href = window.location.href.split('?')[0].replace(/^https?:\/\/(www\.)?bikeskills\.cz/, 'https://bikeskills.cz');
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
    `<div class="gallery-item"><img src="${escapeHtml(resolveUrl(url))}" loading="lazy" alt="" style="width:100%;height:200px;object-fit:cover;border-radius:4px;"></div>`
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
document.addEventListener('DOMContentLoaded', async () => {
  // Globálně: všechny externí linky otevřít v novém okně
  externalLinksNewTab(document.body);

  let path = window.location.pathname;
  if (IS_EN) {
    // /en/… → interní CZ routa (stejné loadery, jiný jazyk dat)
    const p = path.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    const EN_ROUTES = { '/en': '/', '/en/index': '/', '/en/blog': '/blog', '/en/courses-and-events': '/akce-archive', '/en/team': '/team' };
    if (EN_ROUTES[p]) path = EN_ROUTES[p];
    else if (p.indexOf('/en/blog/') === 0) { const s = p.slice('/en/blog/'.length); path = '/blog/' + s + '/'; }
    else if (p.indexOf('/en/events/') === 0) { const s = p.slice('/en/events/'.length); path = '/akce/' + s; }
    else if (p.indexOf('/en/team/') === 0) { const s = p.slice('/en/team/'.length); path = '/team/' + s; }
    else if (p === '/en/event-detail') path = '/detail_akce';
    else if (p === '/en/team-member') path = '/detail_archive-team';
  }

  // Aplikovat SEO z Firestore (nepřepisuje meta dynamicky generovaná pro detail stránky)
  applySeoFromSettings(path);

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

  const href = `${AKCE_BASE}${data.slug}`;
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
      setImgWithThumb(imgEl, resolveUrl(data.imageUrl), {
        sizes: '(max-width: 767px) 100vw, (max-width: 991px) 50vw, 25vw'
      });
    } else {
      imgEl.removeAttribute('onerror');
      imgEl.removeAttribute('srcset');
      imgEl.removeAttribute('sizes');
      imgEl.removeAttribute('data-full-url');
      imgEl.src = PLACEHOLDER_URL;
      imgEl.onerror = makeImgErrorHandler();
    }
    imgEl.alt = data.nazev || '';
    imgEl.width = 800; imgEl.height = 600;
    imgEl.classList.remove('w-dyn-bind-empty');
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
      cenaEl.textContent = data.cena.toLocaleString(LOCALE);
      cenaEl.classList.remove('w-dyn-bind-empty');
    } else {
      // Nahraď cenu odkazem na individuální kurzy
      const after = cenaEl.nextElementSibling;
      if (after && after.classList.contains('akce-cena-after')) after.style.display = 'none';
      const popisEl = cenaEl.previousElementSibling;
      if (popisEl && popisEl.classList.contains('akce-popis')) popisEl.style.display = 'none';
      cenaEl.textContent = t('individuální kurzy →');
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

  showSkeleton(itemsList, 4);
  try {
    const snapshot = await db.collection('akce').get();
    const today = new Date();
    const todayStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

    const all = snapshot.docs.map(d => loc(d.data())).filter(hasLang).filter(d => d.aktivni !== false);
    // Nejbližší nadcházející akce seřazené od nejbližšího data
    const upcoming = all
      .filter(d => dsKey(d.datumSort) >= todayStr)
      .sort((a, b) => dsKey(a.datumSort).localeCompare(dsKey(b.datumSort)));
    // Pokud je málo nadcházejících, doplníme nedávno proběhlé
    const past = all
      .filter(d => dsKey(d.datumSort) < todayStr)
      .sort((a, b) => dsKey(b.datumSort).localeCompare(dsKey(a.datumSort)));
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
let akceTermFilter = 'all';        // all | upcoming | past
const akceYearSel = new Set();      // vybrané roky
const akceTypSel = new Set();       // vybrané typy akce
let akceCenaFilter = 'all';         // all | ind | do2000 | 2000-3500 | nad3500
let akceSort = 'newest';            // newest | nearest | cheap | expensive
const AKCE_SORTS = [['newest', 'Od nejnovějších'], ['nearest', 'Od nejbližšího termínu'], ['cheap', 'Od nejlevnějších'], ['expensive', 'Od nejdražších']];
const AKCE_CENY = [['ind', 'Zdarma / individuální'], ['do2000', 'do 2 000 Kč'], ['2000-3500', '2 000 – 3 500 Kč'], ['nad3500', 'nad 3 500 Kč']];

function akceCenaBucket(d) {
  const c = Number(d.cena) || 0;
  if (!c) return 'ind';
  if (c < 2000) return 'do2000';
  if (c <= 3500) return '2000-3500';
  return 'nad3500';
}

/** skip = název filtru, který se při výpočtu ignoruje (pro počty v nabídkách) */
function akceMatches(d, skip) {
  if (skip !== 'term' && akceTermFilter !== 'all' && (akceTermFilter === 'past') !== isAkceOdjeto(d)) return false;
  if (skip !== 'year' && akceYearSel.size && !akceYearSel.has(getYearFromDatumSort(d.datumSort))) return false;
  if (skip !== 'typ' && akceTypSel.size && !akceTypSel.has(resolveAkceLabel(d))) return false;
  if (skip !== 'cena' && akceCenaFilter !== 'all' && akceCenaBucket(d) !== akceCenaFilter) return false;
  return true;
}

/** datumSort je v adminu 'YYYY-MM-DD', u starších akcí mohlo být 'YYYYMMDD' → porovnávací klíč YYYYMMDD. */
function dsKey(v) { return String(v || '').replace(/\D/g, '').slice(0, 8) || '0'; }

function getYearFromDatumSort(datumSort) {
  if (!datumSort) return null;
  const m = String(datumSort).match(/^(\d{4})/);
  return m ? m[1] : null;
}

function isAkceOdjeto(data) {
  if (!data.datumSort) return false;
  const today = new Date();
  const todayStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  return dsKey(data.datumSort) < todayStr;
}

function injectFilterBar(id, beforeEl) {
  let bar = document.getElementById(id);
  if (!bar) {
    bar = document.createElement('div');
    bar.id = id;
    bar.className = 'bs-filter';
    beforeEl.parentNode.insertBefore(bar, beforeEl);
  }
  return bar;
}

// Filtr ve stylu „pruh se záložkami“ (inspirace mtbrzdy.cz) – styly v css/bikeskills-overrides.css (.bs-filter, .bs-tabs, .bs-tab, .bs-select)

/** Skloňování počtu: [1, 2–4, 5+] (CZ) / [1, více] (EN) */
function pluralLabel(n, cz, en) {
  if (IS_EN) return n === 1 ? en[0] : en[1];
  if (n === 1) return cz[0];
  if (n >= 2 && n <= 4) return cz[1];
  return cz[2];
}

// ---------- Filtr výpisů: pilulky nahoře + počet a řazení pod nimi (varianta B) ----------
// Styly: css/bikeskills-overrides.css (.bs-filter, .bs-pill, .bs-dd, .bs-sort)

function makeFilterFoot(count, cz, en, sortEl) {
  const foot = document.createElement('div');
  foot.className = 'bs-filter__foot';
  const c = document.createElement('span');
  c.className = 'bs-filter__count';
  c.setAttribute('aria-live', 'polite');
  const strong = document.createElement('strong');
  strong.textContent = count;
  c.appendChild(strong);
  c.appendChild(document.createTextNode(' ' + pluralLabel(count, cz, en)));
  foot.appendChild(c);
  if (sortEl) foot.appendChild(sortEl);
  return foot;
}

/** Přepínací pilulka (zap/vyp), např. „Nadcházející“ */
function makeTogglePill(label, active, onToggle) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'bs-pill bs-pill--toggle' + (active ? ' is-set' : '');
  b.setAttribute('aria-pressed', active ? 'true' : 'false');
  b.textContent = label;
  if (active) b.insertAdjacentHTML('beforeend', BS_X_ICON);
  b.addEventListener('click', onToggle);
  return b;
}

const BS_X_ICON = '<svg class="bs-pill__x" width="11" height="11" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.6"/></svg>';
const BS_CHEV_ICON = '<svg class="bs-dd__chev" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

function buildAkceFilterBar(bar, years, typy) {
  bar.innerHTML = '';
  const rerender = () => { currentAkcePage = 1; renderAkceListPage({ noScroll: true }); };
  const cnt = (skip, pred) => allAkceData.filter(d => akceMatches(d, skip) && pred(d)).length;
  const toggleSet = (set, v) => { set.has(v) ? set.delete(v) : set.add(v); rerender(); };

  const pills = document.createElement('div');
  pills.className = 'bs-filter__pills';

  pills.appendChild(makeDropdown('typ', t('Typ akce'), typy.map(x => ({ val: x, label: x, count: cnt('typ', d => resolveAkceLabel(d) === x) })), {
    multi: true, selected: akceTypSel, onPick: v => toggleSet(akceTypSel, v),
    onClear: () => { akceTypSel.clear(); rerender(); },
  }));
  pills.appendChild(makeDropdown('rok', t('Rok'), years.map(y => ({ val: y, label: y, count: cnt('year', d => getYearFromDatumSort(d.datumSort) === y) })), {
    multi: true, selected: akceYearSel, onPick: v => toggleSet(akceYearSel, v),
    onClear: () => { akceYearSel.clear(); rerender(); },
  }));
  pills.appendChild(makeDropdown('cena', t('Cena'), AKCE_CENY.map(([v, l]) => ({ val: v, label: t(l), count: cnt('cena', d => akceCenaBucket(d) === v) })), {
    selected: akceCenaFilter, onPick: v => { akceCenaFilter = akceCenaFilter === v ? 'all' : v; rerender(); },
    onClear: () => { akceCenaFilter = 'all'; rerender(); },
  }));
  pills.appendChild(makeTogglePill(t('Nadcházející'), akceTermFilter === 'upcoming', () => {
    akceTermFilter = akceTermFilter === 'upcoming' ? 'all' : 'upcoming'; rerender();
  }));
  pills.appendChild(makeTogglePill(t('Proběhlé'), akceTermFilter === 'past', () => {
    akceTermFilter = akceTermFilter === 'past' ? 'all' : 'past'; rerender();
  }));
  if (akceTypSel.size || akceYearSel.size || akceCenaFilter !== 'all' || akceTermFilter !== 'all') {
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'bs-filter__reset';
    reset.textContent = t('Zrušit filtry');
    reset.addEventListener('click', () => { akceTypSel.clear(); akceYearSel.clear(); akceCenaFilter = 'all'; akceTermFilter = 'all'; rerender(); });
    pills.appendChild(reset);
  }
  bar.appendChild(pills);

  const sort = makeDropdown('sort', t('Řadit'), AKCE_SORTS.map(([v, l]) => ({ val: v, label: t(l) })), {
    selected: akceSort, sort: true, align: 'right',
    onPick: v => { akceSort = v; rerender(); },
  });
  bar.appendChild(makeFilterFoot(getFilteredAkce().length, ['akce', 'akce', 'akcí'], ['event', 'events'], sort));
}

function buildClankyFilterBar(bar, years) {
  bar.innerHTML = '';
  const rerender = () => { currentClankyPage = 1; renderClankyListPage({ noScroll: true }); };
  const pills = document.createElement('div');
  pills.className = 'bs-filter__pills';
  pills.appendChild(makeDropdown('clanky-rok', t('Rok'), years.map(y => ({
    val: y, label: y, count: allClankyData.filter(d => getYearFromTimestamp(d.datum) === y).length,
  })), {
    selected: clankyYearFilter, onPick: v => { clankyYearFilter = clankyYearFilter === v ? 'all' : v; rerender(); },
    onClear: () => { clankyYearFilter = 'all'; rerender(); },
  }));
  bar.appendChild(pills);
  bar.appendChild(makeFilterFoot(getFilteredClanky().length, ['článek', 'články', 'článků'], ['article', 'articles']));
}

// ---------- Rozbalovací nabídka v designu webu (náhrada nativního <select>) ----------
let _bsOpenDd = null;

function closeAllDropdowns(except) {
  document.querySelectorAll('.bs-dd.is-open').forEach(dd => {
    if (dd === except) return;
    dd.classList.remove('is-open');
    const b = dd.querySelector('.bs-dd__btn');
    if (b) b.setAttribute('aria-expanded', 'false');
  });
  if (!except) _bsOpenDd = null;
}

if (!window.__bsDdListeners) {
  window.__bsDdListeners = true;
  document.addEventListener('click', e => { if (!e.target.closest || !e.target.closest('.bs-dd')) closeAllDropdowns(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !_bsOpenDd) return;
    const open = document.querySelector('.bs-dd.is-open .bs-dd__btn');
    closeAllDropdowns();
    if (open) open.focus();
  });
}

/**
 * options: [{ val, label, count? }]
 * opts: { multi, selected (Set u multi, jinak hodnota, 'all' = nic), onPick(val), onClear(), sort, align: 'right' }
 * Bez výběru: obrysová pilulka „Typ akce ⌄“. S výběrem: světlá pilulka „Typ akce: Camp ✕“ (✕ zruší výběr).
 * sort: true → textový odkaz „Řadit: Od nejnovějších ⌄“.
 */
function makeDropdown(key, label, options, opts) {
  const multi = !!opts.multi;
  const isSel = v => multi ? opts.selected.has(v) : opts.selected === v;
  const chosen = options.filter(o => isSel(o.val));
  const hasValue = !opts.sort && chosen.length > 0;

  const dd = document.createElement('div');
  dd.className = 'bs-dd' + (opts.sort ? ' bs-dd--sort' : ' bs-pill') + (hasValue ? ' is-set' : '') + (opts.align === 'right' ? ' bs-dd--right' : '');
  const open = _bsOpenDd === key;
  if (open) dd.classList.add('is-open');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bs-dd__btn';
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  const lab = document.createElement('span');
  lab.className = 'bs-dd__label';
  if (opts.sort || hasValue) {
    const vals = chosen.map(o => o.label);
    const valText = vals.length > 2 ? vals.slice(0, 2).join(', ') + ' +' + (vals.length - 2) : vals.join(', ');
    lab.innerHTML = '<span class="bs-dd__prefix"></span> <strong></strong>';
    lab.firstChild.textContent = label + ':';
    lab.lastChild.textContent = valText;
  } else {
    lab.textContent = label;
  }
  btn.appendChild(lab);
  if (!hasValue) btn.insertAdjacentHTML('beforeend', BS_CHEV_ICON);
  btn.addEventListener('click', () => {
    const willOpen = !dd.classList.contains('is-open');
    closeAllDropdowns(dd);
    dd.classList.toggle('is-open', willOpen);
    btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    _bsOpenDd = willOpen ? key : null;
    if (willOpen) { fitPanel(); const f = panel.querySelector('.bs-dd__opt:not([disabled])'); if (f) f.focus(); }
  });
  // Panel nesmí přetéct přes pravý okraj obrazovky (mobil) → případně zarovnat doprava
  const fitPanel = () => {
    if (opts.align === 'right') return;
    dd.classList.remove('bs-dd--right');
    const r = panel.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) dd.classList.add('bs-dd--right');
  };
  if (open) requestAnimationFrame(fitPanel);
  dd.appendChild(btn);

  if (hasValue && opts.onClear) {
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'bs-pill__clear';
    x.setAttribute('aria-label', t('Odebrat filtr') + ': ' + label);
    x.innerHTML = BS_X_ICON;
    x.addEventListener('click', e => { e.stopPropagation(); _bsOpenDd = null; opts.onClear(); });
    dd.appendChild(x);
  }

  const panel = document.createElement('div');
  panel.className = 'bs-dd__panel';
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', label);
  options.forEach((o, i) => {
    const sel = isSel(o.val);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bs-dd__opt' + (sel ? ' is-selected' : '');
    b.setAttribute(multi ? 'aria-pressed' : 'aria-current', sel ? 'true' : 'false');
    if (o.count === 0 && !sel) b.disabled = true;
    const mark = document.createElement('span');
    mark.className = multi ? 'bs-dd__check' : 'bs-dd__radio';
    b.appendChild(mark);
    const txt = document.createElement('span');
    txt.className = 'bs-dd__text';
    txt.textContent = o.label;
    b.appendChild(txt);
    if (o.count != null) {
      const c = document.createElement('span');
      c.className = 'bs-dd__count';
      c.textContent = o.count;
      b.appendChild(c);
    }
    b.addEventListener('click', e => {
      e.stopPropagation();
      _bsOpenDd = multi ? key : null;   // vícenásobný výběr nechá nabídku otevřenou
      opts.onPick(o.val);
      if (multi) { const again = document.querySelector('.bs-dd.is-open .bs-dd__opt:nth-child(' + (i + 1) + ')'); if (again) again.focus(); }
    });
    panel.appendChild(b);
  });
  dd.appendChild(panel);
  return dd;
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

/** Storage URL → čistá Storage URL bez tokenu (storage rules povolují public read) */
function resolveUrl(url) {
  if (!url) return url;
  // Libovolná Firebase Storage URL: odstraň expirující token, nech ?alt=media
  const m = url.match(/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?]*)\?/);
  if (!m) return url;
  return `https://firebasestorage.googleapis.com/v0/b/${m[1]}/o/${m[2]}?alt=media`;
}

const PLACEHOLDER_URL = 'https://firebasestorage.googleapis.com/v0/b/bikeskills-web.firebasestorage.app/o/images%2Fplaceholder.webp?alt=media';

/**
 * Transformuje Storage URL na thumbnail generovaný Firebase Extension "Resize Images".
 * Výstup: stejný folder jako originál, název s `_{w}x{h}.webp` suffixem.
 * (Odpovídá Firebase ext. parametru RESIZED_IMAGES_PATH=prázdný + IMG_TYPE=webp.)
 * Pokud thumb neexistuje, onerror handler nastaví src zpět na originál.
 */
function toThumbUrl(resolvedUrl, size = '800x800') {
  const m = resolvedUrl.match(/(https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/)([^?]+)(\?alt=media)/);
  if (!m) return resolvedUrl;
  const path = decodeURIComponent(m[2]);
  const dot = path.lastIndexOf('.');
  const base = dot >= 0 ? path.slice(0, dot) : path;
  const thumbPath = base + '_' + size + '.webp';
  const encoded = thumbPath.split('/').map(encodeURIComponent).join('%2F');
  return m[1] + encoded + m[3];
}

/** Default srcset varianty pro Firebase Image Resize ext (IMG_SIZES=400x400,800x800,1600x1600) */
const DEFAULT_THUMB_VARIANTS = [
  { size: '400x400',   width: 400  },
  { size: '800x800',   width: 800  },
  { size: '1600x1600', width: 1600 }
];

/**
 * Nastaví img src + srcset na thumbnaily; při chybě (missing thumb) přepne na originál.
 * Default sizes attribute pokrývá mobile/tablet/desktop layout.
 * Lightbox čte data-full-url = originál v plné kvalitě.
 *
 * @param {HTMLImageElement} imgEl
 * @param {string} origUrl  Vyřešená Storage URL (resolveUrl-applied).
 * @param {object} [opts]
 * @param {Array<{size:string,width:number}>} [opts.variants]  srcset varianty
 * @param {string} [opts.fallbackSize]  src fallback když browser srcset neumí
 * @param {string} [opts.sizes]  HTML sizes attribute
 */
function setImgWithThumb(imgEl, origUrl, opts) {
  opts = opts || {};
  const variants = opts.variants || DEFAULT_THUMB_VARIANTS;
  const fallbackSize = opts.fallbackSize || '800x800';
  const sizes = opts.sizes || '(max-width: 767px) 400px, (max-width: 991px) 800px, 1600px';
  const srcset = variants.map(v => toThumbUrl(origUrl, v.size) + ' ' + v.width + 'w').join(', ');
  // Cleanup atributu z prerendered template (cloneNode zachova puvodni inline onerror,
  // srcset a sizes - bez ocisteni interferuji s novymi hodnotami a v archivu se pak
  // u vsech karet ukaze obrazek z templatu misto vlastniho).
  imgEl.removeAttribute("onerror");
  imgEl.removeAttribute("srcset");
  imgEl.removeAttribute("sizes");
  imgEl.src = toThumbUrl(origUrl, fallbackSize);
  imgEl.srcset = srcset;
  imgEl.sizes = sizes;
  imgEl.setAttribute('data-full-url', origUrl);
  imgEl.onerror = function() {
    if (this.src !== origUrl) {
      this.removeAttribute('srcset');
      this.removeAttribute('sizes');
      this.src = origUrl;
      this.onerror = makeImgErrorHandler();
    } else {
      showImgPlaceholder(this);
    }
  };
}

/** Onerror → placeholder (Storage URL selhala) */
function makeImgErrorHandler() {
  return function() { showImgPlaceholder(this); };
}

function showImgPlaceholder(imgEl) {
  imgEl.onerror = null;
  imgEl.src = PLACEHOLDER_URL;
  imgEl.style.display = '';
}

/** Přepíše Storage URL v HTML obsahu na čisté Storage URL bez tokenu */
function resolveContentUrls(html) {
  if (!html) return html;
  return html.replace(
    /https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?"'\s<>]*)\?[^"'\s<>]*/g,
    (_, bucket, enc) => `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${enc}?alt=media`
  );
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
  const list = allAkceData.filter(d => akceMatches(d));   // allAkceData je seřazené od nejnovějšího data
  const k = d => dsKey(d.datumSort);
  if (akceSort === 'nearest') {
    const up = list.filter(d => !isAkceOdjeto(d)).sort((a, b) => k(a).localeCompare(k(b)));
    const past = list.filter(d => isAkceOdjeto(d));
    return [...up, ...past];
  }
  if (akceSort === 'cheap' || akceSort === 'expensive') {
    const dir = akceSort === 'cheap' ? 1 : -1;
    return list.slice().sort((a, b) => {
      const ca = Number(a.cena) || 0, cb = Number(b.cena) || 0;
      if (!ca !== !cb) return ca ? -1 : 1;              // akce bez ceny vždy na konec
      return (ca - cb) * dir || k(b).localeCompare(k(a));
    });
  }
  return list;
}

function renderAkceListPage(opts) {
  if (!_akceItemsList || !_akceTemplate) return;

  buildAkceFilterBar(_akceFilterBar, _akceYears, _akceTypy);

  const filtered = getFilteredAkce();
  const start = (currentAkcePage - 1) * PAGE_SIZE;
  const page = filtered.slice(start, start + PAGE_SIZE);

  if (!page.length) {
    setFilterEmptyText(_akceEmptyEl, t('Žádná akce neodpovídá vybraným filtrům.'));
    toggleEmpty(_akceEmptyEl, false);
    _akceItemsList.innerHTML = '';
  } else {
    toggleEmpty(_akceEmptyEl, true);
    _akceItemsList.innerHTML = '';
    page.forEach(data => _akceItemsList.appendChild(renderAkceItem(_akceTemplate, data)));
  }

  updatePaginationState(_akcePrevBtn, _akceNextBtn, currentAkcePage, filtered.length);
  if (!(opts && opts.noScroll)) window.scrollTo({ top: 0, behavior: 'smooth' });
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

  const prerenderedList = isPrerenderedList(itemsList);
  if (!prerenderedList) showSkeleton(itemsList, 8);

  try {
    // Bez orderBy — Firestore vylučuje dokumenty bez indexovaného pole
    const snapshot = await db.collection('akce').get();
    allAkceData = snapshot.docs.map(d => loc(d.data())).filter(hasLang)
      .filter(d => d.aktivni !== false)
      .sort((a, b) => dsKey(b.datumSort).localeCompare(dsKey(a.datumSort)));

    const yearSet = new Set();
    const typSet = new Set();
    allAkceData.forEach(d => {
      const y = getYearFromDatumSort(d.datumSort);
      if (y) yearSet.add(y);
      const label = resolveAkceLabel(d);
      if (label) typSet.add(label);
    });
    _akceYears = Array.from(yearSet).sort((a, b) => b - a);
    _akceTypy = Array.from(typSet).sort();

    // Vzdy prekreslit z cerstvych dat z Firestore — prerenderovane HTML
    // ze static exportu muze byt zastarale (nove/aktualni akce pridane po
    // poslednim nasazeni se jinak nezobrazi, dokud se stranka znovu nevyexportuje).
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
    const snapshot = await findBySlug('akce', slug);
    if (snapshot.empty) {
      toggleEmpty(emptyEl, false);
      itemsList.innerHTML = '';
      return;
    }

    const data = await locDetail(snapshot.docs[0].data());
    setDetailLangSwitch(snapshot.docs[0].data(), 'akce');
    const galerie = (data.galerie && data.galerie.length)
      ? data.galerie.filter(Boolean)
      : [data.galerie1, data.galerie2, data.galerie3, data.galerie4].filter(Boolean);

    // Nastav název akce do rezervačního modalu (i v pre-renderovaném režimu)
    const rezCamp = document.getElementById('rez-modal-camp');
    if (rezCamp) rezCamp.textContent = data.nazev || '';
    const rezMailLink = document.getElementById('rez-mail-link');
    if (rezMailLink) rezMailLink.href = `mailto:cihi@bikeskills.cz?subject=${encodeURIComponent(t('Registrace: ') + (data.nazev || t('akce')))}`;
    window._akceNazev = data.nazev || '';

    // Pre-rendered režim: pouze doplnit interaktivitu nad existujícím DOMem
    if (PAGE_PRERENDERED) {
      const itemPre = document.querySelector('.collection-list-wrapper-5 .w-dyn-item');
      if (!itemPre) return;
      const imgPre = itemPre.querySelector('img[item="featured-image"]');
      if (imgPre && imgPre.src) imgPre.onerror = makeImgErrorHandler();

      // Video (není pre-renderované)
      const videoEl = itemPre.querySelector('.video-4');
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

      // Gallery (není pre-renderovaná — vyžaduje runtime + lightbox)
      const galleryBlock = itemPre.querySelector('.div-block-340');
      if (galleryBlock) {
        if (galerie.length) {
          const galItems = galleryBlock.querySelector('.collection-list-15');
          const galTemplate = galleryBlock.querySelector('.collection-item-8.w-dyn-item');
          if (galItems && galTemplate) {
            galItems.innerHTML = '';
            galItems.classList.remove('akce-gal-1', 'akce-gal-2', 'akce-gal-3');
            if (galerie.length <= 3) galItems.classList.add(`akce-gal-${galerie.length}`);
            galerie.forEach(url => {
              const gi = galTemplate.cloneNode(true);
              const gImg = gi.querySelector('img');
              if (gImg) {
                gImg.alt = data.nazev || '';
                gImg.loading = 'lazy';
                setImgWithThumb(gImg, resolveUrl(url));
              }
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
        const akceDiv = itemPre.querySelector('.akce');
        if (akceDiv) akceDiv.appendChild(igDiv);
        else itemPre.appendChild(igDiv);
        if (!document.getElementById('ig-embed-script')) {
          const s = document.createElement('script');
          s.id = 'ig-embed-script'; s.src = 'https://www.instagram.com/embed.js'; s.async = true;
          document.body.appendChild(s);
        }
      }

      attachLightbox(galleryBlock);
      const contentPre = itemPre.querySelector('[item="content"]');
      if (contentPre) {
        attachLightbox(contentPre);
        externalLinksNewTab(contentPre);
      }
      return; // hotovo, pre-rendered režim
    }

    const pageHeading = document.querySelector('.page-heading[acf\\:text="typ-akce"]');
    if (pageHeading) {
      pageHeading.textContent = resolveAkceLabel(data) || data.nazev || '';
      pageHeading.classList.remove('w-dyn-bind-empty');
    }

    setPageMeta(`${data.metaTitle || data.nazev} | BikeSkills`, data.metaDescription || data.popis, data.imageUrl, 'event');
    // Datum na ISO 8601 (YYYY-MM-DD) pro schema.org (Event vyžaduje startDate)
    const akceISOStart = computeAkceISOStart(data);
    const akceImage = (data.imageUrl ? resolveUrl(data.imageUrl) : 'https://bikeskills.cz/images/og-image.jpg');
    const eventSchema = {
      '@context': 'https://schema.org',
      '@type': 'Event',
      'name': data.nazev || '',
      'description': (data.popis || '').replace(/<[^>]*>/g, '').trim().substring(0, 300),
      'image': akceImage,
      'url': window.location.href,
      'eventStatus': 'https://schema.org/EventScheduled',
      'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
      'location': {
        '@type': 'Place',
        'name': 'BikeSkills — Tehov / Říčany u Prahy',
        'address': {
          '@type': 'PostalAddress',
          'streetAddress': 'Na Vyhlídce 285',
          'addressLocality': 'Tehov',
          'postalCode': '25101',
          'addressCountry': 'CZ'
        }
      },
      'organizer': {
        '@type': 'Organization',
        'name': 'BikeSkills',
        'url': 'https://bikeskills.cz'
      },
      'performer': {
        '@type': 'Organization',
        'name': 'BikeSkills',
        'url': 'https://bikeskills.cz'
      }
    };
    if (akceISOStart) {
      eventSchema.startDate = akceISOStart;
      eventSchema.endDate = akceISOStart;
      if (data.cena) {
        eventSchema.offers = {
          '@type': 'Offer',
          'price': String(data.cena),
          'priceCurrency': 'CZK',
          'url': window.location.href,
          'availability': 'https://schema.org/InStock',
          'validFrom': akceISOStart
        };
      }
      injectJsonLd(eventSchema);
    } else {
      // Bez data → Course (opakující se / sezónní kurz)
      const courseSchema = {
        '@context': 'https://schema.org',
        '@type': 'Course',
        'name': data.nazev || '',
        'description': (data.popis || '').replace(/<[^>]*>/g, '').trim().substring(0, 300),
        'image': akceImage,
        'url': window.location.href,
        'provider': {
          '@type': 'Organization',
          'name': 'BikeSkills',
          'url': 'https://bikeskills.cz',
          'sameAs': 'https://bikeskills.cz'
        }
      };
      if (data.cena) {
        const todayIso = new Date().toISOString().split('T')[0];
        courseSchema.offers = {
          '@type': 'Offer',
          'price': String(data.cena),
          'priceCurrency': 'CZK',
          'url': window.location.href,
          'availability': 'https://schema.org/InStock',
          'validFrom': todayIso
        };
      }
      injectJsonLd(courseSchema);
    }
    injectBreadcrumb([
      { name: t('Domů'), item: SITE_URL + HOME_PATH },
      { name: t('Akce'), item: SITE_URL + AKCE_LIST },
      { name: data.nazev || 'Akce', item: window.location.href }
    ]);

    toggleEmpty(emptyEl, true);
    itemsList.innerHTML = '';
    const item = template.cloneNode(true);

    const titleEl = item.querySelector('[item="title"]');
    if (titleEl) { titleEl.textContent = data.nazev || ''; titleEl.classList.remove('w-dyn-bind-empty'); }

    const datumEl = item.querySelector('[acf\\:text="datum"]');
    if (datumEl) { datumEl.textContent = data.datumText || ''; datumEl.classList.remove('w-dyn-bind-empty'); }

    const cenaEl = item.querySelector('[acf\\:text="price"]');
    if (cenaEl) {
      cenaEl.textContent = data.cena ? data.cena.toLocaleString(LOCALE) : '';
      cenaEl.classList.remove('w-dyn-bind-empty');
    }

    const dobaEl = item.querySelector('[acf\\:text="doba-trvani"]');
    if (dobaEl) { dobaEl.textContent = resolveAkceLabel(data); dobaEl.classList.remove('w-dyn-bind-empty'); }

    const ridersEl = item.querySelector('[acf\\:text="riders-number"]');
    if (ridersEl) { ridersEl.textContent = data.stavLabel || data.stav || ''; ridersEl.classList.remove('w-dyn-bind-empty'); }

    const levelEl = item.querySelector('[acf\\:text="akce-level"]');
    if (levelEl) { levelEl.textContent = data.uroven || ''; levelEl.classList.remove('w-dyn-bind-empty'); }

    const imgEl = item.querySelector('img[item="featured-image"]');
    if (imgEl) {
      if (data.imageUrl) {
        setImgWithThumb(imgEl, resolveUrl(data.imageUrl), {
          sizes: '(max-width: 991px) 100vw, 1280px'
        });
      } else {
        imgEl.removeAttribute('onerror');
        imgEl.removeAttribute('srcset');
        imgEl.removeAttribute('sizes');
        imgEl.removeAttribute('data-full-url');
        imgEl.src = PLACEHOLDER_URL;
        imgEl.onerror = makeImgErrorHandler();
      }
      imgEl.alt = data.nazev || '';
      imgEl.width = 1280; imgEl.height = 720;
      imgEl.classList.remove('w-dyn-bind-empty');
    }

    const contentEl = item.querySelector('[item="content"]');
    if (contentEl) {
      contentEl.innerHTML = resolveContentUrls(ensureHtml(data.popis));
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
          galItems.classList.remove('akce-gal-1', 'akce-gal-2', 'akce-gal-3');
          if (galerie.length <= 3) galItems.classList.add(`akce-gal-${galerie.length}`);
          galerie.forEach(url => {
            const gi = galTemplate.cloneNode(true);
            const gImg = gi.querySelector('img');
            if (gImg) {
              gImg.alt = data.nazev || '';
              gImg.loading = 'lazy';
              setImgWithThumb(gImg, resolveUrl(url));
            }
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

  const href = `${BLOG_BASE}${data.slug}${IS_EN ? '' : '/'}`;
  item.querySelectorAll('[item="permalink"]').forEach(el => { el.href = href; });

  const titleEl = item.querySelector('[item="title"], .wrapper--text__title');
  if (titleEl) { titleEl.textContent = data.titulek || ''; titleEl.classList.remove('w-dyn-bind-empty'); }

  const imgEl = item.querySelector('[item="featured-image"], .wrapper-image__img');
  if (imgEl) {
    if (data.imageUrl) {
      setImgWithThumb(imgEl, resolveUrl(data.imageUrl), {
        sizes: '(max-width: 767px) 100vw, (max-width: 991px) 50vw, 50vw'
      });
    } else {
      // Cleanup atributu z prerendered template (cloneNode zachova puvodni inline onerror,
      // srcset a sizes - bez ocisteni se v archivu u placeholder karty zobrazi obrazek
      // z templatu misto sedeho placeholderu).
      imgEl.removeAttribute('onerror');
      imgEl.removeAttribute('srcset');
      imgEl.removeAttribute('sizes');
      imgEl.removeAttribute('data-full-url');
      imgEl.src = PLACEHOLDER_URL;
      imgEl.onerror = makeImgErrorHandler();
    }
    imgEl.alt = data.titulek || '';
    imgEl.width = 800; imgEl.height = 600;
    imgEl.classList.remove('w-dyn-bind-empty');
  }

  return item;
}

async function loadClankyPreview() {
  const wfl = getWebflowList('.collection-list-blog');
  if (!wfl) return;
  const { itemsList, template, emptyEl } = wfl;

  showSkeleton(itemsList, 4);
  try {
    const snapshot = await db.collection('clanky').orderBy('datum', 'desc').limit(4).get();
    const docs = snapshot.docs.map(d => loc(d.data())).filter(hasLang).filter(d => d.publikovano !== false);

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

function renderClankyListPage(opts) {
  if (!_clankyItemsList || !_clankyTemplate) return;

  buildClankyFilterBar(_clankyFilterBar, _clankyYears);

  const filtered = getFilteredClanky();
  const start = (currentClankyPage - 1) * PAGE_SIZE;
  const page = filtered.slice(start, start + PAGE_SIZE);

  if (!page.length) {
    setFilterEmptyText(_clankyEmptyEl, t('Žádný článek neodpovídá vybranému roku.'));
    toggleEmpty(_clankyEmptyEl, false);
    _clankyItemsList.innerHTML = '';
  } else {
    toggleEmpty(_clankyEmptyEl, true);
    _clankyItemsList.innerHTML = '';
    page.forEach(data => _clankyItemsList.appendChild(renderClanekItem(_clankyTemplate, data)));
  }

  updatePaginationState(_clankyPrevBtn, _clankyNextBtn, currentClankyPage, filtered.length);
  if (!(opts && opts.noScroll)) window.scrollTo({ top: 0, behavior: 'smooth' });
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

  const prerenderedList = isPrerenderedList(itemsList);
  if (!prerenderedList) showSkeleton(itemsList, 8);

  try {
    const snapshot = await db.collection('clanky').orderBy('datum', 'desc').get();
    allClankyData = snapshot.docs.map(d => loc(d.data())).filter(hasLang).filter(d => d.publikovano !== false);

    const yearSet = new Set();
    allClankyData.forEach(d => {
      const y = getYearFromTimestamp(d.datum);
      if (y) yearSet.add(y);
    });
    _clankyYears = Array.from(yearSet).sort((a, b) => b - a);

    // Vzdy prekreslit z cerstvych dat z Firestore — prerenderovane HTML
    // ze static exportu muze byt zastarale (nove clanky pridane po poslednim
    // nasazeni se jinak nezobrazi, dokud se stranka znovu nevyexportuje).
    renderClankyListPage();
  } catch (err) {
    console.error('Chyba načítání clanky list:', err);
  }
}

async function loadClanekDetail(slug) {
  try {
    const snapshot = await findBySlug('clanky', slug);
    if (snapshot.empty) return;

    const data = await locDetail(snapshot.docs[0].data());
    setDetailLangSwitch(snapshot.docs[0].data(), 'clanky');
    const datum = data.datum
      ? new Date(data.datum.seconds ? data.datum.seconds * 1000 : data.datum).toLocaleDateString(LOCALE, IS_EN ? { day: 'numeric', month: 'long', year: 'numeric' } : undefined)
      : '';
    const galerie = (data.galerie && data.galerie.length)
      ? data.galerie.filter(Boolean)
      : [data.galerie1, data.galerie2, data.galerie3, data.galerie4].filter(Boolean);

    if (!PAGE_PRERENDERED) {
      // Pre-rendered HTML již obsahuje meta + JSON-LD + title/date/author/content/img.
      // Při SSG režimu přeskočíme DOM mutaci hlavičky a hlavního obsahu — jen
      // dotahujeme galerii, video, related-posts (ty pre-renderované nejsou).
      setPageMeta(`${data.metaTitle || data.titulek} | BikeSkills`, data.metaDescription || data.popis || data.perex, galerie[0] || data.imageUrl, 'article');
      const postPublishedISO = data.datum
        ? new Date(data.datum.seconds ? data.datum.seconds * 1000 : data.datum).toISOString()
        : null;
      const postModifiedISO = data.datumZmeny
        ? new Date(data.datumZmeny.seconds ? data.datumZmeny.seconds * 1000 : data.datumZmeny).toISOString()
        : postPublishedISO;
      const postImage = (galerie[0] || data.imageUrl)
        ? resolveUrl(galerie[0] || data.imageUrl)
        : 'https://bikeskills.cz/images/og-image.jpg';
      const articleSchema = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        'headline': (data.titulek || '').substring(0, 110),
        'description': (data.popis || data.perex || '').replace(/<[^>]*>/g, '').trim().substring(0, 300),
        'image': postImage,
        'author': { '@type': 'Person', 'name': data.autor || 'BikeSkills' },
        'publisher': {
          '@type': 'Organization',
          'name': 'BikeSkills',
          'url': 'https://bikeskills.cz',
          'logo': { '@type': 'ImageObject', 'url': 'https://bikeskills.cz/images/webclip.png', 'width': 256, 'height': 256 }
        },
        'url': window.location.href,
        'mainEntityOfPage': { '@type': 'WebPage', '@id': window.location.href }
      };
      if (postPublishedISO) articleSchema.datePublished = postPublishedISO;
      if (postModifiedISO) articleSchema.dateModified = postModifiedISO;
      injectJsonLd(articleSchema);
      injectBreadcrumb([
        { name: t('Domů'), item: SITE_URL + HOME_PATH },
        { name: 'Blog', item: SITE_URL + BLOG_LIST },
        { name: data.titulek || t('Článek'), item: window.location.href }
      ]);

      const titleEl = document.querySelector('[item="title"].heading-83, .div-block-325 [item="title"]');
      if (titleEl) { titleEl.textContent = data.titulek || ''; titleEl.classList.remove('w-dyn-bind-empty'); }

      const dateEl = document.querySelector('[item="date"].blog-date-author, .div-block-326 [item="date"]');
      if (dateEl) { dateEl.textContent = datum; dateEl.classList.remove('w-dyn-bind-empty'); }

      const authorEl = document.querySelector('[item="author-display-name"].blog-date-author, .div-block-326 [item="author-display-name"]');
      if (authorEl) { authorEl.textContent = data.autor || ''; authorEl.classList.remove('w-dyn-bind-empty'); }

      const contentEl = document.querySelector('[item="content"].rich-text-block-3, .div-block-325 [item="content"]');
      if (contentEl) {
        contentEl.innerHTML = resolveContentUrls(ensureHtml(processWpContent(data.obsah)));
        contentEl.classList.remove('w-dyn-bind-empty');
        contentEl.querySelectorAll('img').forEach(img => { img.onerror = function() { this.style.display = 'none'; }; });
      }

      const imgEl = document.querySelector('.div-block-324 img[item="featured-image"], img[item="featured-image"].image-53');
      if (imgEl) {
        if (data.imageUrl) {
          setImgWithThumb(imgEl, resolveUrl(data.imageUrl), {
            sizes: '(max-width: 991px) 100vw, 1280px'
          });
          imgEl.alt = data.titulek || '';
          imgEl.width = 1280; imgEl.height = 720;
          imgEl.classList.remove('w-dyn-bind-empty');
          const wrap = imgEl.parentElement;
          if (wrap) wrap.style.display = '';
        } else {
          const wrap = imgEl.parentElement;
          if (wrap) wrap.style.display = 'none';
        }
      }
    } else {
      // V pre-rendered režimu navíc napojit onerror handler na hlavní fotku
      const imgEl = document.querySelector('.div-block-324 img[item="featured-image"], img[item="featured-image"].image-53');
      if (imgEl && imgEl.src) imgEl.onerror = makeImgErrorHandler();
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
            gImg.alt = data.titulek || '';
            gImg.style.cssText = 'width:100%;aspect-ratio:4/3;object-fit:cover;display:block;min-width:0;';
            gImg.classList.remove('w-dyn-bind-empty');
            setImgWithThumb(gImg, resolveUrl(url));
          }
          galItems.appendChild(gi);
        });
        const emptyState = document.querySelector('.collection-list-wrapper-6 .w-dyn-empty');
        if (emptyState) emptyState.style.display = 'none';
        // Lightbox na fotky galerie
        attachLightbox(galItems);
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
          .map(d => loc(d.data())).filter(hasLang)
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

    // Lightbox na fotky obsahu + úvodní fotku + externí linky v novém panelu
    // Querujeme přímo (contentEl je definován jen v !PAGE_PRERENDERED větvi)
    attachLightbox(document.querySelector('[item="content"].rich-text-block-3, .div-block-325 [item="content"]'));
    attachLightbox(document.querySelector('.div-block-324'));
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

  const href = `${TEAM_BASE}${data.slug}`;
  item.querySelectorAll('[item="permalink"]').forEach(el => { el.href = href; });

  const titleEl = item.querySelector('[item="title"], .text-block-135');
  if (titleEl) { titleEl.textContent = data.jmeno || ''; titleEl.classList.remove('w-dyn-bind-empty'); }

  const excerptEl = item.querySelector('[item="excerpt"], .text-block-136');
  if (excerptEl) {
    const bio = (data.popis || '').replace(/<[^>]*>/g, '').trim();
    excerptEl.textContent = bio.length > 120 ? bio.substring(0, 120) + '…' : bio;
    excerptEl.classList.remove('w-dyn-bind-empty');
  }

  const imgEl = item.querySelector('[item="featured-image"], .image-49');
  if (imgEl) {
    if (data.imageUrl) {
      setImgWithThumb(imgEl, resolveUrl(data.imageUrl), {
        sizes: '(max-width: 767px) 50vw, (max-width: 991px) 33vw, 25vw'
      });
    } else {
      imgEl.removeAttribute('onerror');
      imgEl.removeAttribute('srcset');
      imgEl.removeAttribute('sizes');
      imgEl.removeAttribute('data-full-url');
      imgEl.src = PLACEHOLDER_URL;
      imgEl.onerror = makeImgErrorHandler();
    }
    imgEl.alt = data.jmeno || '';
    imgEl.width = 800; imgEl.height = 1000;
    imgEl.classList.remove('w-dyn-bind-empty');
  }

  return item;
}

async function loadTeamList() {
  const wfl = getWebflowList('.collection-list-wrapper-3');
  if (!wfl) return;
  const { itemsList, template, emptyEl } = wfl;

  showSkeleton(itemsList, 6);

  try {
    const snapshot = await db.collection('team').orderBy('poradi', 'asc').get();
    const docs = snapshot.docs.map(d => loc(d.data())).filter(hasLang).filter(d => d.aktivni !== false);

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
    const snapshot = await findBySlug('team', slug);
    if (snapshot.empty) { container.innerHTML = '<p>' + t('Člen týmu nenalezen.') + '</p>'; return; }

    const data = await locDetail(snapshot.docs[0].data());
    setDetailLangSwitch(snapshot.docs[0].data(), 'team');
    const galerie = (data.galerie && data.galerie.length)
      ? data.galerie.filter(Boolean)
      : [];

    setPageMeta(`${data.jmeno} | BikeSkills Team`, data.bio || data.popis, data.imageUrl, 'profile');
    injectJsonLd({
      '@context': 'https://schema.org',
      '@type': 'Person',
      'name': data.jmeno || '',
      'description': (data.bio || data.popis || '').replace(/<[^>]*>/g, '').trim().substring(0, 200),
      'image': data.imageUrl ? resolveUrl(data.imageUrl) : 'https://bikeskills.cz/images/webclip.png',
      'url': window.location.href,
      'memberOf': { '@type': 'Organization', 'name': 'BikeSkills', 'url': 'https://bikeskills.cz' }
    });
    injectBreadcrumb([
      { name: t('Domů'), item: SITE_URL + HOME_PATH },
      { name: t('Tým'), item: SITE_URL + TEAM_LIST },
      { name: data.jmeno || t('Člen týmu'), item: window.location.href }
    ]);
    const h1El = container.querySelector('h1.page-heading');
    if (h1El) h1El.textContent = data.jmeno || '';

    // Jméno
    const titleEl = container.querySelector('[item="title"]');
    if (titleEl) { titleEl.textContent = data.jmeno || ''; titleEl.classList.remove('w-dyn-bind-empty'); }

    // Bio
    const contentEl = container.querySelector('[item="content"]');
    if (contentEl) { contentEl.innerHTML = resolveContentUrls(ensureHtml(data.popis || '')); contentEl.classList.remove('w-dyn-bind-empty'); }

    // Hlavní fotka
    const imgEl = container.querySelector('img[item="featured-image"]');
    if (imgEl) {
      if (data.imageUrl) {
        setImgWithThumb(imgEl, resolveUrl(data.imageUrl), {
          sizes: '(max-width: 767px) 100vw, 800px'
        });
      } else {
        imgEl.removeAttribute('onerror');
        imgEl.removeAttribute('srcset');
        imgEl.removeAttribute('sizes');
        imgEl.removeAttribute('data-full-url');
        imgEl.src = PLACEHOLDER_URL;
        imgEl.onerror = makeImgErrorHandler();
      }
      imgEl.alt = data.jmeno || '';
      imgEl.width = 1280; imgEl.height = 1600;
      imgEl.classList.remove('w-dyn-bind-empty');
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
        imgSlot.alt = data.jmeno || '';
        setImgWithThumb(imgSlot, resolveUrl(url));
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

// ============================================================
// REZERVAČNÍ FORMULÁŘ
// ============================================================
(function() {
  const SEND_URL = 'https://europe-west1-bikeskills-web.cloudfunctions.net/sendReservation';

  function closeModal() {
    const m = document.getElementById('rezervace-modal');
    if (m) m.style.display = 'none';
  }

  function showError(msg) {
    const el = document.getElementById('rez-error');
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  }

  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function checked(id) {
    const el = document.getElementById(id);
    return el ? el.checked : false;
  }

  function resetForm() {
    const form = document.getElementById('rezervace-form');
    if (form) form.reset();
    showError('');
    const wrap = document.getElementById('rez-form-wrap');
    const dekuji = document.getElementById('rez-dekuji');
    if (wrap) wrap.style.display = '';
    if (dekuji) dekuji.style.display = 'none';
    const btn = document.getElementById('rez-submit');
    if (btn) { btn.disabled = false; btn.textContent = t('ODESLAT'); }
  }

  document.addEventListener('click', function(e) {
    const modal = document.getElementById('rezervace-modal');
    if (modal && e.target === modal) { resetForm(); closeModal(); }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { resetForm(); closeModal(); }
  });

  document.addEventListener('submit', async function(e) {
    if (!e.target || e.target.id !== 'rezervace-form') return;
    e.preventDefault();

    const jmenoPrijmeni = val('rez-jmeno-prijmeni');
    const email = val('rez-email');
    const telefon = val('rez-telefon');
    const termin = val('rez-termin');
    const typKola = val('rez-typ-kola');
    const pocet = val('rez-pocet');
    const poznamka = val('rez-poznamka');
    const gdpr = checked('rez-gdpr');
    const nazevAkce = window._akceNazev || document.getElementById('rez-modal-camp')?.textContent || '';

    if (!jmenoPrijmeni) { showError(t('Vyplňte prosím jméno a příjmení.')); return; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError(t('Zadejte platný e-mail.')); return; }
    if (!gdpr) { showError(t('Pro odeslání je nutný souhlas se zásadami ochrany osobních údajů.')); return; }
    showError('');

    const btn = document.getElementById('rez-submit');
    if (btn) { btn.disabled = true; btn.textContent = t('Odesílám…'); }

    try {
      const resp = await fetch(SEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jmenoPrijmeni, email, telefon, termin, typKola, pocet, poznamka, nazevAkce, lang: LANG }),
      });

      if (!resp.ok) throw new Error('server error');

      const wrap = document.getElementById('rez-form-wrap');
      const dekuji = document.getElementById('rez-dekuji');
      const textEl = document.getElementById('rez-dekuji-text');

      if (textEl && IS_EN) textEl.innerHTML =
        `Thank you for signing up for <strong>${escapeHtml(nazevAkce || 'the camp')}</strong>.<br><br>` +
        `Once we process your registration, we will contact you with the details. ` +
        `We are also sending a confirmation to the e-mail address you entered. ` +
        `If you don't receive it, please contact us at ` +
        `<a href="mailto:info@bikeskills.cz">info@bikeskills.cz</a>.`;
      else if (textEl) textEl.innerHTML =
        `Děkujeme za přihlášení na <strong>${nazevAkce || 'camp'}</strong>.<br><br>` +
        `Po zpracování přihlášky vás kontaktujeme s detaily. ` +
        `Na zadaný mail vám také posíláme potvrzení. ` +
        `Pokud byste jej nedostali, kontaktujte nás na ` +
        `<a href="mailto:info@bikeskills.cz">info@bikeskills.cz</a>.`;

      if (wrap) wrap.style.display = 'none';
      if (dekuji) dekuji.style.display = 'block';
    } catch (err) {
      console.error('Rezervace error:', err);
      if (btn) { btn.disabled = false; btn.textContent = t('ODESLAT'); }
      showError(t('Nepodařilo se odeslat. Zkuste to prosím znovu nebo nás kontaktujte na info@bikeskills.cz.'));
    }
  });
})();
