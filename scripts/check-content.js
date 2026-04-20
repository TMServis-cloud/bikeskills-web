const path = require('path');
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();

async function check() {
  const snap = await db.collection('clanky').limit(2).get();
  for (const doc of snap.docs) {
    const obsah = doc.data().obsah || '';
    const imgs = obsah.match(/src="([^"]+)"/g) || [];
    console.log('clanky/' + doc.id + ':');
    imgs.slice(0,3).forEach(m => console.log(' ', m.substring(0,130)));
  }
  const snap2 = await db.collection('akce').limit(2).get();
  for (const doc of snap2.docs) {
    const popis = doc.data().popis || '';
    const imgs = popis.match(/src="([^"]+)"/g) || [];
    console.log('akce/' + doc.id + ':');
    imgs.slice(0,3).forEach(m => console.log(' ', m.substring(0,130)));
  }
  const snap3 = await db.collection('team').limit(3).get();
  for (const doc of snap3.docs) {
    const popis = doc.data().popis || '';
    console.log('team/' + doc.id + ' popis[0:120]:', popis.substring(0,120));
  }
  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
