const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();

const STORAGE_BASE = 'https://firebasestorage.googleapis.com/v0/b/bikeskills-web.firebasestorage.app/o/';
const UPLOADS_DIR = path.join(__dirname, '../public/wp-content/uploads');

async function check() {
  // Get all img src from one clanky
  const snap = await db.collection('clanky').limit(5).get();
  const missing = [];
  const found = [];

  for (const doc of snap.docs) {
    const obsah = doc.data().obsah || '';
    const urls = [...obsah.matchAll(/src="(https:\/\/firebasestorage[^"]+)"/g)].map(m => m[1]);
    for (const url of urls.slice(0, 5)) {
      // Decode storage path
      const pathPart = url.replace(STORAGE_BASE, '').replace(/\?alt=media$/, '');
      const localPath = decodeURIComponent(pathPart.replace(/%2F/g, '/'));
      const fullPath = path.join(__dirname, '../public', localPath);
      const exists = fs.existsSync(fullPath);
      if (exists) found.push(localPath);
      else missing.push(localPath);
    }
  }

  console.log('=== CHYBÍ v local (a tedy i v Storage) ===');
  missing.slice(0, 15).forEach(p => console.log(' MISSING:', p));
  console.log('\n=== EXISTUJÍ lokálně ===');
  found.slice(0, 5).forEach(p => console.log(' OK:', p));
  console.log(`\nCelkem: ${found.length} OK, ${missing.length} CHYBÍ`);

  // Check team imageUrl
  const tSnap = await db.collection('team').limit(3).get();
  console.log('\n=== TEAM imageUrl ===');
  for (const doc of tSnap.docs) {
    const d = doc.data();
    console.log(doc.id, ':', d.imageUrl ? d.imageUrl.substring(0, 100) : '(prázdné)');
    if (d.galerie) console.log('  galerie:', d.galerie.length, 'položek');
    if (d.videoUrl) console.log('  videoUrl:', d.videoUrl.substring(0, 80));
  }

  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
