/**
 * BIKESKILLS – generátor anglické verze statických stránek
 *
 *   public/<cs>.html  →  public/en/<en>.html
 *
 * - texty překládá podle translations/static-en.json (klíč = český úsek s tagy maskovanými jako {1},{2}…)
 * - přepíše odkazy na EN slugy (scripts/i18n/pages.js, translations/slugs.json) a na shop.bikeskills.cz/en/
 * - doplní hreflang (cs / en / x-default), canonical, og:locale, lang="en"
 * - vloží přepínač jazyka do menu (CZ i EN stránky, idempotentně)
 *
 * Nepřeložené úseky nechá česky a vypíše je; doplníš je přes
 *   node scripts/i18n/dump-static.js  →  překlad dávek  →  node scripts/i18n/merge-batches.js static
 *
 * Run: node scripts/build-en.js            (generuje EN + patchne CZ stránky)
 *      node scripts/build-en.js --check    (jen vypíše chybějící překlady)
 */
const fs = require('fs');
const path = require('path');
const S = require('./i18n/segments');
const L = require('./i18n/links');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const EN_DIR = path.join(PUB, 'en');
const DICT = JSON.parse(fs.readFileSync(path.join(ROOT, 'translations/static-en.json'), 'utf8'));
const CHECK = process.argv.includes('--check');
const LEGAL = new Set(['obchodni-podminky', 'dodaci-podminky', 'zasady-ochrany-osobnich-udaju']);

const missing = new Map();
function tr(csNorm, page) {
  const { text, tags } = S.mask(csNorm);
  const en = DICT[text];
  if (en == null) { if (!missing.has(text)) missing.set(text, page); return null; }
  try { return S.unmask(en, tags); } catch (e) { console.warn(`  ⚠️  ${page}: ${e.message} – "${text.slice(0, 60)}"`); return null; }
}
function trPlain(s, page) { const r = tr(S.norm(s), page); return r == null ? s : r; }

function escAttr(s) { return String(s).replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&amp;').replace(/"/g, '&quot;'); }

// ---------------------------------------------------------------- head helpers
function setMetaContent(html, attr, key, value) {
  const re = new RegExp(`<meta\\b[^>]*\\b${attr}="${key}"[^>]*>`, 'i');
  const m = html.match(re);
  if (m) return html.replace(m[0], /\bcontent="/.test(m[0]) ? m[0].replace(/\bcontent="[^"]*"/, `content="${escAttr(value)}"`) : m[0].replace(/\s*\/?>$/, ` content="${escAttr(value)}">`));
  return html.replace(/(<title>[^<]*<\/title>)/, `$1\n  <meta ${attr}="${key}" content="${escAttr(value)}">`);
}
function getMeta(html, attr, key) {
  const m = html.match(new RegExp(`<meta\\b[^>]*\\b${attr}="${key}"[^>]*>`, 'i'));
  if (!m) return null; const c = m[0].match(/\bcontent="([^"]*)"/); return c ? c[1] : null;
}
function setCanonical(html, url) {
  // na místě – inline skripty v šablonách na canonical sahají a musí ho najít
  const re = /<link\b[^>]*\brel="canonical"[^>]*>/i;
  if (re.test(html)) return html.replace(re, `<link rel="canonical" href="${url}">`);
  return html.replace('</head>', `  <link rel="canonical" href="${url}">\n</head>`);
}
/** hreflang blok mezi markery – idempotentní. */
function setHreflang(html, csUrl, enUrl) {
  html = html.replace(/\s*<!-- hreflang:start -->[\s\S]*?<!-- hreflang:end -->/, '');
  html = html.replace(/\s*<link\b[^>]*\bhreflang="[^"]*"[^>]*>/gi, '');
  const block = `  <!-- hreflang:start -->\n  <link rel="alternate" hreflang="cs" href="${csUrl}">\n  <link rel="alternate" hreflang="en" href="${enUrl}">\n  <link rel="alternate" hreflang="x-default" href="${csUrl}">\n  <!-- hreflang:end -->`;
  return html.replace('</head>', `${block}\n</head>`);
}
function translateJsonLd(html, page) {
  return html.replace(/(<script type="application\/ld\+json"[^>]*>)([\s\S]*?)(<\/script>)/g, (m, a, json, b) => {
    let o; try { o = JSON.parse(json); } catch (e) { return m; }
    const walk = (x, key) => {
      if (Array.isArray(x)) return x.map(v => walk(v, key));
      if (x && typeof x === 'object') { const r = {}; for (const [k, v] of Object.entries(x)) r[k] = walk(v, k); return r; }
      if (typeof x === 'string') {
        if (['item', 'url', '@id'].includes(key) && /^https?:\/\/(www\.)?bikeskills\.cz/.test(x) && key !== 'url') return L.linkToEn(x) || x;
        if (['name', 'description', 'alternateName', 'text', 'headline', 'serviceType', 'category'].includes(key) && /[ěščřžýáíéůú]/i.test(x)) return trPlain(x, page);
      }
      return x;
    };
    const out = walk(o);
    if (out && !Array.isArray(out) && out['@context']) out.inLanguage = out.inLanguage ? out.inLanguage : undefined;
    return a + JSON.stringify(out) + b;
  });
}

