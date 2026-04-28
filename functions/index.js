const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();
const db = admin.firestore();

// ============================================================
// CORS helper
// ============================================================
function setCors(req, res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
}

// ============================================================
// SITEMAP
// ============================================================
const STATIC_PAGES = [
  { loc: '/', priority: '1.0', changefreq: 'weekly' },
  { loc: '/akce-archive.html', priority: '0.9', changefreq: 'weekly' },
  { loc: '/blog.html', priority: '0.8', changefreq: 'weekly' },
  { loc: '/team.html', priority: '0.7', changefreq: 'monthly' },
  { loc: '/individualni-kurzy.html', priority: '0.8', changefreq: 'monthly' },
  { loc: '/campy.html', priority: '0.8', changefreq: 'monthly' },
  { loc: '/servis.html', priority: '0.7', changefreq: 'monthly' },
  { loc: '/kontakt.html', priority: '0.6', changefreq: 'yearly' },
];

const BASE = 'https://bikeskills.cz';

function toDate(val) {
  if (!val) return null;
  if (val.toDate) return val.toDate().toISOString().split('T')[0];
  if (typeof val === 'string') return val.split('T')[0];
  return null;
}

function urlEntry(page) {
  const loc = typeof page === 'string' ? page : page.loc;
  const priority = typeof page === 'object' ? (page.priority || '0.5') : '0.5';
  const changefreq = typeof page === 'object' ? (page.changefreq || 'monthly') : 'monthly';
  const lastmod = typeof page === 'object' ? page.lastmod : null;
  let xml = `  <url>\n    <loc>${BASE}${loc}</loc>\n`;
  if (lastmod) xml += `    <lastmod>${lastmod}</lastmod>\n`;
  xml += `    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`;
  return xml;
}

exports.sitemap = functions
  .region('europe-west1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    try {
      const [clankySnap, akceSnap, teamSnap] = await Promise.all([
        db.collection('clanky').get(),
        db.collection('akce').get(),
        db.collection('team').get(),
      ]);

      const entries = STATIC_PAGES.map(urlEntry);

      clankySnap.docs.map(d => d.data())
        .filter(d => d.slug && d.publikovano !== false)
        .forEach(d => entries.push(urlEntry({ loc: `/blog/${d.slug}/`, priority: '0.6', changefreq: 'yearly', lastmod: toDate(d.datum) })));

      akceSnap.docs.map(d => d.data())
        .filter(d => d.slug && d.aktivni !== false)
        .forEach(d => entries.push(urlEntry({ loc: `/akce/${d.slug}/`, priority: '0.7', changefreq: 'monthly' })));

      teamSnap.docs.map(d => d.data())
        .filter(d => d.slug)
        .forEach(d => entries.push(urlEntry({ loc: `/team/${d.slug}/`, priority: '0.5', changefreq: 'yearly' })));

      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('')}</urlset>`;
      res.set('Content-Type', 'application/xml; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=3600');
      res.status(200).send(xml);
    } catch (err) {
      console.error('Sitemap error:', err);
      res.status(500).send('Internal error');
    }
  });

// ============================================================
// SEND RESERVATION (kontaktní formulář pro akce)
// ============================================================
exports.sendReservation = functions
  .region('europe-west1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const { jmenoPrijmeni, email, telefon, termin, typKola, pocet, poznamka, nazevAkce } = req.body || {};

    if (!jmenoPrijmeni || !email) {
      res.status(400).json({ error: 'Chybějí povinné údaje' });
      return;
    }

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) {
      res.status(400).json({ error: 'Neplatný e-mail' });
      return;
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.mail.me.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const adminBody = [
      `Nová přihláška / dotaz: ${nazevAkce || '(neuvedeno)'}`,
      ``,
      `Jméno a příjmení: ${jmenoPrijmeni}`,
      `E-mail: ${email}`,
      `Telefon: ${telefon || '—'}`,
      `Termín kurzu / campu: ${termin || '—'}`,
      `Typ kola: ${typKola || '—'}`,
      `Počet účastníků: ${pocet || '—'}`,
      `Poznámka / dotaz: ${poznamka || '—'}`,
    ].join('\n');

    const clientBody = [
      `Dobrý den ${jmenoPrijmeni.split(' ')[0]},`,
      ``,
      `Váš dotaz / přihláška na akci „${nazevAkce || 'BikeSkills'}" byla úspěšně odeslána.`,
      `Obratem se vám ozveme s dalšími informacemi.`,
      ``,
      `Tým BikeSkills`,
      `https://bikeskills.cz`,
    ].join('\n');

    try {
      await Promise.all([
        transporter.sendMail({
          from: `"BikeSkills rezervace" <${process.env.EMAIL_FROM}>`,
          to: 'cihi@bikeskills.cz',
          subject: `Přihláška: ${nazevAkce || 'akce'} — ${jmenoPrijmeni}`,
          text: adminBody,
        }),
        transporter.sendMail({
          from: `"BikeSkills" <${process.env.EMAIL_FROM}>`,
          to: email,
          subject: `Potvrzení přihlášky: ${nazevAkce || 'BikeSkills'}`,
          text: clientBody,
        }),
      ]);
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Email error:', err);
      res.status(500).json({ error: 'Nepodařilo se odeslat e-mail' });
    }
  });

