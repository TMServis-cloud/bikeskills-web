#!/usr/bin/env node
/**
 * refactor-consent.js
 *
 * Refactor cookie consent napříč VŠEMI HTML stránkami (top-level + akce/* + blog/*):
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

// Rekurzivní walk všech *.html v public/, vyloučit wp-content/
function walkHtml(dir, files) {
  files = files || [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      // skip wp-content/uploads (binární assety)
      if (ent.name === 'wp-content' || ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
      walkHtml(full, files);
    } else if (ent.isFile() && ent.name.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

// Patterny k odstranění
const PATTERN_GA_FB = /\s*<!--\s*Google Analytics[^>]*-->\s*\n\s*<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-DG5KF7PX48"><\/script>\s*\n\s*<script>window\.dataLayer=window\.dataLayer\|\|\[\];function gtag\(\)\{dataLayer\.push\(arguments\);\}gtag\('js',new Date\(\)\);gtag\('config','G-DG5KF7PX48'\);<\/script>\s*\n(?:\s*<!--\s*Meta Pixel[^>]*-->\s*\n)?\s*<script>!function\(f,b,e,v,n,t,s\)\{[\s\S]*?fbq\('track','PageView'\);<\/script>\s*\n\s*<noscript><img height="1" width="1"[^>]*src="https:\/\/www\.facebook\.com\/tr\?id=537412813575132[^>]*><\/noscript>\s*\n/g;

const PATTERN_HEAD_SHOW = /\s*<script>\(function\(\)\{if\(document\.cookie\.match\(\/\(\?:\^\|; \)cookieClosed=\/\)\)return;function s\(\)\{setTimeout\(function\(\)\{document\.documentElement\.classList\.add\('cookies-show'\);\},800\);\}if\(document\.readyState==='complete'\)s\(\);else window\.addEventListener\('load',s,\{once:true\}\);\}\)\(\);<\/script>\s*\n/g;

const PATTERN_BANNER_JS = /\s*<script>\s*\n\s*\/\/ Cookie banner — native, defer-friendly[\s\S]*?\}\)\(\);\s*\n<\/script>\s*\n/g;

const CONSENT_SCRIPT_TAG = '  <script src="/js/consent.js" defer></script>\n';

const files = walkHtml(PUBLIC_DIR);
console.log(`Scanning ${files.length} HTML files...`);

let totalChanges = 0;
let alreadyClean = 0;

for (const filepath of files) {
  let html = fs.readFileSync(filepath, 'utf8');
  const before = html;

  html = html.replace(PATTERN_GA_FB, '\n');
  html = html.replace(PATTERN_HEAD_SHOW, '\n');
  html = html.replace(PATTERN_BANNER_JS, '\n');

  if (!html.includes('/js/consent.js')) {
    if (html.includes('</body>')) {
      html = html.replace(/<\/body>/i, CONSENT_SCRIPT_TAG + '</body>');
    }
  }

  if (html !== before) {
    fs.writeFileSync(filepath, html, 'utf8');
    totalChanges++;
    const rel = path.relative(PUBLIC_DIR, filepath);
    if (totalChanges <= 10 || totalChanges % 50 === 0) {
      console.log(`[ok]   ${rel}`);
    }
  } else {
    alreadyClean++;
  }
}

console.log(`\nDone. ${totalChanges} files modified, ${alreadyClean} already clean.`);
