#!/usr/bin/env node
// Pro 16 starších stránek nahradí synchronní WebFont Loader (a víceřádkový stylesheet link)
// jednotným async patternem stejně jako u hlavního template.
// Idempotentní.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public');
const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&family=Montserrat:wght@300;400;500;600;700&family=Lobster&display=swap';

const ASYNC_BLOCK =
  `<link rel="preload" as="style" href="${FONTS_URL}" onload="this.onload=null;this.rel='stylesheet'">\n` +
  `  <noscript><link rel="stylesheet" href="${FONTS_URL}"></noscript>`;

function processFile(filePath) {
  let html = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  const reasons = [];

  // 0) Skip pokud už máme preload pattern
  if (html.includes(`<link rel="preload" as="style" href="${FONTS_URL}"`)) {
    return { changed: false, reason: 'already-async' };
  }

  // 1) Odstraň synchronní WebFont Loader (script src + následující WebFont.load(...))
  const webfontPattern = /\s*<script src="https:\/\/ajax\.googleapis\.com\/ajax\/libs\/webfont\/[^"]+"[^>]*><\/script>\s*\n\s*<script[^>]*>WebFont\.load\([^<]*\);<\/script>/;
  if (webfontPattern.test(html)) {
    html = html.replace(webfontPattern, '');
    changed = true;
    reasons.push('removed-webfont-loader');
  }

  // 2) Nahraď víceřádkový (i jednořádkový) <link rel="stylesheet" href="...fonts.googleapis.com...css2..."> za async block
  const multilineLinkPattern = /<link rel="stylesheet"\s+href="https:\/\/fonts\.googleapis\.com\/css2\?family=Lato[^"]*">/;
  if (multilineLinkPattern.test(html)) {
    html = html.replace(multilineLinkPattern, ASYNC_BLOCK);
    changed = true;
    reasons.push('replaced-stylesheet-link');
  } else if (reasons.includes('removed-webfont-loader')) {
    // Pokud jsme jen odstranili WebFont Loader, musíme někam vložit async preload.
    // Najdi poslední <link href="..." rel="preconnect"...> a vlož za něj.
    const preconnectPattern = /(<link[^>]*rel="preconnect"[^>]*>)(\s*\n\s*)(?!.*<link[^>]*rel="preconnect")/s;
    const lastPre = /(<link[^>]*rel="preconnect"[^>]*>)([^]*?)(?=<script|<link href="images\/favicon)/;
    const m = html.match(lastPre);
    if (m) {
      // Insert ASYNC_BLOCK after last preconnect block (before next non-preconnect element)
      // Safer: just insert před první <script> nebo favicon
      html = html.replace(/(\s*)(<script[^>]*>!function \(o, c\)|<link href="images\/favicon)/, `\n  ${ASYNC_BLOCK}$1$2`);
      reasons.push('inserted-async-fallback');
    }
  }

  if (!changed) return { changed: false, reason: 'no-match' };

  fs.writeFileSync(filePath, html, 'utf8');
  return { changed: true, reasons };
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      // Skip admin/ (jiný font Inter)
      if (name === 'admin') continue;
      walk(full, out);
    } else if (stat.isFile() && full.endsWith('.html')) out.push(full);
  }
  return out;
}

const files = walk(ROOT);
let changed = 0, alreadyAsync = 0, noMatch = 0;
for (const f of files) {
  const res = processFile(f);
  if (res.changed) {
    changed++;
    console.log(`✓ ${path.relative(ROOT, f)}: ${res.reasons.join(', ')}`);
  } else if (res.reason === 'already-async') alreadyAsync++;
  else noMatch++;
}

console.log(`\nTotal HTML: ${files.length}`);
console.log(`Changed:    ${changed}`);
console.log(`Already async: ${alreadyAsync}`);
console.log(`No match:   ${noMatch}`);
