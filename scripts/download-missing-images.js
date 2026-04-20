/**
 * BIKESKILLS – Stáhne chybějící obrázky z bikeskills.cz a nahraje do Storage
 *
 * Čte missing-images.json, pro každý chybějící soubor zkusí:
 *  1. stáhnout .webp z WP (pokud tam je)
 *  2. stáhnout .jpg/.jpeg/.png a konvertovat na webp přes Python Pillow
 *  3. nahrát výsledný .webp do Firebase Storage
 */

const path    = require('path');
const fs      = require('fs');
const https   = require('https');
const http    = require('http');
const { execSync, spawnSync } = require('child_process');
const admin   = require('firebase-admin');

const BUCKET_NAME = 'bikeskills-web.firebasestorage.app';
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))), storageBucket: BUCKET_NAME });
const bucket = admin.storage().bucket();

const MISSING_FILE = path.join(__dirname, 'missing-images.json');
const PUBLIC_DIR   = path.join(__dirname, '../public');
const CONCURRENCY  = 5;

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return download(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const f = fs.createWriteStream(destPath);
      res.pipe(f);
      f.on('finish', () => f.close(resolve));
      f.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function convertToWebp(srcPath, dstPath) {
  const result = spawnSync('python3', ['-c', `
from PIL import Image
import sys
img = Image.open('${srcPath.replace(/'/g,"\\'")}')
img.save('${dstPath.replace(/'/g,"\\'")}', 'WEBP', quality=82, method=4)
`]);
  if (result.status !== 0) throw new Error(result.stderr.toString());
}

async function processOne(item) {
  const { localPath, storageUrl } = item;
  const localFull = path.join(PUBLIC_DIR, localPath);
  fs.mkdirSync(path.dirname(localFull), { recursive: true });

  const exts = ['.webp', '.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG'];
  const basePath = localPath.replace(/\.webp$/, '');

  let downloadedPath = null;
  let downloadedExt  = null;

  for (const ext of exts) {
    const wpUrl = `https://bikeskills.cz/${basePath}${ext}`;
    const tmpPath = localFull + '.tmp' + ext;
    try {
      await download(wpUrl, tmpPath);
      downloadedPath = tmpPath;
      downloadedExt  = ext;
      break;
    } catch (e) {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  }

  if (!downloadedPath) return { path: localPath, ok: false, reason: 'not found on WP' };

  // Pokud není webp, konvertuj
  if (downloadedExt !== '.webp') {
    try {
      convertToWebp(downloadedPath, localFull);
      fs.unlinkSync(downloadedPath);
    } catch (e) {
      fs.unlinkSync(downloadedPath);
      return { path: localPath, ok: false, reason: 'convert failed: ' + e.message };
    }
  } else {
    fs.renameSync(downloadedPath, localFull);
  }

  // Nahrát do Storage
  try {
    await bucket.upload(localFull, {
      destination: localPath,
      metadata: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000' },
    });
    return { path: localPath, ok: true };
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
      if (result.ok) { ok++; }
      else { fail++; failed.push(result); }
      if ((ok + fail) % 10 === 0 || (ok + fail) === total) {
        process.stdout.write(`\r  ${ok + fail}/${total} (✅${ok} ❌${fail})`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return { ok, fail, failed };
}

async function main() {
  if (!fs.existsSync(MISSING_FILE)) {
    console.error('❌ Chybí missing-images.json — spusť nejdřív find-missing-images.js');
    process.exit(1);
  }
  const items = JSON.parse(fs.readFileSync(MISSING_FILE, 'utf8'));
  console.log(`🔽 Stahuji ${items.length} chybějících obrázků z bikeskills.cz...\n`);

  const { ok, fail, failed } = await runPool(items, CONCURRENCY);
  console.log(`\n\n✅ Hotovo: ${ok} staženo, ${fail} selhalo`);
  if (failed.length) {
    console.log('\nSelhání:');
    failed.slice(0, 20).forEach(f => console.log(` ❌ ${f.path}: ${f.reason}`));
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
