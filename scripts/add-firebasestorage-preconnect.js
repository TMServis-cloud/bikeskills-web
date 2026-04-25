#!/usr/bin/env node
/**
 * Idempotently add <link rel="preconnect" href="https://firebasestorage.googleapis.com">
 * (without crossorigin) right after the fonts.gstatic.com preconnect.
 *
 * PSI doporučuje 300 ms LCP úsporu. Bez crossorigin atributu — Firebase Storage <img>
 * tagy z cms-loaderu jsou no-cors, a browser drží oddělené connection pooly pro cors vs no-cors.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'public');
const NEW_LINK = '<link rel="preconnect" href="https://firebasestorage.googleapis.com">';

// Match the fonts.gstatic.com preconnect line, then we'll insert ours right after.
// Lookahead allows attributes in any order.
const GSTATIC_PRECONNECT_RE = /([ \t]*<link(?=[^>]*\brel=["']preconnect["'])(?=[^>]*\bhref=["']https:\/\/fonts\.gstatic\.com["'])[^>]*>\s*\n)/i;

// Idempotency check: any preconnect to firebasestorage.googleapis.com already present?
const FIREBASESTORAGE_PRECONNECT_RE = /<link[^>]*\brel=["']preconnect["'][^>]*\bhref=["']https:\/\/firebasestorage\.googleapis\.com["']/i;
const FIREBASESTORAGE_PRECONNECT_ALT_RE = /<link[^>]*\bhref=["']https:\/\/firebasestorage\.googleapis\.com["'][^>]*\brel=["']preconnect["']/i;

function walk(dir, files = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, files);
    else if (e.isFile() && e.name.endsWith('.html')) files.push(p);
  }
  return files;
}

const files = walk(ROOT);
let edited = 0, skipped = 0, noAnchor = 0;

for (const f of files) {
  let html = fs.readFileSync(f, 'utf8');

  if (FIREBASESTORAGE_PRECONNECT_RE.test(html) || FIREBASESTORAGE_PRECONNECT_ALT_RE.test(html)) {
    skipped++;
    continue;
  }

  const m = html.match(GSTATIC_PRECONNECT_RE);
  if (!m) {
    noAnchor++;
    continue;
  }

  // Use the exact indentation of the gstatic line.
  const gstaticLine = m[1];
  const indent = (gstaticLine.match(/^[ \t]*/) || [''])[0];
  const insertion = `${indent}${NEW_LINK}\n`;

  html = html.replace(GSTATIC_PRECONNECT_RE, gstaticLine + insertion);
  fs.writeFileSync(f, html);
  edited++;
}

console.log(`HTML files scanned: ${files.length}`);
console.log(`Edited:  ${edited}`);
console.log(`Skipped (already present): ${skipped}`);
console.log(`No fonts.gstatic anchor:   ${noAnchor}`);
