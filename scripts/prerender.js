/**
 * BIKESKILLS – Prerender CMS pages (SSG)
 *
 * Stáhne clanky/akce z Firestore a inject statický HTML do:
 *   - public/blog.html (12 nejnovějších karet)
 *   - public/akce-archive.html (12 nejnovějších karet)
 *   - public/blog/<slug>/index.html (detail článku — kopie detail_post.html)
 *   - public/akce/<slug>/index.html (detail akce — kopie detail_akce.html)
 *
 * Idempotentní: opakované spuštění přepíše předchozí výstup.
 * Marker `data-prerendered="true"` na container říká cms-loader.js,
 * ať místo přepsání DOM jen napojí filtry/paginaci/lightbox.
 *
 * Run: node scripts/prerender.js
 */

const fs = require('fs');
const path = require('path');

const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(__dirname, 'serviceAccountKey.json');

if (!fs.existsSync(SA_PATH)) {
  console.log('⚠️  serviceAccountKey.json nenalezen — prerender přeskočen (CI prostředí)');
  process.exit(0);
}

const admin = require('firebase-admin');
try {
  admin.initializeApp({ credential: admin.credential.cert(require(SA_PATH)) });
} catch (e) {
  console.error('❌ Firebase init error:', e.message);
  process.exit(1);
}

const db = admin.firestore();
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const BASE_URL = 'https://bikeskills.cz';
const PLACEHOLDER_URL = 'https://firebasestorage.googleapis.com/v0/b/bikeskills-web.firebasestorage.app/o/images%2Fplaceholder.webp?alt=media';

// ============================================================
// Helpers (mirror cms-loader.js)
// ============================================================
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeAttr(s) { return escapeHtml(s); }

function resolveUrl(url) {
  if (!url) return url;
  const m = url.match(/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?]*)\?/);
  if (!m) return url;
  return `https://firebasestorage.googleapis.com/v0/b/${m[1]}/o/${m[2]}?alt=media`;
}

function toThumbUrl(resolvedUrl, size = '800x800') {
  const m = resolvedUrl && resolvedUrl.match(/(https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/)([^?]+)(\?alt=media)/);
  if (!m) return resolvedUrl;
  const p = decodeURIComponent(m[2]);
  const dot = p.lastIndexOf('.');
  const base = dot >= 0 ? p.slice(0, dot) : p;
  const thumbPath = base + '_' + size + '.webp';
  const encoded = thumbPath.split('/').map(encodeURIComponent).join('%2F');
  return m[1] + encoded + m[3];
}

function imgSrc(url, size) {
  if (!url) return PLACEHOLDER_URL;
  return toThumbUrl(resolveUrl(url), size);
}

/** Vrátí "url1 400w, url2 800w, url3 1600w" srcset string z resolvedUrl. */
function thumbSrcset(resolvedUrl) {
  if (!resolvedUrl) return '';
  return [
    toThumbUrl(resolvedUrl, '400x400')   + ' 400w',
    toThumbUrl(resolvedUrl, '800x800')   + ' 800w',
    toThumbUrl(resolvedUrl, '1600x1600') + ' 1600w'
  ].join(', ');
}

function plainText(html, max) {
  const stripped = String(html || '').replace(/<[^>]*>/g, '').trim();
  return max && stripped.length > max ? stripped.substring(0, max - 1) + '…' : stripped;
}

/**
 * Vrátí ISO datum YYYY-MM-DD pro Event.startDate, nebo null když nelze určit.
 * Pořadí zdrojů: d.datum (Timestamp/ISO) → d.datumSort (YYYYMMDD) → parse "D.M.YYYY" z d.datumText.
 */
