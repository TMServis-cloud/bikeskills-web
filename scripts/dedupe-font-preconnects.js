#!/usr/bin/env node
/**
 * dedupe-font-preconnects.js
 *
 * Odstraní duplicitní preconnect tagy pro fonts.googleapis.com a
 * fonts.gstatic.com, které vznikly opakovanou aplikací optimize-fonts skriptů.
 *
 * Strategy: ponechá první výskyt každého preconnect hostu, další odstraní.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'public');
const HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

function walk(dir, files = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, files);
    else if (full.endsWith('.html')) files.push(full);
  }
  return files;
}

const files = walk(ROOT);
let modified = 0;
let totalRemoved = 0;

for (const file of files) {
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  let removedHere = 0;

  for (const host of HOSTS) {
    // Najdi všechny <link ... preconnect ... host ... > tagy
    const re = new RegExp('[ \\t]*<link[^>]*' + host.replace(/\./g, '\\.') + '[^>]*>\\s*\\n?', 'gi');
    let firstKept = false;
    html = html.replace(re, (match) => {
      if (!/preconnect/i.test(match)) return match; // ne-preconnect (např. preload as="style") nech
      if (!firstKept) {
        firstKept = true;
        return match;
      }
      removedHere++;
      return '';
    });
  }

  if (html !== before) {
    fs.writeFileSync(file, html, 'utf8');
    modified++;
    totalRemoved += removedHere;
  }
}

console.log('Souborů celkem: ' + files.length);
console.log('Upraveno: ' + modified);
console.log('Odstraněno duplicitních preconnect tagů: ' + totalRemoved);
