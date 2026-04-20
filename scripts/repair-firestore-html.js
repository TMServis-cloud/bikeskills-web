/**
 * BIKESKILLS – Oprava popis/obsah polí poškozených update-firestore-to-storage.js
 *
 * Problém: update-firestore-to-storage.js použil greedy regex (.+) a celý HTML
 * v popis/obsah polích zpracoval jako URL, čímž vznikly mangled Storage URL.
 *
 * Oprava:
 *   1. Detekuje poškozené hodnoty (Storage URL obsahující HTML entity %22, %3C…)
 *   2. Dekóduje původní HTML z URL path
 *   3. Aplikuje správnou náhradu bikeskills.cz URL → Storage URL v HTML (non-greedy regex)
 *
 * Usage: node scripts/repair-firestore-html.js
 */

const path  = require('path');
const admin = require('firebase-admin');

const BUCKET = 'bikeskills-web.firebasestorage.app';
const STORAGE_BASE = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/`;

const SA = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'serviceAccountKey.json');
try { admin.initializeApp({ credential: admin.credential.cert(require(SA)) }); }
catch (e) { console.error('❌ Firebase init:', e.message); process.exit(1); }

const db = admin.firestore();

/** Správná náhrada bikeskills.cz URL → Storage URL v textu/HTML */
function replaceUrls(str) {
  if (!str || typeof str !== 'string') return str;
  // Non-greedy [^\s"'<>]+ — zastaví se na konci URL, nepohltí HTML
  return str.replace(
    /https?:\/\/bikeskills\.cz\/(wp-content\/uploads\/[^\s"'<>]+)/gi,
    (match, urlPath) => {
      const encoded = urlPath.split('/').map(encodeURIComponent).join('%2F');
      return `${STORAGE_BASE}${encoded}?alt=media`;
    }
  );
}

/** Detekuje zda je hodnota mangled Storage URL (Storage URL obsahující HTML entity) */
function isMangledStorageUrl(val) {
  if (!val || typeof val !== 'string') return false;
  if (!val.startsWith(STORAGE_BASE)) return false;
  // Správná Storage URL neobsahuje %22 (uvozovky) ani %3C (< ) v path části
  const pathPart = val.replace(STORAGE_BASE, '').replace(/\?alt=media$/, '');
  return pathPart.includes('%22') || pathPart.includes('%3C') || pathPart.includes('%20');
}

/** Dekóduje mangled Storage URL zpět na HTML fragment */
function decodeMangled(val) {
  try {
    // Extrahuj path část mezi /o/ a ?alt=media
    const m = val.match(/\/o\/(.+?)\?alt=media$/);
    if (!m) return null;
    // Dekóduj: split by %2F (náš join separator), decodeURIComponent každý segment, join /
    const decoded = m[1].split('%2F').map(s => { try { return decodeURIComponent(s); } catch { return s; } }).join('/');
    // decoded začíná od "wp-content/uploads/...", přidej zpět https://bikeskills.cz/
    return 'https://bikeskills.cz/' + decoded;
  } catch { return null; }
}

async function repairCollection(colName, htmlFields) {
  const snap = await db.collection(colName).get();
  let repaired = 0, skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const patch = {};

    for (const field of htmlFields) {
      const val = data[field];
      if (!val) continue;

      if (Array.isArray(val)) {
        // galerie pole — jednotlivé URL, nikoli HTML
        const fixed = val.map(v => (typeof v === 'string' && !isMangledStorageUrl(v)) ? v : v);
        continue; // galerie by měly být OK
      }

      if (typeof val !== 'string') continue;

      if (isMangledStorageUrl(val)) {
        // Poškozená hodnota — dekóduj původní HTML
        const recovered = decodeMangled(val);
        if (recovered) {
          // Aplikuj správnou náhradu URL v HTML
          patch[field] = replaceUrls(recovered);
          console.log(`  🔧 ${colName}/${doc.id} [${field}]: recovered`);
        } else {
          console.log(`  ⚠️  ${colName}/${doc.id} [${field}]: nelze dekódovat`);
        }
      } else if (typeof val === 'string' && val.includes('bikeskills.cz/wp-content/')) {
        // Nepoškozená hodnota s bikeskills URL — správně nahraď
        patch[field] = replaceUrls(val);
        console.log(`  ✅ ${colName}/${doc.id} [${field}]: fixed inline URLs`);
      }
    }

    if (Object.keys(patch).length) {
      await doc.ref.update(patch);
      repaired++;
    } else {
      skipped++;
    }
  }

  console.log(`  → ${colName}: ${repaired} opraveno, ${skipped} beze změny\n`);
}

async function main() {
  console.log('🔧 Opravuji poškozené popis/obsah pole v Firestore...\n');
  await repairCollection('akce',   ['popis']);
  await repairCollection('clanky', ['obsah', 'perex']);
  await repairCollection('team',   ['popis']);
  console.log('✅ Hotovo');
  process.exit(0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