function computeAkceISOStart(d) {
  if (d && d.datum) {
    try {
      const ms = d.datum.seconds ? d.datum.seconds * 1000 : d.datum;
      const iso = new Date(ms).toISOString();
      return iso.split('T')[0];
    } catch (_) { /* fallthrough */ }
  }
  if (d && d.datumSort) {
    const s = String(d.datumSort);
    const m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  if (d && d.datumText) {
    const t = String(d.datumText);
    const m = t.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
    if (m) {
      const dd = m[1].padStart(2, '0');
      const mm = m[2].padStart(2, '0');
      return `${m[3]}-${mm}-${dd}`;
    }
  }
  return null;
}


function ensureHtml(text) {
  if (!text) return '';
  if (/<[a-z][^>]*>/i.test(text)) return text;
  return text.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

function resolveContentUrls(html) {
  if (!html) return html;
  return html.replace(
    /https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?"'\s<>]*)\?[^"'\s<>]*/g,
    (_, bucket, enc) => `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${enc}?alt=media`
  );
}

function youtubeEmbedUrl(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

function processWpContent(html) {
  if (!html) return html;
  return html.replace(
    /<figure[^>]*wp-block-embed[^>]*>[\s\S]*?<div[^>]*wp-block-embed__wrapper[^>]*>\s*(https?:\/\/[^\s<]+)\s*<\/div>[\s\S]*?<\/figure>/gi,
    (m, url) => {
      const e = youtubeEmbedUrl(url.trim());
      if (!e) return m;
      return `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin:1.5rem 0;">` +
        `<iframe src="${e}" frameborder="0" allowfullscreen loading="lazy" ` +
        `style="position:absolute;top:0;left:0;width:100%;height:100%;"></iframe></div>`;
    }
  );
}

const KATEGORIE_LABELS = { camp:'Camp', kurz:'Kurz', trialovy:'Trialový kurz', deti:'Dětský kurz', workshop:'Workshop', jine:'Jiné' };
function resolveAkceLabel(d) {
  if (d.kategorie && KATEGORIE_LABELS[d.kategorie]) return KATEGORIE_LABELS[d.kategorie];
  const typ = (d.typAkce || '').toLowerCase().trim();
  if (typ === 'pro deti' || typ === 'detsky kurz') return 'Dětský kurz';
  return d.typAkce ? d.typAkce.charAt(0).toUpperCase() + d.typAkce.slice(1) : '';
}

// ============================================================
// Balanced div matcher — najde uzavírací </div> pro daný open tag
// ============================================================
function findContainerEnd(html, startIdx) {
  // startIdx ukazuje na '<' open tagu; najdi konec open tagu
  const tagClose = html.indexOf('>', startIdx);
  if (tagClose < 0) return -1;
  let depth = 1;
  let i = tagClose + 1;
  const tagRe = /<\/?div\b/g;
  tagRe.lastIndex = i;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    if (m[0] === '<div') depth++;
    else { depth--; if (depth === 0) return m.index + 6; }
    tagRe.lastIndex = m.index + m[0].length;
  }
  return -1;
}

function replaceListContainer(html, listClassMarker, newInnerHtml, extraAttr) {
  // Najdi <div ... class="...listClassMarker..."> a nahraď uvnitř.
  const re = new RegExp(`<div([^>]*\\bclass="[^"]*${listClassMarker.replace(/[-]/g,'\\-')}[^"]*"[^>]*)>`);
  const m = html.match(re);
  if (!m) return { html, ok: false };
  const startIdx = m.index;
  const end = findContainerEnd(html, startIdx);
  if (end < 0) return { html, ok: false };
  const openTag = m[0];
  // Replace open tag (přidat atribut data-prerendered) a inner content
  const newOpenTag = `<div${m[1]}${extraAttr || ''}>`;
  const replaced = html.slice(0, startIdx) + newOpenTag + '\n' + newInnerHtml + '\n' + html.slice(end - 6);
  return { html: replaced, ok: true };
}

// ============================================================
// Card builders
// ============================================================
function buildClanekCard(d, i) {
  const href = `/blog/${d.slug}/`;
  const resolved = d.imageUrl ? resolveUrl(d.imageUrl) : null;
  // src = originál (vždy 200) — fallback pokud variant ze srcset 404
  const src = resolved || PLACEHOLDER_URL;
  const srcset = resolved ? thumbSrcset(resolved) : '';
  const sizes = '(max-width: 767px) 100vw, (max-width: 991px) 50vw, 50vw';
  const ssAttr = srcset ? ` srcset="${escapeAttr(srcset)}" sizes="${escapeAttr(sizes)}"` : '';
  // onerror: pokud variant 404, odstraň srcset → browser fallne na src=originál
  const onErr = srcset ? ` onerror="this.onerror=null;this.removeAttribute('srcset');this.removeAttribute('sizes');"` : '';
  const eager = i === 0;
  const fp = eager ? ' fetchpriority="high"' : '';
  const loading = eager ? 'eager' : 'lazy';
  return `
<div role="listitem" class="collection-blog-item w-dyn-item">
  <a item="permalink" href="${escapeAttr(href)}" class="collection-item__card-blog w-inline-block">
    <div class="card-blog__wrapper-image"><img item="featured-image" src="${escapeAttr(src)}"${ssAttr}${onErr} alt="${escapeAttr(d.titulek||'')}" width="800" height="600" loading="${loading}"${fp} class="wrapper-image__img"></div>
    <div class="card-blog__wrapper-text">
      <h2 item="title" class="wrapper--text__title">${escapeHtml(d.titulek||'')}</h2>
    </div>
  </a>
  <div class="secondary-link-block blog">
    <div class="secondary-link-button">
      <a item="permalink" style="color:rgb(255,255,255)" href="${escapeAttr(href)}" class="secondary-link">Číst dále</a>
      <div style="background-color:rgb(255,255,255)" class="secondary-button-line"></div>
    </div>
  </div>
</div>`;
}

function buildAkceCard(d, i) {
  const href = `/akce/${d.slug}/`;
  const resolved = d.imageUrl ? resolveUrl(d.imageUrl) : null;
  // src = originál (vždy 200) — fallback pokud variant ze srcset 404
  const src = resolved || PLACEHOLDER_URL;
  const srcset = resolved ? thumbSrcset(resolved) : '';
  const sizes = '(max-width: 767px) 100vw, (max-width: 991px) 50vw, 25vw';
  const ssAttr = srcset ? ` srcset="${escapeAttr(srcset)}" sizes="${escapeAttr(sizes)}"` : '';
  const onErr = srcset ? ` onerror="this.onerror=null;this.removeAttribute('srcset');this.removeAttribute('sizes');"` : '';
  const eager = i === 0;
  const fp = eager ? ' fetchpriority="high"' : '';
  const loading = eager ? 'eager' : 'lazy';
  const stripped = String(d.popis||'').replace(/<[^>]*>/g, '');
  const excerpt = stripped.length > 150 ? stripped.substring(0,150) + '…' : stripped;
  const cenaBlock = d.cena
    ? `<div class="akce-popis">cena za kurz: </div><div acf:text="price" class="akce-cena">${escapeHtml(d.cena.toLocaleString('cs-CZ'))}</div><div class="akce-cena-after">,- CZK</div>`
    : `<div acf:text="price" class="akce-cena" style="font-size:0.8em;letter-spacing:0.03em;opacity:0.85;">individuální kurzy →</div>`;
  return `
<div role="listitem" class="collection-item-akce w-dyn-item" style="transform:translate3d(0,0,0)">
  <a item="permalink" href="${escapeAttr(href)}" class="akce-box w-inline-block">
    <div style="background-color:rgb(46,48,44)" class="akce-text-blok">
      <h3 item="title" style="color:rgb(255,255,255)" class="akce-heading">${escapeHtml(d.nazev||'')}</h3>
      <div acf:text="datum" style="color:rgb(239,193,1)" class="akce-datum">${escapeHtml(d.datumText||'')}</div>
    </div>
    <div acf:text="akce-level" style="color:rgb(34,37,40)" class="akce-level">${escapeHtml(d.uroven||'')}</div>
    <div class="akce-image-blok">
      <img item="featured-image" src="${escapeAttr(src)}"${ssAttr}${onErr} alt="${escapeAttr(d.nazev||'')}" width="800" height="600" loading="${loading}"${fp} class="image-55">
      <p item="excerpt" style="opacity:0" class="paragraph-2">${escapeHtml(excerpt)}</p>
    </div>
    <div style="color:rgb(255,255,255);background-color:rgb(45,96,171)" class="div-block-330">
      <div class="akce-cena-block">
        <div class="akce-popis">stav / obsazenost: </div>
        <div acf:text="riders-number" class="akce-ridersnumber">${escapeHtml(d.stavLabel||d.stav||'')}</div>
      </div>
      <div class="akce-cena-block">${cenaBlock}</div>
    </div>
  </a>
</div>`;
}

// ============================================================
// Listings — blog.html, akce-archive.html
// ============================================================
function injectPreloadHero(html, heroSrc, opts) {
  if (!heroSrc) return html;
  // Idempotence: nejprve odstraň VŠECHNY existující preload-image tagy z <head>
  const cleaned = html.replace(
    /\n?\s*<link\s+rel="preload"\s+as="image"[^>]*>\s*/gi,
    ''
  );
  const ss = (opts && opts.srcset)
    ? ` imagesrcset="${escapeAttr(opts.srcset)}" imagesizes="${escapeAttr(opts.sizes || '100vw')}"`
    : '';
  const link = `<link rel="preload" as="image" href="${escapeAttr(heroSrc)}"${ss} fetchpriority="high">`;
  return cleaned.replace(/<head>([\s\S]*?)<link/, (m, headInner) => {
    return `<head>${headInner}${link}\n  <link`;
  });
}

function prerenderBlogListing(html, clanky) {
  const top12 = clanky.slice(0, 12);
  const cards = top12.map((d, i) => buildClanekCard(d, i)).join('\n');
  const result = replaceListContainer(html, 'collection-blog-grid', cards, ' data-prerendered="true"');
  if (!result.ok) {
    console.warn('  ⚠️  blog.html: collection-blog-grid container nenalezen — listings prerender PŘESKOČEN');
    return html;
  }
  let out = result.html;
  if (top12[0] && top12[0].imageUrl) {
    const r = resolveUrl(top12[0].imageUrl);
    out = injectPreloadHero(out, toThumbUrl(r, '800x800'), {
      srcset: thumbSrcset(r),
      sizes: '(max-width: 767px) 100vw, (max-width: 991px) 50vw, 50vw'
    });
  }
  return out;
}

function prerenderAkceListing(html, akceTop12) {
  const cards = akceTop12.map((d, i) => buildAkceCard(d, i)).join('\n');
  const result = replaceListContainer(html, 'collection-list-akce', cards, ' data-prerendered="true"');
  if (!result.ok) {
    console.warn('  ⚠️  akce-archive.html: collection-list-akce container nenalezen — listings prerender PŘESKOČEN');
    return html;
  }
  let out = result.html;
  if (akceTop12[0] && akceTop12[0].imageUrl) {
    const r = resolveUrl(akceTop12[0].imageUrl);
    out = injectPreloadHero(out, toThumbUrl(r, '800x800'), {
      srcset: thumbSrcset(r),
      sizes: '(max-width: 767px) 100vw, (max-width: 991px) 50vw, 25vw'
    });
  }
  return out;
}

// ============================================================
// Detail page — patch metadata + item= elementy
// ============================================================
function setMeta(html, prop, value, by) {
  const attr = by === 'name' ? 'name' : 'property';
  // Najit meta tag s danou property/name v libovolnem poradi atributu.
  // Webflow generuje <meta content="..." property="...">, my musime obe poradi prepsat.
  const tagRe = new RegExp(`<meta\\b[^>]*\\b${attr}="${prop}"[^>]*>`, 'i');
  const m = html.match(tagRe);
  if (m) {
    const oldTag = m[0];
    let newTag;
    if (/\bcontent="[^"]*"/.test(oldTag)) {
      newTag = oldTag.replace(/\bcontent="[^"]*"/, `content="${escapeAttr(value)}"`);
    } else {
      // Pokud content atribut chybi, vloz ho pred uzavreni tagu
      newTag = oldTag.replace(/\s*\/?>$/, ` content="${escapeAttr(value)}">`);
    }
    return html.replace(oldTag, newTag);
  }
  // Pokud meta neexistuje vubec, vloz ji za <title>
  return html.replace(/(<title>[^<]*<\/title>)/, `$1\n  <meta ${attr}="${prop}" content="${escapeAttr(value)}">`);
}

function setTitle(html, title) {
  return html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
}

function setCanonical(html, url) {
  const re = /<link[^>]*\brel="canonical"[^>]*\bhref="[^"]*"[^>]*>/;
  if (re.test(html)) return html.replace(re, `<link rel="canonical" href="${escapeAttr(url)}">`);
  return html.replace('</head>', `  <link rel="canonical" href="${escapeAttr(url)}">\n</head>`);
}

