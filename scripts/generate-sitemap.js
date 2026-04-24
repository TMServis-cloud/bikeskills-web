/**
 * BIKESKILLS – Generátor sitemap.xml
 *
 * Načte slugy z Firestore (clanky + akce) a vygeneruje public/sitemap.xml.
 *
 * Usage:
 *   node scripts/generate-sitemap.js
 */

const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(__dirname, 'serviceAccountKey.json');

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.log('⚠️  serviceAccountKey.json nenalezen — sitemap generation přeskočena (CI prostředí)');
  process.exit(0);
}

const admin = require('firebase-admin');
try {
  const serviceAccount = require(SERVICE_ACCOUNT_PATH);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} catch (error) {
  console.error('❌ Firebase init error:', error.message);
  process.exit(1);
}

const db = admin.firestore();
const BASE = 'https://bikeskills.cz';
const OUT = path.join(__dirname, '../public/sitemap.xml');

const STATIC_PAGES = [
  { loc: '/',                                     priority: '1.0', changefreq: 'weekly' },
  { loc: '/akce-archive',                    priority: '0.9', changefreq: 'weekly' },
  { loc: '/individualni-kurzy',              priority: '0.9', changefreq: 'monthly' },
  { loc: '/campy',                           priority: '0.9', changefreq: 'monthly' },
  { loc: '/specialni-akce',                  priority: '0.8', changefreq: 'monthly' },
  { loc: '/servis',                          priority: '0.8', changefreq: 'monthly' },
  { loc: '/standartni-servis-kol',           priority: '0.7', changefreq: 'monthly' },
  { loc: '/kompletni-servis-hardtail',       priority: '0.7', changefreq: 'monthly' },
  { loc: '/kompletni-servis-full',           priority: '0.7', changefreq: 'monthly' },
  { loc: '/kompletni-cenik-servisnich-praci',priority: '0.6', changefreq: 'monthly' },  { loc: '/pujcovna',                        priority: '0.7', changefreq: 'monthly' },
  { loc: '/pojisteni-bikeplan',              priority: '0.7', changefreq: 'monthly' },
  { loc: '/blog',                            priority: '0.8', changefreq: 'weekly' },
  { loc: '/team',                            priority: '0.7', changefreq: 'monthly' },
  { loc: '/kontakt',                         priority: '0.7', changefreq: 'monthly' },
  { loc: '/obchodni-podminky',               priority: '0.3', changefreq: 'yearly' },
  { loc: '/dodaci-podminky',                 priority: '0.3', changefreq: 'yearly' },
  { loc: '/zasady-ochrany-osobnich-udaju',   priority: '0.3', changefreq: 'yearly' },
];

function urlEntry({ loc, priority, changefreq, lastmod }) {
  const parts = [`  <url>`, `    <loc>${BASE}${loc}</loc>`];
  if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`);
  parts.push(`    <priority>${priority}</priority>`);
  parts.push(`    <changefreq>${changefreq}</changefreq>`);
  parts.push(`  </url>`);
  return parts.join('\n');
}

function toLastmod(ts) {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toISOString().split('T')[0];
}

async function main() {
  console.log('🗺️  Generuji sitemap.xml...');

  const entries = STATIC_PAGES.map(p => urlEntry(p));

  // Blog
  const clankySnap = await db.collection('clanky').get();
  const clanky = clankySnap.docs.map(d => d.data()).filter(d => d.slug && d.publikovano !== false);
  console.log(`  📝 Články: ${clanky.length}`);
  clanky.forEach(d => entries.push(urlEntry({
    loc: `/blog/${d.slug}/`,
    priority: '0.6',
    changefreq: 'yearly',
    lastmod: toLastmod(d.datum || d.updatedAt || d.createdAt),
  })));

  // Akce
  const akceSnap = await db.collection('akce').get();
  const akce = akceSnap.docs.map(d => d.data()).filter(d => d.slug && d.publikovano !== false);
  console.log(`  🚴 Akce: ${akce.length}`);
  akce.forEach(d => entries.push(urlEntry({
    loc: `/akce/${d.slug}/`,
    priority: '0.7',
    changefreq: 'monthly',
    lastmod: toLastmod(d.datum || d.updatedAt || d.createdAt),
  })));

  // Tým
  const teamSnap = await db.collection('team').get();
  const team = teamSnap.docs.map(d => d.data()).filter(d => d.slug);
  console.log(`  👤 Tým: ${team.length}`);
  team.forEach(d => entries.push(urlEntry({
    loc: `/team/${d.slug}/`,
    priority: '0.6',
    changefreq: 'monthly',
  })));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

${entries.join('\n\n')}

</urlset>
`;

  fs.writeFileSync(OUT, xml, 'utf-8');
  console.log(`\n✅ Hotovo: ${OUT} (${entries.length} URL)`);
  process.exit(0);
}

main().catch(err => { console.error('❌', err); process.exit(1); });
