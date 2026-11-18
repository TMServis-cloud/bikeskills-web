/**
 * Doplní prázdné metaTitle_en / metaDescription_en u článků a akcí z EN titulku a perexu/popisu
 * (stejně jako admin při překladu – public/js/admin-en.js). Nic nepřepisuje. Bez --write jen náhled.
 *   NODE_PATH=functions/node_modules node scripts/i18n/backfill-en-seo.js [--write]
 */
const path = require('path');
const WRITE = process.argv.includes('--write');
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, '../serviceAccountKey.json'))) });
const db = admin.firestore();
const plain = s => String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
function clip(s, max) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1).replace(/[\s,;:.\-–]+\S*$/, '');
  return (cut || s.slice(0, max - 1)).replace(/[\s,;:.\-–]+$/, '') + '…';
}
(async () => {
  for (const [col, key, desc] of [['clanky', 'titulek_en', d => d.perex_en || d.obsah_en], ['akce', 'nazev_en', d => d.popis_en]]) {
    const snap = await db.collection(col).get();
    let batch = db.batch(), n = 0, cnt = 0;
    for (const doc of snap.docs) {
      const d = doc.data(); if (!d[key]) continue;
      const upd = {};
      if (!d.metaTitle_en) upd.metaTitle_en = clip(d[key], 60);
      if (!d.metaDescription_en) upd.metaDescription_en = clip(plain(desc(d)), 160);
      if (!Object.keys(upd).length) continue;
      cnt++;
      if (WRITE) { batch.update(doc.ref, upd); if (++n === 400) { await batch.commit(); batch = db.batch(); n = 0; } }
      else if (cnt <= 2) console.log(col, d.slug, upd);
    }
    if (WRITE && n) await batch.commit();
    console.log(`${col}: ${cnt} ${WRITE ? 'doplněno' : 'k doplnění'}`);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
