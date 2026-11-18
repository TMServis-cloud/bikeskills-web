/**
 * Sitemap bikeskills.cz (cs + en, hreflang přes xhtml:link).
 * Používá Cloud Function `sitemap` (/sitemap.xml) i scripts/generate-sitemap.js (náhled lokálně).
 * EN verze CMS položek bere z polí *_en ve Firestore (viz lib/en-fields.js).
 */
const PAGES = require('./pages');
const { enOf } = require('./en-fields');

const BASE = 'https://bikeskills.cz';

const STATIC_PAGES = [
  { loc: '/',                                 priority: '1.0', changefreq: 'weekly' },
  { loc: '/akce-archive',                     priority: '0.9', changefreq: 'weekly' },
  { loc: '/individualni-kurzy',               priority: '0.9', changefreq: 'monthly' },
  { loc: '/campy',                            priority: '0.9', changefreq: 'monthly' },
  { loc: '/specialni-akce',                   priority: '0.8', changefreq: 'monthly' },
  { loc: '/servis',                           priority: '0.8', changefreq: 'monthly' },
  { loc: '/standartni-servis-kol',            priority: '0.7', changefreq: 'monthly' },
  { loc: '/kompletni-servis-hardtail',        priority: '0.7', changefreq: 'monthly' },
  { loc: '/kompletni-servis-full',            priority: '0.7', changefreq: 'monthly' },
  { loc: '/kompletni-cenik-servisnich-praci', priority: '0.6', changefreq: 'monthly' },
  { loc: '/pujcovna',                         priority: '0.7', changefreq: 'monthly' },
  { loc: '/blog',                             priority: '0.8', changefreq: 'weekly' },
  { loc: '/team',                             priority: '0.7', changefreq: 'monthly' },
  { loc: '/kontakt',                          priority: '0.7', changefreq: 'monthly' },
  { loc: '/obchodni-podminky',                priority: '0.3', changefreq: 'yearly' },
  { loc: '/dodaci-podminky',                  priority: '0.3', changefreq: 'yearly' },
  { loc: '/zasady-ochrany-osobnich-udaju',    priority: '0.3', changefreq: 'yearly' },
];

function xmlEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function pageEn(csLoc) {
  const bare = csLoc === '/' ? 'index' : csLoc.replace(/^\//, '');
  const p = PAGES.find(x => x.cs === bare);
  return p ? (p.en === 'index' ? '/en' : '/en/' + p.en) : null;
}

function urlEntry({ loc, priority, changefreq, lastmod, alt }) {
  const parts = ['  <url>', `    <loc>${xmlEsc(BASE + loc)}</loc>`];
  if (alt) {
    parts.push(`    <xhtml:link rel="alternate" hreflang="cs" href="${xmlEsc(BASE + alt.cs)}"/>`);
    parts.push(`    <xhtml:link rel="alternate" hreflang="en" href="${xmlEsc(BASE + alt.en)}"/>`);
    parts.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEsc(BASE + alt.cs)}"/>`);
  }
  if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`);
  parts.push(`    <priority>${priority}</priority>`);
  parts.push(`    <changefreq>${changefreq}</changefreq>`);
  parts.push('  </url>');
  return parts.join('\n');
}

/** 2 záznamy (cs + en) se vzájemnými alternates, nebo 1 bez EN. */
function pair(entry, enLoc) {
  if (!enLoc) return [urlEntry(entry)];
  const alt = { cs: entry.loc, en: enLoc };
  return [urlEntry(Object.assign({}, entry, { alt })), urlEntry(Object.assign({}, entry, { loc: enLoc, alt }))];
}

function toLastmod(ts) {
  if (!ts) return null;
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts.seconds ? ts.seconds * 1000 : ts);
    return isNaN(d) ? null : d.toISOString().split('T')[0];
  } catch (_) { return null; }
}

async function buildSitemapXml(db) {
  const [clankySnap, akceSnap, teamSnap] = await Promise.all([
    db.collection('clanky').get(), db.collection('akce').get(), db.collection('team').get(),
  ]);
  const entries = STATIC_PAGES.flatMap(p => pair(p, pageEn(p.loc)));

  clankySnap.docs.map(d => d.data()).filter(d => d.slug && d.publikovano !== false).forEach(d => {
    const en = enOf('clanky', d);
    entries.push(...pair({ loc: `/blog/${d.slug}/`, priority: '0.6', changefreq: 'yearly', lastmod: toLastmod(d.updatedAt || d.datum || d.createdAt) },
      en && en.slug ? `/en/blog/${en.slug}` : null));
  });
  akceSnap.docs.map(d => d.data()).filter(d => d.slug && d.aktivni !== false).forEach(d => {
    const en = enOf('akce', d);
    entries.push(...pair({ loc: `/akce/${d.slug}`, priority: '0.7', changefreq: 'monthly', lastmod: toLastmod(d.updatedAt || d.createdAt) },
      en && en.slug ? `/en/events/${en.slug}` : null));
  });
  teamSnap.docs.map(d => d.data()).filter(d => d.slug && d.aktivni !== false).forEach(d => {
    const en = enOf('team', d);
    entries.push(...pair({ loc: `/team/${d.slug}`, priority: '0.6', changefreq: 'monthly' }, en ? `/en/team/${d.slug}` : null));
  });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n\n${entries.join('\n\n')}\n\n</urlset>\n`;
}

module.exports = { buildSitemapXml };
