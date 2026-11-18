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
// SITEMAP – /sitemap.xml (Hosting rewrite). Statické stránky + články, akce a tým
// z Firestore v obou jazycích s hreflang alternativami. Nová položka nebo její EN
// překlad se v sitemapě objeví hned po uložení v adminu (cache 1 h).
// ============================================================
const { buildSitemapXml } = require('./lib/sitemap');
exports.sitemap = functions
  .region('europe-west1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    try {
      const xml = await buildSitemapXml(db);
      res.set('Content-Type', 'application/xml; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');
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

    const { jmenoPrijmeni, email, telefon, termin, typKola, pocet, poznamka, nazevAkce, lang } = req.body || {};
    const isEn = lang === 'en';

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
      `Nová přihláška / dotaz: ${nazevAkce || '(neuvedeno)'}${isEn ? '  [EN web]' : ''}`,
      ``,
      `Jméno a příjmení: ${jmenoPrijmeni}`,
      `E-mail: ${email}`,
      `Telefon: ${telefon || '—'}`,
      `Termín kurzu / campu: ${termin || '—'}`,
      `Typ kola: ${typKola || '—'}`,
      `Počet účastníků: ${pocet || '—'}`,
      `Poznámka / dotaz: ${poznamka || '—'}`,
    ].join('\n');

    const clientBody = isEn ? [
      `Hello ${jmenoPrijmeni.split(' ')[0]},`,
      ``,
      `Your enquiry / registration for „${nazevAkce || 'BikeSkills'}" has been sent successfully.`,
      `We will get back to you shortly with more information.`,
      ``,
      `The BikeSkills team`,
      `https://bikeskills.cz/en`,
    ].join('\n') : [
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
          subject: `${isEn ? '[EN] ' : ''}Přihláška: ${nazevAkce || 'akce'} — ${jmenoPrijmeni}`,
          text: adminBody,
        }),
        transporter.sendMail({
          from: `"BikeSkills" <${process.env.EMAIL_FROM}>`,
          to: email,
          subject: isEn ? `Registration confirmation: ${nazevAkce || 'BikeSkills'}` : `Potvrzení přihlášky: ${nazevAkce || 'BikeSkills'}`,
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

    const { jmenoPrijmeni, email, telefon, typServisu, zprava, lang } = req.body || {};
    const isEn = lang === 'en';

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
      `Nová zpráva z objednávkového formuláře servis.html${isEn ? '  [EN web]' : ''}`,
      ``,
      `Jméno a příjmení: ${jmenoPrijmeni}`,
      `E-mail: ${email}`,
      `Telefon: ${telefon || '—'}`,
      `Typ servisu: ${typServisu || '—'}`,
      `Zpráva: ${zprava || '—'}`,
    ].join('\n');

    const clientBody = isEn ? [
      `Hello ${jmenoPrijmeni.split(' ')[0]},`,
      ``,
      `Your enquiry has been sent successfully. We'll get back to you as soon as we're off the bike!`,
      ``,
      `The BikeSkills team`,
      `https://bikeskills.cz/en`,
    ].join('\n') : [
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
          subject: `${isEn ? '[EN] ' : ''}Objednávkový formulář: ${typServisu || 'dotaz'} — ${jmenoPrijmeni}`,
          text: adminBody,
        }),
        transporter.sendMail({
          from: `"BikeSkills" <${process.env.EMAIL_FROM}>`,
          to: email,
          subject: isEn ? `Enquiry confirmation — BikeSkills bike service` : `Potvrzení dotazu — BikeSkills servis`,
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
// v2 = HTML včetně textu článku (dřív jen meta). Nová cesta = stará cache se automaticky nepoužije.
// v12 = mezery v mobilním zápatí
// cs: prerendered-blog-v13/<csSlug>/index.html · en: prerendered-blog-v13/en/<enSlug>/index.html
const STORAGE_PRERENDER_PATH = (slug, lang) => `prerendered-blog-v13/${lang === 'en' ? 'en/' : ''}${slug}/index.html`;
const { prerenderClanekDetail } = require('./lib/clanek-detail');
const { enOf, localize } = require('./lib/en-fields');
const SITE_URL = 'https://bikeskills.cz';
const DEFAULT_OG_IMAGE = `${SITE_URL}/images/og-image.jpg`;

// Šablony detailu z Hostingu (cs: detail_post.html, en: en/blog-post.html).
// Cache 10 minut v pameti instance — Hosting muze byt re-deployovan.
const _tpl = {};
async function loadDetailTemplate(lang) {
  const key = lang === 'en' ? 'en' : 'cs';
  const c = _tpl[key];
  if (c && (Date.now() - c.at < 10 * 60 * 1000)) return c.html;
  const r = await fetch(`${SITE_URL}/${key === 'en' ? 'en/blog-post.html' : 'detail_post.html'}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`detail template (${key}) fetch ${r.status}`);
  const html = await r.text();
  _tpl[key] = { html, at: Date.now() };
  return html;
}

async function buildClanekDetailHtml(d, lang) {
  // Plný detail: meta + JSON-LD + titulek, datum, autor, text a hlavní obrázek přímo v HTML
  // (dřív jen meta – text doplňoval až JavaScript, SeznamBot ho neviděl).
  const template = await loadDetailTemplate(lang);
  if (lang === 'en') return prerenderClanekDetail(template, localize('clanky', d), 'en');
  const en = enOf('clanky', d);
  return prerenderClanekDetail(template, en ? Object.assign({}, d, { enSlug: en.slug }) : d, 'cs');
}

// Firestore trigger: pri zmene clanku smaze Storage cache (lazy regenerate) – CZ i EN verzi
exports.onClanekWrite = functions
  .region('europe-west1')
  .firestore.document('clanky/{docId}')
  .onWrite(async (change) => {
    const after = change.after.exists ? change.after.data() : null;
    const before = change.before.exists ? change.before.data() : null;
    const paths = new Set();
    for (const d of [after, before]) {
      if (!d) continue;
      if (d.slug) paths.add(STORAGE_PRERENDER_PATH(d.slug, 'cs'));
      if (d.slug_en) paths.add(STORAGE_PRERENDER_PATH(d.slug_en, 'en'));
    }
    for (const p of paths) {
      try {
        await bucket.file(p).delete({ ignoreNotFound: true });
        console.log(`[onClanekWrite] invalidated ${p}`);
      } catch (e) {
        console.error(`[onClanekWrite] delete failed for ${p}:`, e.message);
      }
    }
    return null;
  });

// HTTP: serve detail clanku z Storage cache (s lazy regenerate pri cache miss)
//   /blog/<csSlug>/  → česká verze
//   /en/blog/<enSlug> → anglická verze (dokument se hledá podle slug_en)
exports.serveBlogDetail = functions
  .region('europe-west1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    const m = req.path.match(/^\/(en\/)?blog\/([^\/]+)\/?$/);
    if (!m) { res.status(404).send('Not found'); return; }
    const lang = m[1] ? 'en' : 'cs';
    const slug = decodeURIComponent(m[2]);

    const file = bucket.file(STORAGE_PRERENDER_PATH(slug, lang));
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
      const snap = await db.collection('clanky').where(lang === 'en' ? 'slug_en' : 'slug', '==', slug).limit(1).get();
      const data = snap.empty ? null : snap.docs[0].data();
      if (!data || data.publikovano === false || (lang === 'en' && !enOf('clanky', data))) {
        await send404(res, lang);
        return;
      }
      const html = await buildClanekDetailHtml(data, lang);
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

async function send404(res, lang) {
  let body = lang === 'en' ? 'Article not found' : 'Článek nenalezen';
  try {
    const r = await fetch(`${SITE_URL}/${lang === 'en' ? 'en/404.html' : '404.html'}`);
    if (r.ok) body = await r.text();
  } catch (_) {}
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=60');
  res.status(404).send(body);
}

// ============================================================
// TRANSLATE CONTENT (admin: tlačítko „Přeložit do AJ" a automatický překlad při uložení)
// ============================================================
const translate = require('./lib/translate');
exports.translateContent = functions
  .region('europe-west1')
  .runWith({ memory: '256MB', timeoutSeconds: 120 })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Přihlaste se do administrace.');
    const err = translate.validate(data);
    if (err) throw new functions.https.HttpsError('invalid-argument', err);
    try {
      const translations = await translate.translateTexts(data.texts, data.format === 'text' ? 'text' : 'html');
      return { translations };
    } catch (e) {
      console.error('[translateContent]', e);
      const msg = /has not been used|is disabled|SERVICE_DISABLED/i.test(e.message || '')
        ? 'Cloud Translation API není v projektu zapnuté.'
        : 'Překlad se nepovedl: ' + (e.message || e);
      throw new functions.https.HttpsError('internal', msg);
    }
  });

// ============================================================
// RESIZE IMAGES (náhrada extension storage-resize-images, v2, europe-west3)
// ============================================================
exports.resizeImages = require('./resize-images').resizeImages;
