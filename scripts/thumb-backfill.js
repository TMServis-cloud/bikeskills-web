/**
 * thumb-backfill.js
 *
 * Zpracuje stávající fotky v Firebase Storage tak, aby Firebase Extension
 * "Resize Images" vygeneroval thumbnaily.
 *
 * Funguje tak, že každý soubor stáhne a znovu nahraje na stejnou cestu —
 * tím se spustí onObjectFinalized trigger extension.
 *
 * Použití:
 *   node scripts/thumb-backfill.js [--dry-run] [--prefix galerie/]
 *
 * Prerekvizity:
 *   npm install firebase-admin
 *   serviceAccountKey.json musí být v scripts/ nebo nastav GOOGLE_APPLICATION_CREDENTIALS
 */

const admin = require('firebase-admin');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const prefixArg = process.argv.find(a => a.startsWith('--prefix='));
const PREFIX = prefixArg ? prefixArg.split('=')[1] : '';

const KEY_PATH = path.join(__dirname, 'serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(require(KEY_PATH)),
  storageBucket: 'bikeskills-web.firebasestorage.app',
});

const bucket = admin.storage().bucket();

// Přípony, které chceme zpracovat
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);

// Velikost thumbnailu musí odpovídat konfiguraci extension (IMG_SIZES)
const THUMB_SIZE = '800x600';
const THUMBS_PATH = 'thumbs'; // RESIZED_IMAGES_PATH v extension config

async function main() {
  console.log(`🔍 Listuji soubory${PREFIX ? ` s prefixem "${PREFIX}"` : ''}…`);
  const [files] = await bucket.getFiles({ prefix: PREFIX });

  const images = files.filter(f => {
    const ext = path.extname(f.name).toLowerCase();
    // Přeskoč již existující thumbnaile a placeholder
    if (f.name.includes(`/${THUMBS_PATH}/`)) return false;
    if (f.name.includes('placeholder')) return false;
    return IMAGE_EXTS.has(ext);
  });

  console.log(`📷 Nalezeno ${images.length} obrázků ke zpracování`);
  if (DRY_RUN) {
    images.forEach(f => console.log('  (dry-run)', f.name));
    return;
  }

  let ok = 0, err = 0;
  for (const file of images) {
    const name = file.name;

    // Zkontroluj, zda thumb již existuje
    const ext = path.extname(name);
    const base = name.slice(0, -ext.length);
    const dir = path.dirname(name);
    const filename = path.basename(name, ext);
    const thumbName = `${dir}/${THUMBS_PATH}/${filename}_${THUMB_SIZE}.webp`;

    const thumbFile = bucket.file(thumbName);
    const [thumbExists] = await thumbFile.exists();
    if (thumbExists) {
      console.log(`  ✓ thumb OK  ${name}`);
      ok++;
      continue;
    }

    // Stáhni a znovu nahraj → spustí extension trigger
    try {
      const [data] = await file.download();
      const [meta] = await file.getMetadata();
      await file.save(data, {
        metadata: {
          contentType: meta.contentType || 'image/jpeg',
          cacheControl: meta.cacheControl,
        },
        resumable: false,
      });
      console.log(`  ⬆ re-upload ${name}`);
      ok++;
      // Extension potřebuje chvilku — throttle aby se nevyčerpaly limity
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.error(`  ✗ chyba    ${name}:`, e.message);
      err++;
    }
  }

  console.log(`\n✅ Hotovo: ${ok} zpracováno, ${err} chyb`);
  console.log('Thumbnaile se generují asynchronně — počkej 1–2 minuty než se objeví v Storage.');
}

main().catch(e => { console.error(e); process.exit(1); });
