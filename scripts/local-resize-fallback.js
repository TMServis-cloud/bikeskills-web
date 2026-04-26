// Generate _400x400 / _800x800 / _1600x1600 WebP variants locally via Sharp
// for images that the Image Resize Extension failed to process.
// Reads paths from argv (or /tmp/sample-paths.txt if none).
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const sharp = require('sharp');
const sa = require(path.join(__dirname, 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(sa), storageBucket: 'bikeskills-web.firebasestorage.app' });
const bucket = admin.storage().bucket();

const SIZES = [400, 800, 1600];
const inputs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readFileSync('/tmp/sample-paths.txt', 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);

function variantPath(orig, size) {
  // matches extension behavior: foo.jpg -> foo_800x800.webp (always WebP output)
  return orig.replace(/(\.[a-z]+)$/i, `_${size}x${size}.webp`);
}

(async () => {
  console.log(`Processing ${inputs.length} originals…`);
  for (const p of inputs) {
    console.log(`\n→ ${p}`);
    try {
      const [buf] = await bucket.file(p).download();
      console.log(`  downloaded ${(buf.length/1024/1024).toFixed(2)} MB`);
      const meta = await sharp(buf).metadata();
      console.log(`  ${meta.width}x${meta.height} ${meta.format}`);
      for (const s of SIZES) {
        const out = await sharp(buf, { failOn: 'none' })
          .rotate() // honor EXIF orientation
          .resize({ width: s, height: s, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();
        const vp = variantPath(p, s);
        await bucket.file(vp).save(out, {
          contentType: 'image/webp',
          metadata: { metadata: { generatedBy: 'local-fallback' } },
          resumable: false,
        });
        console.log(`  ✓ ${vp} (${(out.length/1024).toFixed(0)} KB)`);
      }
    } catch (e) {
      console.error(`  ✗ ${p}: ${e.message}`);
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