/**
 * Najde index, kde začíná related-posts (nebo galerie) sekce.
 * Replace operations se aplikují jen na text PŘED tímto indexem,
 * aby se nezasáhly template karty pro related/galerie.
 */
function findScopeBoundary(html) {
  const markers = [
    /<div\b[^>]*\bclass="[^"]*\brelated-posts\b[^"]*"/i,
    /<section\b[^>]*\bclass="[^"]*\brelated-posts\b[^"]*"/i,
    /<div\b[^>]*\bclass="[^"]*\bcollection-list-wrapper-6\b[^"]*"/i // galerie
  ];
  let earliest = -1;
  for (const re of markers) {
    const m = html.match(re);
    if (m && m.index !== undefined) {
      if (earliest < 0 || m.index < earliest) earliest = m.index;
    }
  }
  return earliest;
}

function splitScope(html) {
  const idx = findScopeBoundary(html);
  if (idx < 0) return { head: html, tail: '' };
  return { head: html.slice(0, idx), tail: html.slice(idx) };
}

function setItemElementContent(html, tagName, itemName, innerHtml) {
  // Match jen PRVNÍ výskyt v HEAD části (před related-posts)
  const { head, tail } = splitScope(html);
  const re = new RegExp(`(<${tagName}[^>]*\\bitem="${itemName}"[^>]*?)(\\s*)></${tagName}>`);
  let replaced = false;
  const newHead = head.replace(re, (m, openAttrs) => {
    replaced = true;
    const cleaned = openAttrs.replace(/\s+class="([^"]*)\bw-dyn-bind-empty\b\s*([^"]*)"/, ' class="$1$2"');
    return `${cleaned.replace(/\s+$/,'')}>${innerHtml}</${tagName}>`;
  });
  return { html: newHead + tail, replaced };
}

