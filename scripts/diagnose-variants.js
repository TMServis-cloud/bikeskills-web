const path = require('path');
const admin = require('firebase-admin');
const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'bikeskills-web.firebasestorage.app',
});

const bucket = admin.storage().bucket();
const SIZES = ['_400x400', '_800x800', '_1600x1600'];

async function listAll(prefix = '') {
  const all = [];
  let pageToken;
  do {
    const [files, , apiResp] = await bucket.getFiles({
      prefix, maxResults: 1000, pageToken,
    });
    files.forEach((f) => all.push(f.name));
    pageToken = apiResp && apiResp.nextPageToken;
  } while (pageToken);
  return all;
}

(async () => {
  console.error('Listing bucket bikeskills-web.firebasestorage.app …');
  const t0 = Date.now();
  const all = await listAll('');
  console.error(`Listed ${all.length} objects in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  const originals = new Set();
  const variants = new Map();
  let nonImg = 0;
  for (const name of all) {
    if (!/\.(webp|jpg|jpeg|png)$/i.test(name)) { nonImg++; continue; }
    const m = name.match(/^(.*?)(_\d+x\d+)(\.[a-z]+)$/i);
    if (m) {
      const orig = m[1] + m[3];
      if (!variants.has(orig)) variants.set(orig, new Set());
      variants.get(orig).add(m[2]);
    } else {
      originals.add(name);
    }
  }
  console.error(`Originals: ${originals.size}, variants groups: ${variants.size}, non-image: ${nonImg}`);

  const dist = { '3of3': 0, '2of3': 0, '1of3': 0, '0of3': 0, 'other-only': 0 };
  const partials = []; const missing = [];
  const yearStats = {};
  for (const orig of originals) {
    const v = variants.get(orig) || new Set();
    const matched = SIZES.filter((s) => v.has(s));
    let b;
    if (matched.length === 3) b = '3of3';
    else if (matched.length === 2) b = '2of3';
    else if (matched.length === 1) b = '1of3';
    else if (v.size === 0) b = '0of3';
    else b = 'other-only';
    dist[b]++;
    const ym = orig.match(/(\d{4})/);
    const year = ym ? ym[1] : 'unknown';
    if (!yearStats[year]) yearStats[year] = { full: 0, partial: 0, missing: 0 };
    if (b === '3of3') yearStats[year].full++;
    else if (b === '0of3') yearStats[year].missing++;
    else yearStats[year].partial++;
    if (b === '0of3') missing.push(orig);
    else if (b !== '3of3') partials.push({ orig, has: matched, hasOther: [...v].filter((x) => !SIZES.includes(x)) });
  }

  console.log('=== DISTRIBUTION ===');
  console.log(JSON.stringify(dist, null, 2));
  console.log('\n=== PER YEAR (originals) ===');
  console.log(JSON.stringify(yearStats, null, 2));
  console.log('\n=== SAMPLE 0/3 MISSING (first 10) ===');
  console.log(missing.slice(0, 10).join('\n'));
  console.log('\n=== SAMPLE PARTIAL (first 10) ===');
  console.log(JSON.stringify(partials.slice(0, 10), null, 2));

  const fs = require('fs');
  fs.writeFileSync('/tmp/missing-originals.txt', missing.join('\n'));
  fs.writeFileSync('/tmp/partial-originals.json', JSON.stringify(partials, null, 2));
  console.log(`\n→ /tmp/missing-originals.txt (${missing.length} lines)`);
  console.log(`→ /tmp/partial-originals.json (${partials.length} entries)`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
