/**
 * BIKESKILLS – Restore popis/obsah z originálních WP dat
 *
 * Zdroje:
 *   - akce: scripts/akce-export.csv (Content sloupec + Permalink)
 *   - clanky: scripts/export.xml (content:encoded + wp:post_name)
 *
 * Postup:
 *   1. Parsuje WP data, extrahuje slug → obsah
 *   2. Převede .jpg/.jpeg/.png → .webp v URL
 *   3. Převede bikeskills.cz/wp-content URL → Firebase Storage URL
 *   4. Aktualizuje Firestore (jen poškozené dokumenty)
 *
 * Usage: node scripts/restore-from-wp.js
 */

const fs    = require('fs');
const path  = require('path');
const admin = require('firebase-admin');

const BUCKET       = 'bikeskills-web.firebasestorage.app';
const STORAGE_BASE = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/`;

const SA = path.join(__dirname, 'serviceAccountKey.json');
try { admin.initializeApp({ credential: admin.credential.cert(require(SA)) }); }
catch (e) { console.error('❌ Firebase init:', e.message); process.exit(1); }

const db = admin.firestore();

// --- URL transformace ---

function toWebp(str) {
  return str.replace(
    /(https?:\/\/bikeskills\.cz\/wp-content\/uploads\/[^\s"'<>]+?)\.(jpg|jpeg|png)/gi,
    '$1.webp'
  );
}

function toStorageUrl(str) {
  if (!str || typeof str !== 'string') return str;
  return str.replace(
    /https?:\/\/bikeskills\.cz\/(wp-content\/uploads\/[^\s"'<>]+)/gi,
    (match, urlPath) => {
      const encoded = urlPath.split('/').map(encodeURIComponent).join('%2F');
      return `${STORAGE_BASE}${encoded}?alt=media`;
    }
  );
}

function stripWpBlocks(html) {
  if (!html) return '';
  return html
    .replace(/<!--\s*wp:[^>]*-->/g, '')
    .replace(/<!--\s*\/wp:[^>]*-->/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function processContent(html) {
  return toStorageUrl(toWebp(stripWpBlocks(html)));
}

// --- Parsování CSV (podporuje quoted fields s newlines) ---

function parseCsv(content) {
  const records = [];
  let i = 0;
  const len = content.length;

  function readField() {
    if (content[i] === '"') {
      i++; // skip opening quote
      let val = '';
      while (i < len) {
        if (content[i] === '"' && content[i + 1] === '"') {
          val += '"'; i += 2;
        } else if (content[i] === '"') {
          i++; break;
        } else {
          val += content[i++];
        }
      }
      return val;
    } else {
      let val = '';
      while (i < len && content[i] !== ',' && content[i] !== '\n' && content[i] !== '\r') {
        val += content[i++];
      }
      return val;
    }
  }

  // Skip header row
  let headers = [];
  while (i < len && content[i] !== '\n') {
    headers.push(readField());
    if (content[i] === ',') i++;
  }
  if (content[i] === '\r') i++;
  if (content[i] === '\n') i++;

  // Parse data rows
  while (i < len) {
    const row = {};
    let col = 0;
    while (i < len && content[i] !== '\n') {
      const field = readField();
      if (headers[col]) row[headers[col].replace(/^"|"$/g, '')] = field;
      col++;
      if (i < len && content[i] === ',') i++;
    }
    if (content[i] === '\r') i++;
    if (content[i] === '\n') i++;
    if (Object.keys(row).length > 0) records.push(row);
  }
  return records;
}

// --- Parsování WP XML pro clanky ---

function parseWpXml(xmlPath) {
  const xml = fs.readFileSync(xmlPath, 'utf8');
  const slugToContent = new Map();

  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const item = m[1];

    const statusM = item.match(/<wp:status><!\[CDATA\[(.*?)\]\]><\/wp:status>/);
    if (!statusM || statusM[1] !== 'publish') continue;

    const typeM = item.match(/<wp:post_type><!\[CDATA\[(.*?)\]\]><\/wp:post_type>/);
    if (!typeM || typeM[1] !== 'post') continue;

    const slugM = item.match(/<wp:post_name><!\[CDATA\[(.*?)\]\]><\/wp:post_name>/);
    if (!slugM) continue;

    const contentM = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);
    if (!contentM) continue;

    slugToContent.set(slugM[1], contentM[1]);
  }

  console.log(`  XML: ${slugToContent.size} clanky parsováno`);
  return slugToContent;
}

// --- Restore akce z CSV ---

async function restoreAkce() {
  console.log('\n📂 Parsování akce-export.csv...');
  const csvPath = path.join(__dirname, 'akce-export.csv');
  const csv = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(csv);
  console.log(`  CSV: ${rows.length} řádků`);

  // slug → content map
  const slugToContent = new Map();
  for (const row of rows) {
    const permalink = row['Permalink'] || '';
    const content   = row['Content']   || '';
    if (!permalink || !content) continue;
    // Extract slug from permalink: https://bikeskills.cz/akce/chlapi-ladi-bikeskills-1/
    const slugM = permalink.match(/\/([^/]+)\/?$/);
    if (slugM) slugToContent.set(slugM[1], content);
  }
  console.log(`  Slugů v CSV: ${slugToContent.size}`);

  const snap = await db.collection('akce').get();
  let repaired = 0, notFound = 0, skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const slug = data.slug || '';
    const popis = data.popis || '';

    const wpContent = slugToContent.get(slug);
    if (!wpContent) {
      console.log(`  ⚠️  akce/${doc.id} slug="${slug}" – nenalezeno v CSV`);
      notFound++;
      continue;
    }

    const fixed = processContent(wpContent);
    // Přeskoč pokud je obsah identický (již správný)
    if (popis === fixed) { skipped++; continue; }

    await doc.ref.update({ popis: fixed });
    console.log(`  ✅ akce/${doc.id} [${slug}]`);
    repaired++;
  }

  console.log(`  → akce: ${repaired} opraveno, ${skipped} OK, ${notFound} nenalezeno\n`);
}

// --- Restore clanky z XML ---

async function restaureClanky() {
  console.log('\n📂 Parsování export.xml...');
  const xmlPath = path.join(__dirname, 'export.xml');
  const slugToContent = parseWpXml(xmlPath);

  const snap = await db.collection('clanky').get();
  let repaired = 0, notFound = 0, skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const slug  = data.slug || '';
    const obsah = data.obsah || '';

    const wpContent = slugToContent.get(slug);
    if (!wpContent) {
      console.log(`  ⚠️  clanky/${doc.id} slug="${slug}" – nenalezeno v XML`);
      notFound++;
      continue;
    }

    const fixed = processContent(wpContent);
    if (obsah === fixed) { skipped++; continue; }

    await doc.ref.update({ obsah: fixed });
    console.log(`  ✅ clanky/${doc.id} [${slug}]`);
    repaired++;
  }

  console.log(`  → clanky: ${repaired} opraveno, ${skipped} OK, ${notFound} nenalezeno\n`);
}

async function main() {
  console.log('🔧 Restore popis/obsah z originálních WP dat...');
  await restoreAkce();
  await restaureClanky();
  console.log('✅ Hotovo');
  process.exit(0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
