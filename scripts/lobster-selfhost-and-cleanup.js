#!/usr/bin/env node
/**
 * lobster-selfhost-and-cleanup.js
 *
 * Idempotentní batch úprava pro všechny HTML soubory v public/:
 *
 *  1) Odstraní `&family=Lobster` (případně `?family=Lobster&...` na začátku)
 *     z Google Fonts URL. Ponechá Lato + Montserrat. Self-hosted Lobster je
 *     nyní deklarován v bikeskills-overrides.css.
 *
 *  2) Odstraní render-blocking preconnect na firestore.googleapis.com.
 *     PSI explicitně flaguje jako "Nepoužité předběžné připojení". Firebase
 *     SDK si spojení otevře sám až po inicializaci.
 *
 *  3) Přidá <link rel="preload" as="font" type="font/woff2" ...> pro
 *     lobster-latin-ext.woff2 (kritické — obsahuje českou diakritiku š/č/ř/ž
 *     v hero textu) hned za firebasestorage preconnect.
 *
 *  Cíl:
 *    - −1500 ms z LCP critical chain (waterfall: HTML → webflow.css →
 *      /css2?Lobster → woff2 = 2.1 s)
 *    - −300 ms z preconnect quota (PSI explicit recommendation)
 *
 *  Bezpečnost:
 *    - Idempotentní: detekuje již upravené soubory a přeskakuje je
 *    - Po regex split logování modified vs skipped
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'public');

// 1) Lobster odstranění z různých kombinací v Google Fonts URL
//    Formy v praxi: `&family=Lobster&display=swap`, `&family=Lobster"`, atd.
const LOBSTER_REGEX = /&family=Lobster(?=[&"'])/g;

// 2) Firestore preconnect tag (s libovolným pořadím atributů)
const FIRESTORE_PRECONNECT_REGEX = /[ \t]*<link[^>]*rel=["']preconnect["'][^>]*href=["']https:\/\/firestore\.googleapis\.com["'][^>]*>\s*\n?/gi;

// 3) Lobster preload — vložit za firebasestorage preconnect
const FIREBASESTORAGE_PRECONNECT = /(<link[^>]*rel=["']preconnect["'][^>]*href=["']https:\/\/firebasestorage\.googleapis\.com["'][^>]*>)/i;
const LOBSTER_PRELOAD_BLOCK = `$1
  <!-- Self-hosted Lobster font (LCP critical chain optimalizace) -->
  <link rel="preload" as="font" type="font/woff2" href="fonts/lobster-latin-ext.woff2" crossorigin>
  <link rel="preload" as="font" type="font/woff2" href="fonts/lobster-latin.woff2" crossorigin>`;

// Idempotency check
const ALREADY_DONE_MARKER = /lobster-latin-ext\.woff2/;

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
let stats = { lobsterRemoved: 0, firestoreRemoved: 0, preloadAdded: 0 };

for (const file of htmlFiles) {
  const original = fs.readFileSync(file, 'utf8');
  let updated = original;

  // 1) Lobster z Google Fonts URL
  const lobsterMatches = updated.match(LOBSTER_REGEX);
  if (lobsterMatches) {
    updated = updated.replace(LOBSTER_REGEX, '');
    stats.lobsterRemoved += lobsterMatches.length;
  }

  // 2) Firestore preconnect
  const firestoreMatches = updated.match(FIRESTORE_PRECONNECT_REGEX);
  if (firestoreMatches) {
    updated = updated.replace(FIRESTORE_PRECONNECT_REGEX, '');
    stats.firestoreRemoved += firestoreMatches.length;
  }

  // 3) Preload tagy (jen když ještě nejsou)
  if (!ALREADY_DONE_MARKER.test(updated) && FIREBASESTORAGE_PRECONNECT.test(updated)) {
    updated = updated.replace(FIREBASESTORAGE_PRECONNECT, LOBSTER_PRELOAD_BLOCK);
    stats.preloadAdded++;
  }

  if (updated !== original) {
    fs.writeFileSync(file, updated, 'utf8');
    modified++;
  } else {
    skipped++;
  }
}

console.log('---');
console.log('HTML soubory celkem: ' + htmlFiles.length);
console.log('Upraveno: ' + modified);
console.log('Přeskočeno: ' + skipped);
console.log('Lobster odstraněn z URL: ' + stats.lobsterRemoved);
console.log('Firestore preconnect odstraněn: ' + stats.firestoreRemoved);
console.log('Lobster preload přidán: ' + stats.preloadAdded);
