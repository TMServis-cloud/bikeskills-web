/**
 * Server-side HTML detailu článku (pro Cloud Function serveBlogDetail).
 *
 * Funkce jsou PŘEVZATÉ 1:1 ze scripts/prerender.js (prerenderClanekDetail + helpery),
 * aby byl výstup stejný jako u build-time prerenderu. Rozdíly:
 *  - nenastavuje <html data-prerendered="true"> → cms-loader.js se chová jako dřív
 *    (dotáhne data z Firestore a obsah přepíše stejnými daty),
 *  - JSON-LD má id shodné s cms-loader.js, takže se v prohlížeči nezdvojí.
 * Při úpravě šablony článku uprav oba soubory.
 */
const BASE_URL = 'https://bikeskills.cz';

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
  // id = stejné id, jaké používá cms-loader.js → klient JSON-LD nahradí, nezdvojí
  const elId = marker === 'breadcrumb' ? 'json-ld-breadcrumb' : 'json-ld-schema';
  const tag = `<script type="application/ld+json" id="${elId}" data-schema="${marker}">${json}</script>`;
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
  // ZÁMĚRNĚ bez data-prerendered: cms-loader.js článek po načtení vykreslí stejně jako dosud,
  // HTML ze serveru jen navíc obsahuje text pro roboty (SeznamBot).
  return html;
}

module.exports = { prerenderClanekDetail };
