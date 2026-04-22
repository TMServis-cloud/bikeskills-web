/**
 * Nahraje placeholder.webp na Firebase Storage pod:
 *  - images/placeholder.webp (kanonická cesta)
 *  - všechny chybějící cesty ze still-missing-failed.json
 *
 * Usage: node scripts/upload-placeholder.js [--dry-run]
 */

const path  = require('path');
const fs    = require('fs');
const admin = require('firebase-admin');

const DRY_RUN       = process.argv.includes('--dry-run');
const BUCKET_NAME   = 'bikeskills-web.firebasestorage.app';
const PLACEHOLDER   = path.join(__dirname, '../public/images/placeholder.webp');
const FAILED_FILE   = path.join(__dirname, 'still-missing-failed.json');
const CONCURRENCY   = 10;

admin.initializeApp({
  credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))),
  storageBucket: BUCKET_NAME,
});
const bucket = admin.storage().bucket();

async function upload(storagePath) {
  if (DRY_RUN) { console.log('  [dry]', storagePath); return; }
  await bucket.upload(PLACEHOLDER, {
    destination: storagePath,
    metadata: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000' },
  });
}

async function runPool(paths, concurrency) {
  let i = 0, ok = 0, err = 0;
  const total = paths.length;

  async function worker() {
    while (i < total) {
      const p = paths[i++];
      try {
        await upload(p);
        ok++;
        if (ok % 20 === 0 || ok === total)
          process.stdout.write(`\r  ${ok + err}/${total} (✅${ok} ❌${err})`);
      } catch (e) {
        err++;
        console.error(`\n  ❌ ${path.basename(p)}: ${e.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return { ok, err };
}

async function main() {
  if (!fs.existsSync(PLACEHOLDER)) {
    console.error('❌ Chybí public/images/placeholder.webp');
    process.exit(1);
  }

  const missing = fs.existsSync(FAILED_FILE)
    ? JSON.parse(fs.readFileSync(FAILED_FILE, 'utf8')).map(i => i.path)
    : [];

  const targets = ['images/placeholder.webp', ...missing];
  console.log(`☁️  Nahrávám placeholder na ${targets.length} cest (1 kanonická + ${missing.length} chybějících)...`);
  if (DRY_RUN) console.log('   [DRY RUN]');

  const { ok, err } = await runPool(targets, CONCURRENCY);
  console.log(`\n\n✅ Hotovo: ${ok} OK, ${err} chyb`);
  process.exit(err > 0 ? 1 : 0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