// ============================================================
// SEND SERVIS FORM (objednávkový formulář — servis.html)
// ============================================================
exports.sendServisForm = functions
  .region('europe-west1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const { jmenoPrijmeni, email, telefon, typServisu, zprava } = req.body || {};

    if (!jmenoPrijmeni || !email) {
      res.status(400).json({ error: 'Chybějí povinné údaje' });
      return;
    }

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) {
      res.status(400).json({ error: 'Neplatný e-mail' });
      return;
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.mail.me.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const adminBody = [
      `Nová zpráva z objednávkového formuláře servis.html`,
      ``,
      `Jméno a příjmení: ${jmenoPrijmeni}`,
      `E-mail: ${email}`,
      `Telefon: ${telefon || '—'}`,
      `Typ servisu: ${typServisu || '—'}`,
      `Zpráva: ${zprava || '—'}`,
    ].join('\n');

    const clientBody = [
      `Dobrý den ${jmenoPrijmeni.split(' ')[0]},`,
      ``,
      `Váš dotaz byl úspěšně odeslán. Jak slezeme z kola, ozveme se vám!`,
      ``,
      `Tým BikeSkills`,
      `https://bikeskills.cz`,
    ].join('\n');

    try {
      await Promise.all([
        transporter.sendMail({
          from: `"BikeSkills servis" <${process.env.EMAIL_FROM}>`,
          to: 'cihi@bikeskills.cz',
          subject: `Objednávkový formulář: ${typServisu || 'dotaz'} — ${jmenoPrijmeni}`,
          text: adminBody,
        }),
        transporter.sendMail({
          from: `"BikeSkills" <${process.env.EMAIL_FROM}>`,
          to: email,
          subject: `Potvrzení dotazu — BikeSkills servis`,
          text: clientBody,
        }),
      ]);
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Email error:', err);
      res.status(500).json({ error: 'Nepodařilo se odeslat e-mail' });
    }
  });

// ============================================================
// PRERENDER ARTICLE DETAIL (auto-regenerace pri editaci)
// ============================================================
//
// Pri kazdem ulozeni clanku v adminu se Firestore trigger postara o smazani
// Storage cache (`prerendered-blog/<slug>/index.html`). Pri pristim requestu
// HTTP function `serveBlogDetail` HTML znovu vygeneruje s aktualnimi daty
// (titulek, popis, og:image z uvodniho obrazku) a ulozi zpet do Storage.
//
// Hosting rewrite `/blog/**` smeruje vsechny detail requesty na tuto function,
// takze se Facebook crawler vzdy dostane k aktualnim Open Graph tagum bez
// nutnosti znovu spoustet `npm run deploy:hosting`.

const bucket = admin.storage().bucket();
const STORAGE_PRERENDER_PATH = (slug) => `prerendered-blog/${slug}/index.html`;
const SITE_URL = 'https://bikeskills.cz';
const DEFAULT_OG_IMAGE = `${SITE_URL}/images/og-image.jpg`;

let _templateCache = null;
let _templateCachedAt = 0;
async function loadDetailTemplate() {
  // Cache 10 minut v pameti instance — Hosting muze byt re-deployovan.
  if (_templateCache && (Date.now() - _templateCachedAt < 10 * 60 * 1000)) return _templateCache;
  const r = await fetch(`${SITE_URL}/detail_post.html`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`detail_post.html fetch ${r.status}`);
  _templateCache = await r.text();
  _templateCachedAt = Date.now();
  return _templateCache;
}

function _escapeAttr(s)  { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }
function _escapeHtml(s)  { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function _plainText(html, max) {
  const text = String(html == null ? '' : html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!max) return text;
  return text.length > max ? text.slice(0, max - 1).trim() + '…' : text;
}
function _resolveStorageUrl(url) {
  if (!url) return url;
  // Odstrani expirujici download token, nech jen ?alt=media (Storage rules public-read).
  const m = String(url).match(/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?]*)\?/);
  if (!m) return url;
  return `https://firebasestorage.googleapis.com/v0/b/${m[1]}/o/${m[2]}?alt=media`;
}
function _setMeta(html, prop, value, by) {
  const attr = by === 'name' ? 'name' : 'property';
  // Webflow generuje <meta content="..." property="...">, my musime obe poradi prepsat.
  const tagRe = new RegExp(`<meta\\b[^>]*\\b${attr}="${prop}"[^>]*>`, 'i');
  const m = html.match(tagRe);
  if (m) {
    const oldTag = m[0];
    let newTag;
    if (/\bcontent="[^"]*"/.test(oldTag)) {
      newTag = oldTag.replace(/\bcontent="[^"]*"/, `content="${_escapeAttr(value)}"`);
    } else {
      newTag = oldTag.replace(/\s*\/?>$/, ` content="${_escapeAttr(value)}">`);
    }
    return html.replace(oldTag, newTag);
  }
  return html.replace(/(<title>[^<]*<\/title>)/, `$1\n  <meta ${attr}="${prop}" content="${_escapeAttr(value)}">`);
}
function _setTitle(html, title) {
  return html.replace(/<title>[^<]*<\/title>/, `<title>${_escapeHtml(title)}</title>`);
}
function _setCanonical(html, url) {
  const re = /<link[^>]*\brel="canonical"[^>]*\bhref="[^"]*"[^>]*>/;
  if (re.test(html)) return html.replace(re, `<link rel="canonical" href="${_escapeAttr(url)}">`);
  return html.replace('</head>', `  <link rel="canonical" href="${_escapeAttr(url)}">\n</head>`);
}

