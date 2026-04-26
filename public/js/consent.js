/* ============================================================
 * Bikeskills consent manager
 *
 * Centralizovaná logika cookie banneru + GDPR-compliant gating
 * non-essential trackerů (Google Analytics 4 + Meta Pixel).
 *
 * Stav je uložen v cookie 'cookieConsent':
 *   - 'accepted'  → loadAnalytics() proběhne, banner se neukáže
 *   - 'rejected'  → trackery se nenačtou, banner se neukáže
 *   - (neset)     → banner se ukáže s 800 ms delay (kvůli LCP)
 *
 * Backward-compat: starší verze používala cookie 'cookieClosed=ok'
 * jako "ok, přijímám". Migrujeme to → 'cookieConsent=accepted'.
 *
 * Banner HTML je pre-rendrovaný v stránce (Webflow .cookie wrapper),
 * tlačítko ODMÍTNOUT injectujeme JavaScriptem (žádný HTML refactor).
 * ============================================================ */
(function () {
  var CONSENT_COOKIE = 'cookieConsent';
  var LEGACY_COOKIE = 'cookieClosed';
  var COOKIE_DAYS = 180; // ~6 měsíců — pak se znovu zeptáme (typický GDPR refresh)
  var SHOW_DELAY_MS = 800; // delay aby banner nebyl LCP element na PSI mobile
  var GA_ID = 'G-DG5KF7PX48';
  var FB_PIXEL_ID = '537412813575132';

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
    document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax';
  }

  // ---------------- analytics loader ----------------
  var analyticsLoaded = false;
  function loadAnalytics() {
    if (analyticsLoaded) return;
    analyticsLoaded = true;

    // Google Analytics 4
    var gaScript = document.createElement('script');
    gaScript.async = true;
    gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(gaScript);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);

    // Meta Pixel (Facebook)
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

  // ---------------- banner UI ----------------
  function injectRejectButton(banner) {
    if (banner.querySelector('.bs-reject-btn')) return; // idempotent
    var acceptBtn = banner.querySelector('.close-btn');
    if (!acceptBtn || !acceptBtn.parentNode) return;
    var rejectBtn = document.createElement('a');
    rejectBtn.href = '#';
    rejectBtn.className = 'close-btn bs-reject-btn w-button';
    rejectBtn.textContent = 'ODMÍTNOUT';
    rejectBtn.setAttribute('role', 'button');
    rejectBtn.setAttribute('aria-label', 'Odmítnout cookies');
    // Vložit PŘED PŘIJÍMÁM, takže layout je: [text] ... [ODMÍTNOUT] [PŘIJÍMÁM] [×]
    acceptBtn.parentNode.insertBefore(rejectBtn, acceptBtn);
  }

  function showBanner(banner) {
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

  function bindHandlers(banner) {
    // Accept (PŘIJÍMÁM) — jediný .close-btn bez .bs-reject-btn
    var acceptBtn = banner.querySelector('.close-btn:not(.bs-reject-btn)');
    if (acceptBtn) {
      acceptBtn.addEventListener('click', function (e) {
        e.preventDefault();
        setCookie(CONSENT_COOKIE, 'accepted', COOKIE_DAYS);
        loadAnalytics();
        hideBanner(banner);
      });
    }
    // Reject (ODMÍTNOUT)
    var rejectBtn = banner.querySelector('.bs-reject-btn');
    if (rejectBtn) {
      rejectBtn.addEventListener('click', function (e) {
        e.preventDefault();
        setCookie(CONSENT_COOKIE, 'rejected', COOKIE_DAYS);
        hideBanner(banner);
      });
    }
    // Close × — chování jako ODMÍTNOUT (close ≠ implicit consent, EDPB guidelines)
    var closeBtn = banner.querySelector('.banner-close-card');
    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        setCookie(CONSENT_COOKIE, 'rejected', COOKIE_DAYS);
        hideBanner(banner);
      });
    }
  }

  // ---------------- init ----------------
  function init() {
    // Migrace ze staré cookie
    var legacy = getCookie(LEGACY_COOKIE);
    var consent = getCookie(CONSENT_COOKIE);
    if (!consent && legacy === 'ok') {
      setCookie(CONSENT_COOKIE, 'accepted', COOKIE_DAYS);
      deleteCookie(LEGACY_COOKIE);
      consent = 'accepted';
    }

    var banner = document.querySelector('.cookie');

    if (consent === 'accepted') {
      loadAnalytics();
      if (banner) hideBanner(banner);
      return;
    }
    if (consent === 'rejected') {
      if (banner) hideBanner(banner);
      return;
    }

    // Unknown consent → ukázat banner s delay (kvůli LCP)
    if (!banner) return;
    injectRejectButton(banner);
    bindHandlers(banner);
    setTimeout(function () { showBanner(banner); }, SHOW_DELAY_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
