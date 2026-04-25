#!/usr/bin/env node
// Async-loadne Google Fonts CSS (preload+onload swap) + přidá preconnecty.
// Idempotentní — bezpečně spustitelné opakovaně.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public');
const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&family=Montserrat:wght@300;400;500;600;700&family=Lobster&display=swap';

const ORIG = `<link rel="stylesheet" href="${FONTS_URL}">`;
const REPLACEMENT =
  `<link rel="preconnect" href="https://fonts.googleapis.com">\n` +
  `  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n` +
  `  <link rel="preload" as="style" href="${FONTS_URL}" onload="this.onload=null;this.rel='stylesheet'">\n` +
  `  <noscript><link rel="stylesheet" href="${FONTS_URL}"></noscript>`;

function processFile(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');

  // Idempotence: pokud už máme preload pattern, přeskoč.
  if (html.includes(`<link rel="preload" as="style" href="${FONTS_URL}"`)) {
    return { path: filePath, changed: false, reason: 'already-async' };
  }

  if (!html.includes(ORIG)) {
    return { path: filePath, changed: false, reason: 'no-match' };
  }

  const updated = html.replace(ORIG, REPLACEMENT);
  fs.writeFileSync(filePath, updated, 'utf8');
  return { path: filePath, changed: true };
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (stat.isFile() && full.endsWith('.html')) out.push(full);
  }
  return out;
}

const files = walk(ROOT);
let changed = 0, alreadyAsync = 0, noMatch = 0;
for (const f of files) {
  const res = processFile(f);
  if (res.changed) changed++;
  else if (res.reason === 'already-async') alreadyAsync++;
  else if (res.reason === 'no-match') noMatch++;
}

console.log(`Total HTML: ${files.length}`);
console.log(`Changed:    ${changed}`);
console.log(`Already async: ${alreadyAsync}`);
console.log(`No match:   ${noMatch}`);
