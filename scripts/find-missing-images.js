/**
 * Najde všechny Storage URL v Firestore, zkontroluje existenci lokálně.
 * Výstup: seznam chybějících souborů + odpovídající bikeskills.cz URL pro stažení.
 */
const path  = require('path');
const fs    = require('fs');
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();

const STORAGE_BASE = 'https://firebasestorage.googleapis.com/v0/b/bikeskills-web.firebasestorage.app/o/';
const UPLOADS_DIR  = path.join(__dirname, '../public/wp-content/uploads');

function extractStorageUrls(val) {
  if (!val || typeof val !== 'string') return [];
  return [...val.matchAll(new RegExp(STORAGE_BASE.replace(/\./g,'\\.')+'([^"\'\\s<>]+\\?alt=media)', 'g'))]
    .map(m => STORAGE_BASE + m[1]);
}

function storageUrlToLocalPath(url) {
  const encoded = url.replace(STORAGE_BASE, '').replace(/\?alt=media$/, '');
  return decodeURIComponent(encoded.replace(/%2F/g, '/'));
}

function localPathToBikeskillsUrl(localPath) {
  // localPath: wp-content/uploads/2022/03/photo.webp
  // WP original might be .jpg/.jpeg/.png
  return 'https://bikeskills.cz/' + localPath;
}

async function main() {
  const missing = new Map(); // localPath → {storageUrl, bikeskillsUrl}
  let total = 0;

  async function scanField(val) {
    if (!val) return;
    if (typeof val === 'string') {
      for (const url of extractStorageUrls(val)) {
        total++;
        const localPath = storageUrlToLocalPath(url);
        const fullPath = path.join(__dirname, '../public', localPath);
        if (!fs.existsSync(fullPath) && !missing.has(localPath)) {
          missing.set(localPath, {
            storageUrl: url,
            bikeskillsUrl: localPathToBikeskillsUrl(localPath)
          });
        }
      }
    } else if (Array.isArray(val)) {
      for (const v of val) await scanField(v);
    }
  }

  for (const [col, fields] of [
    ['clanky', ['obsah', 'imageUrl', 'galerie']],
    ['akce',   ['popis',  'imageUrl', 'galerie']],
    ['team',   ['imageUrl', 'galerie']],
  ]) {
    const snap = await db.collection(col).get();
    for (const doc of snap.docs) {
      const d = doc.data();
      for (const f of fields) await scanField(d[f]);
    }
  }

  console.log(`Celkem URL: ${total}, Chybějící: ${missing.size}`);
  console.log('\nChybějící soubory:');
  for (const [localPath, {bikeskillsUrl}] of missing) {
    console.log(localPath);
    console.log('  WP:', bikeskillsUrl);
  }

  // Ulož seznam pro stažení
  const list = [...missing.entries()].map(([p, v]) => ({localPath: p, ...v}));
  fs.writeFileSync(path.join(__dirname, 'missing-images.json'), JSON.stringify(list, null, 2));
  console.log('\nUloženo do scripts/missing-images.json');
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
