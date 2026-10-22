/* ============================================================
 * Bikeskills consent manager (GDPR + § 89 odst. 3 zák. č. 127/2005 Sb.)
 *
 * Souhlas po účelech:
 *   - nezbytné cookies         → vždy (nevyžadují souhlas)
 *   - analytické (GA4)         → pouze po souhlasu
 *   - marketingové (Meta Pixel)→ pouze po souhlasu
 *
 * Stav je uložen v cookie 'cookieConsent2' ve tvaru 'a<0|1>m<0|1>':
 *   'a1m1' = vše povoleno, 'a0m0' = vše odmítnuto,
 *   'a1m0' = jen analytika, 'a0m1' = jen marketing.
 *   (nenastaveno) → banner se ukáže s 800 ms delay (kvůli LCP).
 *
 * Verze 2: starší cookie 'cookieConsent' (souhlas daný při textu, který
 * nezmiňoval marketing) a 'cookieClosed' se neberou jako souhlas — návštěvník
 * je požádán znovu. Souhlas je platný 180 dní.
 *
 * Souhlas lze kdykoli změnit/odvolat přes odkaz "Nastavení cookies" v patičce
 * (nebo window.bsOpenCookieSettings()).
 *
 * Banner HTML je pre-rendrovaný v stránce (Webflow .cookie wrapper),
 * tlačítka ODMÍTNOUT VŠE / NASTAVENÍ a dialog nastavení injectujeme JS.
 * ============================================================ */
