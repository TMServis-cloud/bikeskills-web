/**
 * BIKESKILLS – Nahrání wp-content/uploads do Firebase Storage
 *
 * Nahraje všechny WebP soubory z public/wp-content/uploads/ do Firebase Storage
 * pod cestou wp-content/uploads/... (zachová původní strukturu).
 *
 * Po dokončení spusť: node scripts/update-firestore-to-storage.js
 *
 * Usage: node scripts/upload-wp-content-to-storage.js [--dry-run]
 */

const fs   = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const DRY_RUN      = process.argv.includes('--dry-run');
const UPLOADS_DIR  = path.join(__dirname, '../public/wp-content/uploads');
const BUCKET_NAME  = 'bikeskills-web.firebasestorage.app';
const CONCURRENCY  = 10;

const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(__dirname, 'serviceAccountKey.json');

try {
  const sa = require(SERVICE_ACCOUNT_PATH);
  admin.initializeApp({ credential: admin.credential.cert(sa), storageBucket: BUCKET_NAME });
} catch (e) {
  console.error('❌ Firebase init:', e.message);
  process.exit(1);
}

const bucket = admin.storage().bucket();

function walkDir(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(full));
    else results.push(full);
  }
  return results;
}

const MIME = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
               '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' };

async function uploadFile(localPath) {
  const rel       = path.relative(path.join(__dirname, '../public'), localPath);
  const storagePath = rel.replace(/\\/g, '/');           // wp-content/uploads/YYYY/MM/file.webp
  const ext       = path.extname(localPath).toLowerCase();
  const mimeType  = MIME[ext] || 'application/octet-stream';

  if (DRY_RUN) { console.log('  [dry] ' + storagePath); return; }

  await bucket.upload(localPath, {
    destination: storagePath,
    metadata: {
      contentType: mimeType,
      cacheControl: 'public, max-age=31536000',
    },
  });
}

async function runPool(tasks, concurrency) {
  let i = 0, ok = 0, err = 0;
  const total = tasks.length;

  async function worker() {
    while (i < total) {
      const task = tasks[i++];
      try {
        await uploadFile(task);
        ok++;
        if (ok % 200 === 0 || ok === total) process.stdout.write(`\r  ${ok}/${total} nahráno`);
      } catch (e) {
        err++;
        console.error(`\n  ❌ ${path.basename(task)}: ${e.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return { ok, err };
}

async function main() {
  console.log('☁️  Nahrávám wp-content/uploads do Firebase Storage...');
  if (DRY_RUN) console.log('   [DRY RUN — žádné soubory se nenahrají]');

  const files = walkDir(UPLOADS_DIR);
  console.log(`   Souborů: ${files.length}\n`);

  const { ok, err } = await runPool(files, CONCURRENCY);
  console.log(`\n\n✅ Hotovo: ${ok} OK, ${err} chyb`);
  if (!DRY_RUN) console.log('\nDalší krok: node scripts/update-firestore-to-storage.js');
  process.exit(err > 0 ? 1 : 0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
