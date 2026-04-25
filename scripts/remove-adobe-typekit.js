#!/usr/bin/env node
/**
 * remove-adobe-typekit.js
 *
 * Idempotentně odstraňuje render-blocking ghost dependency Adobe Typekit
 * (use.typekit.net/rxy5dgi.js) ze všech HTML souborů v public/.
 *
 * Web používá pouze Google Fonts (Lato, Montserrat, Lobster). Adobe Typekit
 * zde zbyl jako reziduum z původní Webflow šablony, ale stahoval 14 variant
 * fontů (~1 MB, ~3 s na mobilu) — bez efektu.
 *
 * Bezpečnost: ověřeno, že žádné CSS @font-face nereferencuje typekit a žádný
 * jiný kód nevolá Typekit.* (jediný výskyt je onload handler v tom samém tagu).
 *
 * Spuštění:
 *   node scripts/remove-adobe-typekit.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'public');

const TYPEKIT_REGEX = /[ \t]*<script[^>]*src=["']https:\/\/use\.typekit\.net\/[^"']+["'][^>]*><\/script>\s*\n?/gi;

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && full.endsWith('.html')) files.push(full);
  }
  return files;
}

const htmlFiles = walk(ROOT);
let modified = 0;
let skipped = 0;
let totalRemoved = 0;

for (const file of htmlFiles) {
  const original = fs.readFileSync(file, 'utf8');
  if (!/use\.typekit\.net/.test(original)) {
    skipped++;
    continue;
  }
  const matches = original.match(TYPEKIT_REGEX) || [];
  const updated = original.replace(TYPEKIT_REGEX, '');
  if (updated !== original) {
    fs.writeFileSync(file, updated, 'utf8');
    modified++;
    totalRemoved += matches.length;
  } else {
    skipped++;
    console.warn('! ' + path.relative(ROOT, file) + ' obsahuje use.typekit.net ale regex nematchnul');
  }
}

console.log('---');
console.log('HTML soubory celkem: ' + htmlFiles.length);
console.log('Upraveno: ' + modified);
console.log('Přeskočeno (neobsahuje Typekit): ' + skipped);
console.log('Odstraněno tagů: ' + totalRemoved);
