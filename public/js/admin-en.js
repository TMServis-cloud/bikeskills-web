/**
 * BIKESKILLS Admin – anglická verze obsahu (články, akce, tým)
 *
 * Anglické texty se ukládají do stejného dokumentu jako české, do polí *_en
 * (viz functions/lib/en-fields.js). Překládá Cloud Function `translateContent`
 * (Google Cloud Translation API).
 *
 * Chování při uložení:
 *  - EN verze neexistuje            → automaticky se přeloží z češtiny,
 *  - strojový překlad + změna CZ    → automaticky se přeloží znovu (slug zůstává),
 *  - ručně upravený překlad          → nepřepisuje se; při změně CZ jen upozornění,
 *  - tlačítko „Přeložit do AJ"       → přeloží hned a výsledek ukáže ve formuláři.
 *
 * Napojení v admin.js: AdminEN.init(), AdminEN.reset(col), AdminEN.fill(col, data),
 * await AdminEN.collect(col, csData, docId) → pole *_en ke sloučení do ukládaných dat.
 */
(function () {
  'use strict';

  // ---- definice (shodné s functions/lib/en-fields.js a en-src.js) ----
  const SRC_FIELDS = { clanky: ['titulek', 'perex', 'obsah'], akce: ['nazev', 'popis', 'uroven', 'datumText'], team: ['popis'] };
  const EN_KEY = { clanky: 'titulek', akce: 'nazev', team: 'popis' };
  const STATUS_EN = { otevreno: 'Open', prihlasujte: 'Registration open', obsazeno: 'Fully booked', odjeto: 'Finished' };
  const KATEGORIE_EN = { camp: 'Camp', kurz: 'Course', trialovy: 'Trial course', deti: 'Kids course', workshop: 'Workshop', jine: 'Other' };

  // Pole EN sekce. src = odkud se bere čeština (id inputu nebo 'quill:<proměnná>'), fmt = formát překladu.
  const CFG = {
    clanky: {
      form: 'form-clanek', idp: 'clanek-en', urlBase: '/en/blog/',
      fields: [
        { f: 'titulek', label: 'Titulek (EN)', type: 'text', src: 'clanek-titulek', fmt: 'text' },
        { f: 'perex', label: 'Perex (EN)', type: 'textarea', src: 'clanek-perex', fmt: 'text' },
        { f: 'obsah', label: 'Obsah článku (EN)', type: 'quill', src: 'quill:quillEditor', fmt: 'html', folder: 'blog/content' },
        { f: 'slug', label: 'Slug (EN URL)', type: 'text', hint: 'prázdné = vytvoří se z anglického titulku; po zveřejnění raději neměňte' },
        { f: 'metaTitle', label: 'SEO title (EN)', type: 'text', hint: 'vyplní se při překladu; max. 60 znaků', counter: 60 },
        { f: 'metaDescription', label: 'SEO description (EN)', type: 'textarea', hint: 'vyplní se při překladu z perexu; max. 160 znaků', counter: 160 },
      ],
    },
    akce: {
      form: 'form-akce', idp: 'akce-en', urlBase: '/en/events/',
      fields: [
        { f: 'nazev', label: 'Název akce (EN)', type: 'text', src: 'akce-nazev', fmt: 'text' },
        { f: 'datumText', label: 'Datum (EN)', type: 'text', src: 'akce-datum', fmt: 'text', half: true },
        { f: 'uroven', label: 'Úroveň (EN)', type: 'text', src: 'akce-uroven', fmt: 'text', half: true },
        { f: 'popis', label: 'Popis akce (EN)', type: 'quill', src: 'quill:quillAkcePopis', fmt: 'html', folder: 'akce/content' },
        { f: 'slug', label: 'Slug (EN URL)', type: 'text', hint: 'prázdné = vytvoří se z anglického názvu + rok; po zveřejnění raději neměňte' },
        { f: 'metaTitle', label: 'SEO title (EN)', type: 'text', hint: 'vyplní se při překladu; max. 60 znaků', counter: 60 },
        { f: 'metaDescription', label: 'SEO description (EN)', type: 'textarea', hint: 'vyplní se při překladu z popisu; max. 160 znaků', counter: 160 },
      ],
    },
    team: {
      form: 'form-team', idp: 'team-en', urlBase: '/en/team/',
      fields: [
        { f: 'popis', label: 'Biografie / popis (EN)', type: 'quill', src: 'quill:quillTeamPopis', fmt: 'html', folder: 'team/content' },
      ],
    },
  };

  const quills = {};          // col → Quill instance EN editoru
  const state = {};           // col → { loaded, raw, formHash, translatedNow }
  let translateFn = null;

  // ---------------- helpers ----------------
  function $(id) { return document.getElementById(id); }
  function plain(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  }
  function enSrcHash(col, d) {
    const str = SRC_FIELDS[col].map(f => plain(d[f])).join('\u0001');
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }
  function quillByName(name) {
    // proměnné z admin.js (let na nejvyšší úrovni → sdílený globální scope)
    try { return { quillEditor, quillAkcePopis, quillTeamPopis }[name] || null; } catch (_) { return null; }
  }
  function quillHtml(q) {
    if (!q) return '';
    const h = q.root.innerHTML;
    return (h === '<p><br></p>' || !plain(h)) ? '' : h;
  }
  function slugify(s) {
    return (typeof generateSlug === 'function' ? generateSlug(String(s || '')) : String(s || '').toLowerCase())
      .replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-+$/, '');
  }
  /** Zkrátí text na max znaků na hranici slova (s „…"). */
  function clip(s, max) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (s.length <= max) return s;
    const cut = s.slice(0, max - 1).replace(/[\s,;:.\-–]+\S*$/, '');
    return (cut || s.slice(0, max - 1)).replace(/[\s,;:.\-–]+$/, '') + '…';
  }
  function toast(msg, type) { if (typeof showToast === 'function') showToast(msg, type); else console.log(msg); }

  /** Aktuální české hodnoty z formuláře (jen pole, která se překládají). */
  function readCs(col) {
    const out = {};
    for (const fd of CFG[col].fields) {
      if (!fd.src) continue;
      if (fd.src.indexOf('quill:') === 0) out[fd.f] = quillHtml(quillByName(fd.src.slice(6)));
      else out[fd.f] = ($(fd.src) && $(fd.src).value || '').trim();
    }
    return out;
  }
  function readEn(col) {
    const out = {};
    for (const fd of CFG[col].fields) {
      if (fd.type === 'quill') out[fd.f] = quillHtml(quills[col]);
      else out[fd.f] = ($(`${CFG[col].idp}-${fd.f}`).value || '').trim();
    }
    return out;
  }
  function writeEn(col, en) {
    for (const fd of CFG[col].fields) {
      if (!(fd.f in en)) continue;
      const v = en[fd.f] || '';
      if (fd.type === 'quill') { if (quills[col]) { if (v) quills[col].root.innerHTML = v; else quills[col].setContents([]); } }
      else $(`${CFG[col].idp}-${fd.f}`).value = v;
    }
    updateCounters(col);
  }
  function sameEn(a, b) {
    return Object.keys(a).every(k => plain(a[k]) === plain(b[k]) && (k !== 'slug' || a[k] === b[k]));
  }

  // ---------------- odkazy v přeloženém obsahu → EN stránky ----------------
  const PAGES_EN = {
    '': '/en', 'index': '/en', 'individualni-kurzy': '/en/individual-courses', 'campy': '/en/camps', 'akce-archive': '/en/courses-and-events',
    'akce': '/en/courses-and-events', 'specialni-akce': '/en/special-events', 'servis': '/en/bike-service',
    'standartni-servis-kol': '/en/standard-bike-service', 'kompletni-servis-hardtail': '/en/complete-service-hardtail',
    'kompletni-servis-full': '/en/complete-service-full-suspension', 'kompletni-cenik-servisnich-praci': '/en/service-price-list',
    'pujcovna': '/en/e-bike-rental', 'team': '/en/team', 'blog': '/en/blog', 'kontakt': '/en/contact', 'kontakty': '/en/contact',
    'obchodni-podminky': '/en/terms-and-conditions', 'dodaci-podminky': '/en/delivery-terms',
    'zasady-ochrany-osobnich-udaju': '/en/privacy-policy', 'ochrana-osobnich-udaju': '/en/privacy-policy',
  };
  const SHOP_ACCOUNT = { 'muj-ucet': 'my-account', 'historie-objednavek': 'order-history', 'obnova-hesla': 'password-recovery', 'prihlasit': 'login', 'kosik': 'cart', 'sleva': 'discount' };
  const slugCache = { clanky: {}, akce: {} };
  async function enSlugOf(col, csSlug) {
    if (csSlug in slugCache[col]) return slugCache[col][csSlug];
    let v = null;
    try {
      const snap = await db.collection(col).where('slug', '==', csSlug).limit(1).get();
      if (!snap.empty) v = snap.docs[0].data().slug_en || null;
    } catch (_) {}
    return (slugCache[col][csSlug] = v);
  }
  function shopToEn(url) {
    const m = url.match(/^https?:\/\/shop\.bikeskills\.cz(\/[^#?]*)?(\?[^#]*)?(#.*)?$/i);
    if (!m) return url;
    let p = (m[1] || '/').replace(/^\/+/, '');
    if (/^(download|img|modules)\//.test(p)) return url;
    p = p.replace(/^(cs|en)\//, '').replace(/^(cs|en)$/, '');
    const first = p.split('/')[0];
    if (SHOP_ACCOUNT[decodeURIComponent(first)]) p = SHOP_ACCOUNT[decodeURIComponent(first)] + p.slice(first.length);
    const hash = (m[3] || '').replace('42-hodnota_voucheru-', '42-voucher_value-').replace('54-typ_pdf_nebo_doruceni-bezne_pdf', '54-pdf_type_or_delivery-regular_pdf');
    p = p.replace(/^209--super-vyprodej/, '209-super-sale').replace(/^202-bikeskills-produkty/, '202-bikeskills-products').replace(/^266-brzdy/, '266-brakes');
    return `https://shop.bikeskills.cz/en/${p}${m[2] || ''}${hash}`;
  }
  async function linkToEn(href) {
    if (!href || /^(mailto:|tel:|#|javascript:|data:)/i.test(href)) return href;
    if (/^https?:\/\/shop\.bikeskills\.cz/i.test(href)) return shopToEn(href);
    let url = href, abs = '';
    const mm = href.match(/^https?:\/\/(?:www\.)?bikeskills\.cz(\/.*)?$/i);
    if (mm) { url = mm[1] || '/'; abs = 'https://bikeskills.cz'; }
    else if (/^[a-z]+:/i.test(href) || href.indexOf('//') === 0) return href;
    const hm = url.match(/^([^#?]*)([?#].*)?$/); const rest = hm[2] || '';
    if (/^\/en(\/|$)/.test(hm[1])) return href;
    const bare = hm[1].replace(/^\//, '').replace(/\.html$/, '').replace(/\/$/, '');
    if (bare in PAGES_EN) return abs + PAGES_EN[bare] + rest;
    let m;
    if ((m = bare.match(/^blog\/([^/]+)$/))) { const s = await enSlugOf('clanky', m[1]); return s ? abs + '/en/blog/' + s + rest : href; }
    if ((m = bare.match(/^akce\/([^/]+)$/))) { const s = await enSlugOf('akce', m[1]); return s ? abs + '/en/events/' + s + rest : href; }
    if ((m = bare.match(/^team\/([^/]+)$/))) return abs + '/en/team/' + m[1] + rest;
    return href;
  }
  async function rewriteLinksEn(html) {
    if (!html || html.indexOf('href') < 0) return html;
    const doc = new DOMParser().parseFromString('<div id="bs-r">' + html + '</div>', 'text/html');
    for (const a of doc.querySelectorAll('a[href]')) {
      const en = await linkToEn(a.getAttribute('href'));
      if (en && en !== a.getAttribute('href')) a.setAttribute('href', en);
    }
    return doc.getElementById('bs-r').innerHTML;
  }

  // ---------------- překlad ----------------
  async function callTranslate(texts, format) {
    if (!texts.length) return [];
    if (!translateFn) throw new Error('Překladová služba není dostupná.');
    const res = await translateFn({ texts, format });
    return res.data.translations;
  }
  /** Přeloží zdrojová CZ pole; vrací { pole: text } (bez slugu a SEO). */
  async function translateCs(col, cs) {
    const textF = [], htmlF = [];
    for (const fd of CFG[col].fields) if (fd.src && cs[fd.f]) (fd.fmt === 'html' ? htmlF : textF).push(fd.f);
    const [tt, th] = await Promise.all([
      callTranslate(textF.map(f => cs[f]), 'text'),
      callTranslate(htmlF.map(f => cs[f]), 'html'),
    ]);
    const out = {};
    textF.forEach((f, i) => { out[f] = (tt[i] || '').trim(); });
    for (let i = 0; i < htmlF.length; i++) out[htmlF[i]] = await rewriteLinksEn(th[i] || '');
    for (const fd of CFG[col].fields) if (fd.src && !(fd.f in out)) out[fd.f] = '';
    // SEO title / description (EN) – odvozené z přeloženého titulku a perexu / popisu
    if (col !== 'team') {
      out.metaTitle = clip(out[EN_KEY[col]], 60);
      out.metaDescription = clip(plain(col === 'clanky' ? (out.perex || out.obsah) : out.popis), 160);
    }
    return out;
  }
  function errMsg(e) {
    const m = (e && (e.message || e.details)) || String(e);
    return /not-found|internal/i.test(e && e.code || '') && !m ? 'Překladová funkce neodpověděla.' : m;
  }

  async function uniqueSlug(col, wanted, docId) {
    let base = slugify(wanted) || 'item';
    let s = base, i = 2;
    for (;;) {
      const snap = await db.collection(col).where('slug_en', '==', s).limit(2).get();
      if (!snap.docs.some(d => d.id !== docId)) return s;
      s = `${base}-${i++}`;
    }
  }

  // ---------------- UI ----------------
  function fieldHtml(col, fd) {
    const id = `${CFG[col].idp}-${fd.f}`;
    const hint = fd.hint ? ` <span class="label-hint">(${fd.hint})</span>` : '';
    const counter = fd.counter ? ` <span class="seo-counter en-counter" id="${id}-count" data-max="${fd.counter}"></span>` : '';
    let input;
    if (fd.type === 'quill') input = `<div id="${id}-editor" class="quill-editor quill-editor-en"></div>`;
    else if (fd.type === 'textarea') input = `<textarea id="${id}" rows="2"></textarea>`;
    else input = `<input type="text" id="${id}"${fd.f === 'slug' ? ' spellcheck="false"' : ''}>`;
    return `<div class="form-group${fd.half ? '' : ''}"><label for="${id}">${fd.label}${hint}${counter}</label>${input}</div>`;
  }
  function buildSection(col) {
    const c = CFG[col];
    const form = $(c.form); if (!form || $(`${c.idp}-section`)) return;
    const det = document.createElement('details');
    det.className = 'en-section'; det.id = `${c.idp}-section`;
    const halves = c.fields.filter(f => f.half), rest = c.fields.filter(f => !f.half);
    let body = '';
    for (const fd of rest) {
      if (fd === rest.find(f => f.type === 'quill') && halves.length) body += `<div class="form-row">${halves.map(h => fieldHtml(col, h)).join('')}</div>`;
      body += fieldHtml(col, fd);
    }
    det.innerHTML = `
      <summary><span class="en-flag">EN</span> Anglická verze <span class="en-status" id="${c.idp}-status"></span></summary>
      <div class="en-body">
        <div class="en-toolbar">
          <button type="button" class="btn btn-ghost btn-sm" id="${c.idp}-translate">🌐 Přeložit do AJ</button>
          <a class="en-view" id="${c.idp}-view" target="_blank" rel="noopener" style="display:none">Zobrazit na webu ↗</a>
          <span class="en-note" id="${c.idp}-note"></span>
        </div>
        ${body}
      </div>`;
    const actions = form.querySelector('.modal-actions');
    form.insertBefore(det, actions);

    const qf = c.fields.find(f => f.type === 'quill');
    if (qf && window.Quill) {
      const opts = window.__bsQuillOpts || {};
      quills[col] = new Quill(`#${c.idp}-${qf.f}-editor`, {
        theme: 'snow',
        modules: { toolbar: { container: opts.toolbar || [['bold', 'italic'], ['link'], ['clean']], handlers: {} } },
        placeholder: 'Anglický text…',
      });
      if (opts.imageHandler) quills[col].getModule('toolbar').addHandler('image', opts.imageHandler(quills[col], qf.folder));
      if (typeof attachHtmlSourceButton === 'function') attachHtmlSourceButton(quills[col]);
    }
    $(`${c.idp}-translate`).addEventListener('click', () => onTranslateClick(col));
    for (const fd of c.fields) if (fd.counter) $(`${c.idp}-${fd.f}`).addEventListener('input', () => updateCounters(col));
  }
  function updateCounters(col) {
    for (const fd of CFG[col].fields) {
      if (!fd.counter) continue;
      const el = $(`${CFG[col].idp}-${fd.f}-count`); if (!el) continue;
      const n = ($(`${CFG[col].idp}-${fd.f}`).value || '').length;
      el.textContent = n ? `${n}/${fd.counter}` : '';
      el.classList.toggle('over', n > fd.counter);
    }
  }
  function setStatus(col) {
    const st = state[col] || {}; const raw = st.raw || {};
    const el = $(`${CFG[col].idp}-status`); const note = $(`${CFG[col].idp}-note`); const view = $(`${CFG[col].idp}-view`);
    const has = !!raw[EN_KEY[col] + '_en'];
    let txt, cls;
    if (!has) { txt = 'zatím není – přeloží se automaticky při uložení'; cls = 'none'; }
    else if (raw.en_auto === false) { txt = 'upraveno ručně'; cls = 'manual'; }
    else { txt = 'strojový překlad'; cls = 'auto'; }
    if (has && raw.en_src && raw.en_src !== enSrcHash(col, raw)) { txt += ' · ⚠️ čeština se od překladu změnila'; cls += ' stale'; }
    el.textContent = txt; el.className = 'en-status ' + cls;
    note.textContent = has
      ? (raw.en_auto === false ? 'Ruční úpravy se při změně češtiny nepřepisují.' : 'Při změně češtiny se při uložení přeloží znovu. Když text upravíte, zůstane vaše verze.')
      : '';
    const enSlug = col === 'team' ? (has && raw.slug) : raw.slug_en;
    if (has && enSlug && (col === 'team' ? raw.aktivni !== false : true)) { view.href = CFG[col].urlBase + enSlug; view.style.display = ''; }
    else view.style.display = 'none';
  }

  async function onTranslateClick(col) {
    const st = state[col] || (state[col] = {});
    const cs = readCs(col);
    if (!cs[EN_KEY[col]] && !Object.values(cs).some(Boolean)) { toast('Nejdřív vyplňte český text.', 'error'); return; }
    const cur = readEn(col);
    const edited = st.loaded && !sameEn(cur, st.loaded);
    if ((st.raw && st.raw.en_auto === false || edited) && cur[EN_KEY[col]] && !confirm('Anglická verze byla upravena ručně. Přepsat ji novým strojovým překladem?')) return;
    const btn = $(`${CFG[col].idp}-translate`);
    btn.disabled = true; btn.textContent = 'Překládám…';
    try {
      const en = await translateCs(col, cs);
      writeEn(col, en);
      st.translatedNow = true;
      st.translatedSnapshot = readEn(col);
      $(`${CFG[col].idp}-section`).open = true;
      toast('Přeloženo – zkontrolujte text a uložte ✓');
    } catch (e) {
      console.error('translate', e);
      toast('Překlad se nepovedl: ' + errMsg(e), 'error');
    }
    btn.disabled = false; btn.textContent = '🌐 Přeložit do AJ';
  }

  // ---------------- API pro admin.js ----------------
  const AdminEN = {
    init(opts) {
      window.__bsQuillOpts = opts || {};
      try { translateFn = firebase.app().functions('europe-west1').httpsCallable('translateContent', { timeout: 120000 }); }
      catch (e) { console.warn('[AdminEN] functions SDK chybí', e); }
      Object.keys(CFG).forEach(buildSection);
    },
    reset(col) {
      if (!CFG[col]) return;
      const en = {}; CFG[col].fields.forEach(fd => { en[fd.f] = ''; });
      writeEn(col, en);
      state[col] = { raw: {}, loaded: readEn(col), formHash: null, translatedNow: false };
      const det = $(`${CFG[col].idp}-section`); if (det) det.open = false;
      setStatus(col);
    },
    fill(col, raw) {
      if (!CFG[col]) return;
      const en = {}; CFG[col].fields.forEach(fd => { en[fd.f] = raw[fd.f + '_en'] || ''; });
      writeEn(col, en);
      state[col] = { raw: raw || {}, loaded: readEn(col), formHash: enSrcHash(col, readCs(col)), translatedNow: false };
      const det = $(`${CFG[col].idp}-section`); if (det) det.open = false;
      setStatus(col);
    },
    /**
     * Vrátí pole *_en k uložení (případně po automatickém překladu).
     * csData = česká data, která admin.js právě ukládá; docId = id dokumentu (nový = '').
     */
    async collect(col, csData, docId) {
      if (!CFG[col]) return {};
      const st = state[col] || (state[col] = { raw: {}, loaded: null });
      const raw = st.raw || {};
      let en = readEn(col);
      const key = EN_KEY[col];
      const curHash = enSrcHash(col, csData);
      const hadEn = !!raw[key + '_en'];
      const editedByHand = st.loaded ? !sameEn(en, st.loaded) && !(st.translatedNow && st.translatedSnapshot && sameEn(en, st.translatedSnapshot)) : false;
      const csChanged = (st.formHash != null && st.formHash !== enSrcHash(col, readCs(col))) || (raw.en_src && raw.en_src !== enSrcHash(col, raw));
      const out = {};
      let translated = st.translatedNow;

      const needAuto = !st.translatedNow && (
        !en[key] ||                                              // EN chybí
        (hadEn && raw.en_auto !== false && !editedByHand && csChanged) // strojový překlad + změna češtiny
      );
      if (needAuto && plain(csData[key])) {
        try {
          const cs = {}; for (const fd of CFG[col].fields) if (fd.src) cs[fd.f] = csData[fd.f] || '';
          const tr = await translateCs(col, cs);
          en = Object.assign({}, en, tr);
          writeEn(col, en);
          translated = true;
        } catch (e) {
          console.error('auto-translate', e);
          toast('Uloženo bez anglického překladu (' + errMsg(e) + '). Zkuste tlačítko „Přeložit do AJ".', 'error');
          return {};
        }
      }
      if (!en[key]) return {};

      // slug
      if (col !== 'team') {
        let want = en.slug ? slugify(en.slug) : '';
        if (!want) {
          want = slugify(en[key]);
          if (col === 'akce') { const yr = String(csData.datumSort || '').slice(0, 4); if (/^\d{4}$/.test(yr) && want.indexOf(yr) < 0) want += '-' + yr; }
        }
        en.slug = (want === raw.slug_en) ? want : await uniqueSlug(col, want, docId);
      }
      for (const fd of CFG[col].fields) out[fd.f + '_en'] = en[fd.f] || '';
      if (col === 'akce') {
        out.stavLabel_en = STATUS_EN[csData.stav] || csData.stavLabel || '';
        out.typAkce_en = KATEGORIE_EN[csData.kategorie] || '';
      }
      if (translated && !editedByHand) { out.en_src = curHash; out.en_auto = true; }
      else if (editedByHand || !hadEn) { out.en_src = curHash; out.en_auto = false; }
      else if (csChanged) toast('Pozor: čeština se změnila, ale anglická verze je upravená ručně – zkontrolujte ji.', 'error');
      return out;
    },
  };
  window.AdminEN = AdminEN;
})();
