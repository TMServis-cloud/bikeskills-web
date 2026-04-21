/**
 * Stáhne chybějící obrázky z Firebase Storage do public/wp-content/uploads/
 * aby byly dostupné přes Firebase Hosting.
 *
 * Spuštění: node scripts/download-from-storage.js
 */

const path  = require('path');
const fs    = require('fs');
const admin = require('firebase-admin');

const BUCKET_NAME  = 'bikeskills-web.firebasestorage.app';
admin.initializeApp({
  credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))),
  storageBucket: BUCKET_NAME
});
const bucket = admin.storage().bucket();

const MISSING_FILE = path.join(__dirname, 'missing-images.json');
const PUBLIC_DIR   = path.join(__dirname, '../public');
const CONCURRENCY  = 10;

async function processOne(item) {
  const { localPath } = item;
  const localFull = path.join(PUBLIC_DIR, localPath);

  // Přeskoč pokud soubor už existuje lokálně
  if (fs.existsSync(localFull)) return { path: localPath, ok: true, skipped: true };

  const file = bucket.file(localPath);
  try {
    const [exists] = await file.exists();
    if (!exists) return { path: localPath, ok: false, reason: 'not in Storage' };

    fs.mkdirSync(path.dirname(localFull), { recursive: true });
    await file.download({ destination: localFull });
    return { path: localPath, ok: true };
  } catch (e) {
    return { path: localPath, ok: false, reason: e.message };
  }
}

async function runPool(items, concurrency) {
  let i = 0, ok = 0, skipped = 0, fail = 0;
  const failed = [];
  const total = items.length;

  async function worker() {
    while (i < total) {
      const item = items[i++];
      const result = await processOne(item);
      if (result.ok && result.skipped) { skipped++; }
      else if (result.ok) { ok++; }
      else { fail++; failed.push(result); }
      const done = ok + skipped + fail;
      if (done % 20 === 0 || done === total) {
        process.stdout.write(`\r  ${done}/${total} (✅${ok} ⏭️${skipped} ❌${fail})`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return { ok, skipped, fail, failed };
}

async function main() {
  if (!fs.existsSync(MISSING_FILE)) {
    console.error('❌ Chybí missing-images.json — spusť nejdřív find-missing-images.js');
    process.exit(1);
  }

  const items = JSON.parse(fs.readFileSync(MISSING_FILE, 'utf8'));
  console.log(`🔽 Kontroluji ${items.length} chybějících souborů ve Firebase Storage...\n`);

  const { ok, skipped, fail, failed } = await runPool(items, CONCURRENCY);
  console.log(`\n\n✅ Staženo ze Storage: ${ok}, Přeskočeno: ${skipped}, Nenalezeno: ${fail}`);

  if (ok > 0) {
    console.log('\n🚀 Nyní spusť: firebase deploy --only hosting');
  }

  if (failed.length) {
    const stillMissing = items.filter(item => failed.some(f => f.path === item.localPath));
    fs.writeFileSync(path.join(__dirname, 'still-missing.json'), JSON.stringify(stillMissing, null, 2));
    console.log(`\n📄 ${failed.length} souborů není ani ve Storage → uloženo do still-missing.json`);
    console.log('   Tyto soubory je potřeba nahrát ručně z WP hostingu (FTP/cPanel).');
    if (failed.length <= 20) {
      failed.forEach(f => console.log(` ❌ ${f.path}`));
    }
  }

  process.exit(0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
