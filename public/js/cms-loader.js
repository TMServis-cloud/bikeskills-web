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

/** Převede YouTube URL na embed URL */
function youtubeEmbedUrl(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
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
// PAGE DETECTION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
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

  const ridersEl = item.querySelector('.akce-ridersnumber, [acf\\:text="riders-number"]');
  if (ridersEl) { ridersEl.textContent = data.stavLabel || data.stav || ''; ridersEl.classList.remove('w-dyn-bind-empty'); }

  const cenaEl = item.querySelector('.akce-cena, [acf\\:text="price"]');
  if (cenaEl) {
    cenaEl.textContent = data.cena ? data.cena.toLocaleString('cs-CZ') : '';
    cenaEl.classList.remove('w-dyn-bind-empty');
    if (!data.cena) {
      const after = cenaEl.nextElementSibling;
      if (after && after.classList.contains('akce-cena-after')) after.style.display = 'none';
    }
  }

  return item;
}

async function loadAkcePreview() {
  const wfl = getWebflowList('.collection-list-wrappe-campy');
  if (!wfl) return;
  const { itemsList, template, emptyEl } = wfl;

  try {
    // Bez composite indexu: načteme vše seřazené dle datumSort, filtrujeme JS
    const snapshot = await db.collection('akce')
      .orderBy('datumSort', 'asc')
      .get();

    const docs = snapshot.docs
      .map(d => d.data())
      .filter(d => d.aktivni !== false)
      .slice(0, 6);

    if (!docs.length) { toggleEmpty(emptyEl, false); itemsList.innerHTML = ''; return; }

    toggleEmpty(emptyEl, true);
    itemsList.innerHTML = '';
    docs.forEach(data => itemsList.appendChild(renderAkceItem(template, data)));
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
      .orderBy('datumSort', 'desc')
      .get();

    const docs = snapshot.docs.map(d => d.data()).filter(d => d.aktivni !== false);

    if (!docs.length) { toggleEmpty(emptyEl, false); itemsList.innerHTML = ''; return; }

    toggleEmpty(emptyEl, true);
    itemsList.innerHTML = '';
    docs.forEach(data => itemsList.appendChild(renderAkceItem(template, data)));
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
    // Podpora nového formátu galerie[] i starého galerie1..4
    const galerie = (data.galerie && data.galerie.length)
      ? data.galerie.filter(Boolean)
      : [data.galerie1, data.galerie2, data.galerie3, data.galerie4].filter(Boolean);

    // Nadpis stránky (typ akce)
    const pageHeading = document.querySelector('.page-heading[acf\\:text="typ-akce"]');
    if (pageHeading) {
      pageHeading.textContent = data.typAkce || data.nazev || '';
      pageHeading.classList.remove('w-dyn-bind-empty');
    }

    document.title = `${data.nazev} | BIKESKILLS`;

    toggleEmpty(emptyEl, true);
    itemsList.innerHTML = '';
    const item = template.cloneNode(true);

    // Název akce
    const titleEl = item.querySelector('[item="title"]');
    if (titleEl) { titleEl.textContent = data.nazev || ''; titleEl.classList.remove('w-dyn-bind-empty'); }

    // Datum
    const datumEl = item.querySelector('[acf\\:text="datum"]');
    if (datumEl) { datumEl.textContent = data.datumText || ''; datumEl.classList.remove('w-dyn-bind-empty'); }

    // Cena
    const cenaEl = item.querySelector('[acf\\:text="price"]');
    if (cenaEl) {
      cenaEl.textContent = data.cena ? data.cena.toLocaleString('cs-CZ') : '';
      cenaEl.classList.remove('w-dyn-bind-empty');
    }

    // Typ/doba trvání
    const dobaEl = item.querySelector('[acf\\:text="doba-trvani"]');
    if (dobaEl) { dobaEl.textContent = data.typAkce || ''; dobaEl.classList.remove('w-dyn-bind-empty'); }

    // Stav / obsazenost
    const ridersEl = item.querySelector('[acf\\:text="riders-number"]');
    if (ridersEl) { ridersEl.textContent = data.stavLabel || data.stav || ''; ridersEl.classList.remove('w-dyn-bind-empty'); }

    // Úroveň
    const levelEl = item.querySelector('[acf\\:text="akce-level"]');
    if (levelEl) { levelEl.textContent = data.uroven || ''; levelEl.classList.remove('w-dyn-bind-empty'); }

    // Hlavní obrázek
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

    // Obsah / popis
    const contentEl = item.querySelector('[item="content"]');
    if (contentEl) {
      contentEl.innerHTML = data.popis || '';
      contentEl.classList.remove('w-dyn-bind-empty');
    }

    // YouTube video
    const videoEl = item.querySelector('.video-4');
    if (videoEl) {
      const embedUrl = youtubeEmbedUrl(data.videoUrl);
      if (embedUrl) {
        videoEl.innerHTML = `<iframe src="${embedUrl}" frameborder="0" allowfullscreen loading="lazy" style="position:absolute;top:0;left:0;width:100%;height:100%;"></iframe>`;
        videoEl.classList.remove('w-dyn-bind-empty');
      } else {
        videoEl.style.display = 'none';
      }
    }

    // Galerie fotografií
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

    // Instagram embed
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

async function loadClankyList() {
  const wfl = getWebflowList('.collection-list-blog');
  if (!wfl) return;
  const { itemsList, template, emptyEl } = wfl;

  try {
    const snapshot = await db.collection('clanky').orderBy('datum', 'desc').get();

    const docs = snapshot.docs.map(d => d.data()).filter(d => d.publikovano !== false);

    if (!docs.length) { toggleEmpty(emptyEl, false); itemsList.innerHTML = ''; return; }

    toggleEmpty(emptyEl, true);
    itemsList.innerHTML = '';
    docs.forEach(data => itemsList.appendChild(renderClanekItem(template, data)));
  } catch (err) {
    console.error('Chyba načítání clanky list:', err);
  }
}

async function loadClanekDetail(slug) {
  const container = document.getElementById('clanek-detail');
  if (!container) return;

  try {
    const snapshot = await db.collection('clanky').where('slug', '==', slug).limit(1).get();
    if (snapshot.empty) { container.innerHTML = '<p>Článek nenalezen.</p>'; return; }

    const data = snapshot.docs[0].data();
    const datum = data.datum
      ? new Date(data.datum.seconds ? data.datum.seconds * 1000 : data.datum).toLocaleDateString('cs-CZ')
      : '';
    const galerie = (data.galerie && data.galerie.length)
      ? data.galerie.filter(Boolean)
      : [data.galerie1, data.galerie2, data.galerie3, data.galerie4].filter(Boolean);

    container.innerHTML = `
      <article>
        ${data.imageUrl ? `<div class="clanek-detail-image"><img src="${escapeHtml(data.imageUrl)}" alt="${escapeHtml(data.titulek)}" loading="lazy" style="width:100%;max-height:500px;object-fit:cover;border-radius:8px;margin-bottom:1.5rem;"></div>` : ''}
        <h1>${escapeHtml(data.titulek)}</h1>
        <div class="clanek-detail-meta" style="display:flex;gap:1rem;color:#888;margin-bottom:1.5rem;">
          ${datum ? `<span>${datum}</span>` : ''}
          ${data.autor ? `<span>${escapeHtml(data.autor)}</span>` : ''}
        </div>
        <div class="clanek-detail-body">${data.obsah || ''}</div>
        ${youtubeEmbedHtml(data.videoUrl)}
        ${galleryHtml(galerie)}
        ${data.instagramUrl ? `<div class="clanek-instagram" style="margin:1.5rem 0;"><blockquote class="instagram-media" data-instgrm-captioned data-instgrm-permalink="${escapeHtml(data.instagramUrl)}" style="max-width:540px;margin:0 auto;"></blockquote></div>` : ''}
      </article>
    `;

    document.title = `${data.titulek} | BIKESKILLS`;

    if (data.instagramUrl && !document.getElementById('ig-embed-script')) {
      const s = document.createElement('script');
      s.id = 'ig-embed-script';
      s.src = 'https://www.instagram.com/embed.js';
      s.async = true;
      document.body.appendChild(s);
    }
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

    const titleEl = container.querySelector('[item="title"]');
    if (titleEl) { titleEl.textContent = data.jmeno || ''; titleEl.classList.remove('w-dyn-bind-empty'); }

    const contentEl = container.querySelector('[item="content"]');
    if (contentEl) { contentEl.innerHTML = data.popis || ''; contentEl.classList.remove('w-dyn-bind-empty'); }

    const imgEl = container.querySelector('[item="featured-image"]');
    if (imgEl && data.imageUrl) {
      imgEl.src = data.imageUrl; imgEl.alt = data.jmeno || '';
      imgEl.classList.remove('w-dyn-bind-empty');
    }

    document.title = `${data.jmeno} | BIKESKILLS`;
  } catch (err) {
    console.error('Chyba načítání člena týmu:', err);
  }
}
