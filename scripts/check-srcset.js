const path = require('path');
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();

async function check() {
  const snap = await db.collection('clanky').limit(2).get();
  for (const doc of snap.docs) {
    const obsah = doc.data().obsah || '';
    const srcsets = [...obsah.matchAll(/srcset="([^"]+)"/g)].map(m => m[1]);
    if (srcsets.length) {
      console.log('clanky/' + doc.id + ' srcset[0]:');
      console.log(srcsets[0].substring(0, 300));
    }
    const widths = [...obsah.matchAll(/width="(\d+)"/g)].slice(0,2).map(m => m[1]);
    const heights = [...obsah.matchAll(/height="(\d+)"/g)].slice(0,2).map(m => m[1]);
    if (widths.length) console.log('  width/height attrs present:', widths, heights);
  }
  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
