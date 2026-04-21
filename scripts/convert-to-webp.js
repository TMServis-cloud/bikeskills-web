/**
 * Pro každý chybějící .webp soubor z missing-images.json najde
 * odpovídající JPG/PNG ve stejné složce a převede ho na WebP.
 *
 * Spuštění: node scripts/convert-to-webp.js
 */

const path    = require('path');
const fs      = require('fs');
const { spawnSync } = require('child_process');

const MISSING_FILE = path.join(__dirname, 'missing-images.json');
const PUBLIC_DIR   = path.join(__dirname, '../public');
const QUALITY      = 82;

const EXTS = ['jpg', 'jpeg', 'png', 'JPG', 'JPEG', 'PNG'];

function findSourceFile(webpFull) {
  const dir  = path.dirname(webpFull);
  const base = path.basename(webpFull, '.webp');
  for (const ext of EXTS) {
    const candidate = path.join(dir, `${base}.${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function convertToWebp(src, dst) {
  const result = spawnSync('python3', ['-c', `
from PIL import Image
img = Image.open(${JSON.stringify(src)})
if img.mode in ('RGBA', 'LA', 'P'):
    img = img.convert('RGBA')
else:
    img = img.convert('RGB')
img.save(${JSON.stringify(dst)}, 'WEBP', quality=${QUALITY}, method=4)
`]);
  if (result.status !== 0) throw new Error(result.stderr.toString().trim());
}

function main() {
  if (!fs.existsSync(MISSING_FILE)) {
    console.error('❌ Chybí missing-images.json — spusť nejdřív find-missing-images.js');
    process.exit(1);
  }

  const items = JSON.parse(fs.readFileSync(MISSING_FILE, 'utf8'));
  const webpItems = items.filter(i => i.localPath.endsWith('.webp'));

  console.log(`🔄 Hledám zdrojové JPG/PNG pro ${webpItems.length} chybějících .webp souborů...\n`);

  let converted = 0, skipped = 0, noSource = 0, failed = 0;
  const noSourceList = [];
  const failedList   = [];

  for (const item of webpItems) {
    const webpFull = path.join(PUBLIC_DIR, item.localPath);

    // Přeskoč pokud .webp už existuje
    if (fs.existsSync(webpFull)) { skipped++; continue; }

    const src = findSourceFile(webpFull);
    if (!src) { noSource++; noSourceList.push(item.localPath); continue; }

    fs.mkdirSync(path.dirname(webpFull), { recursive: true });
    try {
      convertToWebp(src, webpFull);
      converted++;
    } catch (e) {
      failed++;
      failedList.push({ path: item.localPath, reason: e.message });
    }

    const done = converted + skipped + noSource + failed;
    if (done % 20 === 0 || done === webpItems.length) {
      process.stdout.write(`\r  ${done}/${webpItems.length} (✅${converted} ⏭️${skipped} ❓${noSource} ❌${failed})`);
    }
  }

  console.log(`\n\n✅ Převedeno: ${converted}, Přeskočeno: ${skipped}, Bez zdroje: ${noSource}, Chyba: ${failed}`);

  if (converted > 0) {
    console.log('\n🚀 Nyní spusť: firebase deploy --only hosting');
  }

  if (noSourceList.length) {
    console.log(`\n⚠️  ${noSourceList.length} souborů bez odpovídajícího JPG/PNG:`);
    noSourceList.slice(0, 20).forEach(p => console.log(`   ${p}`));
    if (noSourceList.length > 20) console.log(`   ... a dalších ${noSourceList.length - 20}`);
  }

  if (failedList.length) {
    console.log(`\n❌ ${failedList.length} chyb při konverzi:`);
    failedList.slice(0, 10).forEach(f => console.log(`   ${f.path}: ${f.reason}`));
  }
}

main();
