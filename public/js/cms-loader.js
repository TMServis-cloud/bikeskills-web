/**
 * BIKESKILLS CMS Loader
 * Načítá akce a články z Firebase Firestore a renderuje na frontend
 */

// ============================================================
// FIREBASE CONFIG
// ============================================================
// TODO: Nahradit skutečnou konfigurací po vytvoření Firebase projektu
const firebaseConfig = {
  apiKey: "AIzaSyD-DnZA0IV6S7iGTAayrMdxSyndNJ8JqZM",
  authDomain: "bikeskills-web.firebaseapp.com",
  projectId: "bikeskills-web",
  storageBucket: "bikeskills-web.firebasestorage.app",
  messagingSenderId: "804622076781",
  appId: "1:804622076781:web:0cc99211c3c36f27842864",
  measurementId: "G-Y1GJE85WDX"
};

// Initialize Firebase only if not already initialized
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();

// ============================================================
// STATUS CONFIGURATION
// ============================================================
const STATUS_CONFIG = {
  otevreno: { label: 'Otevřeno', class: 'status-open' },
  prihlasujte: { label: 'Přihlašujte se', class: 'status-register' },
  obsazeno: { label: 'Obsazeno', class: 'status-full' },
  odjeto: { label: 'Odjeto', class: 'status-done' }
};

// ============================================================
// PAGE DETECTION & INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;

  // Homepage - load preview of akce and articles
  if (path === '/' || path === '/index.html' || path === '/index') {
    loadAkcePreview();
    loadClankyPreview();
  }

  // Akce list page
  if (path === '/akce' || path === '/akce.html' || path === '/akce/') {
    loadAkceList();
  }

  // Akce detail page
  if (path.startsWith('/akce/') && path !== '/akce/' && path !== '/akce.html') {
    const slug = path.split('/akce/')[1].replace(/\/$/, '');
    if (slug) loadAkceDetail(slug);
  }

  // Blog list page
  if (path === '/blog' || path === '/blog.html' || path === '/blog/') {
    loadClankyList();
  }

  // Blog detail page
  if (path.startsWith('/blog/') && path !== '/blog/' && path !== '/blog.html') {
    const slug = path.split('/blog/')[1].replace(/\/$/, '');
    if (slug) loadClanekDetail(slug);
  }
});

// ============================================================
// AKCE (EVENTS)
// ============================================================

/**
 * Load preview of upcoming events for homepage
 */
async function loadAkcePreview() {
  const container = document.getElementById('akce-preview');
  if (!container) return;

  try {
    const today = new Date().toISOString().split('T')[0];
    const snapshot = await db.collection('akce')
      .where('aktivni', '==', true)
      .orderBy('datumSort', 'asc')
      .limit(6)
      .get();

    if (snapshot.empty) {
      container.innerHTML = '<p class="cms-empty">Aktuálně nemáme naplánované žádné akce.</p>';
      return;
    }

    container.innerHTML = '';
    snapshot.forEach(doc => {
      const data = doc.data();
      container.appendChild(createAkceCard(data));
    });
  } catch (error) {
    console.error('Error loading akce preview:', error);
  }
}

/**
 * Load full list of events
 */
async function loadAkceList() {
  const container = document.getElementById('akce-list');
  if (!container) return;

  try {
    const snapshot = await db.collection('akce')
      .where('aktivni', '==', true)
      .orderBy('datumSort', 'desc')
      .get();

    if (snapshot.empty) {
      container.innerHTML = '<p class="cms-empty">Aktuálně nemáme naplánované žádné akce.</p>';
      return;
    }

    container.innerHTML = '';
    snapshot.forEach(doc => {
      const data = doc.data();
      container.appendChild(createAkceCard(data));
    });
  } catch (error) {
    console.error('Error loading akce list:', error);
  }
}

/**
 * Load event detail by slug
 */
async function loadAkceDetail(slug) {
  const container = document.getElementById('akce-detail');
  if (!container) return;

  try {
    const snapshot = await db.collection('akce')
      .where('slug', '==', slug)
      .limit(1)
      .get();

    if (snapshot.empty) {
      container.innerHTML = '<p class="cms-empty">Akce nenalezena.</p>';
      return;
    }

    const data = snapshot.docs[0].data();
    const status = STATUS_CONFIG[data.stav] || STATUS_CONFIG.otevreno;

    container.innerHTML = `
      <div class="akce-detail-content">
        ${data.imageUrl ? `<div class="akce-detail-image"><img src="${data.imageUrl}" alt="${escapeHtml(data.nazev)}" loading="lazy"></div>` : ''}
        <div class="akce-detail-info">
          <h1 class="akce-detail-title">${escapeHtml(data.nazev)}</h1>
          <div class="akce-detail-meta">
            ${data.datumText ? `<span class="akce-meta-item"><strong>Datum:</strong> ${escapeHtml(data.datumText)}</span>` : ''}
            ${data.uroven ? `<span class="akce-meta-item"><strong>Úroveň:</strong> ${escapeHtml(data.uroven)}</span>` : ''}
            ${data.cena ? `<span class="akce-meta-item"><strong>Cena:</strong> ${data.cena.toLocaleString('cs-CZ')} CZK</span>` : ''}
            <span class="akce-meta-item"><strong>Stav:</strong> <span class="akce-status ${status.class}">${status.label}</span></span>
          </div>
          <div class="akce-detail-description">${data.popis || ''}</div>
        </div>
      </div>
    `;

    // Update page title
    document.title = `${data.nazev} | BIKESKILLS`;
  } catch (error) {
    console.error('Error loading akce detail:', error);
    container.innerHTML = '<p class="cms-empty">Chyba načítání akce.</p>';
  }
}

