// Stáhne clanky/akce/team z Firestore (nebo vezme snapshot) a vypíše nepřeložené úseky do translations/todo-cms.json
// Run: node scripts/i18n/dump-cms.js [--fetch]
const fs = require('fs'), path = require('path'); const S = require('./segments');
const T = path.join(__dirname, '../../translations'); const SNAP = path.join(T, 'firestore-snapshot');
const FIELDS = require('./cms-fields');
async function fetchAll() {
  const admin = require(path.join(__dirname, '../../functions/node_modules/firebase-admin'));
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, '../serviceAccountKey.json'))) });
  const db = admin.firestore();
  fs.mkdirSync(SNAP, { recursive: true });
  for (const c of Object.keys(FIELDS)) {
    const s = await db.collection(c).get();
    fs.writeFileSync(path.join(SNAP, c + '.json'), JSON.stringify(s.docs.map(d => ({ _id: d.id, ...d.data() }))));
    console.log('  ⬇️ ', c, s.size);
  }
}
(async () => {
  if (process.argv.includes('--fetch')) await fetchAll();
  const dictPath = path.join(T, 'cms-en.json'); const dict = fs.existsSync(dictPath) ? JSON.parse(fs.readFileSync(dictPath)) : {};
  const todo = new Map(); const add = (t, src) => { if (!t || typeof t !== 'string' || !S.hasLetters(t)) return; if (S.isUrlLike(t)) return; const k = S.mask(S.norm(t)).text; if (!(k in dict) && !todo.has(k)) todo.set(k, src); };
  for (const [c, f] of Object.entries(FIELDS)) {
    const docs = JSON.parse(fs.readFileSync(path.join(SNAP, c + '.json')));
    for (const d of docs) {
      if (!f.include(d)) continue;
      for (const k of f.plain) { if (k === 'perex' && S.perexFromContent(d)) continue; add(d[k], c + ':' + d.slug); }
      for (const k of f.html) S.transform(d[k] || '', r => { add(r, c + ':' + d.slug); return null; }, a => { add(a, c + ':' + d.slug); return null; });
    }
  }
  const arr = [...todo.keys()]; fs.writeFileSync(path.join(T, 'todo-cms.json'), JSON.stringify(arr, null, 1));
  console.log('todo-cms', arr.length, arr.reduce((s, x) => s + x.length, 0), 'znaků');
})();
