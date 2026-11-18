/**
 * BIKESKILLS – náhled sitemapy
 *
 * Ostrá sitemapa se generuje za běhu Cloud Function `sitemap` (/sitemap.xml → functions/lib/sitemap.js),
 * aby nové články/akce a jejich EN překlady byly v sitemapě hned po uložení v adminu.
 * Tento skript jen vypíše stejný výstup lokálně do sitemap-preview.xml (není součástí webu).
 *
 * Usage:
 *   NODE_PATH=functions/node_modules node scripts/generate-sitemap.js
 */
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.log('⚠️  serviceAccountKey.json nenalezen — náhled sitemapy přeskočen');
  process.exit(0);
}
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH)) });
const { buildSitemapXml } = require('../functions/lib/sitemap');

const OUT = path.join(__dirname, '../sitemap-preview.xml');
buildSitemapXml(admin.firestore()).then(xml => {
  fs.writeFileSync(OUT, xml, 'utf-8');
  console.log(`✅ ${OUT} (${(xml.match(/<url>/g) || []).length} URL)`);
  process.exit(0);
}).catch(err => { console.error('❌', err); process.exit(1); });
