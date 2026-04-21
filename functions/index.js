const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

admin.initializeApp();
const db = admin.firestore();

const BASE = 'https://bikeskills.cz';
const TODAY = new Date().toISOString().split('T')[0];
const ALLOWED_ORIGINS = ['https://bikeskills.cz', 'http://localhost:5000', 'http://127.0.0.1:5000'];
const DEFAULT_IMAGE = 'https://bikeskills.cz/images/webclip.png';

// Social/SEO bot User-Agent detection
const SOCIAL_BOT_RE = /facebookexternalhit|Twitterbot|LinkedInBot|WhatsApp|Telegrambot|Slackbot|Googlebot|bingbot|DuckDuckBot|Discordbot|Applebot|redditbot|Pinterest|Embedly|Quora|Showyou|Nuzzel|Outbrain|vkShare|W3C_Validator/i;

// HTML templates bundled with function
const TEMPLATES = {
  blog: fs.readFileSync(path.join(__dirname, 'templates/detail_post.html'), 'utf8'),
  akce: fs.readFileSync(path.join(__dirname, 'templates/detail_akce.html'), 'utf8'),
  team: fs.readFileSync(path.join(__dirname, 'templates/detail_archive-team.html'), 'utf8'),
};

function esc(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function stripHtml(str) {
  return (str || '').replace(/<[^>]*>/g, '').trim().substring(0, 300);
}

function injectMeta(html, { title, description, imageUrl, url, type }) {
  const t = esc(title);
  const d = esc(stripHtml(description));
  const img = imageUrl || DEFAULT_IMAGE;
  const fullTitle = t ? `${t} | BikeSkills` : 'BikeSkills — MTB škola kola';

  let h = html;

  // <title>
  h = h.replace(/<title>[^<]*<\/title>/, `<title>${fullTitle}</title>`);

  // og:title — format: <meta content="..." property="og:title">
  h = h.replace(/(<meta content=")[^"]*(" property="og:title">)/, `$1${fullTitle}$2`);
  // og:description
  h = h.replace(/(<meta content=")[^"]*(" property="og:description">)/, `$1${d}$2`);
  // og:type — format: <meta property="og:type" content="...">
  h = h.replace(/(<meta property="og:type" content=")[^"]*(" *\/?>)/, `$1${type || 'website'}$2`);
  // og:url — format: <meta property="og:url" content="">
  h = h.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
  // og:image — replace or inject
  if (h.includes('property="og:image"')) {
    h = h.replace(/(<meta content=")[^"]*(" property="og:image">)/, `$1${img}$2`);
  } else {
    h = h.replace(/(<meta property="og:url"[^>]*>)/, `$1\n  <meta content="${img}" property="og:image">`);
  }

  // twitter:title
  h = h.replace(/(<meta content=")[^"]*(" property="twitter:title">)/, `$1${fullTitle}$2`);
  // twitter:description
  h = h.replace(/(<meta content=")[^"]*(" property="twitter:description">)/, `$1${d}$2`);
  // twitter:image — replace or inject
  if (h.includes('property="twitter:image"')) {
    h = h.replace(/(<meta content=")[^"]*(" property="twitter:image">)/, `$1${img}$2`);
  } else {
    h = h.replace(/(<meta[^>]*name="twitter:card"[^>]*>)/, `$1\n  <meta content="${img}" property="twitter:image">`);
  }

  // canonical
  h = h.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`);

  return h;
}

const STATIC_PAGES = [
  { loc: '/',                                      priority: '1.0', changefreq: 'weekly' },
  { loc: '/akce-archive.html',                     priority: '0.9', changefreq: 'weekly' },
  { loc: '/individualni-kurzy.html',               priority: '0.9', changefreq: 'monthly' },
  { loc: '/campy.html',                            priority: '0.9', changefreq: 'monthly' },
  { loc: '/specialni-akce.html',                   priority: '0.8', changefreq: 'monthly' },
  { loc: '/servis.html',                           priority: '0.8', changefreq: 'monthly' },
  { loc: '/standartni-servis-kol.html',            priority: '0.7', changefreq: 'monthly' },
  { loc: '/kompletni-servis-hardtail.html',        priority: '0.7', changefreq: 'monthly' },
  { loc: '/kompletni-servis-full.html',            priority: '0.7', changefreq: 'monthly' },
  { loc: '/kompletni-cenik-servisnich-praci.html', priority: '0.6', changefreq: 'monthly' },
  { loc: '/shop.html',                             priority: '0.8', changefreq: 'weekly' },
  { loc: '/pujcovna.html',                         priority: '0.7', changefreq: 'monthly' },
  { loc: '/pojisteni-bikeplan.html',               priority: '0.7', changefreq: 'monthly' },
  { loc: '/blog.html',                             priority: '0.8', changefreq: 'weekly' },
  { loc: '/team.html',                             priority: '0.7', changefreq: 'monthly' },
  { loc: '/kontakt.html',                          priority: '0.7', changefreq: 'monthly' },
  { loc: '/obchodni-podminky.html',                priority: '0.3', changefreq: 'yearly' },
  { loc: '/dodaci-podminky.html',                  priority: '0.3', changefreq: 'yearly' },
  { loc: '/zasady-ochrany-osobnich-udaju.html',    priority: '0.3', changefreq: 'yearly' },
];

function toDate(ts) {
  if (!ts) return TODAY;
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toISOString().split('T')[0];
  } catch { return TODAY; }
}

function urlEntry({ loc, priority, changefreq, lastmod }) {
  return [
    '  <url>',
    `    <loc>${BASE}${loc}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    `    <priority>${priority}</priority>`,
    `    <changefreq>${changefreq}</changefreq>`,
    '  </url>',
  ].filter(Boolean).join('\n');
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
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

      clankySnap.docs
        .map(d => d.data())
        .filter(d => d.slug && d.publikovano !== false)
        .forEach(d => entries.push(urlEntry({
          loc: `/blog/${d.slug}/`,
          priority: '0.6',
          changefreq: 'yearly',
          lastmod: toDate(d.datum),
        })));

      akceSnap.docs
        .map(d => d.data())
        .filter(d => d.slug && d.publikovano !== false)
        .forEach(d => entries.push(urlEntry({
          loc: `/akce/${d.slug}/`,
          priority: '0.7',
          changefreq: 'monthly',
          lastmod: toDate(d.datum),
        })));

      teamSnap.docs
        .map(d => d.data())
        .filter(d => d.slug)
        .forEach(d => entries.push(urlEntry({
          loc: `/team/${d.slug}/`,
          priority: '0.6',
          changefreq: 'monthly',
        })));

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

${entries.join('\n\n')}

</urlset>`;

      res.set('Content-Type', 'application/xml');
      res.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');
      res.status(200).send(xml);
    } catch (err) {
      console.error('Sitemap error:', err);
      res.status(500).send('Sitemap generation failed');
    }
  });

exports.sendReservation = functions
  .region('europe-west1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const { jmeno, prijmeni, email, telefon, pedaly, nazevAkce } = req.body || {};

    if (!jmeno || !prijmeni || !email || !nazevAkce) {
      res.status(400).json({ error: 'Chybějí povinné údaje' });
      return;
    }

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) {
      res.status(400).json({ error: 'Neplatný e-mail' });
      return;
    }

    const smtpUser = process.env.EMAIL_USER || '';
    const smtpPass = process.env.EMAIL_PASS || '';
    const smtpFrom = process.env.EMAIL_FROM || smtpUser;

    if (!smtpUser || !smtpPass) {
      console.error('Chybí SMTP konfigurace (EMAIL_USER / EMAIL_PASS)');
      res.status(500).json({ error: 'Chybí konfigurace serveru' });
      return;
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.mail.me.com',
      port: 587,
      secure: false,
      auth: { user: smtpUser, pass: smtpPass },
      tls: { rejectUnauthorized: true },
    });

    const pedalyText = pedaly ? 'Ano — pedály jsou platformy (flat)' : 'Ne / neuveden';
    const jmenoPlne = `${jmeno} ${prijmeni}`;

    const adminHtml = `
<h2 style="color:#222;">Nová přihláška: ${nazevAkce}</h2>
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
  <tr><td style="padding:6px 16px 6px 0;color:#666;">Jméno:</td><td style="padding:6px 0;font-weight:600;">${jmenoPlne}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#666;">E-mail:</td><td style="padding:6px 0;"><a href="mailto:${email}">${email}</a></td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#666;">Telefon:</td><td style="padding:6px 0;">${telefon || 'neuvedeno'}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#666;">Pedály platformy:</td><td style="padding:6px 0;">${pedalyText}</td></tr>
</table>`;

    const clientHtml = `
<div style="font-family:sans-serif;max-width:520px;color:#222;">
  <h2 style="color:#efc101;">Díky za přihlášení!</h2>
  <p>Děkujeme za přihlášení na <strong>${nazevAkce}</strong>.</p>
  <p>Po zpracování přihlášky vás budeme kontaktovat s detaily.</p>
  <p style="margin-top:1.5em;font-size:13px;color:#555;">
    Pokud jste tento mail nedostali nebo máte jakékoliv dotazy, kontaktujte nás na
    <a href="mailto:info@bikeskills.cz" style="color:#efc101;">info@bikeskills.cz</a>.
  </p>
  <p style="margin-top:1.5em;font-size:13px;color:#555;">Tým BikeSkills</p>
</div>`;

    try {
      await Promise.all([
        transporter.sendMail({
          from: `"BikeSkills rezervace" <${smtpFrom}>`,
          to: 'cihi@bikeskills.cz',
          subject: `Nová přihláška: ${nazevAkce} — ${jmenoPlne}`,
          html: adminHtml,
          text: `Nová přihláška: ${nazevAkce}\nJméno: ${jmenoPlne}\nE-mail: ${email}\nTelefon: ${telefon || 'neuvedeno'}\nPedály: ${pedalyText}`,
        }),
        transporter.sendMail({
          from: `"BikeSkills" <${smtpFrom}>`,
          to: email,
          subject: `Potvrzení přihlášky: ${nazevAkce}`,
          html: clientHtml,
          text: `Děkujeme za přihlášení na ${nazevAkce}.\n\nPo zpracování přihlášky vás kontaktujeme s detaily.\n\nPokud byste tento mail nedostali, kontaktujte nás na info@bikeskills.cz.\n\nTým BikeSkills`,
        }),
      ]);
      res.json({ success: true });
    } catch (err) {
      console.error('Chyba odesílání mailu:', err);
      res.status(500).json({ error: 'Chyba při odesílání e-mailu' });
    }
  });

exports.prerender = functions
  .region('europe-west1')
  .runWith({ memory: '256MB', timeoutSeconds: 15 })
  .https.onRequest(async (req, res) => {
    const urlPath = req.path; // e.g. /blog/some-slug/ or /akce/some-slug/
    const ua = req.headers['user-agent'] || '';
    const isBot = SOCIAL_BOT_RE.test(ua);

    // Determine content type from path
    let type, collection, template;
    if (urlPath.startsWith('/blog/')) {
      type = 'blog'; collection = 'clanky';
      template = TEMPLATES.blog;
    } else if (urlPath.startsWith('/akce/')) {
      type = 'akce'; collection = 'akce';
      template = TEMPLATES.akce;
    } else if (urlPath.startsWith('/team/')) {
      type = 'team'; collection = 'team';
      template = TEMPLATES.team;
    } else {
      res.status(404).send('Not found');
      return;
    }

    // Extract slug from path (remove leading /blog/ and trailing /)
    const slug = urlPath.replace(/^\/(blog|akce|team)\//, '').replace(/\/$/, '');

    if (!slug) {
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=60');
      res.status(200).send(template);
      return;
    }

    // For non-bots: serve the static template immediately (JS handles the rest)
    if (!isBot) {
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=300');
      res.status(200).send(template);
      return;
    }

    // For social bots: fetch Firestore data and inject proper meta tags
    try {
      const snap = await db.collection(collection).where('slug', '==', slug).limit(1).get();
      if (snap.empty) {
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.status(200).send(template);
        return;
      }

      const data = snap.docs[0].data();
      const pageUrl = `${BASE}/${type === 'blog' ? 'blog' : type === 'akce' ? 'akce' : 'team'}/${slug}/`;

      let title, description, imageUrl, ogType;

      if (type === 'blog') {
        title = data.titulek || data.nazev || '';
        description = data.perex || data.popis || '';
        imageUrl = data.imageUrl || data.featured_image || '';
        ogType = 'article';
      } else if (type === 'akce') {
        title = data.nazev || '';
        description = data.popis || '';
        imageUrl = data.imageUrl || data.uvodniFoto || '';
        ogType = 'event';
      } else {
        title = data.jmeno || data.name || data.nazev || '';
        description = data.bio || data.popis || '';
        imageUrl = data.imageUrl || data.foto || '';
        ogType = 'profile';
      }

      if (imageUrl && !imageUrl.startsWith('http')) {
        imageUrl = `${BASE}/${imageUrl.replace(/^\//, '')}`;
      }

      const html = injectMeta(template, { title, description, imageUrl, url: pageUrl, type: ogType });

      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');
      res.status(200).send(html);
    } catch (err) {
      console.error('Prerender error:', err);
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(template);
    }
  });
