const functions = require('firebase-functions');
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