function setItemImg(html, itemName, src, alt, w, h, fetchPriority, srcsetOpts) {
  // Match jen PRVNÍ výskyt v HEAD části (před related-posts/galerie)
  const { head, tail } = splitScope(html);
  // Match celý <img ... item="X" ... > tag jako jeden blok, pak rebuild atributů
  const re = new RegExp(`<img\\b([^>]*\\bitem="${itemName}"[^>]*)>`);
  let replaced = false;
  const newHead = head.replace(re, (m, attrsStr) => {
    replaced = true;
    let attrs = attrsStr;
    // Drop původní src/alt, sym-bind, w-dyn-bind-empty class fragment
    attrs = attrs.replace(/\s+src="[^"]*"/g, '');
    attrs = attrs.replace(/\s+srcset="[^"]*"/gi, '');
    attrs = attrs.replace(/\s+sizes="[^"]*"/gi, '');
    attrs = attrs.replace(/\s+alt="[^"]*"/g, '');
    attrs = attrs.replace(/\s+sym-bind="[^"]*"/g, '');
    attrs = attrs.replace(/\s+loading="[^"]*"/g, '');
    attrs = attrs.replace(/\s+width="[^"]*"/g, '');
    attrs = attrs.replace(/\s+height="[^"]*"/g, '');
    attrs = attrs.replace(/\s+fetchpriority="[^"]*"/gi, '');
    attrs = attrs.replace(/\s+class="([^"]*)\bw-dyn-bind-empty\b\s*([^"]*)"/, ' class="$1$2"');
    attrs = attrs.replace(/\s+class="\s+/, ' class="').replace(/\s+"/, '"');
    const wh = (w && h) ? ` width="${w}" height="${h}"` : '';
    const fp = fetchPriority ? ` fetchpriority="${fetchPriority}"` : '';
    const loading = fetchPriority === 'high' ? ' loading="eager"' : ' loading="lazy"';
    const ss = (srcsetOpts && srcsetOpts.srcset)
      ? ` srcset="${escapeAttr(srcsetOpts.srcset)}" sizes="${escapeAttr(srcsetOpts.sizes || '100vw')}"`
      : '';
    // onerror: pokud variant ze srcset 404, odstraň srcset/sizes → browser fallne na src=originál
    const onErr = ss ? ` onerror="this.onerror=null;this.removeAttribute('srcset');this.removeAttribute('sizes');"` : '';
    return `<img src="${escapeAttr(src)}"${ss}${onErr} alt="${escapeAttr(alt||'')}"${loading}${wh}${fp}${attrs.replace(/\s+/g, ' ').replace(/\s+$/, '')}>`;
  });
  return newHead + tail;
}

function injectJsonLd(html, schemaObj, marker) {
  const json = JSON.stringify(schemaObj);
  const tag = `<script type="application/ld+json" data-schema="${marker}">${json}</script>`;
  // Nahrad existující ld+json se stejným data-schema, nebo vlož před </head>
  const re = new RegExp(`<script[^>]*\\bdata-schema="${marker}"[^>]*>[\\s\\S]*?</script>`);
  if (re.test(html)) return html.replace(re, tag);
  return html.replace('</head>', `  ${tag}\n</head>`);
}

function prerenderClanekDetail(template, d) {
  const url = `${BASE_URL}/blog/${d.slug}/`;
  const titulek = d.titulek || '';
  const datum = d.datum
    ? new Date(d.datum.seconds ? d.datum.seconds * 1000 : d.datum).toLocaleDateString('cs-CZ')
    : '';
  const datumISO = d.datum
    ? new Date(d.datum.seconds ? d.datum.seconds * 1000 : d.datum).toISOString()
    : null;
  const datumZmenyISO = d.datumZmeny
    ? new Date(d.datumZmeny.seconds ? d.datumZmeny.seconds * 1000 : d.datumZmeny).toISOString()
    : datumISO;
  const galerie = (d.galerie && d.galerie.length) ? d.galerie.filter(Boolean) : [];
  // Pro hero/og:image preferujeme uvodni obrazek clanku (d.imageUrl) pred prvni fotkou galerie.
  // Uvodni obrazek je co admin vybere v "Hlavni obrazek" - i tady je videt ve sdileni na FB.
  const heroOrig = d.imageUrl || galerie[0];
  const hero = heroOrig ? resolveUrl(heroOrig) : `${BASE_URL}/images/og-image.jpg`;
  const desc = plainText(d.popis || d.perex, 160);

  let html = template;
  // <head>
  html = setTitle(html, `${titulek} | BikeSkills`);
  html = setMeta(html, 'description', desc, 'name');
  html = setMeta(html, 'og:title', `${titulek} | BikeSkills`);
  html = setMeta(html, 'og:description', desc);
  html = setMeta(html, 'og:image', hero);
  html = setMeta(html, 'og:url', url);
  html = setMeta(html, 'og:type', 'article');
  html = setMeta(html, 'twitter:title', `${titulek} | BikeSkills`);
  html = setMeta(html, 'twitter:description', desc);
  html = setMeta(html, 'twitter:image', hero);
  html = setCanonical(html, url);
  // Preload hero — href = ORIGINÁL (vždy 200), srcset jako progressive enhancement
  const heroResolved = heroOrig ? resolveUrl(heroOrig) : null;
  const heroPrimary = heroResolved;  // originál URL — fallback při 404 z variant
  const heroSrcset = heroResolved ? thumbSrcset(heroResolved) : '';
  const heroSizes = '(max-width: 991px) 100vw, 1280px';
  if (heroPrimary) html = injectPreloadHero(html, heroPrimary, { srcset: heroSrcset, sizes: heroSizes });

  // JSON-LD
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: titulek.substring(0, 110),
    description: plainText(d.popis || d.perex, 300),
    image: hero,
    author: { '@type': 'Person', name: d.autor || 'BikeSkills' },
    publisher: {
      '@type': 'Organization', name: 'BikeSkills', url: BASE_URL,
      logo: { '@type': 'ImageObject', url: `${BASE_URL}/images/webclip.png`, width: 256, height: 256 }
    },
    url, mainEntityOfPage: { '@type': 'WebPage', '@id': url }
  };
  if (datumISO) articleSchema.datePublished = datumISO;
  if (datumZmenyISO) articleSchema.dateModified = datumZmenyISO;
  html = injectJsonLd(html, articleSchema, 'article');
  html = injectJsonLd(html, {
    '@context':'https://schema.org','@type':'BreadcrumbList',
    itemListElement: [
      {'@type':'ListItem',position:1,name:'Domů',item: BASE_URL + '/'},
      {'@type':'ListItem',position:2,name:'Blog',item: BASE_URL + '/blog'},
      {'@type':'ListItem',position:3,name:titulek,item:url}
    ]
  }, 'breadcrumb');

  // Body — item= elementy
  html = setItemElementContent(html, 'h2', 'title', escapeHtml(titulek)).html;
  html = setItemElementContent(html, 'div', 'date', escapeHtml(datum)).html;
  html = setItemElementContent(html, 'div', 'author-display-name', escapeHtml(d.autor || '')).html;
  html = setItemElementContent(html, 'div', 'content', resolveContentUrls(ensureHtml(processWpContent(d.obsah)))).html;
  if (heroPrimary) {
    html = setItemImg(html, 'featured-image', heroPrimary, titulek, 1280, 720, 'high', { srcset: heroSrcset, sizes: heroSizes });
  }

  // Označit pre-rendered (cms-loader.js to detekuje)
  html = html.replace(/<html\b/, '<html data-prerendered="true"');
  return html;
}

