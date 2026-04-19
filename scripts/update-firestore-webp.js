/**
 * BIKESKILLS – Aktualizace imageUrl v Firestore na WebP
 *
 * Přepíše .jpg/.jpeg/.png → .webp v polích:
 *   - imageUrl (akce, clanky, team)
 *   - galerie[] (akce, clanky)
 *   - popis/obsah HTML obsah (inline <img src="...">)
 *
 * Usage: node scripts/update-firestore-webp.js
 */

const path = require('path');
const admin = require('firebase-admin');

const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(__dirname, 'serviceAccountKey.json');

try {
  const sa = require(SERVICE_ACCOUNT_PATH);
  admin.initializeApp({ credential: admin.credential.cert(sa) });
} catch (e) {
  console.error('❌ Firebase init:', e.message);
  process.exit(1);
}

const db = admin.firestore();

/** Nahradí .jpg/.jpeg/.png → .webp pouze v bikeskills.cz/wp-content URL */
function toWebp(val) {
  if (!val || typeof val !== 'string') return val;
  return val.replace(
    /(https?:\/\/bikeskills\.cz\/wp-content\/uploads\/[^\s"'<>]+?)\.(jpg|jpeg|png)/gi,
    '$1.webp'
  );
}

function toWebpArray(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr.map(toWebp);
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
      const fixed = Array.isArray(orig) ? toWebpArray(orig) : toWebp(orig);
      const changed = JSON.stringify(orig) !== JSON.stringify(fixed);
      if (changed) patch[field] = fixed;
    }

    if (Object.keys(patch).length > 0) {
      await doc.ref.update(patch);
      updated++;
      console.log(`  ✅ ${colName}/${doc.id}: ${Object.keys(patch).join(', ')}`);
    }
  }
  console.log(`  → ${colName}: ${updated}/${snap.size} dokumentů aktualizováno\n`);
  return updated;
}

async function main() {
  console.log('🔄 Aktualizuji Firestore URL na WebP...\n');

  await updateCollection('akce',   ['imageUrl', 'galerie', 'popis']);
  await updateCollection('clanky', ['imageUrl', 'galerie', 'obsah', 'perex']);
  await updateCollection('team',   ['imageUrl', 'popis']);

  console.log('✅ Hotovo');
  process.exit(0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
