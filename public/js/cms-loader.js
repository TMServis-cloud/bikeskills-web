/**
 * BIKESKILLS CMS Loader
 * Načítá akce a články z Firebase Firestore a renderuje do Webflow HTML struktury.
 *
 * Webflow používá šablonové .w-dyn-item elementy uvnitř .w-dyn-items.
 * Tento skript klonuje šablonu, naplní daty z Firestore a zobrazí výsledky.
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

/**
 * Získá seznam prvků a šablonu z Webflow .w-dyn-list struktury.
 * @param {string} containerSelector - CSS selektor pro .w-dyn-list nebo rodičovský kontejner
 * @returns {{ itemsList: Element, template: Element, emptyEl: Element } | null}
 */
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

/**
 * Po naplnění seznamu: skryje empty state, nebo ho zobrazí pokud nic není.
 */
function toggleEmpty(emptyEl, hasItems) {
  if (!emptyEl) return;
  emptyEl.style.display = hasItems ? 'none' : '';
}

// ============================================================
// PAGE DETECTION & INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;

  if (path === '/' || path === '/index.html' || path === '/index') {
    loadAkcePreview();
    loadClankyPreview();
  }

  if (path === '/akce-archive' || path === '/akce-archive.html' || path === '/akce-archive/' || path === '/akce' || path === '/akce/') {
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
});

// ============================================================
// AKCE (UDÁLOSTI)
// ============================================================

/**
 * Vytvoří naklonovaný akce-item a naplní ho daty.
 * Struktura akce karty v Webflow HTML:
 *   .collection-item-akce.w-dyn-item
 *     a.akce-box[item="permalink"]
 *       .akce-text-blok
 *         h3.akce-heading[item="title"]
 *         .akce-datum[acf:text="datum"]
 *       .akce-level[acf:text="akce-level"]
 *       .akce-image-blok
 *         img.image-55[item="featured-image"]
 *       .div-block-330
 *         .akce-ridersnumber[acf:text="riders-number"]
 *         .akce-cena[acf:text="price"]
 */
function renderAkceItem(template, data) {
  const item = template.cloneNode(true);

  // Permalink
  const href = `/akce/${data.slug}/`;
  item.querySelectorAll('[item="permalink"], a.akce-box').forEach(el => { el.href = href; });

  // Název
  const titleEl = item.querySelector('[item="title"], .akce-heading');
  if (titleEl) {
    titleEl.textContent = data.nazev || '';
    titleEl.classList.remove('w-dyn-bind-empty');
  }

  // Datum
  const datumEl = item.querySelector('.akce-datum, [acf\\:text="datum"]');
  if (datumEl) {
    datumEl.textContent = data.datumText || '';
    datumEl.classList.remove('w-dyn-bind-empty');
  }

  // Úroveň jezdců
  const levelEl = item.querySelector('.akce-level, [acf\\:text="akce-level"]');
  if (levelEl) {
    levelEl.textContent = data.uroven || '';
    levelEl.classList.remove('w-dyn-bind-empty');
  }

  // Obrázek
  const imgEl = item.querySelector('[item="featured-image"], img.image-55');
  if (imgEl) {
    if (data.imageUrl) {
      imgEl.src = data.imageUrl;
      imgEl.alt = data.nazev || '';
      imgEl.classList.remove('w-dyn-bind-empty');
    } else {
      const imgBlock = imgEl.closest('.akce-image-blok');
      if (imgBlock) imgBlock.style.display = 'none';
    }
  }

  // Stav / obsazenost
  const ridersEl = item.querySelector('.akce-ridersnumber, [acf\\:text="riders-number"]');
  if (ridersEl) {
    ridersEl.textContent = data.stavLabel || data.stav || '';
    ridersEl.classList.remove('w-dyn-bind-empty');
  }

  // Cena
  const cenaEl = item.querySelector('.akce-cena, [acf\\:text="price"]');
  if (cenaEl) {
    cenaEl.textContent = data.cena ? data.cena.toLocaleString('cs-CZ') : '';
    cenaEl.classList.remove('w-dyn-bind-empty');
    // Skrýt ",-CZK" pokud není cena
    if (!data.cena) {
      const cenaAfter = cenaEl.nextElementSibling;
      if (cenaAfter && cenaAfter.classList.contains('akce-cena-after')) {
        cenaAfter.style.display = 'none';
      }
    }
  }

  return item;
}