function prerenderAkceDetail(template, d) {
  const url = `${BASE_URL}/akce/${d.slug}/`;
  const nazev = d.nazev || '';
  const heroOrig = d.imageUrl;
  const hero = heroOrig ? resolveUrl(heroOrig) : `${BASE_URL}/images/og-image.jpg`;
  const desc = plainText(d.popis, 160);
  const labelTyp = resolveAkceLabel(d) || '';
  const akceISOStart = computeAkceISOStart(d);

  let html = template;
  html = setTitle(html, `${nazev} | BikeSkills`);
  html = setMeta(html, 'description', desc, 'name');
  html = setMeta(html, 'og:title', `${nazev} | BikeSkills`);
  html = setMeta(html, 'og:description', desc);
  html = setMeta(html, 'og:image', hero);
  html = setMeta(html, 'og:url', url);
  html = setMeta(html, 'og:type', 'event');
  html = setMeta(html, 'twitter:title', `${nazev} | BikeSkills`);
  html = setMeta(html, 'twitter:description', desc);
  html = setMeta(html, 'twitter:image', hero);
  html = setCanonical(html, url);
  const heroResolved = heroOrig ? resolveUrl(heroOrig) : null;
  const heroPrimary = heroResolved;  // originál URL — fallback při 404 z variant
  const heroSrcset = heroResolved ? thumbSrcset(heroResolved) : '';
  const heroSizes = '(max-width: 991px) 100vw, 1280px';
  if (heroPrimary) html = injectPreloadHero(html, heroPrimary, { srcset: heroSrcset, sizes: heroSizes });

  const eventSchema = {
    '@context':'https://schema.org','@type':'Event',
    name: nazev, description: plainText(d.popis, 300), image: hero, url,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type':'Place', name:'BikeSkills — Tehov / Říčany u Prahy',
      address: { '@type':'PostalAddress', streetAddress:'Na Vyhlídce 285', addressLocality:'Tehov', postalCode:'25101', addressCountry:'CZ' } },
    organizer: { '@type':'Organization', name:'BikeSkills', url: BASE_URL }
  };
  if (akceISOStart) {
    eventSchema.startDate = akceISOStart;
    if (d.cena) eventSchema.offers = { '@type':'Offer', price: String(d.cena), priceCurrency:'CZK', url, availability:'https://schema.org/InStock' };
    html = injectJsonLd(html, eventSchema, 'event');
  }
  html = injectJsonLd(html, {
    '@context':'https://schema.org','@type':'BreadcrumbList',
    itemListElement: [
      {'@type':'ListItem',position:1,name:'Domů',item: BASE_URL + '/'},
      {'@type':'ListItem',position:2,name:'Akce',item: BASE_URL + '/akce-archive'},
      {'@type':'ListItem',position:3,name:nazev,item:url}
    ]
  }, 'breadcrumb');

  // Body — acf:text= a item= elementy (jen v head části)
  // setAcfText: nahradí prázdný element (libovolný tag) s acf:text="name"
  const setAcfText = (h, name, val, tagName) => {
    const { head, tail } = splitScope(h);
    const tag = tagName || '(?:div|h1|h2|h3|h4|h5|h6|p|span)';
    const re = new RegExp(`(<(${tag})[^>]*\\bacf:text="${name}"[^>]*?)(\\s*)></\\2>`);
    const newHead = head.replace(re, (m, openAttrs, t) => {
      const cleaned = openAttrs.replace(/\s+class="([^"]*)\bw-dyn-bind-empty\b\s*([^"]*)"/, ' class="$1$2"');
      return `${cleaned.replace(/\s+$/,'')}>${escapeHtml(val||'')}</${t}>`;
    });
    return newHead + tail;
  };
  html = setAcfText(html, 'typ-akce', labelTyp);
  html = setAcfText(html, 'datum', d.datumText || '');
  html = setAcfText(html, 'doba-trvani', labelTyp);
  html = setAcfText(html, 'price', d.cena ? d.cena.toLocaleString('cs-CZ') : '');
  html = setAcfText(html, 'riders-number', d.stavLabel || d.stav || '');
  html = setAcfText(html, 'akce-level', d.uroven || '');
  html = setItemElementContent(html, 'h2', 'title', escapeHtml(nazev)).html;
  html = setItemElementContent(html, 'div', 'content', resolveContentUrls(ensureHtml(d.popis))).html;
  if (heroPrimary) {
    html = setItemImg(html, 'featured-image', heroPrimary, nazev, 1280, 720, 'high', { srcset: heroSrcset, sizes: heroSizes });
  }
  html = html.replace(/<html\b/, '<html data-prerendered="true"');
  return html;
}

