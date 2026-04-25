#!/usr/bin/env node
/**
 * remove-unused-preconnects.js (v2)
 *
 * Idempotentně odstraňuje 2 nepoužité preconnect tagy ze všech HTML.
 * v2 fix: matchuje OBĚ pořadí atributů (href|rel a rel|href).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'public');

/**
 * Vrátí regex matchující <link> tag, který má rel="preconnect" a href="<url>",
 * bez ohledu na pořadí atributů. Lookahead zajišťuje, že tag obsahuje oba.
 */
function preconnectRegex(hostname) {
  // Escape regex special chars in hostname
  const h = hostname.replace(/\./g, '\\.');
  return new RegExp(
    `[ \\t]*<link(?=[^>]*\\brel=["']preconnect["'])(?=[^>]*\\bhref=["']https://${h}["'])[^>]*>\\s*\\n?`,
    'gi'
  );
}

const WWW_GSTATIC_REGEX = preconnectRegex('www.gstatic.com');
const FIREBASESTORAGE_REGEX = preconnectRegex('firebasestorage.googleapis.com');

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
let stats = { wwwGstaticRemoved: 0, firebasestorageRemoved: 0 };

for (const file of htmlFiles) {
  const original = fs.readFileSync(file, 'utf8');
  let updated = original;

  const wwwMatches = updated.match(WWW_GSTATIC_REGEX);
  if (wwwMatches) {
    updated = updated.replace(WWW_GSTATIC_REGEX, '');
    stats.wwwGstaticRemoved += wwwMatches.length;
  }

  const fbMatches = updated.match(FIREBASESTORAGE_REGEX);
  if (fbMatches) {
    updated = updated.replace(FIREBASESTORAGE_REGEX, '');
    stats.firebasestorageRemoved += fbMatches.length;
  }

  if (updated !== original) {
    fs.writeFileSync(file, updated, 'utf8');
    modified++;
  }
}

console.log('---');
console.log('HTML souborů celkem: ' + htmlFiles.length);
console.log('Upraveno: ' + modified);
console.log('www.gstatic.com preconnect odstraněn: ' + stats.wwwGstaticRemoved);
console.log('firebasestorage preconnect odstraněn: ' + stats.firebasestorageRemoved);