async function buildClanekDetailHtml(d) {
  const slug = d.slug;
  const titulek = d.titulek || '';
  const desc = _plainText(d.popis || d.perex, 160);
  const url = `${SITE_URL}/blog/${slug}/`;
  // Preferujeme uvodni obrazek (admin > "Hlavni obrazek"); fallback prvni z galerie.
  const heroOrig = d.imageUrl || ((d.galerie && d.galerie.length) ? d.galerie[0] : null);
  const hero = heroOrig ? _resolveStorageUrl(heroOrig) : DEFAULT_OG_IMAGE;

  let html = await loadDetailTemplate();
  html = _setTitle(html, `${titulek} | BikeSkills`);
  html = _setMeta(html, 'description', desc, 'name');
  html = _setMeta(html, 'og:title', `${titulek} | BikeSkills`);
  html = _setMeta(html, 'og:description', desc);
  html = _setMeta(html, 'og:image', hero);
  html = _setMeta(html, 'og:url', url);
  html = _setMeta(html, 'og:type', 'article');
  html = _setMeta(html, 'twitter:title', `${titulek} | BikeSkills`);
  html = _setMeta(html, 'twitter:description', desc);
  html = _setMeta(html, 'twitter:image', hero);
  html = _setCanonical(html, url);
  return html;
}

// Firestore trigger: pri zmene clanku smaze Storage cache (lazy regenerate)
exports.onClanekWrite = functions
  .region('europe-west1')
  .firestore.document('clanky/{docId}')
  .onWrite(async (change) => {
    const after = change.after.exists ? change.after.data() : null;
    const before = change.before.exists ? change.before.data() : null;
    const slugsToInvalidate = new Set();
    if (after && after.slug) slugsToInvalidate.add(after.slug);
    if (before && before.slug) slugsToInvalidate.add(before.slug);
    for (const slug of slugsToInvalidate) {
      try {
        await bucket.file(STORAGE_PRERENDER_PATH(slug)).delete({ ignoreNotFound: true });
        console.log(`[onClanekWrite] invalidated ${slug}`);
      } catch (e) {
        console.error(`[onClanekWrite] delete failed for ${slug}:`, e.message);
      }
    }
    return null;
  });

// HTTP: serve detail clanku z Storage cache (s lazy regenerate pri cache miss)
exports.serveBlogDetail = functions
  .region('europe-west1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    // Hosting rewrites smeruji /blog/<slug>/ a /blog/<slug>; obojime extrahujeme slug.
    const m = req.path.match(/^\/blog\/([^\/]+)\/?$/);
    if (!m) { res.status(404).send('Not found'); return; }
    const slug = decodeURIComponent(m[1]);

    const file = bucket.file(STORAGE_PRERENDER_PATH(slug));
    try {
      const [exists] = await file.exists();
      if (exists) {
        const [buf] = await file.download();
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('Cache-Control', 'public, max-age=60, s-maxage=300');
        res.set('X-Prerender-Source', 'storage-cache');
        res.status(200).send(buf);
        return;
      }
    } catch (e) {
      console.warn('[serveBlogDetail] storage read failed:', e.message);
    }

    // Cache miss → vygeneruj a ulož
    try {
      const snap = await db.collection('clanky').where('slug', '==', slug).limit(1).get();
      if (snap.empty) { res.status(404).send('Article not found'); return; }
      const data = snap.docs[0].data();
      if (data.publikovano === false) { res.status(404).send('Article not published'); return; }
      const html = await buildClanekDetailHtml(data);
      // Ulozeni cache async (nechci blokovat response)
      file.save(html, {
        contentType: 'text/html; charset=utf-8',
        metadata: { cacheControl: 'public, max-age=60' }
      }).catch(e => console.error('[serveBlogDetail] cache save failed:', e.message));
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=60, s-maxage=300');
      res.set('X-Prerender-Source', 'on-demand');
      res.status(200).send(html);
    } catch (e) {
      console.error('[serveBlogDetail] generate failed:', e);
      res.status(500).send('Server error');
    }
  });