(function () {
  var CONSENT_COOKIE = 'cookieConsent2';
  var OLD_COOKIES = ['cookieConsent', 'cookieClosed'];
  var COOKIE_DAYS = 180; // ~6 měsíců — pak se znovu zeptáme
  var SHOW_DELAY_MS = 800; // delay aby banner nebyl LCP element na PSI mobile
  // Hlavní GA4 property bikeskills.cz (účet BikeSkills.cz, má historii dat).
  // Duplicitní měření do G-Y1GJE85WDX (chytreit.cz / bikeskills-web-app) odebráno 2026-10-21.
  var GA_IDS = ['G-DG5KF7PX48'];
  var FB_PIXEL_ID = '537412813575132';
  var PRIVACY_URL = '/zasady-ochrany-osobnich-udaju';

  // ---------------- cookie helpers ----------------
  function getCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function setCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 86400000);
    document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + d.toUTCString() + '; path=/; SameSite=Lax';
  }
  function deleteCookie(name) {
    var host = location.hostname;
    var parts = host.split('.');
    var domains = ['', host];
    if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));
    else domains.push('.' + host);
    domains.forEach(function (dom) {
      document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax' + (dom ? '; domain=' + dom : '');
    });
  }
  // Smaže GA / Meta cookies (při odvolání souhlasu)
  function purgeTrackingCookies(which) {
    document.cookie.split(';').forEach(function (c) {
      var n = c.split('=')[0].trim();
      if (which.analytics && (n === '_ga' || n.indexOf('_ga_') === 0 || n === '_gid' || n.indexOf('_gat') === 0)) deleteCookie(n);
      if (which.marketing && (n === '_fbp' || n === '_fbc')) deleteCookie(n);
    });
  }

  // ---------------- stav souhlasu ----------------
  function readConsent() {
    var v = getCookie(CONSENT_COOKIE);
    var m = v && v.match(/^a([01])m([01])$/);
    return m ? { analytics: m[1] === '1', marketing: m[2] === '1' } : null;
  }
  function saveConsent(c) {
    setCookie(CONSENT_COOKIE, 'a' + (c.analytics ? 1 : 0) + 'm' + (c.marketing ? 1 : 0), COOKIE_DAYS);
  }

  // ---------------- trackery ----------------
  var gaLoaded = false;
  var pixelLoaded = false;
  function loadGA() {
    if (gaLoaded) return;
    gaLoaded = true;
    var gaScript = document.createElement('script');
    gaScript.async = true;
    gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_IDS[0];
    document.head.appendChild(gaScript);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    GA_IDS.forEach(function (id) { window.gtag('config', id); });
  }
  function loadPixel() {
    if (pixelLoaded) return;
    pixelLoaded = true;
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
      n.queue = []; t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', FB_PIXEL_ID);
    window.fbq('track', 'PageView');
  }
  function applyConsent(c) {
    if (c.analytics) loadGA();
    if (c.marketing) loadPixel();
  }

  // Uloží volbu; při odvolání už načteného trackeru smaže cookies a stránku obnoví
  function commit(c) {
    var withdrawn = {
      analytics: gaLoaded && !c.analytics,
      marketing: pixelLoaded && !c.marketing
    };
    var prev = readConsent();
    if (prev) {
      if (prev.analytics && !c.analytics) withdrawn.analytics = true;
      if (prev.marketing && !c.marketing) withdrawn.marketing = true;
    }
    saveConsent(c);
    if (withdrawn.analytics || withdrawn.marketing) {
      purgeTrackingCookies(withdrawn);
      if ((withdrawn.analytics && gaLoaded) || (withdrawn.marketing && pixelLoaded)) {
        location.reload(); // už načtené skripty nelze spolehlivě zastavit
        return;
      }
    }
    applyConsent(c);
  }

  // ---------------- banner UI ----------------
  function makeBtn(cls, text, label) {
    var a = document.createElement('a');
    a.href = '#';
    a.className = cls;
    a.textContent = text;
    a.setAttribute('role', 'button');
    if (label) a.setAttribute('aria-label', label);
    return a;
  }

  function prepareBanner(banner) {
    if (banner.querySelector('.bs-reject-btn')) return; // idempotent
    var acceptBtn = banner.querySelector('.close-btn');
    if (!acceptBtn || !acceptBtn.parentNode) return;

    // Text banneru — musí pojmenovat účely (analytika + marketing)
    var txt = banner.querySelector('.banner-author:not(.link)');
    if (txt) {
      txt.textContent = 'TENTO WEB POUŽÍVÁ NEZBYTNÉ COOKIES. S VAŠÍM SOUHLASEM POUŽÍVÁME TAKÉ ANALYTICKÉ (GOOGLE ANALYTICS) A MARKETINGOVÉ (META PIXEL) COOKIES. ';
      txt.removeAttribute('target');
      txt.setAttribute('href', PRIVACY_URL);
    }
    var more = banner.querySelector('.banner-author.link');
    if (more) { more.setAttribute('href', PRIVACY_URL); more.removeAttribute('target'); }

    acceptBtn.textContent = 'PŘIJMOUT VŠE';
    acceptBtn.removeAttribute('target');

    // ODMÍTNOUT VŠE + NASTAVENÍ — sekundární textové odkazy; hlavní tlačítko je PŘIJMOUT VŠE
    var rejectBtn = makeBtn('bs-reject-btn', 'ODMÍTNOUT VŠE', 'Odmítnout všechny nepovinné cookies');
    var settingsBtn = makeBtn('bs-settings-btn', 'NASTAVENÍ', 'Nastavit cookies podle účelů');
    // Layout: [text] ... NASTAVENÍ  ODMÍTNOUT VŠE  [PŘIJMOUT VŠE] [×]
    acceptBtn.parentNode.insertBefore(settingsBtn, acceptBtn);
    acceptBtn.parentNode.insertBefore(rejectBtn, acceptBtn);
  }

  function showBanner() {
    document.documentElement.classList.add('cookies-show');
  }

  function hideBanner(banner) {
    document.documentElement.classList.remove('cookies-show');
    if (!document.getElementById('bs-cookie-hide')) {
      var s = document.createElement('style');
      s.id = 'bs-cookie-hide';
      s.textContent = '.cookie{display:none!important}';
      document.head.appendChild(s);
    }
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
  }

  function bindBanner(banner) {
    var acceptBtn = banner.querySelector('.close-btn:not(.bs-reject-btn)');
    if (acceptBtn) {
      acceptBtn.addEventListener('click', function (e) {
        e.preventDefault();
        commit({ analytics: true, marketing: true });
        hideBanner(banner);
      });
    }
    var rejectBtn = banner.querySelector('.bs-reject-btn');
    if (rejectBtn) {
      rejectBtn.addEventListener('click', function (e) {
        e.preventDefault();
        commit({ analytics: false, marketing: false });
        hideBanner(banner);
      });
    }
    var settingsBtn = banner.querySelector('.bs-settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openSettings(banner);
      });
    }
    // Close × — chování jako ODMÍTNOUT (close ≠ souhlas, EDPB guidelines)
    var closeBtn = banner.querySelector('.banner-close-card');
    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        commit({ analytics: false, marketing: false });
        hideBanner(banner);
      });
    }
  }

  // ---------------- dialog "Nastavení cookies" ----------------
  var modal = null;
  var lastFocus = null;

  function injectModalStyle() {
    if (document.getElementById('bs-cc-style')) return;
    var s = document.createElement('style');
    s.id = 'bs-cc-style';
    s.textContent =
      '#bs-cc-modal{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);padding:16px}' +
      '#bs-cc-modal.bs-open{display:flex}' +
      '#bs-cc-modal .bs-cc-box{background:#222528;color:#fff;max-width:560px;width:100%;max-height:90vh;overflow:auto;border-radius:6px;padding:24px;font-family:proxima-nova,sans-serif;font-size:14px;line-height:1.5;box-shadow:0 10px 40px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.08)}' +
      '#bs-cc-modal,#bs-cc-modal *{box-sizing:border-box}' +
      '#bs-cc-modal h2,#bs-cc-modal p,#bs-cc-modal label,#bs-cc-modal span{color:#fff !important;font-family:proxima-nova,Arial,sans-serif !important;text-transform:none !important;letter-spacing:normal !important}' +
      '#bs-cc-modal h2{margin:0 0 8px !important;font-size:20px !important;line-height:1.25 !important;font-weight:700 !important}' +
      '#bs-cc-modal p{margin:0 0 12px !important;font-size:14px !important;line-height:1.5 !important}' +
      '#bs-cc-modal .bs-cc-row{border-top:1px solid rgba(255,255,255,.15);padding:12px 0}' +
      '#bs-cc-modal .bs-cc-row label{display:flex !important;align-items:center;gap:10px;font-weight:700 !important;color:#efc101 !important;font-size:14px !important;cursor:pointer;margin:0 !important}' +
      '#bs-cc-modal .bs-cc-row input{-webkit-appearance:none;appearance:none;width:18px;height:18px;flex-shrink:0;margin:0 !important;border:2px solid #efc101;border-radius:0;background:transparent center/14px 14px no-repeat;cursor:pointer}' +
      '#bs-cc-modal .bs-cc-row input:checked{background-color:#efc101;background-image:url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22%3E%3Cpath d=%22M3 8.5l3 3 7-7%22 fill=%22none%22 stroke=%22%23000%22 stroke-width=%222.4%22 stroke-linecap=%22square%22/%3E%3C/svg%3E")}' +
      '#bs-cc-modal .bs-cc-row input:disabled{opacity:.55;cursor:default}' +
            '#bs-cc-modal .bs-cc-row p{margin:6px 0 0 28px !important;font-size:13px !important;color:#bdbdbd !important}' +
      '#bs-cc-modal .bs-cc-actions{display:flex;flex-wrap:wrap;align-items:center;gap:14px 24px;margin-top:16px;border-top:1px solid rgba(255,255,255,.15);padding-top:16px}' +
      /* hlavní tlačítko = stejné jako ostatní hlavní tlačítka webu (černá pilulka, 64px, obrys v akcentní barvě) */
      '#bs-cc-modal .bs-cc-actions button.bs-primary{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 28px;border:2px solid #efc101;border-radius:64px;background:#000;color:#efc101;font-family:proxima-nova,sans-serif;font-size:14.4px;font-weight:500;letter-spacing:.4px;line-height:1.2;text-transform:uppercase;text-align:center;white-space:nowrap;cursor:pointer;transition:opacity .2s}' +
      /* ostatní = sekundární textové odkazy s podtržením */
      '#bs-cc-modal .bs-cc-actions button.bs-link{all:unset;box-sizing:border-box;display:inline-block;font-family:proxima-nova,Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:.025rem;line-height:1.4;text-transform:uppercase;text-decoration:underline;text-underline-offset:3px;color:#fff;cursor:pointer;white-space:nowrap;transition:opacity .2s}' +
      '#bs-cc-modal .bs-cc-actions button:hover{opacity:.65}' +
      '#bs-cc-modal .bs-cc-actions button:focus-visible,#bs-cc-modal a:focus-visible,#bs-cc-modal input:focus-visible{outline:3px solid #efc101;outline-offset:3px}' +
      '#bs-cc-modal .bs-cc-more{color:#efc101 !important;text-decoration:underline !important;text-underline-offset:2px}' +
      '@media (max-width:480px){#bs-cc-modal .bs-cc-box{padding:18px}}';
    document.head.appendChild(s);
  }

  function buildModal() {
    if (modal) return modal;
    injectModalStyle();
    modal = document.createElement('div');
    modal.id = 'bs-cc-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'bs-cc-title');
    modal.innerHTML =
      '<div class="bs-cc-box">' +
        '<h2 id="bs-cc-title">Nastavení cookies</h2>' +
        '<p>Vyberte, které cookies smíme používat. Souhlas můžete kdykoli změnit nebo odvolat přes odkaz „Nastavení cookies“ v patičce webu. Odmítnutí nijak neomezuje funkčnost webu. Podrobnosti najdete v <a class="bs-cc-more" href="' + PRIVACY_URL + '">Zásadách ochrany osobních údajů</a>.</p>' +
        '<div class="bs-cc-row"><label><input type="checkbox" checked disabled> Nezbytné cookies</label>' +
          '<p>Zajišťují základní chod webu a uložení vaší volby. Nevyžadují souhlas a nelze je vypnout.</p></div>' +
        '<div class="bs-cc-row"><label><input type="checkbox" id="bs-cc-a"> Analytické cookies (Google Analytics)</label>' +
          '<p>Měří návštěvnost a chování na webu, abychom ho mohli zlepšovat. Data zpracovává Google.</p></div>' +
        '<div class="bs-cc-row"><label><input type="checkbox" id="bs-cc-m"> Marketingové cookies (Meta Pixel)</label>' +
          '<p>Umožňují měřit účinnost reklamy a zobrazovat reklamu na Facebooku a Instagramu. Data zpracovává Meta.</p></div>' +
        '<div class="bs-cc-actions">' +
          '<button type="button" data-act="save" class="bs-primary">Uložit výběr</button>' +
          '<button type="button" data-act="all" class="bs-link">Přijmout vše</button>' +
          '<button type="button" data-act="none" class="bs-link">Odmítnout vše</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeSettings();
      var act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      if (!act) return;
      var c;
      if (act === 'all') c = { analytics: true, marketing: true };
      else if (act === 'none') c = { analytics: false, marketing: false };
      else c = { analytics: modal.querySelector('#bs-cc-a').checked, marketing: modal.querySelector('#bs-cc-m').checked };
      commit(c);
      closeSettings();
      var banner = document.querySelector('.cookie');
      hideBanner(banner);
    });
    modal.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeSettings(); return; }
      if (e.key !== 'Tab') return;
      // jednoduchý focus trap
      var f = modal.querySelectorAll('button, a[href], input:not([disabled])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    return modal;
  }

  function openSettings() {
    var m = buildModal();
    var c = readConsent() || { analytics: false, marketing: false }; // nic předzaškrtnuto
    m.querySelector('#bs-cc-a').checked = c.analytics;
    m.querySelector('#bs-cc-m').checked = c.marketing;
    lastFocus = document.activeElement;
    m.classList.add('bs-open');
    m.querySelector('#bs-cc-a').focus();
  }
  function closeSettings() {
    if (!modal) return;
    modal.classList.remove('bs-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  window.bsOpenCookieSettings = openSettings;

  // Odkaz "Nastavení cookies" v patičce — odvolání souhlasu musí být stejně snadné jako udělení
  function addFooterLink() {
    try {
      if (document.getElementById('bs-cc-footer-link')) return;
      var ref = document.querySelector('a.footer-link[href*="zasady-ochrany"]') || document.querySelector('a.footer-link');
      if (!ref || !ref.parentNode) return;
      var l = ref.cloneNode(false);
      l.id = 'bs-cc-footer-link';
      l.href = '#';
      l.removeAttribute('target');
      l.textContent = 'Nastavení cookies';
      l.addEventListener('click', function (e) { e.preventDefault(); openSettings(); });
      ref.parentNode.insertBefore(l, ref.nextSibling);
    } catch (err) { /* patička je jen doplněk */ }
  }

  // ---------------- init ----------------
  function init() {
    // Staré cookies (souhlas daný před verzí 2) už neplatí
    OLD_COOKIES.forEach(function (n) { if (getCookie(n) !== null) deleteCookie(n); });

    addFooterLink();
    var consent = readConsent();
    var banner = document.querySelector('.cookie');

    if (consent) {
      applyConsent(consent);
      if (banner) hideBanner(banner);
      return;
    }

    // Souhlas neudělen → žádné trackery, ukázat banner s delay (kvůli LCP)
    if (!banner) return;
    prepareBanner(banner);
    bindBanner(banner);
    setTimeout(showBanner, SHOW_DELAY_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
