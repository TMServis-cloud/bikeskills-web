/**
 * Stáhne anglické verze CMS obsahu z Firestore (pole *_en, viz functions/lib/en-fields.js)
 * a vygeneruje z nich statické soubory pro build (běží v `npm run deploy:hosting` před build:en a prerenderem):
 *
 *   translations/slugs.json             – CZ slug → EN slug (odkazy v build-en.js / links.js)
 *   translations/cms-docs-en.json       – kompletní EN data { kolekce: { csSlug: {...} } } (prerender.js)
 *   public/en/data/<kolekce>.json       – záložní index pro cms-loader.js (primárně čte Firestore)
 *   public/en/data/<kolekce>/<cs>.json  – záložní plný obsah/popis
 *
 * Překlady se zakládají a upravují v administraci (/admin, sekce „English"). Nic nezapisuje do Firestore.
 *
 *   npm run i18n:pull
 */
const fs = require('fs'), path = require('path');
const { EN_FIELDS, enOf } = require('../../functions/lib/en-fields');

const SA = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, '../serviceAccountKey.json');
if (!fs.existsSync(SA)) { console.log('⚠️  serviceAccountKey.json nenalezen — EN data se nestáhla, zůstávají poslední vygenerovaná'); process.exit(0); }
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require(SA)) });
const db = admin.firestore();

const T = path.join(__dirname, '../../translations');
const PUB = path.join(__dirname, '../../public/en/data');
const INCLUDE = {
  clanky: d => d.publikovano !== false && !!d.slug,
  akce: d => d.aktivni !== false && !!d.slug,
  team: d => d.aktivni !== false && !!d.slug,
};
const plainOf = h => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

(async () => {
  const out = { clanky: {}, akce: {}, team: {} };
  let missing = 0;
  for (const c of Object.keys(EN_FIELDS)) {
    const snap = await db.collection(c).get();
    for (const doc of snap.docs) {
      const d = doc.data();
      if (!INCLUDE[c](d)) continue;
      const e = enOf(c, d);
      if (e) out[c][d.slug] = e; else missing++;
    }
  }
  const slugs = { blog: {}, akce: {} };
  for (const [cs, e] of Object.entries(out.clanky)) slugs.blog[cs] = e.slug;
  for (const [cs, e] of Object.entries(out.akce)) slugs.akce[cs] = e.slug;
  fs.writeFileSync(path.join(T, 'slugs.json'), JSON.stringify(slugs, null, 1));
  fs.writeFileSync(path.join(T, 'cms-docs-en.json'), JSON.stringify(out, null, 1));

  fs.mkdirSync(path.join(PUB, 'clanky'), { recursive: true }); fs.mkdirSync(path.join(PUB, 'akce'), { recursive: true });
  const idx = { clanky: {}, akce: {}, team: {} };
  for (const [cs, e] of Object.entries(out.clanky)) {
    const { obsah, ...rest } = e; idx.clanky[cs] = rest;
    fs.writeFileSync(path.join(PUB, 'clanky', cs + '.json'), JSON.stringify({ obsah }));
  }
  for (const [cs, e] of Object.entries(out.akce)) {
    const { popis, ...rest } = e; const plain = plainOf(popis);
    idx.akce[cs] = Object.assign(rest, { popis: plain.length > 300 ? plain.slice(0, 300) + '…' : plain });
    fs.writeFileSync(path.join(PUB, 'akce', cs + '.json'), JSON.stringify({ popis }));
  }
  idx.team = out.team;
  for (const c of Object.keys(idx)) fs.writeFileSync(path.join(PUB, c + '.json'), JSON.stringify(idx[c]));
  console.log(`✅ EN z Firestore: clanky ${Object.keys(out.clanky).length}, akce ${Object.keys(out.akce).length}, team ${Object.keys(out.team).length}` + (missing ? ` · ${missing} položek zatím bez EN verze` : ''));
  process.exit(0);
})().catch(e => { console.error('❌', e); process.exit(1); });
