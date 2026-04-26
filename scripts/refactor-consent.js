#!/usr/bin/env node
/**
 * refactor-consent.js
 *
 * Refactor cookie consent napříč všemi HTML stránkami:
 *  1) Odstraní inline GA4 + Meta Pixel + noscript (4 řádky v <head>)
 *  2) Odstraní inline 'cookies-show' delay <script> (1 řádek v <head>)
 *  3) Odstraní inline cookie banner JS blok (před </body>)
 *  4) Přidá <script src="/js/consent.js" defer></script> před </body>
 *
 * Vše idempotentní — opakované spuštění nic nerozbije.
 */
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const FILES = [
  '404.html', 'akce-archive.html', 'blog.html', 'campy.html',
  'detail_akce.html', 'detail_archive-team.html', 'detail_post.html',
  'dodaci-podminky.html', 'index.html', 'individualni-kurzy.html',
  'kompletni-cenik-servisnich-praci.html', 'kompletni-servis-full.html',
  'kompletni-servis-hardtail.html', 'kontakt.html', 'obchodni-podminky.html',
  'pojisteni-bikeplan.html', 'pujcovna.html', 'servis.html',
  'specialni-akce.html', 'standartni-servis-kol.html', 'team.html',
  'zasady-ochrany-osobnich-udaju.html'
];

// Patterny k odstranění
// 1) Komentář + GA + (komentář) + FB Pixel + noscript (s case-insensitive variantami)
const PATTERN_GA_FB = /\s*<!--\s*Google Analytics[^>]*-->\s*\n\s*<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-DG5KF7PX48"><\/script>\s*\n\s*<script>window\.dataLayer=window\.dataLayer\|\|\[\];function gtag\(\)\{dataLayer\.push\(arguments\);\}gtag\('js',new Date\(\)\);gtag\('config','G-DG5KF7PX48'\);<\/script>\s*\n(?:\s*<!--\s*Meta Pixel[^>]*-->\s*\n)?\s*<script>!function\(f,b,e,v,n,t,s\)\{[\s\S]*?fbq\('track','PageView'\);<\/script>\s*\n\s*<noscript><img height="1" width="1"[^>]*src="https:\/\/www\.facebook\.com\/tr\?id=537412813575132[^>]*><\/noscript>\s*\n/g;

// 2) inline 'cookies-show' delay script v <head>
const PATTERN_HEAD_SHOW = /\s*<script>\(function\(\)\{if\(document\.cookie\.match\(\/\(\?:\^\|; \)cookieClosed=\/\)\)return;function s\(\)\{setTimeout\(function\(\)\{document\.documentElement\.classList\.add\('cookies-show'\);\},800\);\}if\(document\.readyState==='complete'\)s\(\);else window\.addEventListener\('load',s,\{once:true\}\);\}\)\(\);<\/script>\s*\n/g;

// 3) inline banner JS blok před </body>
//    Začíná: <script>\n// Cookie banner — native, defer-friendly...
//    Končí:  })();\n</script>
const PATTERN_BANNER_JS = /\s*<script>\s*\n\s*\/\/ Cookie banner — native, defer-friendly[\s\S]*?\}\)\(\);\s*\n<\/script>\s*\n/g;

// Co přidat: <script src="/js/consent.js" defer></script>
const CONSENT_SCRIPT_TAG = '  <script src="/js/consent.js" defer></script>\n';

let totalChanges = 0;
let totalErrors = 0;

for (const filename of FILES) {
  const filepath = path.join(PUBLIC_DIR, filename);
  if (!fs.existsSync(filepath)) {
    console.warn(`[skip] ${filename} — neexistuje`);
    continue;
  }
  let html = fs.readFileSync(filepath, 'utf8');
  const before = html;

  html = html.replace(PATTERN_GA_FB, '\n');
  html = html.replace(PATTERN_HEAD_SHOW, '\n');
  html = html.replace(PATTERN_BANNER_JS, '\n');

  // Idempotentní přidání consent.js před </body> — jen pokud tam ještě není
  if (!html.includes('/js/consent.js')) {
    html = html.replace(/<\/body>/i, CONSENT_SCRIPT_TAG + '</body>');
  }

  if (html !== before) {
    fs.writeFileSync(filepath, html, 'utf8');
    totalChanges++;
    console.log(`[ok]   ${filename} — patched`);
  } else {
    console.log(`[noop] ${filename} — žádná změna (už zrefactorováno?)`);
  }
}

console.log(`\nDone. ${totalChanges} files modified, ${totalErrors} errors.`);
