/**
 * JEDNORÁZOVÁ migrace: dosavadní EN překlady (translations/cms-docs-en.json) → Firestore pole *_en.
 * Zapisuje jen pole, která v dokumentu ještě nejsou (nic nepřepíše). Bez --write jen vypíše, co by udělala.
 *
 *   NODE_PATH=functions/node_modules node scripts/i18n/migrate-en-to-firestore.js          # náhled
 *   NODE_PATH=functions/node_modules node scripts/i18n/migrate-en-to-firestore.js --write  # zápis
 */
const fs = require('fs'), path = require('path');
const { EN_FIELDS } = require('../../functions/lib/en-fields');
const { enSrcHash } = require('../../functions/lib/en-src');
const WRITE = process.argv.includes('--write');

const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, '../serviceAccountKey.json'))) });
const db = admin.firestore();
const DOCS = JSON.parse(fs.readFileSync(path.join(__dirname, '../../translations/cms-docs-en.json')));

(async () => {
  let total = 0, skipped = 0;
  for (const col of Object.keys(EN_FIELDS)) {
    const snap = await db.collection(col).get();
    let batch = db.batch(), n = 0, cnt = 0;
    for (const doc of snap.docs) {
      const d = doc.data(); const en = d.slug && DOCS[col][d.slug];
      if (!en) continue;
      const upd = {};
      for (const f of EN_FIELDS[col]) {
        if (en[f] == null || en[f] === '') continue;
        if (col === 'team' && f === 'slug') continue;
        if (d[f + '_en'] != null && d[f + '_en'] !== '') continue;
        upd[f + '_en'] = en[f];
      }
      if (!Object.keys(upd).length) { skipped++; continue; }
      if (d.en_src == null) upd.en_src = enSrcHash(col, d);
      if (d.en_auto == null) upd.en_auto = true;
      cnt++;
      if (WRITE) { batch.update(doc.ref, upd); if (++n === 400) { await batch.commit(); batch = db.batch(); n = 0; } }
      else if (cnt <= 2) console.log(col, d.slug, Object.keys(upd).join(', '));
    }
    if (WRITE && n) await batch.commit();
    console.log(`${col}: ${cnt} dokumentů ${WRITE ? 'zapsáno' : 'k zápisu'}`);
    total += cnt;
  }
  console.log(`Celkem ${total}${skipped ? `, ${skipped} už mělo EN` : ''}${WRITE ? '' : ' (náhled – spusť s --write)'}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
