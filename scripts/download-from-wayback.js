/**
 * Stáhne chybějící obrázky z Wayback Machine (web.archive.org)
 * a uloží je lokálně do public/wp-content/uploads/
 *
 * Spuštění: node scripts/download-from-wayback.js
 */

const path    = require('path');
const fs      = require('fs');
const https   = require('https');
const http    = require('http');
const { spawnSync } = require('child_process');

const MISSING_FILE = path.join(__dirname, 'missing-images.json');
const PUBLIC_DIR   = path.join(__dirname, '../public');
const CONCURRENCY  = 3;
const CDX_API      = 'http://web.archive.org/cdx/search/cdx';

function get(url, options = {}) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, ...options }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return get(res.headers.location, options).then(resolve).catch(reject);
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

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
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function convertToWebp(srcPath, dstPath) {
  const result = spawnSync('python3', ['-c', `
from PIL import Image
import sys
img = Image.open(${JSON.stringify(srcPath)})
img.save(${JSON.stringify(dstPath)}, 'WEBP', quality=82, method=4)
`]);
  if (result.status !== 0) throw new Error(result.stderr.toString());
}

// Najde nejnovější archivovanou verzi URL na Wayback Machine
async function findWaybackUrl(originalUrl) {
  const cdxUrl = `${CDX_API}?url=${encodeURIComponent(originalUrl)}&output=json&limit=1&fl=timestamp,original,statuscode&filter=statuscode:200&from=20240101&to=20260101`;
  try {
    const res = await get(cdxUrl);
    if (res.status !== 200) return null;
    const rows = JSON.parse(res.body);
    if (!rows || rows.length < 2) return null; // první řádek je header
    const [timestamp] = rows[1];
    return `https://web.archive.org/web/${timestamp}if_/${originalUrl}`;
  } catch (e) {
    return null;
  }
}

// Zkusí také alternativní extensions (WP může archivovat jpg místo webp)
async function findWaybackUrlAnyExt(localPath) {
  const base = localPath.replace(/\.webp$/, '');
  const exts = ['webp', 'jpg', 'jpeg', 'png', 'JPG', 'JPEG'];
  for (const ext of exts) {
    const url = `https://bikeskills.cz/${base}.${ext}`;
    const wayback = await findWaybackUrl(url);
    if (wayback) return { waybackUrl: wayback, ext };
  }
  return null;
}

async function processOne(item) {
  const { localPath } = item;
  const localFull = path.join(PUBLIC_DIR, localPath);
  fs.mkdirSync(path.dirname(localFull), { recursive: true });

  const found = await findWaybackUrlAnyExt(localPath);
  if (!found) return { path: localPath, ok: false, reason: 'not in Wayback Machine' };

  const { waybackUrl, ext } = found;
  const tmpPath = localFull + '.tmp.' + ext;

  try {
    await download(waybackUrl, tmpPath);
  } catch (e) {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    return { path: localPath, ok: false, reason: 'download failed: ' + e.message };
  }

  if (ext !== 'webp') {
    try {
      convertToWebp(tmpPath, localFull);
      fs.unlinkSync(tmpPath);
    } catch (e) {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      return { path: localPath, ok: false, reason: 'convert failed: ' + e.message };
    }
  } else {
    fs.renameSync(tmpPath, localFull);
  }

  return { path: localPath, ok: true };
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
      if ((ok + fail) % 5 === 0 || (ok + fail) === total) {
        process.stdout.write(`\r  ${ok + fail}/${total} (✅${ok} ❌${fail})`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return { ok, fail, failed };
}

async function main() {
  if (!fs.existsSync(MISSING_FILE)) {
    console.error('❌ Chybí missing-images.json');
    process.exit(1);
  }
  const items = JSON.parse(fs.readFileSync(MISSING_FILE, 'utf8'));
  console.log(`🔽 Hledám ${items.length} obrázků na Wayback Machine...\n`);

  const { ok, fail, failed } = await runPool(items, CONCURRENCY);
  console.log(`\n\n✅ Hotovo: ${ok} staženo, ${fail} nenalezeno`);

  if (ok > 0) {
    console.log('\n🚀 Nyní spusť: firebase deploy --only hosting');
  }

  if (failed.length) {
    // Ulož seznam stále chybějících
    const stillMissing = items.filter(item => failed.some(f => f.path === item.localPath));
    fs.writeFileSync(path.join(__dirname, 'still-missing.json'), JSON.stringify(stillMissing, null, 2));
    console.log(`\n📄 ${failed.length} souborů stále chybí → uloženo do still-missing.json`);
    failed.slice(0, 10).forEach(f => console.log(` ❌ ${f.path}: ${f.reason}`));
  }

  process.exit(fail > 0 && ok === 0 ? 1 : 0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
