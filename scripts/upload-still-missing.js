/**
 * BIKESKILLS – Nahrání still-missing.json do Firebase Storage
 *
 * Pro každou položku:
 *  - pokud soubor existuje lokálně → nahraje přímo do Storage
 *  - pokud neexistuje lokálně → stáhne z bikeskills.cz (zkouší .webp/.jpg/.jpeg/.png),
 *    případně konvertuje na webp přes Python Pillow, pak nahraje
 *
 * Usage: node scripts/upload-still-missing.js [--dry-run]
 */

const path    = require('path');
const fs      = require('fs');
const https   = require('https');
const http    = require('http');
const { spawnSync } = require('child_process');
const admin   = require('firebase-admin');

const DRY_RUN     = process.argv.includes('--dry-run');
const BUCKET_NAME = 'bikeskills-web.firebasestorage.app';
const PUBLIC_DIR  = path.join(__dirname, '../public');
const CONCURRENCY = 8;

const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(__dirname, 'serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH)),
  storageBucket: BUCKET_NAME,
});
const bucket = admin.storage().bucket();

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return download(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const f = fs.createWriteStream(destPath);
      res.pipe(f);
      f.on('finish', () => f.close(resolve));
      f.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function convertToWebp(srcPath, dstPath) {
  const result = spawnSync('python3', ['-c', `
from PIL import Image
img = Image.open(${JSON.stringify(srcPath)})
img.save(${JSON.stringify(dstPath)}, 'WEBP', quality=82, method=4)
`]);
  if (result.status !== 0) throw new Error(result.stderr.toString().trim());
}

async function uploadToStorage(localFull, storagePath) {
  const ext = path.extname(storagePath).toLowerCase();
  const mimeMap = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
  const contentType = mimeMap[ext] || 'image/webp';
  await bucket.upload(localFull, {
    destination: storagePath,
    metadata: { contentType, cacheControl: 'public, max-age=31536000' },
  });
}

async function processOne(item) {
  const { localPath } = item;
  const localFull = path.join(PUBLIC_DIR, localPath);

  if (DRY_RUN) {
    const exists = fs.existsSync(localFull);
    return { path: localPath, ok: true, action: exists ? 'upload(local)' : 'download+upload' };
  }

  // Soubor existuje lokálně → rovnou nahrát
  if (fs.existsSync(localFull)) {
    try {
      await uploadToStorage(localFull, localPath);
      return { path: localPath, ok: true, action: 'uploaded(local)' };
    } catch (e) {
      return { path: localPath, ok: false, reason: 'upload failed: ' + e.message };
    }
  }

  // Soubor neexistuje lokálně → stáhnout z bikeskills.cz
  fs.mkdirSync(path.dirname(localFull), { recursive: true });

  const basePath = localPath.replace(/\.webp$/, '');
  const exts = ['.webp', '.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG'];

  let downloadedPath = null;
  let downloadedExt  = null;

  for (const ext of exts) {
    const wpUrl  = `https://bikeskills.cz/${basePath}${ext}`;
    const tmpPath = localFull + '.tmp' + ext;
    try {
      await download(wpUrl, tmpPath);
      downloadedPath = tmpPath;
      downloadedExt  = ext;
      break;
    } catch (_) {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  }

  if (!downloadedPath) {
    return { path: localPath, ok: false, reason: 'not found on bikeskills.cz' };
  }

  // Konvertuj na webp pokud třeba
  if (downloadedExt.toLowerCase() !== '.webp') {
    try {
      convertToWebp(downloadedPath, localFull);
      fs.unlinkSync(downloadedPath);
    } catch (e) {
      if (fs.existsSync(downloadedPath)) fs.unlinkSync(downloadedPath);
      return { path: localPath, ok: false, reason: 'convert failed: ' + e.message };
    }
  } else {
    fs.renameSync(downloadedPath, localFull);
  }

  // Nahrát do Storage
  try {
    await uploadToStorage(localFull, localPath);
    return { path: localPath, ok: true, action: 'downloaded+uploaded' };
  } catch (e) {
    return { path: localPath, ok: false, reason: 'upload failed: ' + e.message };
  }
}

async function runPool(items, concurrency) {
  let i = 0, ok = 0, fail = 0;
  const failed = [];
  const total = items.length;

  async function worker() {
    while (i < total) {
      const item = items[i++];
      const result = await processOne(item);
      if (result.ok) {
        ok++;
      } else {
        fail++;
        failed.push(result);
      }
      if ((ok + fail) % 20 === 0 || (ok + fail) === total) {
        process.stdout.write(`\r  ${ok + fail}/${total} (✅${ok} ❌${fail})`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return { ok, fail, failed };
}

async function main() {
  const listPath = path.join(__dirname, 'still-missing.json');
  if (!fs.existsSync(listPath)) {
    console.error('❌ Chybí still-missing.json');
    process.exit(1);
  }

  const items = JSON.parse(fs.readFileSync(listPath, 'utf8'));
  const localExists = items.filter(i => fs.existsSync(path.join(PUBLIC_DIR, i.localPath))).length;
  const needDownload = items.length - localExists;

  console.log(`☁️  upload-still-missing.js`);
  if (DRY_RUN) console.log('   [DRY RUN]');
  console.log(`   Celkem: ${items.length} | lokálně: ${localExists} | ke stažení: ${needDownload}\n`);

  const { ok, fail, failed } = await runPool(items, CONCURRENCY);
  console.log(`\n\n✅ Hotovo: ${ok} OK, ${fail} selhalo`);

  if (failed.length) {
    const failPath = path.join(__dirname, 'still-missing-failed.json');
    fs.writeFileSync(failPath, JSON.stringify(failed, null, 2));
    console.log(`\nSelhání (${fail}) uložena do still-missing-failed.json`);
    failed.slice(0, 20).forEach(f => console.log(`  ❌ ${path.basename(f.path)}: ${f.reason}`));
  }

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