async function loadAkcePreview() {
  const wfl = getWebflowList('.collection-list-wrappe-campy');
  if (!wfl) return;
  const { itemsList, template, emptyEl } = wfl;

  try {
    const snapshot = await db.collection('akce')
      .where('aktivni', '==', true)
      .orderBy('datumSort', 'asc')
      .limit(6)
      .get();

    if (snapshot.empty) {
      toggleEmpty(emptyEl, false);
      itemsList.innerHTML = '';
      return;
    }

    toggleEmpty(emptyEl, true);
    itemsList.innerHTML = '';
    snapshot.forEach(doc => {
      itemsList.appendChild(renderAkceItem(template, doc.data()));
    });
  } catch (err) {
    console.error('Chyba načítání akce preview:', err);
  }
}

async function loadAkceList() {
  const wfl = getWebflowList('.collection-list-wrappe-campy');
  if (!wfl) return;
  const { itemsList, template, emptyEl } = wfl;

  try {
    const snapshot = await db.collection('akce')
      .where('aktivni', '==', true)
      .orderBy('datumSort', 'desc')
      .get();

    if (snapshot.empty) {
      toggleEmpty(emptyEl, false);
      itemsList.innerHTML = '';
      return;
    }

    toggleEmpty(emptyEl, true);
    itemsList.innerHTML = '';
    snapshot.forEach(doc => {
      itemsList.appendChild(renderAkceItem(template, doc.data()));
    });
  } catch (err) {
    console.error('Chyba načítání akce list:', err);
  }
}

async function loadAkceDetail(slug) {
  const container = document.getElementById('akce-detail');
  if (!container) return;

  try {
    const snapshot = await db.collection('akce')
      .where('slug', '==', slug)
      .limit(1)
      .get();

    if (snapshot.empty) {
      container.innerHTML = '<p>Akce nenalezena.</p>';
      return;
    }

    const data = snapshot.docs[0].data();
    const statusLabels = { otevreno: 'Otevřeno', prihlasujte: 'Přihlašujte se', obsazeno: 'Obsazeno', odjeto: 'Odjeto' };
    const stavLabel = statusLabels[data.stav] || data.stavLabel || '';

    container.innerHTML = `
      <div class="akce-detail-content">
        ${data.imageUrl ? `<div class="akce-detail-image"><img src="${escapeHtml(data.imageUrl)}" alt="${escapeHtml(data.nazev)}" loading="lazy"></div>` : ''}
        <h1>${escapeHtml(data.nazev)}</h1>
        <div class="akce-detail-meta">
          ${data.datumText ? `<span><strong>Datum:</strong> ${escapeHtml(data.datumText)}</span>` : ''}
          ${data.uroven ? `<span><strong>Úroveň:</strong> ${escapeHtml(data.uroven)}</span>` : ''}
          ${data.cena ? `<span><strong>Cena:</strong> ${data.cena.toLocaleString('cs-CZ')} CZK</span>` : ''}
          ${stavLabel ? `<span><strong>Stav:</strong> ${escapeHtml(stavLabel)}</span>` : ''}
        </div>
        <div class="akce-detail-description">${data.popis || ''}</div>
      </div>
    `;
    document.title = `${data.nazev} | BIKESKILLS`;
  } catch (err) {
    console.error('Chyba načítání akce detail:', err);
  }
}

// ============================================================
// ČLÁNKY (BLOG)
// ============================================================

