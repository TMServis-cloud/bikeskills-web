/**
 * BIKESKILLS – Odstraní WP size suffix z Storage URL
 *
 * WP generuje resizované varianty: photo-1024x683.jpg, photo-300x200.jpg apod.
 * Po konverzi na webp tyto varianty neexistují v Storage — jen originály.
 * Regex nahradí: photo-1024x683.webp → photo.webp
 *
 * Zpracovává: clanky.obsah, akce.popis, imageUrl a galerie ve všech kolekcích
 */

const path  = require('path');
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();

const STORAGE_BASE = 'https://firebasestorage.googleapis.com/v0/b/bikeskills-web.firebasestorage.app/o/';

// Odstraní -WIDTHxHEIGHT ze Storage URL (jen v path části před ?alt=media)
function stripSizeSuffix(str) {
  if (!str || typeof str !== 'string') return str;
  // Nahradí -NNNxNNN.webp → .webp v Storage URL path (URL-encoded i ne)
  // Varianta 1: v plaintext URL (po decodeURIComponent)
  // Varianta 2: v URL-encoded path (%2F separátory) – suffix je v segmentu před %2F nebo ?
  return str
    // V URL-encoded cestě: segment obsahuje -NNNxNNN před .webp
    .replace(
      /(https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^?]+?)(-\d+x\d+)(\.webp(?:%[0-9A-F]{2})*\?alt=media)/gi,
      '$1$3'
    )
    // Fallback: plaintext URL s .webp
    .replace(
      /(https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^"'\s<>]+?)-\d+x\d+(\.webp\?alt=media)/gi,
      '$1$2'
    );
}

function fixField(val) {
  if (!val) return null;
  if (typeof val === 'string') {
    const fixed = stripSizeSuffix(val);
    return fixed !== val ? fixed : null;
  }
  if (Array.isArray(val)) {
    let changed = false;
    const fixed = val.map(v => {
      if (typeof v !== 'string') return v;
      const f = stripSizeSuffix(v);
      if (f !== v) changed = true;
      return f;
    });
    return changed ? fixed : null;
  }
  return null;
}

async function fixCollection(colName, fields) {
  const snap = await db.collection(colName).get();
  let fixed = 0, skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const patch = {};
    for (const field of fields) {
      const result = fixField(data[field]);
      if (result !== null) patch[field] = result;
    }
    if (Object.keys(patch).length) {
      await doc.ref.update(patch);
      fixed++;
      const keys = Object.keys(patch).join(', ');
      console.log(`  ✅ ${colName}/${doc.id} [${keys}]`);
    } else {
      skipped++;
    }
  }
  console.log(`  → ${colName}: ${fixed} opraveno, ${skipped} beze změny\n`);
}

async function main() {
  console.log('🔧 Odstraňuji WP size suffix z Storage URL...\n');
  await fixCollection('clanky', ['obsah', 'imageUrl', 'galerie']);
  await fixCollection('akce',   ['popis', 'imageUrl', 'galerie']);
  await fixCollection('team',   ['imageUrl', 'galerie']);
  console.log('✅ Hotovo');
  process.exit(0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
