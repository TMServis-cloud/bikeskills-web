/**
 * Mapování odkazů CZ → EN (stránky, blog, akce, tým, shop).
 * Slugy blogu/akcí bere z translations/slugs.json ({ blog: {cs: en}, akce: {cs: en} }).
 */
const fs = require('fs'), path = require('path');
const PAGES = require('./pages');
const BASE_URL = 'https://bikeskills.cz';
const slugsPath = path.join(__dirname, '../../translations/slugs.json');
let SLUGS = { blog: {}, akce: {} };
function reloadSlugs() { SLUGS = fs.existsSync(slugsPath) ? JSON.parse(fs.readFileSync(slugsPath)) : { blog: {}, akce: {} }; SLUGS.blog = SLUGS.blog || {}; SLUGS.akce = SLUGS.akce || {}; }
reloadSlugs();

const csToEn = {}; const enToCs = {};
for (const p of PAGES) { csToEn[p.cs] = p.en; enToCs[p.en] = p.cs; }

function csPagePath(p) { return p.cs === 'index' ? '/' : '/' + p.cs; }
function enPagePath(p) { return p.en === 'index' ? '/en' : '/en/' + p.en; }

const SHOP = 'https://shop.bikeskills.cz';
const SHOP_ACCOUNT = { 'muj-ucet': 'my-account', 'historie-objednavek': 'order-history', 'obnova-hesla': 'password-recovery', 'prihlasit': 'login', 'kosik': 'cart', 'sleva': 'discount' };

function shopToEn(url) {
  const m = url.match(/^https?:\/\/shop\.bikeskills\.cz(\/[^#?]*)?(\?[^#]*)?(#.*)?$/i);
  if (!m) return url;
  let p = (m[1] || '/').replace(/^\/+/, '');
  let hash = m[3] || '';
  if (p.startsWith('download/') || p.startsWith('img/') || p.startsWith('modules/')) return url;
  p = p.replace(/^(cs|en)\//, '').replace(/^(cs|en)$/, '');
  const first = p.split('/')[0];
  if (SHOP_ACCOUNT[decodeURIComponent(first)]) p = SHOP_ACCOUNT[decodeURIComponent(first)] + p.slice(first.length);
  // varianta voucheru — atributy mají v EN jiné názvy
  hash = hash.replace('42-hodnota_voucheru-', '42-voucher_value-').replace('54-typ_pdf_nebo_doruceni-bezne_pdf', '54-pdf_type_or_delivery-regular_pdf');
  p = p.replace(/^209--super-vyprodej/, '209-super-sale').replace(/^202-bikeskills-produkty/, '202-bikeskills-products').replace(/^266-brzdy/, '266-brakes');
  return `${SHOP}/en/${p}${m[2] || ''}${hash}`;
}

/** Převede interní/absolutní URL z CZ stránky na EN. Vrací null, pokud se nemá měnit. */
function linkToEn(href) {
  if (!href) return null;
  if (/^mailto:/i.test(href)) {
    const r = href.replace('subject=Dotaz%20pro%20Bikeskills%20t%C3%BDm', 'subject=Question%20for%20the%20Bikeskills%20team');
    return r === href ? null : r;
  }
  if (/^(tel:|#|javascript:|data:)/i.test(href)) return null;
  if (/^https?:\/\/shop\.bikeskills\.cz/i.test(href)) return shopToEn(href);
  let url = href, abs = false;
  const mm = href.match(/^https?:\/\/(?:www\.)?bikeskills\.cz(\/.*)?$/i);
  if (mm) { url = mm[1] || '/'; abs = true; }
  else if (/^[a-z]+:/i.test(href) || href.startsWith('//')) return null;
  const hm = url.match(/^([^#?]*)([?#].*)?$/); let p = hm[1]; const rest = hm[2] || '';
  if (p.startsWith('/en/') || p === '/en') return null;
  const out = (np) => (abs ? BASE_URL : '') + np + rest;
  const bare = p.replace(/^\//, '').replace(/\.html$/, '').replace(/\/$/, '');
  if (p === '/' || bare === '' || bare === 'index') return out('/en');
  if (/^(shop|shop-kategorie|produkt)(\/|$)/.test(bare)) {
    if (/voucher/.test(bare)) return 'https://shop.bikeskills.cz/en/100-sport/5286-243-voucher-bikeskills-pro-individualni-kurzy.html';
    return 'https://shop.bikeskills.cz/en/';
  }
  const ALIAS = { 'ochrana-osobnich-udaju': 'zasady-ochrany-osobnich-udaju', 'akce': 'akce-archive', 'kontakty': 'kontakt' };
  if (ALIAS[bare]) return out('/en/' + csToEn[ALIAS[bare]]);
  if (csToEn[bare] && !PAGES.find(x => x.cs === bare).template) return out('/en/' + csToEn[bare]);
  let m;
  if ((m = bare.match(/^blog\/([^/]+)$/))) return out('/en/blog/' + (SLUGS.blog[m[1]] || m[1]));
  if ((m = bare.match(/^akce\/([^/]+)$/))) return out('/en/events/' + (SLUGS.akce[m[1]] || m[1]));
  if ((m = bare.match(/^team\/([^/]+)$/))) return out('/en/team/' + m[1]);
  return null;
}

/** Relativní cesta k assetu → absolutní (EN stránky leží v /en/). */
function assetAbs(v) {
  if (!v || /^(\/|#|[a-z]+:|\{|\$)/i.test(v)) return v;
  if (/^(css|js|images|fonts|documents|wp-content)\//.test(v)) return '/' + v;
  return v;
}

module.exports = { PAGES, BASE_URL, csToEn, enToCs, csPagePath, enPagePath, linkToEn, shopToEn, assetAbs, reloadSlugs, get SLUGS() { return SLUGS; } };