// ============================================================
// Main
// ============================================================
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

async function main() {
  console.log('🔧 Prerender start');

  const [clankySnap, akceSnap] = await Promise.all([
    db.collection('clanky').get(),
    db.collection('akce').get()
  ]);

  const clanky = clankySnap.docs.map(d => d.data())
    .filter(d => d.publikovano !== false && d.slug)
    .sort((a, b) => {
      const da = a.datum && (a.datum.seconds || a.datum) || 0;
      const dbb = b.datum && (b.datum.seconds || b.datum) || 0;
      return dbb - da;
    });
  const akce = akceSnap.docs.map(d => d.data())
    .filter(d => d.aktivni !== false && d.slug);

  const today = new Date();
  const todayStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
  const upcoming = akce.filter(d => String(d.datumSort||'0') >= todayStr)
    .sort((a,b) => String(a.datumSort||'0').localeCompare(String(b.datumSort||'0')));
  const past = akce.filter(d => String(d.datumSort||'0') < todayStr)
    .sort((a,b) => String(b.datumSort||'0').localeCompare(String(a.datumSort||'0')));
  const akceForListing = [...upcoming, ...past].slice(0, 12);

  console.log(`  📚 clanky: ${clanky.length} publikovaných, top 12 do listingu`);
  console.log(`  🚴 akce:   ${akce.length} aktivních, ${upcoming.length} nadcházejících`);

  // 1. blog.html listing
  const blogPath = path.join(PUBLIC_DIR, 'blog.html');
  let blogHtml = fs.readFileSync(blogPath, 'utf8');
  blogHtml = prerenderBlogListing(blogHtml, clanky);
  fs.writeFileSync(blogPath, blogHtml);
  console.log('  ✅ public/blog.html — listing 12 článků');

  // 2. akce-archive.html listing
  const akcePath = path.join(PUBLIC_DIR, 'akce-archive.html');
  let akceHtml = fs.readFileSync(akcePath, 'utf8');
  akceHtml = prerenderAkceListing(akceHtml, akceForListing);
  fs.writeFileSync(akcePath, akceHtml);
  console.log('  ✅ public/akce-archive.html — listing 12 akcí');

  // 3. Detail clanky
  const detailPostTpl = fs.readFileSync(path.join(PUBLIC_DIR, 'detail_post.html'), 'utf8');
  let cnt = 0;
  for (const d of clanky) {
    if (!d.slug) continue;
    const dir = path.join(PUBLIC_DIR, 'blog', d.slug);
    ensureDir(dir);
    const out = prerenderClanekDetail(detailPostTpl, d);
    fs.writeFileSync(path.join(dir, 'index.html'), out);
    cnt++;
  }
  console.log(`  ✅ public/blog/<slug>/index.html — ${cnt} detail článků`);

  // 4. Detail akce
  const detailAkceTpl = fs.readFileSync(path.join(PUBLIC_DIR, 'detail_akce.html'), 'utf8');
  cnt = 0;
  for (const d of akce) {
    if (!d.slug) continue;
    const dir = path.join(PUBLIC_DIR, 'akce', d.slug);
    ensureDir(dir);
    const out = prerenderAkceDetail(detailAkceTpl, d);
    fs.writeFileSync(path.join(dir, 'index.html'), out);
    cnt++;
  }
  console.log(`  ✅ public/akce/<slug>/index.html — ${cnt} detail akcí`);

  console.log('🎉 Prerender hotov.');
  process.exit(0);
}

main().catch(e => { console.error('❌ Prerender error:', e); process.exit(1); });
