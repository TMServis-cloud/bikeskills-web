const path = require('path');
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();

async function check() {
  const snap = await db.collection('team').get();
  for (const doc of snap.docs) {
    const d = doc.data();
    console.log(`--- ${doc.id} (${d.jmeno}) ---`);
    console.log('  imageUrl:', d.imageUrl ? d.imageUrl.substring(0, 120) : '(prázdné)');
    console.log('  popis[0:80]:', (d.popis || '').substring(0, 80));
    console.log('  galerie:', d.galerie ? d.galerie.length + ' položek' : '(prázdné)');
    if (d.galerie && d.galerie.length) console.log('   galerie[0]:', d.galerie[0].substring(0, 100));
    console.log('  videoUrl:', d.videoUrl || '(prázdné)');
    console.log('  videoUrl2:', d.videoUrl2 || '(prázdné)');
    console.log('  videoUrl3:', d.videoUrl3 || '(prázdné)');
  }
  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