/**
 * Vytvoří naklonovaný blog-item a naplní ho daty.
 * Struktura blog karty v Webflow HTML:
 *   .collection-blog-item.w-dyn-item
 *     a.collection-item__card-blog[item="permalink"]
 *       .card-blog__wrapper-image
 *         img.wrapper-image__img[item="featured-image"]
 *       .card-blog__wrapper-text
 *         h2/h3.wrapper--text__title[item="title"]
 *     .secondary-link-block.blog
 *       a[item="permalink"] "Číst dále"
 */
function renderClanekItem(template, data) {
  const item = template.cloneNode(true);

  const href = `/blog/${data.slug}/`;
  item.querySelectorAll('[item="permalink"]').forEach(el => { el.href = href; });

  // Titulek
  const titleEl = item.querySelector('[item="title"], .wrapper--text__title');
  if (titleEl) {
    titleEl.textContent = data.titulek || '';
    titleEl.classList.remove('w-dyn-bind-empty');
  }

  // Obrázek
  const imgEl = item.querySelector('[item="featured-image"], .wrapper-image__img');
  if (imgEl) {
    if (data.imageUrl) {
      imgEl.src = data.imageUrl;
      imgEl.alt = data.titulek || '';
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
    const snapshot = await db.collection('clanky')
      .where('publikovano', '==', true)
      .orderBy('datum', 'desc')
      .limit(4)
      .get();

    if (snapshot.empty) {
      toggleEmpty(emptyEl, false);
      itemsList.innerHTML = '';
      return;
    }

    toggleEmpty(emptyEl, true);
    itemsList.innerHTML = '';
    snapshot.forEach(doc => {
      itemsList.appendChild(renderClanekItem(template, doc.data()));
    });
  } catch (err) {
    console.error('Chyba načítání clanky preview:', err);
  }
}

async function loadClankyList() {
  const wfl = getWebflowList('.collection-list-blog');
  if (!wfl) return;
  const { itemsList, template, emptyEl } = wfl;

  try {
    const snapshot = await db.collection('clanky')
      .where('publikovano', '==', true)
      .orderBy('datum', 'desc')
      .get();

    if (snapshot.empty) {
      toggleEmpty(emptyEl, false);
      itemsList.innerHTML = '';
      return;
    }

    toggleEmpty(emptyEl, true);
    itemsList.innerHTML = '';
    snapshot.forEach(doc => {
      itemsList.appendChild(renderClanekItem(template, doc.data()));
    });
  } catch (err) {
    console.error('Chyba načítání clanky list:', err);
  }
}

async function loadClanekDetail(slug) {
  const container = document.getElementById('clanek-detail');
  if (!container) return;

  try {
    const snapshot = await db.collection('clanky')
      .where('slug', '==', slug)
      .limit(1)
      .get();

    if (snapshot.empty) {
      container.innerHTML = '<p>Článek nenalezen.</p>';
      return;
    }

    const data = snapshot.docs[0].data();
    const datum = data.datum
      ? new Date(data.datum.seconds ? data.datum.seconds * 1000 : data.datum).toLocaleDateString('cs-CZ')
      : '';

    container.innerHTML = `
      <article>
        ${data.imageUrl ? `<div class="clanek-detail-image"><img src="${escapeHtml(data.imageUrl)}" alt="${escapeHtml(data.titulek)}" loading="lazy"></div>` : ''}
        <h1>${escapeHtml(data.titulek)}</h1>
        <div class="clanek-detail-meta">
          ${datum ? `<span>${datum}</span>` : ''}
          ${data.autor ? `<span>${escapeHtml(data.autor)}</span>` : ''}
        </div>
        <div class="clanek-detail-body">${data.obsah || ''}</div>
      </article>
    `;
    document.title = `${data.titulek} | BIKESKILLS`;
  } catch (err) {
    console.error('Chyba načítání clanek detail:', err);
  }
}
