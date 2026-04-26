// Read /tmp/sample-paths.txt, check how many of 60 variants exist.
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

function vp(orig, size) {
  return orig.replace(/(\.[a-z]+)$/i, size + '$1');
}
(async () => {
  const sample = fs.readFileSync('/tmp/sample-paths.txt', 'utf8')
    .split('\n').map((s) => s.trim()).filter(Boolean);
  console.log(`Polling ${sample.length} originals for ${sample.length * 3} variants…`);
  const counts = { total: 0, perSize: { _400x400: 0, _800x800: 0, _1600x1600: 0 } };
  const outcomes = { '3of3': [], '2of3': [], '1of3': [], '0of3': [] };

  // parallel checks
  const checks = await Promise.all(sample.map(async (p) => {
    const got = [];
    await Promise.all(SIZES.map(async (s) => {
      const [ok] = await bucket.file(vp(p, s)).exists();
      if (ok) got.push(s);
    }));
    return { p, got };
  }));

  for (const { p, got } of checks) {
    counts.total += got.length;
    got.forEach((s) => counts.perSize[s]++);
    outcomes[`${got.length}of3`].push({ p, has: got });
  }

  const rate = ((counts.total / (sample.length * 3)) * 100).toFixed(1);
  console.log(`\n${counts.total}/${sample.length * 3} variants (${rate}%)`);
  console.log(`Per size: 400=${counts.perSize._400x400}/${sample.length}, 800=${counts.perSize._800x800}/${sample.length}, 1600=${counts.perSize._1600x1600}/${sample.length}`);
  console.log(`\nPer original: 3/3=${outcomes['3of3'].length}, 2/3=${outcomes['2of3'].length}, 1/3=${outcomes['1of3'].length}, 0/3=${outcomes['0of3'].length}`);

  if (outcomes['0of3'].length) {
    console.log('\nFailed (0/3):');
    outcomes['0of3'].forEach((o) => console.log('  ' + o.p));
  }
  if (outcomes['1of3'].length || outcomes['2of3'].length) {
    console.log('\nPartial:');
    [...outcomes['1of3'], ...outcomes['2of3']].forEach((o) => console.log(`  [${o.has.join(',')}] ${o.p}`));
  }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
