/**
 * BIKESKILLS – Import akcí z CSV exportu (WP All Export)
 *
 * Usage:
 *   1. Stáhni CSV: https://bikeskills.cz/wp-load.php?security_token=8daacbcd6383cb31&export_id=13&action=get_data
 *   2. Ulož do scripts/akce-export.csv
 *   3. node scripts/akce-import.js
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// ============================================================
// FIREBASE INIT
// ============================================================
const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(__dirname, 'serviceAccountKey.json');

try {
  const serviceAccount = require(SERVICE_ACCOUNT_PATH);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'bikeskills-web.appspot.com'
  });
} catch (error) {
  console.error('❌ Firebase init error:', error.message);
  process.exit(1);
}

const db = admin.firestore();
const CSV_FILE = path.join(__dirname, 'akce-export.csv');

// ============================================================
// CSV PARSER (handles quoted fields and escaped quotes)
// ============================================================
function parseCSV(text) {
  const rows = [];
  let row = [], current = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) { row.push(current); current = ''; }
    else if (ch === '\n' && !inQuotes) { row.push(current); current = ''; rows.push(row); row = []; }
    else if (ch !== '\r') current += ch;
  }
  if (row.length) { row.push(current); rows.push(row); }
  return rows;
}

// ============================================================
// HELPERS
// ============================================================

// Parsuje český datum "d.m.yyyy" nebo "dd.mm.yyyy" na Date objekt
function parseCzechDate(dateStr) {
  if (!dateStr) return null;
  // Handle formats like "25.9.2021", "08.05.2021", "1.1.2021"
  const match = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T12:00:00Z`);
}

// Vytvoří datumSort string "YYYY-MM-DD" pro řazení
function toDateSort(dateStr) {
  const d = parseCzechDate(dateStr);
  if (!d) return null;
  return d.toISOString().split('T')[0]; // "2021-09-25"
}

// Mapuje riders-number na interní stav
function mapStav(ridersNumber) {
  const val = (ridersNumber || '').toLowerCase().trim();
  if (['hotovo', 'odjeto'].includes(val)) return 'odjeto';
  if (val.includes('zrušeno')) return 'odjeto';
  if (val === 'přihlašujte se') return 'prihlasujte';
  if (val === 'obsazeno') return 'obsazeno';
  // Čísla jako "20 z 20" = obsazeno
  const ratioMatch = val.match(/^(\d+)\s*z\s*(\d+)$/);
  if (ratioMatch && parseInt(ratioMatch[1]) >= parseInt(ratioMatch[2])) return 'obsazeno';
  // Vše ostatní (Otevřeno, volno, celoroční, K objednání, +-4, 07/20...) → otevreno
  return 'otevreno';
}

const STAV_LABELS = {
  otevreno: 'Otevřeno',
  prihlasujte: 'Přihlašujte se',
  obsazeno: 'Obsazeno',
  odjeto: 'Odjeto'
};

// Mapuje typ-akce na kategorie pro filtrování
function mapKategorie(typAkce) {
  const val = (typAkce || '').toLowerCase().trim();
  if (val.includes('camp')) return 'camp';
  if (val.includes('trial')) return 'kurz';
  if (val.includes('kurz') || val.includes('course')) return 'kurz';
  if (val === 'pro děti') return 'kurz';
  if (val === '') return 'exhibice';
  return 'kurz'; // default
}

// Extrahuje slug z WP permalink
function slugFromPermalink(permalink) {
  if (!permalink) return '';
  return permalink.replace(/\/$/, '').split('/').pop();
}

function generateSlug(text) {
  const charMap = {
    'á': 'a', 'č': 'c', 'ď': 'd', 'é': 'e', 'ě': 'e', 'í': 'i',
    'ň': 'n', 'ó': 'o', 'ř': 'r', 'š': 's', 'ť': 't', 'ú': 'u',
    'ů': 'u', 'ý': 'y', 'ž': 'z', 'Á': 'a', 'Č': 'c', 'Ď': 'd',
    'É': 'e', 'Ě': 'e', 'Í': 'i', 'Ň': 'n', 'Ó': 'o', 'Ř': 'r',
    'Š': 's', 'Ť': 't', 'Ú': 'u', 'Ů': 'u', 'Ý': 'y', 'Ž': 'z'
  };
  return text.split('').map(c => charMap[c] || c).join('')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<!--\s*wp:[^>]*-->/g, '')
    .replace(/<!--\s*\/wp:[^>]*-->/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n').trim();
}

// Zachová HTML tagy, odstraní jen WP block komentáře
function stripWpBlocks(html) {
  if (!html) return '';
  return html
    .replace(/<!--\s*wp:[^>]*-->/g, '')
    .replace(/<!--\s*\/wp:[^>]*-->/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('🚴 BIKESKILLS – Import akcí z CSV');
  console.log('===================================\n');

  if (!fs.existsSync(CSV_FILE)) {
    console.error(`❌ Soubor nenalezen: ${CSV_FILE}`);
    console.log('\nStáhni CSV příkazem:');
    console.log('  curl -L -A "Mozilla/5.0" "https://bikeskills.cz/wp-load.php?security_token=8daacbcd6383cb31&export_id=13&action=get_data" -o scripts/akce-export.csv');
    process.exit(1);
  }

  const csv = fs.readFileSync(CSV_FILE, 'utf-8');
  const rows = parseCSV(csv);
  const headers = rows[0];
  const toObj = r => Object.fromEntries(headers.map((h, i) => [h, (r[i] || '').trim()]));

  const dataRows = rows.slice(1).filter(r => r.length > 1);
  console.log(`📊 Načteno ${dataRows.length} záznamů z CSV\n`);

  // Preview
  console.log('📋 Přehled akcí:');
  const akceData = [];
  for (const row of dataRows) {
    const obj = toObj(row);

    const title = obj['Title'] || '';
    const datumText = obj['datum'] || '';
    const datumSort = toDateSort(datumText);
    const ridersNum = obj['riders-number'] || '';
    const stav = mapStav(ridersNum);
    const priceRaw = parseInt(obj['price']) || parseInt((obj['cena'] || '').replace(/[^0-9]/g, '')) || null;
    const typAkce = obj['typ-akce'] || '';
    const rawSlug = slugFromPermalink(obj['Permalink']);
    // Slug z WP permalinku je platný jen pokud neobsahuje ? nebo & (tj. není draft URL)
    const slug = (rawSlug && !rawSlug.includes('?') && !rawSlug.includes('&'))
      ? rawSlug
      : generateSlug(title);
    const imageUrl = obj['Image Featured'] || obj['Image URL'] || '';
    const uroven = obj['akce-level'] || '';
    const popis = stripWpBlocks(obj['Content'] || obj['Excerpt'] || '');
    const wpLink = obj['Permalink'] || '';
    const videoUrl = obj['akce-video'] || '';
    const dobaTrvani = obj['doba-trvani'] || '';
    const galerie = [
      obj['akce-more-img'] || '',
      obj['akce-more-img-2'] || '',
      obj['akce-more-img-3'] || '',
      obj['akce-more-img-4'] || ''
    ].filter(Boolean);

    const docData = {
      nazev: title,
      datumText: datumText,
      datumSort: datumSort,
      kategorie: mapKategorie(typAkce),
      typAkce: typAkce,
      uroven: uroven,
      cena: priceRaw,
      mena: 'CZK',
      stav: stav,
      stavLabel: STAV_LABELS[stav] || stav,
      ridersNumberWp: ridersNum,
      popis: popis,
      slug: slug,
      imageUrl: imageUrl,
      videoUrl: videoUrl,
      dobaTrvani: dobaTrvani,
      galerie: galerie,
      aktivni: true,
      wpLink: wpLink,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    akceData.push(docData);
    console.log(`  [${stav}] ${datumText || '?'} – ${title} (${slug})`);
  }

  console.log(`\n⏳ Importuji do Firestore za 3 sekundy... (Ctrl+C pro zrušení)`);
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Smaž existující záznamy v kolekci akce (čistý re-import)
  console.log('\n🗑️  Mažu existující záznamy v kolekci akce...');
  const existing = await db.collection('akce').get();
  const deletePromises = existing.docs.map(doc => doc.ref.delete());
  await Promise.all(deletePromises);
  console.log(`   Smazáno ${existing.docs.length} stávajících záznamů`);

  // Import
  console.log('\n📥 Importuji akce...');
  let ok = 0, fail = 0;
  for (const docData of akceData) {
    try {
      await db.collection('akce').add(docData);
      console.log(`   ✅ ${docData.nazev}`);
      ok++;
    } catch (error) {
      console.error(`   ❌ ${docData.nazev}: ${error.message}`);
      fail++;
    }
  }

  console.log(`\n✅ Import hotov: ${ok} ok, ${fail} chyb`);

  // Přidej redirecty pro WP akce URLs
  const redirects = akceData
    .filter(a => a.wpLink)
    .map(a => {
      try {
        const oldPath = new URL(a.wpLink).pathname;
        const newPath = `/akce/${a.slug}/`;
        return oldPath !== newPath ? { source: oldPath, destination: newPath, type: 301 } : null;
      } catch { return null; }
    })
    .filter(Boolean);

  if (redirects.length > 0) {
    const redirectsPath = path.join(__dirname, 'akce-redirects.json');
    fs.writeFileSync(redirectsPath, JSON.stringify(redirects, null, 2));
    console.log(`\n📄 Redirecty uloženy: ${redirectsPath}`);
    console.log('   Přidej obsah do firebase.json → hosting → redirects');
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
