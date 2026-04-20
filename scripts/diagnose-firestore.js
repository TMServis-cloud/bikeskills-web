const path  = require('path');
const admin = require('firebase-admin');

const BUCKET = 'bikeskills-web.firebasestorage.app';
const STORAGE_BASE = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/`;

const SA = path.join(__dirname, 'serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(SA)) });
const db = admin.firestore();

function classify(val) {
  if (!val || typeof val !== 'string') return 'empty';
  if (val.startsWith(STORAGE_BASE)) {
    const path = val.replace(STORAGE_BASE, '').replace(/\?alt=media$/, '');
    if (path.includes('%22') || path.includes('%3C') || path.includes('%20')) return 'mangled';
    // Starts with storage URL but has trailing HTML garbage
    if (val.includes('?alt=media"') || val.includes('?alt=media>') || val.includes('?alt=media<')) return 'partial';
    return 'plain-storage-url'; // might be ok for imageUrl fields
  }
  if (val.startsWith('<')) return 'html';
  return 'other';
}

async function diagnose(colName, fields) {
  const snap = await db.collection(colName).get();
  const counts = {};
  const examples = {};
  for (const doc of snap.docs) {
    const data = doc.data();
    for (const field of fields) {
      const val = data[field];
      const cls = classify(val);
      counts[field] = counts[field] || {};
      counts[field][cls] = (counts[field][cls] || 0) + 1;
      if ((cls === 'mangled' || cls === 'partial') && !examples[field + cls]) {
        examples[field + cls] = { id: doc.id, val: val.substring(0, 300) };
      }
    }
  }
  console.log(`\n=== ${colName} ===`);
  for (const [field, cls] of Object.entries(counts)) {
    console.log(`  ${field}:`, cls);
  }
  for (const [key, ex] of Object.entries(examples)) {
    console.log(`  EXAMPLE [${key}] doc=${ex.id}:`);
    console.log('  ' + ex.val);
    console.log();
  }
}

async function main() {
  await diagnose('akce',   ['popis']);
  await diagnose('clanky', ['obsah', 'perex']);
  await diagnose('team',   ['popis']);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