/**
 * Create an event card element
 */
function createAkceCard(data) {
  const status = STATUS_CONFIG[data.stav] || STATUS_CONFIG.otevreno;
  const card = document.createElement('a');
  card.href = `/akce/${data.slug}/`;
  card.className = 'akce-card w-inline-block';

  card.innerHTML = `
    ${data.imageUrl ? `<div class="akce-card-image"><img src="${data.imageUrl}" alt="${escapeHtml(data.nazev)}" loading="lazy"></div>` : ''}
    <div class="akce-card-content">
      <h3 class="akce-card-title">${escapeHtml(data.nazev)}</h3>
      <div class="akce-card-date">${escapeHtml(data.datumText || '')}</div>
      <div class="akce-card-level">${escapeHtml(data.uroven || '')}</div>
      <div class="akce-card-description">${escapeHtml((data.popis || '').substring(0, 150))}${(data.popis || '').length > 150 ? '...' : ''}</div>
      <div class="akce-card-footer">
        <span class="akce-card-status ${status.class}">${status.label}</span>
        ${data.cena ? `<span class="akce-card-price">${data.cena.toLocaleString('cs-CZ')}<span class="akce-card-currency">,- CZK</span></span>` : ''}
      </div>
    </div>
  `;

  return card;
}

// ============================================================
// ČLÁNKY (ARTICLES)
// ============================================================

/**
 * Load preview of latest articles for homepage
 */
async function loadClankyPreview() {
  const container = document.getElementById('clanky-preview');
  if (!container) return;

  try {
    const snapshot = await db.collection('clanky')
      .where('publikovano', '==', true)
      .orderBy('datum', 'desc')
      .limit(4)
      .get();

    if (snapshot.empty) {
      container.innerHTML = '<p class="cms-empty">Zatím nemáme žádné články.</p>';
      return;
    }

    container.innerHTML = '';
    snapshot.forEach(doc => {
      const data = doc.data();
      container.appendChild(createClanekCard(data));
    });
  } catch (error) {
    console.error('Error loading clanky preview:', error);
  }
}

/**
 * Load full list of articles
 */
async function loadClankyList() {
  const container = document.getElementById('clanky-list');
  if (!container) return;

  try {
    const snapshot = await db.collection('clanky')
      .where('publikovano', '==', true)
      .orderBy('datum', 'desc')
      .get();

    if (snapshot.empty) {
      container.innerHTML = '<p class="cms-empty">Zatím nemáme žádné články.</p>';
      return;
    }

    container.innerHTML = '';
    snapshot.forEach(doc => {
      const data = doc.data();
      container.appendChild(createClanekCard(data));
    });
  } catch (error) {
    console.error('Error loading clanky list:', error);
  }
}

/**
 * Load article detail by slug
 */
async function loadClanekDetail(slug) {
  const container = document.getElementById('clanek-detail');
  if (!container) return;

  try {
    const snapshot = await db.collection('clanky')
      .where('slug', '==', slug)
      .limit(1)
      .get();

    if (snapshot.empty) {
      container.innerHTML = '<p class="cms-empty">Článek nenalezen.</p>';
      return;
    }

    const data = snapshot.docs[0].data();
    const datum = data.datum
      ? new Date(data.datum.seconds ? data.datum.seconds * 1000 : data.datum).toLocaleDateString('cs-CZ')
      : '';

    container.innerHTML = `
      <article class="clanek-detail-content">
        ${data.imageUrl ? `<div class="clanek-detail-image"><img src="${data.imageUrl}" alt="${escapeHtml(data.titulek)}" loading="lazy"></div>` : ''}
        <h1 class="clanek-detail-title">${escapeHtml(data.titulek)}</h1>
        <div class="clanek-detail-meta">
          ${datum ? `<span class="clanek-meta-date">${datum}</span>` : ''}
          ${data.autor ? `<span class="clanek-meta-author">${escapeHtml(data.autor)}</span>` : ''}
        </div>
        <div class="clanek-detail-body">${data.obsah || ''}</div>
      </article>
    `;

    // Update page title
    document.title = `${data.titulek} | BIKESKILLS`;
  } catch (error) {
    console.error('Error loading clanek detail:', error);
    container.innerHTML = '<p class="cms-empty">Chyba načítání článku.</p>';
  }
}

/**
 * Create an article card element
 */
function createClanekCard(data) {
  const datum = data.datum
    ? new Date(data.datum.seconds ? data.datum.seconds * 1000 : data.datum).toLocaleDateString('cs-CZ')
    : '';

  const card = document.createElement('a');
  card.href = `/blog/${data.slug}/`;
  card.className = 'clanek-card w-inline-block';

  card.innerHTML = `
    ${data.imageUrl ? `<div class="clanek-card-image"><img src="${data.imageUrl}" alt="${escapeHtml(data.titulek)}" loading="lazy"></div>` : ''}
    <div class="clanek-card-content">
      <h3 class="clanek-card-title">${escapeHtml(data.titulek)}</h3>
      ${datum ? `<div class="clanek-card-date">${datum}</div>` : ''}
      ${data.perex ? `<div class="clanek-card-perex">${escapeHtml(data.perex)}</div>` : ''}
      <span class="clanek-card-link">Číst dále</span>
    </div>
  `;

  return card;
}

// ============================================================
// UTILITY
// ============================================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
