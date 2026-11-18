/**
 * Složí EN verze dokumentů clanky/akce/team z translations/cms-en.json.
 * Do Firestore NIC nezapisuje – výstup jsou statické soubory nasazené s webem:
 *
 *   translations/slugs.json             – CZ slug → EN slug (pro odkazy, build-en.js, prerender.js)
 *   translations/cms-docs-en.json       – kompletní EN data { kolekce: { csSlug: {...} } } (prerender.js)
 *   public/en/data/<kolekce>.json       – index pro cms-loader.js (bez dlouhého obsahu)
 *   public/en/data/<kolekce>/<cs>.json  – plný obsah/popis pro detail mimo prerender
 *
 *   node scripts/i18n/apply-cms.js            – z posledního snapshotu (translations/firestore-snapshot)
 *   node scripts/i18n/dump-cms.js --fetch     – nejdřív stáhne čerstvý snapshot a vypíše nové texty k překladu
 */
const fs = require('fs'), path = require('path');
const S = require('./segments'); const L = require('./links'); const FIELDS = require('./cms-fields');
const T = path.join(__dirname, '../../translations'); const SNAP = path.join(T, 'firestore-snapshot');
const DICT = JSON.parse(fs.readFileSync(path.join(T, 'cms-en.json')));

const missing = new Map();
function tr(cs, where) {
  if (!cs || typeof cs !== 'string' || !S.hasLetters(cs)) return cs;
  const n = S.norm(cs); if (S.isUrlLike(n)) return cs;
  const { text, tags } = S.mask(n); const en = DICT[text];
  if (en == null) { missing.set(text, where); return null; }
  try { return S.unmask(en, tags); } catch (e) { missing.set(text, where + ' ' + e.message); return null; }
}
function trPlain(cs, where) { const r = tr(cs, where); return r == null ? cs : r; }
function trHtml(html, where) {
  if (!html) return html;
  return S.transform(html, r => { if (S.isUrlLike(r)) return null; return tr(r, where); }, a => tr(a, where));
}
function slugify(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&[a-z]+;/g, ' ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
}
/** Odkazy v obsahu (href + viditelné URL) → EN */
function rewriteLinks(html) {
  if (!html) return html;
  html = html.replace(/(\s(?:src|href)=")(?:\.\.\/)+(images|wp-content|documents)\//gi, '$1/$2/'); // relativní cesty z WP importu
  html = html.replace(/(\shref=")([^"]*)(")/gi, (m, a, v, b) => { const en = L.linkToEn(v); return en != null ? a + en + b : m; });
  html = html.replace(/(>|\s)(https?:\/\/(?:www\.)?(?:shop\.)?bikeskills\.cz\/[^\s<"]*)/gi, (m, pre, url) => { const en = L.linkToEn(url); return pre + (en != null ? (en.startsWith('/') ? L.BASE_URL + en : en) : url); });
  return html;
}

const docs = {}; for (const c of Object.keys(FIELDS)) docs[c] = JSON.parse(fs.readFileSync(path.join(SNAP, c + '.json'))).filter(FIELDS[c].include);

// 1) slugy
const used = { clanky: new Set(), akce: new Set() };
const slugs = { blog: {}, akce: {} };
function uniq(set, base, extra) {
  let s = base || 'post'; if (!set.has(s)) { set.add(s); return s; }
  if (extra && !set.has(`${base}-${extra}`)) { s = `${base}-${extra}`; set.add(s); return s; }
  let i = 2; while (set.has(`${base}-${i}`)) i++; s = `${base}-${i}`; set.add(s); return s;
}
for (const d of docs.clanky) slugs.blog[d.slug] = uniq(used.clanky, slugify(trPlain(d.titulek, 'slug')));
for (const d of docs.akce) {
  const yr = String(d.datumSort || '').slice(0, 4);
  let base = slugify(trPlain(d.nazev, 'slug'));
  if (/^\d{4}$/.test(yr) && !base.includes(yr)) base += '-' + yr; // rok do slugu – akce se opakují každou sezónu
  slugs.akce[d.slug] = uniq(used.akce, base);
}
fs.writeFileSync(path.join(T, 'slugs.json'), JSON.stringify(slugs, null, 1));
L.reloadSlugs();

// 2) EN dokumenty
const out = { clanky: {}, akce: {}, team: {} };
for (const d of docs.clanky) {
  const w = 'clanky:' + d.slug;
  const obsah = rewriteLinks(trHtml(d.obsah, w));
  let perex;
  if (S.perexFromContent(d)) { const p = S.plainOf(obsah); const max = Math.max(S.plainOf(d.perex).length, 160); perex = p.length > max ? p.slice(0, max).replace(/\s+\S*$/, '') + '…' : p; }
  else perex = trPlain(d.perex, w);
  out.clanky[d.slug] = { slug: slugs.blog[d.slug], titulek: trPlain(d.titulek, w), perex, obsah };
}
for (const d of docs.akce) {
  const w = 'akce:' + d.slug; const e = { slug: slugs.akce[d.slug], popis: rewriteLinks(trHtml(d.popis, w)) };
  for (const f of FIELDS.akce.plain) if (d[f]) e[f] = trPlain(d[f], w);
  out.akce[d.slug] = e;
}
for (const d of docs.team) out.team[d.slug] = { slug: d.slug, popis: rewriteLinks(trHtml(d.popis, 'team:' + d.slug)) };

fs.writeFileSync(path.join(T, 'cms-docs-en.json'), JSON.stringify(out, null, 1));
console.log(`EN dokumenty: clanky ${Object.keys(out.clanky).length}, akce ${Object.keys(out.akce).length}, team ${Object.keys(out.team).length}`);
if (missing.size) { console.log('⚠️  nepřeloženo:', missing.size); for (const [k, w] of [...missing].slice(0, 15)) console.log('  ', w, '|', k.slice(0, 90)); }

// 3) statické soubory pro web
const PUB_DATA = path.join(__dirname, '../../public/en/data');
fs.mkdirSync(path.join(PUB_DATA, 'clanky'), { recursive: true }); fs.mkdirSync(path.join(PUB_DATA, 'akce'), { recursive: true });
const idx = { clanky: {}, akce: {}, team: {} };
for (const [cs, e] of Object.entries(out.clanky)) {
  idx.clanky[cs] = { slug: e.slug, titulek: e.titulek, perex: e.perex };
  fs.writeFileSync(path.join(PUB_DATA, 'clanky', cs + '.json'), JSON.stringify({ obsah: e.obsah }));
}
for (const [cs, e] of Object.entries(out.akce)) {
  const { popis, ...rest } = e; const plain = S.plainOf(popis);
  idx.akce[cs] = Object.assign(rest, { popis: plain.length > 300 ? plain.slice(0, 300) + '…' : plain }); // karta bere jen výňatek
  fs.writeFileSync(path.join(PUB_DATA, 'akce', cs + '.json'), JSON.stringify({ popis }));
}
idx.team = out.team;
for (const c of Object.keys(idx)) fs.writeFileSync(path.join(PUB_DATA, c + '.json'), JSON.stringify(idx[c]));
console.log('✅ public/en/data/ – index + detailní soubory');
