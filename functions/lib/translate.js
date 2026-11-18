/**
 * Strojový překlad CZ → EN pro administraci (Google Cloud Translation API v2).
 *
 * Volá ho admin (public/js/admin.js) přes HTTPS callable `translateContent`:
 *   { texts: ['…', '…'], format: 'html' | 'text' }  →  { translations: ['…', '…'] }
 *
 * Volat smí jen přihlášený uživatel (stejně jako zápis do Firestore).
 * Účtuje se podle počtu znaků – proto limit na velikost požadavku.
 * Vyžaduje zapnuté Cloud Translation API v projektu bikeskills-web.
 */
const { Translate } = require('@google-cloud/translate').v2;

const MAX_TEXTS = 50;
const MAX_CHARS = 120000; // ~ jeden velmi dlouhý článek
const MAX_PER_CALL = 100000; // limit Translation API v2 na jeden request (~100k bajtů); větší dávky dělíme

let _client = null;
function client() {
  if (!_client) _client = new Translate({ projectId: process.env.GCLOUD_PROJECT || 'bikeskills-web' });
  return _client;
}

// Slova, která se nemají překládat (značky, názvy). Google je v HTML režimu respektuje přes translate="no".
const KEEP = ['BIKESKILLS', 'Bikeskills', 'BikeSkills', 'Trialshow', 'TrialShow', 'TM Servis', 'pumptrack', 'Pumptrack'];
function protect(s, html) {
  if (!html) return s;
  // jen v textu mezi tagy (ne v atributech – URL obrázků apod.)
  return s.split(/(<[^>]*>)/).map(part => {
    if (part.charAt(0) === '<') return part;
    let out = part;
    for (const w of KEEP) {
      out = out.replace(new RegExp(`(^|[^\\w])(${w.replace(/ /g, '\\s')})(?!\\w)`, 'g'), (m, pre, word) => `${pre}<span translate="no">${word}</span>`);
    }
    return out;
  }).join('');
}
function unprotect(s) {
  return s.replace(/<span translate="no">([^<]*)<\/span>/g, '$1');
}

/** Přeloží pole textů; zachová pořadí a prázdné položky. */
async function translateTexts(texts, format) {
  const html = format !== 'text';
  const out = new Array(texts.length).fill('');
  const idx = [];
  const src = [];
  texts.forEach((t, i) => {
    if (typeof t === 'string' && t.trim()) { idx.push(i); src.push(protect(t, html)); }
    else out[i] = typeof t === 'string' ? t : '';
  });
  // dávky do ~100k znaků
  let batch = [], batchIdx = [], size = 0;
  const flush = async () => {
    if (!batch.length) return;
    const [res] = await client().translate(batch, { from: 'cs', to: 'en', format: html ? 'html' : 'text' });
    const arr = Array.isArray(res) ? res : [res];
    arr.forEach((r, k) => { out[batchIdx[k]] = html ? unprotect(r) : r; });
    batch = []; batchIdx = []; size = 0;
  };
  for (let k = 0; k < src.length; k++) {
    if (size + src[k].length > MAX_PER_CALL && batch.length) await flush();
    batch.push(src[k]); batchIdx.push(idx[k]); size += src[k].length;
  }
  await flush();
  return out;
}

function validate(data) {
  const texts = data && data.texts;
  if (!Array.isArray(texts) || !texts.length) return 'Chybí texty k překladu.';
  if (texts.length > MAX_TEXTS) return `Najednou lze přeložit max. ${MAX_TEXTS} textů.`;
  const chars = texts.reduce((n, t) => n + (typeof t === 'string' ? t.length : 0), 0);
  if (chars > MAX_CHARS) return `Text je příliš dlouhý (${chars} znaků, max. ${MAX_CHARS}).`;
  return null;
}

module.exports = { translateTexts, validate };
