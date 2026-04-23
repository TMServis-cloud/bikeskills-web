/**
 * Smaže galerii (galerie, galerie1-4) z konkrétní akce dle slugu.
 * Usage:  node scripts/clear-akce-gallery.js <slug>
 * Příklad: node scripts/clear-akce-gallery.js chlapi-ladi-bikeskills-2-3
 */
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const slug = process.argv[2];
if (!slug) { console.error('Použití: node clear-akce-gallery.js <slug>'); process.exit(1); }

(async () => {
  const snap = await db.collection('akce').where('slug', '==', slug).limit(1).get();
  if (snap.empty) { console.error('Akce nenalezena:', slug); process.exit(1); }
  const doc = snap.docs[0];
  console.log('Akce nalezena:', doc.id, doc.data().nazev);
  await doc.ref.update({
    galerie: admin.firestore.FieldValue.delete(),
    galerie1: admin.firestore.FieldValue.delete(),
    galerie2: admin.firestore.FieldValue.delete(),
    galerie3: admin.firestore.FieldValue.delete(),
    galerie4: admin.firestore.FieldValue.delete(),
  });
  console.log('Galerie vymazána.');
  process.exit(0);
})();