// ---------------------------------------------------------------- body helpers
const URL_ATTRS = ['href', 'src', 'data-src', 'poster', 'action', 'data-poster-url', 'data-video-urls'];
function rewriteUrls(html) {
  html = html.replace(new RegExp(`(\\s(?:${URL_ATTRS.join('|')})=")([^"]*)(")`, 'gi'), (m, a, v, b) => {
    const attr = a.trim().slice(0, -2).toLowerCase();
    if (attr === 'href' || attr === 'action') { const en = L.linkToEn(v); if (en != null) return a + en + b; }
    if (attr === 'data-video-urls') return a + v.split(',').map(x => L.assetAbs(x.trim())).join(',') + b;
    return a + L.assetAbs(v) + b;
  });
  html = html.replace(/(\s(?:srcset|imagesrcset)=")([^"]*)(")/gi, (m, a, v, b) =>
    a + v.split(',').map(part => { const t = part.trim().split(/\s+/); t[0] = L.assetAbs(t[0]); return t.join(' '); }).join(', ') + b);
  html = html.replace(/url\((['"]?)((?:css|images|fonts|documents)\/[^'")]+)\1\)/g, (m, q, p) => `url(${q}/${p}${q})`);
  return html;
}

/** Najde konec elementu (balancovaně podle názvu tagu) od indexu otevíracího tagu. */
function findElementEnd(html, startIdx, tag) {
  const re = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = startIdx; let depth = 0, m;
  while ((m = re.exec(html))) { if (m[0][1] === '/') { depth--; if (depth === 0) return m.index; } else depth++; }
  return -1;
}

const SWITCH_CSS = `<style id="bs-lang-css">.bs-lang-switch{display:inline-flex;align-items:center;gap:.35em;font-weight:700;letter-spacing:.05em}.bs-lang-switch img{display:none}@media (max-width:991px){.bs-lang-switch{justify-content:center}}</style>`;
function setLangSwitch(html, targetHref, targetLang) {
  html = html.replace(/\s*<a\b[^>]*\bbs-lang-switch\b[^>]*>[\s\S]*?<\/a>/g, '');
  html = html.replace(/\s*<style id="bs-lang-css">[\s\S]*?<\/style>/, '');
  const label = targetLang === 'en' ? 'EN' : 'CZ';
  const title = targetLang === 'en' ? 'English version' : 'Česká verze';
  const link = `<a href="${targetHref}" hreflang="${targetLang}" lang="${targetLang}" title="${title}" data-lang-switch="${targetLang}" class="nav-link white hover-black w-nav-link bs-lang-switch">${label}</a>`;
  const navStart = html.search(/<nav\b[^>]*\bclass="[^"]*\bnav1-menu\b[^"]*"/);
  if (navStart < 0) return html;
  const end = findElementEnd(html, navStart, 'nav');
  if (end < 0) return html;
  html = html.slice(0, end) + '\n            ' + link + '\n          ' + html.slice(end);
  return html.replace('</head>', `  ${SWITCH_CSS}\n</head>`);
}

// Řetězce v inline <script> (validace formulářů apod.) – přesná shoda
const SCRIPT_STRINGS = {
  'Nepodařilo se odeslat. Zkuste to prosím znovu nebo nás kontaktujte na info@bikeskills.cz.': 'Sending failed. Please try again or contact us at info@bikeskills.cz.',
  'Odesíláme…': 'Sending…',
  'Pro odeslání je nutný souhlas se zásadami ochrany osobních údajů.': 'You must agree to the privacy policy to send the form.',
  'Vyplňte prosím jméno a příjmení.': 'Please enter your full name.',
  'Zadejte platný e-mail.': 'Please enter a valid e-mail address.',
};
function translateInlineScripts(html) {
  return html.replace(/(<script(?![^>]*ld\+json)[^>]*>)([\s\S]*?)(<\/script>)/g, (m, a, js, b) => {
    for (const [cs, en] of Object.entries(SCRIPT_STRINGS)) js = js.split(`'${cs}'`).join(`'${en}'`).split(`"${cs}"`).join(`"${en}"`);
    js = js.replace('typServisu: typServisu, zprava: zprava })', "typServisu: typServisu, zprava: zprava, lang: 'en' })");
    return a + js + b;
  });
}

const LEGAL_NOTE = '<p class="bs-legal-note" style="margin:1rem 0 2rem;padding:.75rem 1rem;border-left:3px solid #efc101;background:rgba(0,0,0,.04);font-size:.9em">This English translation is provided for information only. The legally binding version is the <a href="{CS}" hreflang="cs">Czech original</a>.</p>';

// ---------------------------------------------------------------- main
function buildPage(p) {
  const csFile = path.join(PUB, p.cs + '.html');
  const csHtml = fs.readFileSync(csFile, 'utf8');
  const csUrl = L.BASE_URL + L.csPagePath(p);
  const enUrl = L.BASE_URL + L.enPagePath(p);
  const page = p.cs;

  // odstranit přepínač/hreflang vložený do CZ stránky předchozím během
  let h = csHtml.replace(/\s*<a\b[^>]*\bbs-lang-switch\b[^>]*>[\s\S]*?<\/a>/g, '').replace(/\s*<style id="bs-lang-css">[\s\S]*?<\/style>/, '');
  // head
  h = h.replace(/<html\b([^>]*)\blang="[^"]*"/, '<html$1lang="en"');
  h = h.replace(/<title>([^<]*)<\/title>/, (m, t) => `<title>${trPlain(t, page)}</title>`);
  for (const [attr, key] of [['name', 'description'], ['property', 'og:title'], ['property', 'og:description'], ['property', 'twitter:title'], ['property', 'twitter:description'], ['name', 'twitter:title'], ['name', 'twitter:description'], ['property', 'og:image:alt']]) {
    const v = getMeta(h, attr, key); if (v) h = setMetaContent(h, attr, key, trPlain(v, page));
  }
  h = setMetaContent(h, 'property', 'og:locale', 'en_US');
  h = h.replace(/\s*<meta\b[^>]*property="og:locale:alternate"[^>]*>/g, '');
  h = h.replace(/(<meta\b[^>]*property="og:locale"[^>]*>)/, '$1\n  <meta property="og:locale:alternate" content="cs_CZ">');
  if (getMeta(h, 'property', 'og:url')) h = setMetaContent(h, 'property', 'og:url', enUrl);
  h = translateJsonLd(h, page);

  // body texty
  h = S.transform(h, run => tr(run, page), a => tr(a, page));
  h = translateInlineScripts(h);
  // odkazy + assety
  h = rewriteUrls(h);
  // canonical + hreflang až po přepisu odkazů (jinak by se CZ alternate přepsal na EN)
  if (!p.template) { h = setCanonical(h, enUrl); h = setHreflang(h, csUrl, enUrl); }
  else { h = setCanonical(h, enUrl); h = h.replace(/\s*<!-- hreflang:start -->[\s\S]*?<!-- hreflang:end -->/, ''); } // šablona: prerender canonical přepíše
  // přepínač jazyka
  h = setLangSwitch(h, p.template ? (p.cs === 'detail_post' ? '/blog' : p.cs === 'detail_akce' ? '/akce-archive' : p.cs === 'detail_archive-team' ? '/team' : '/') : L.csPagePath(p), 'cs');
  // poznámka u právních textů
  if (LEGAL.has(p.cs)) {
    const note = LEGAL_NOTE.replace('{CS}', L.csPagePath(p));
    h = h.replace(/\s*<p class="bs-legal-note"[\s\S]*?<\/p>/, '');
    const i = h.search(/<\/h1>/i);
    if (i >= 0) h = h.slice(0, i + 5) + '\n' + note + h.slice(i + 5);
  }
  h = h.replace(/<html\b/, '<html data-lang="en"').replace(/(<html\b[^>]*?)\s+data-lang="en"([^>]*\sdata-lang="en")/, '$1$2');

  if (!CHECK) {
    fs.mkdirSync(EN_DIR, { recursive: true });
    fs.writeFileSync(path.join(EN_DIR, p.en + '.html'), h);
    // CZ stránka: hreflang + přepínač
    let c = csHtml;
    if (!p.template) c = setHreflang(c, csUrl, enUrl);
    c = setLangSwitch(c, p.template ? (p.cs === 'detail_post' ? '/en/blog' : p.cs === 'detail_akce' ? '/en/courses-and-events' : p.cs === 'detail_archive-team' ? '/en/team' : '/en') : L.enPagePath(p), 'en');
    if (c !== csHtml) fs.writeFileSync(csFile, c);
  }
}

function main() {
  for (const p of L.PAGES) buildPage(p);
  if (missing.size) {
    console.log(`⚠️  Nepřeložené úseky: ${missing.size}`);
    for (const [k, pg] of [...missing].slice(0, 30)) console.log(`   [${pg}] ${k.slice(0, 100)}`);
  }
  console.log(CHECK ? '✔ kontrola hotova' : `✅ EN stránky: ${L.PAGES.length} → public/en/`);
}
main();
