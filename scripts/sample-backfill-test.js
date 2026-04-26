// Sample backfill test:
// 1) pick 20 random paths from /tmp/missing-originals.txt
// 2) re-upload each (download → upload, overwrite) to trigger finalize
// 3) wait, poll bucket for variants
// 4) report success rate (60 expected variants total)
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'bikeskills-web.firebasestorage.app',
});
const bucket = admin.storage().bucket();
const SIZES = ['_400x400', '_800x800', '_1600x1600'];

function pickRandom(arr, n) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

function variantPath(orig, size) {
  // images/clanky/foo.webp -> images/clanky/foo_800x800.webp
  return orig.replace(/(\.[a-z]+)$/i, size + '$1');
}

function contentTypeFor(name) {
  if (/\.webp$/i.test(name)) return 'image/webp';
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.(jpe?g)$/i.test(name)) return 'image/jpeg';
  return 'application/octet-stream';
}

async function reupload(p) {
  const file = bucket.file(p);
  const [buf] = await file.download();
  await file.save(buf, {
    contentType: contentTypeFor(p),
    metadata: { metadata: { backfillRetry: String(Date.now()) } },
    resumable: false,
  });
  return buf.length;
}

async function checkVariant(orig, size) {
  const vp = variantPath(orig, size);
  const [exists] = await bucket.file(vp).exists();
  return exists;
}

(async () => {
  const all = fs.readFileSync('/tmp/missing-originals.txt', 'utf8')
    .split('\n').map((s) => s.trim()).filter(Boolean);
  console.log(`Pool: ${all.length} originals`);
  const sample = pickRandom(all, 20);
  console.log(`Sample (${sample.length}):`);
  sample.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));

  console.log('\n=== STEP 1: re-upload to trigger finalize ===');
  let uploaded = 0;
  let bytes = 0;
  for (const p of sample) {
    try {
      const n = await reupload(p);
      uploaded++; bytes += n;
      process.stdout.write('.');
    } catch (e) {
      console.error(`\nERR ${p}: ${e.message}`);
    }
  }
  console.log(`\nReuploaded ${uploaded}/${sample.length} (${(bytes/1024/1024).toFixed(2)} MB)`);

  console.log('\n=== STEP 2: poll for variants (every 15s, max 4 minutes) ===');
  const start = Date.now();
  const maxMs = 4 * 60 * 1000;
  let lastCount = -1;
  let counts;
  while (Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 15000));
    counts = { total: 0, perSize: { _400x400: 0, _800x800: 0, _1600x1600: 0 } };
    for (const p of sample) {
      for (const s of SIZES) {
        const ok = await checkVariant(p, s);
        if (ok) { counts.total++; counts.perSize[s]++; }
      }
    }
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    console.log(`+${elapsed}s: ${counts.total}/60 variants (400:${counts.perSize._400x400}, 800:${counts.perSize._800x800}, 1600:${counts.perSize._1600x1600})`);
    if (counts.total === 60) break;
    if (counts.total === lastCount && counts.total > 0) {
      // plateau for >15s — likely done
      // but give it one more round
    }
    lastCount = counts.total;
  }

  console.log('\n=== FINAL ===');
  const successRate = ((counts.total / 60) * 100).toFixed(1);
  console.log(`${counts.total}/60 variants generated (${successRate}%)`);
  console.log(`Per size: 400=${counts.perSize._400x400}/20, 800=${counts.perSize._800x800}/20, 1600=${counts.perSize._1600x1600}/20`);

  // Per-original outcome
  console.log('\n=== PER ORIGINAL ===');
  const outcomes = { '3of3': [], '2of3': [], '1of3': [], '0of3': [] };
  for (const p of sample) {
    let ok = 0;
    for (const s of SIZES) {
      if (await checkVariant(p, s)) ok++;
    }
    if (ok === 3) outcomes['3of3'].push(p);
    else if (ok === 2) outcomes['2of3'].push(p);
    else if (ok === 1) outcomes['1of3'].push(p);
    else outcomes['0of3'].push(p);
  }
  console.log(`3/3: ${outcomes['3of3'].length}, 2/3: ${outcomes['2of3'].length}, 1/3: ${outcomes['1of3'].length}, 0/3: ${outcomes['0of3'].length}`);
  if (outcomes['0of3'].length) {
    console.log('Failed (0/3):');
    outcomes['0of3'].forEach((p) => console.log('  ' + p));
  }
  if (outcomes['1of3'].length) {
    console.log('Partial (1/3):');
    outcomes['1of3'].forEach((p) => console.log('  ' + p));
  }
  if (outcomes['2of3'].length) {
    console.log('Partial (2/3):');
    outcomes['2of3'].forEach((p) => console.log('  ' + p));
  }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
