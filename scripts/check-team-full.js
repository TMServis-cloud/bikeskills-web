const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();

const STORAGE_BASE = 'https://firebasestorage.googleapis.com/v0/b/bikeskills-web.firebasestorage.app/o/';

async function check() {
  const snap = await db.collection('team').get();
  for (const doc of snap.docs) {
    const d = doc.data();
    const url = d.imageUrl || '';
    console.log(`${d.jmeno}:`);
    console.log('  imageUrl:', url);
    if (url.startsWith(STORAGE_BASE)) {
      const encodedPath = url.replace(STORAGE_BASE, '').replace(/\?alt=media$/, '');
      const localPath = decodeURIComponent(encodedPath.replace(/%2F/g, '/'));
      const fullPath = path.join(__dirname, '../public', localPath);
      const exists = fs.existsSync(fullPath);
      console.log('  local path:', localPath);
      console.log('  exists locally:', exists);
    }
  }
  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
