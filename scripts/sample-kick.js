// Pick 20 random missing originals, reupload to trigger finalize.
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'bikeskills-web.firebasestorage.app',
});
const bucket = admin.storage().bucket();

function pickRandom(arr, n) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}
function ct(name) {
  if (/\.webp$/i.test(name)) return 'image/webp';
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.(jpe?g)$/i.test(name)) return 'image/jpeg';
  return 'application/octet-stream';
}
(async () => {
  const all = fs.readFileSync('/tmp/missing-originals.txt', 'utf8')
    .split('\n').map((s) => s.trim()).filter(Boolean)
    // skip placeholder + odd 1776* paths (unusable timestamps)
    .filter((p) => !p.startsWith('images/placeholder') && !/\/1776\d+_/.test(p));
  console.log(`Eligible pool: ${all.length}`);
  const sample = pickRandom(all, 20);
  fs.writeFileSync('/tmp/sample-paths.txt', sample.join('\n'));

  let ok = 0, bytes = 0;
  const t0 = Date.now();
  for (const p of sample) {
    try {
      const file = bucket.file(p);
      const [buf] = await file.download();
      await file.save(buf, {
        contentType: ct(p),
        metadata: { metadata: { backfillRetry: String(Date.now()) } },
        resumable: false,
      });
      ok++; bytes += buf.length;
      console.log(`  ✓ ${p} (${(buf.length/1024).toFixed(0)} KB)`);
    } catch (e) {
      console.log(`  ✗ ${p}: ${e.message}`);
    }
  }
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nReuploaded ${ok}/${sample.length} in ${dt}s (${(bytes/1024/1024).toFixed(2)} MB)`);
  console.log(`Sample saved to /tmp/sample-paths.txt — wait 60-120s, then run sample-poll.js`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
