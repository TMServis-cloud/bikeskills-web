/**
 * BIKESKILLS – Import galerie a videí team členů z WP XML
 *
 * WP XML obsahuje obsah team stránek s obrázky (gallery blocks, img tags)
 * a YouTube embedy. Extrahuje je a uloží do Firestore team galerie + videoUrl polí.
 */

const path  = require('path');
const fs    = require('fs');
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();

const BUCKET = 'bikeskills-web.firebasestorage.app';
const STORAGE_BASE = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/`;

function toStorageUrl(url) {
  if (!url) return null;
  const m = url.match(/https?:\/\/bikeskills\.cz\/(wp-content\/uploads\/[^\s"'<>]+)/i);
  if (!m) return null;
  // Odstraň size suffix -NNNxNNN
  const urlPath = m[1].replace(/-\d+x\d+(\.\w+)$/, '$1');
  // jpg/jpeg/png → webp
  const webpPath = urlPath.replace(/\.(jpg|jpeg|png)$/i, '.webp');
  const encoded = webpPath.split('/').map(encodeURIComponent).join('%2F');
  return `${STORAGE_BASE}${encoded}?alt=media`;
}

function extractYouTubeUrl(html) {
  // wp:embed YouTube block nebo iframe
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/g,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/g,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/g,
  ];
  const ids = new Set();
  for (const pat of patterns) {
    let m;
    while ((m = pat.exec(html)) !== null) ids.add(m[1]);
  }
  return [...ids].map(id => `https://www.youtube.com/watch?v=${id}`);
}

function extractImages(html) {
  const urls = new Set();
  const srcRegex = /src="(https?:\/\/bikeskills\.cz\/wp-content\/uploads\/[^"]+)"/g;
  const hrefRegex = /href="(https?:\/\/bikeskills\.cz\/wp-content\/uploads\/[^"]+\.(?:jpg|jpeg|png|webp))"/gi;
  let m;
  while ((m = srcRegex.exec(html)) !== null) {
    const s = toStorageUrl(m[1]);
    if (s) urls.add(s);
  }
  while ((m = hrefRegex.exec(html)) !== null) {
    const s = toStorageUrl(m[1]);
    if (s) urls.add(s);
  }
  return [...urls];
}

function parseWpTeam(xmlPath) {
  const xml = fs.readFileSync(xmlPath, 'utf8');
  const teamMap = new Map();

  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const item = m[1];
    const typeM = item.match(/<wp:post_type><!\[CDATA\[(.*?)\]\]><\/wp:post_type>/);
    if (!typeM || typeM[1] !== 'team') continue;
    const statusM = item.match(/<wp:status><!\[CDATA\[(.*?)\]\]><\/wp:status>/);
    if (!statusM || statusM[1] !== 'publish') continue;
    const slugM = item.match(/<wp:post_name><!\[CDATA\[(.*?)\]\]><\/wp:post_name>/);
    if (!slugM) continue;
    const contentM = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);
    if (!contentM) continue;

    teamMap.set(slugM[1], contentM[1]);
  }
  return teamMap;
}

async function main() {
  console.log('📂 Parsování team obsahu z WP XML...');
  const xmlPath = path.join(__dirname, 'export.xml');
  const wpTeam = parseWpTeam(xmlPath);
  console.log(`  Nalezeno ${wpTeam.size} team členů v XML\n`);

  const snap = await db.collection('team').get();
  let updated = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const slug = data.slug || '';
    const wpContent = wpTeam.get(slug);

    if (!wpContent) {
      console.log(`  ⚠️  team/${doc.id} (${data.jmeno}) slug="${slug}" – nenalezeno v XML`);
      continue;
    }

    const galerie = extractImages(wpContent);
    const videos  = extractYouTubeUrl(wpContent);

    const patch = {};
    if (galerie.length) patch.galerie = galerie;
    if (videos[0]) patch.videoUrl  = videos[0];
    if (videos[1]) patch.videoUrl2 = videos[1];
    if (videos[2]) patch.videoUrl3 = videos[2];

    if (Object.keys(patch).length) {
      await doc.ref.update(patch);
      console.log(`  ✅ ${data.jmeno}: ${galerie.length} fotek, ${videos.length} videí`);
      updated++;
    } else {
      console.log(`  ℹ️  ${data.jmeno}: žádné obrázky ani videa v obsahu`);
    }
  }

  console.log(`\n✅ Hotovo: ${updated} team členů aktualizováno`);
  process.exit(0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
