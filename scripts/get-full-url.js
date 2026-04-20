const path = require('path');
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();

async function check() {
  const snap = await db.collection('clanky').limit(1).get();
  const obsah = snap.docs[0].data().obsah || '';
  const imgs = [...obsah.matchAll(/src="([^"]+)"/g)].map(m => m[1]);
  console.log('Plné URL:');
  imgs.slice(0, 5).forEach(u => console.log(u));
  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
