/**
 * BIKESKILLS – Aktualizace Firestore URL na Firebase Storage
 *
 * Přepíše URL z:
 *   https://bikeskills.cz/wp-content/uploads/YYYY/MM/file.webp
 * na:
 *   https://firebasestorage.googleapis.com/v0/b/bikeskills-web.firebasestorage.app/o/wp-content%2Fuploads%2FYYYY%2FMM%2Ffile.webp?alt=media
 *
 * Usage: node scripts/update-firestore-to-storage.js
 */

const path  = require('path');
const admin = require('firebase-admin');

const BUCKET = 'bikeskills-web.firebasestorage.app';

const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(__dirname, 'serviceAccountKey.json');

try {
  const sa = require(SERVICE_ACCOUNT_PATH);
  admin.initializeApp({ credential: admin.credential.cert(sa) });
} catch (e) { console.error('❌ Firebase init:', e.message); process.exit(1); }

const db = admin.firestore();

function toStorageUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const m = url.match(/https?:\/\/bikeskills\.cz\/(wp-content\/uploads\/.+)/i);
  if (!m) return url;
  const encoded = m[1].split('/').map(encodeURIComponent).join('%2F');
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encoded}?alt=media`;
}

function convertValue(val) {
  if (!val) return val;
  if (typeof val === 'string') return toStorageUrl(val);
  if (Array.isArray(val)) return val.map(v => typeof v === 'string' ? toStorageUrl(v) : v);
  return val;
}

async function updateCollection(colName, fields) {
  const snap = await db.collection(colName).get();
  let updated = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const patch = {};
    for (const field of fields) {
      const orig = data[field];
      if (!orig) continue;
      const fixed = convertValue(orig);
      if (JSON.stringify(orig) !== JSON.stringify(fixed)) patch[field] = fixed;
    }
    if (Object.keys(patch).length) {
      await doc.ref.update(patch);
      updated++;
      console.log(`  ✅ ${colName}/${doc.id}`);
    }
  }
  console.log(`  → ${colName}: ${updated}/${snap.size} aktualizováno\n`);
}

async function main() {
  console.log('🔄 Aktualizuji Firestore na Firebase Storage URL...\n');
  await updateCollection('akce',   ['imageUrl', 'galerie', 'popis']);
  await updateCollection('clanky', ['imageUrl', 'galerie', 'obsah', 'perex']);
  await updateCollection('team',   ['imageUrl', 'popis']);
  console.log('✅ Hotovo');
  process.exit(0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
