/**
 * BIKESKILLS – Druhý průchod opravy Firestore HTML
 *
 * Navazuje na repair-firestore-html.js. Řeší "partial" stav:
 * hodnota začíná Storage URL (bez HTML tagu), protože greedy regex
 * zachytil obsah od prvního výskytu URL a vše před ním (figure/a otevírací tagy) se ztratilo.
 *
 * Pattern:
 *   [StorageURL]?alt=media"><img src="[StorageURL]" .../>...</figure>
 *
 * Oprava: dopíše chybějící <figure class="wp-block-image"><a href="[URL]">
 *
 * Usage: node scripts/repair-firestore-html-v2.js
 */

const path  = require('path');
const admin = require('firebase-admin');

const BUCKET = 'bikeskills-web.firebasestorage.app';
const STORAGE_BASE = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/`;

const SA = path.join(__dirname, 'serviceAccountKey.json');
try { admin.initializeApp({ credential: admin.credential.cert(require(SA)) }); }
catch (e) { console.error('❌ Firebase init:', e.message); process.exit(1); }

const db = admin.firestore();

/**
 * Detekuje "partial" stav: začíná Storage URL, za ní je HTML (ne prázdno/newline)
 * Typický pattern: [url]?alt=media"><img  nebo [url]?alt=media" alt=
 */
function isPartial(val) {
  if (!val || typeof val !== 'string') return false;
  if (!val.startsWith(STORAGE_BASE)) return false;
  // Path musí být čistá (bez HTML entit) — to jsou správné storage URL
  // Ale za ?alt=media musí být HTML pozůstatky
  return /\?alt=media[">]/.test(val);
}

/**
 * Opraví partial hodnotu: dopíše chybějící <figure><a href="[URL]"> před obsah
 */
function fixPartial(val) {
  // Extrahuj první Storage URL (do ?alt=media)
  const m = val.match(/^(https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^?]+\?alt=media)/);
  if (!m) return null;
  const firstUrl = m[1];
  // Zbytek za URL (začíná " nebo > nebo mezera)
  const rest = val.slice(firstUrl.length);
  // rest typicky: "><img src="..." ... /></a><figcaption>...</figcaption></figure>
  // Přidej chybějící <figure><a href="URL"> před celý obsah
  return `<figure class="wp-block-image"><a href="${firstUrl}">${rest}`;
}

async function repairCollection(colName, htmlFields) {
  const snap = await db.collection(colName).get();
  let repaired = 0, skipped = 0, failed = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const patch = {};

    for (const field of htmlFields) {
      const val = data[field];
      if (!val || typeof val !== 'string') continue;

      if (isPartial(val)) {
        const fixed = fixPartial(val);
        if (fixed) {
          patch[field] = fixed;
          console.log(`  🔧 ${colName}/${doc.id} [${field}]`);
        } else {
          console.log(`  ⚠️  ${colName}/${doc.id} [${field}]: nelze opravit`);
          failed++;
        }
      }
    }

    if (Object.keys(patch).length) {
      await doc.ref.update(patch);
      repaired++;
    } else {
      skipped++;
    }
  }

  console.log(`  → ${colName}: ${repaired} opraveno, ${skipped} beze změny, ${failed} selhalo\n`);
}

async function main() {
  console.log('🔧 Druhý průchod opravy partial HTML polí...\n');
  await repairCollection('akce',   ['popis']);
  await repairCollection('clanky', ['obsah']);
  console.log('✅ Hotovo');
  process.exit(0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
