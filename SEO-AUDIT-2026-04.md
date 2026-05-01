# SEO & Performance audit — bikeskills.cz

**Datum:** 24. 4. 2026
**Rozsah:** statický obsah v `/public` (to, co se nasazuje na Firebase Hosting)
**Metodika:** lokální analýza HTML, CSS, JS, obrázků, konfigurace Firebase; živý web nebyl dostupný přes allowlist, ale deploy chodí z této složky, takže audit odpovídá produkčnímu stavu.

---

## Aktualizace 24. 4. 2026 — vyčištění e-shopu

E-shop přesunut na `shop.bikeskills.cz` (Prestashop). Provedeno:

**Smazáno 22 HTML stránek:**
- E-shop: `shop.html`, `shop-category.html`, `detail_product.html`, `detail_category.html`, `detail_sku.html`, `kosik.html`, `checkout.html`, `order-confirmation.html`, `paypal-checkout.html`, `search.html`
- Zákaznické účty: `account.html`, `user-account.html`, `login.html`, `log-in.html`, `register.html`, `sign-up.html`, `password-reset.html`, `reset-password.html`, `update-password.html`, `access-denied.html`
- Webflow template junk: `setup-guide.html`, `style-guide.html`

Zbylo **22 produkčních HTML** (viz seznam níže).

**Smazáno 65 nepoužívaných obrázků** (3,81 MB): Screenshot-2020-*.png, activate-udesly-plugin*.png, webflow-to-wordpress-error*.png, page-setting*.png, banner2021*.jpg, pack1*.jpg a jejich Webflow responsivní varianty. `public/images/` je nyní 2,6 MB / 100 souborů.

**Patička na 21 stránkách** — 3 odkazy na zákaznický účet přepojené na Prestashop:
- *"Objednávky"* → `https://shop.bikeskills.cz/historie-objednavek`
- *"Zapomenuté heslo"* → `https://shop.bikeskills.cz/cs/obnova-hesla`
- *"Detail účtu"* → `https://shop.bikeskills.cz/muj-ucet`

URL ověřené uživatelem 24. 4. 2026 proti živému Prestashopu. Původní odkaz *"E-shop"* → `https://shop.bikeskills.cz/` zůstal beze změny.

**robots.txt** — zjednodušen, Disallow bloky pro smazané stránky odstraněny:

```
User-agent: *
Allow: /

Sitemap: https://bikeskills.cz/sitemap.xml
```

**firebase.json** — přidáno 23 nových 301 redirectů:
- 10× e-shop URL → `https://shop.bikeskills.cz/`
- 10× auth URL → odpovídající Prestashop stránka (`/muj-ucet`, `/cs/přihlásit`, `/cs/obnova-hesla`)
- 2× template guide → homepage
- Starý WP odkaz `/my-account/orders/` → `/historie-objednavek`

**sitemap.xml** — odstraněna URL `/shop.html` (z 223 na 222 URL). Skript `scripts/generate-sitemap.js` také vyčištěn, takže příští `npm run sitemap` bude čistý.

**Zbývající produkční HTML stránky (22):** 404, index, blog, detail_post, team, detail_archive-team, kontakt, servis, standartni-servis-kol, kompletni-servis-full, kompletni-servis-hardtail, kompletni-cenik-servisnich-praci, individualni-kurzy, campy, pujcovna, specialni-akce, akce-archive, detail_akce, pojisteni-bikeplan, obchodni-podminky, dodaci-podminky, zasady-ochrany-osobnich-udaju.

**Stav po úklidu:** body z P0 (detail_product, detail_category, zbytky Webflow šablony v meta tagech) jsou vyřešené smazáním. Zbývají P1/P2 nálezy popsané níže v původním auditu (OG images, descriptions na obchodních podmínkách, strukturovaná data pro blog a akce, …).

**Zachováno:** `public/wp-content/uploads/` (3,3 GB) — obrázky článků, akcí a teamu, referencované z CMS obsahu ve Firestore.

---

## Aktualizace 24. 4. 2026 — OG image

Vytvořen nový Open Graph obrázek `public/images/og-image.jpg` (1200×630 px, 61,7 KB) nahrazující původní `webclip.png` (256×256 px).

**Design:**
- Brand badge logo (webclip.png) vlevo
- Titulek *"BikeSkills"* v Lobster fontu (stejný jako na webu)
- Subtitle *"MTB & E-MTB kurzy · Servis · Půjčovna"* v Montserrat (vizuální proxy za Proxima Nova — ta je Adobe Typekit licenční)
- URL *"bikeskills.cz"* v žluté akcentové barvě loga
- Pozadí: tmavě modrý gradient se siluetou hor a žlutým sluncem (v duchu loga)

**Nasazeno na 22 HTML stránkách:**
- 9 stránek mělo původní `og:image` → URL nahrazena, doplněno `og:image:width`, `og:image:height`, `og:image:alt`
- 13 stránek `og:image` nemělo → přidán kompletní blok (og:image, og:image:width, og:image:height, og:image:alt, twitter:image)
- `twitter:card` bylo již dříve nastaveno na `summary_large_image` — správně pro velké náhledy
- Alt text: *"BikeSkills – MTB & E-MTB kurzy, servis a půjčovna kol"*

**Po deployi:**
1. **Facebook Sharing Debugger** — vložit URL `https://bikeskills.cz/`, kliknout *Scrape Again* pro obnovení cache. Totéž pro pár dalších klíčových stránek (blog, kontakt, servis).
2. **LinkedIn Post Inspector** — `https://www.linkedin.com/post-inspector/` pro vynucení refresh.
3. **Twitter Card Validator** — `https://cards-dev.twitter.com/validator` (pokud stále funguje; X/Twitter validátor byl deprecated).

---

## Aktualizace 24. 4. 2026 — Clean URLs (kritická oprava)

**Nález z Facebook Sharing Debuggeru po deployi:** stránky `/kontakt`, `/blog`, `/servis` vracely HTTP 404 (og:title *"Not Found"*). Příčina: Firebase Hosting neměl zapnutý `cleanUrls`, takže pro požadavek `/kontakt` nenašel soubor (soubor je `kontakt.html`).

**Opraveno:**
- `firebase.json` — přidáno `"cleanUrls": true` a `"trailingSlash": false`. Firebase teď:
  - pro `/kontakt` naservíruje `kontakt.html` (status 200)
  - pro `/kontakt.html` udělá 301 redirect na `/kontakt` (kanonická forma bez přípony)
- **Canonicals** aktualizovány na 22 HTML stránkách — odstraněn `.html` suffix (např. `https://bikeskills.cz/kontakt.html` → `https://bikeskills.cz/kontakt`). Homepage má `https://bikeskills.cz/`.
- **og:url** aktualizováno na 4 stránkách, kde bylo vyplněné (zbytek mělo prázdnou hodnotu — teď je doplněno).
- **Vnitřní odkazy v HTML** — 437 `href="foo.html"` změněno na `href="foo"` ve všech 22 produkčních stránkách. Odstraňuje extra 301 hop při navigaci.
- **Sitemap.xml** — 17 URL upraveno (odstraněn `.html` suffix u statických stránek). Dynamické (blog/akce/team slugy) zůstávají.
- **`scripts/generate-sitemap.js`** — staticPages pole upraveno, další regenerace bude čistá.

**Po deployi znovu otestuj:**
- Facebook Sharing Debugger → *Scrape Again* pro klíčové stránky (homepage, blog, kontakt, servis, team)
- Response Code má být 200 a og:title má být skutečný titul stránky (ne "Not Found")
- Znovu odeslat sitemap v Google Search Console (má 222 URL, teď s clean URLs)


---

## Aktualizace 24. 4. 2026 — Meta descriptions na 4 zbývajících stránkách

Doplněny chybějící `meta name="description"` (+ `og:description` a `twitter:description` pro konzistenci s ostatními stránkami) na:

| Stránka | Description | Délka |
|---|---|---|
| `obchodni-podminky` | *Obchodní podmínky BikeSkills — pravidla nákupu v e-shopu i kurzů, platby, doručení, odstoupení od smlouvy a reklamace. Přečtěte si před objednáním.* | 150 |
| `dodaci-podminky` | *Dodací podmínky BikeSkills — způsoby dopravy, ceny, termíny doručení a možnosti osobního odběru v Říčanech u Prahy. Informace k zaslání objednávky.* | 150 |
| `404` | *Hledaná stránka neexistuje nebo byla přesunuta. Vraťte se na úvod BikeSkills nebo si vyberte z nabídky MTB kurzů, servisu kol a e-shopu.* | 138 |
| `zasady-ochrany-osobnich-udaju` | *Zásady ochrany osobních údajů BikeSkills — jak zpracováváme vaše osobní data, k čemu slouží, jak dlouho je uchováváme a jaká máte práva podle GDPR.* | 150 |

Současně přeloženy dva anglické titulky do češtiny (`Not Found` → *Stránka nenalezena (404) | BikeSkills*, `Privacy Policy` → *Zásady ochrany osobních údajů | BikeSkills*) a na `404.html` přidán `<meta name="robots" content="noindex, follow">`, aby se chybová stránka neindexovala. Všechny čtyři stránky také doplněny o `twitter:card = summary_large_image`.

**Výsledek:** Všech 22 produkčních HTML stránek má nyní unikátní meta description i twitter card. P1 nálezy z auditu *"Chybí meta description"* vyřešeny.

---

## Aktualizace 24. 4. 2026 — Strukturovaná data JSON-LD

**Stav před:** Homepage měla `Organization + LocalBusiness`. `cms-loader.js` injektoval minimální `Article`, `Event`, `Person` schemas na detail stránky + `BreadcrumbList` s `.html` URL (nekonzistentní s clean URLs).

**Úpravy v `public/js/cms-loader.js`:**

- **Event** (detail akce) — doplněno `startDate` (ISO 8601 z `datum` timestamp), `eventStatus = EventScheduled`, `eventAttendanceMode = OfflineEventAttendanceMode`, `location` (PostalAddress Tehov), `offers` s cenou a CZK měnou když je `data.cena` vyplněno, rozšířený `organizer`. `og:type` změněno na `event`.
- **Article** (detail blog post) — `datePublished` a `dateModified` nyní v ISO 8601 formátu (původně `toLocaleDateString('cs-CZ')` = *"24. 4. 2026"*, což Google neakceptuje). Přidán `mainEntityOfPage`, `publisher.logo` rozšířen o width/height. Fallback obrázku z webclip.png na og-image.jpg (1200×630).
- **BreadcrumbList** v Event/Article/Person — URL odkazy vyčištěny (`/blog`, `/akce-archive`, `/team` místo `.html`).

**Nové statické JSON-LD bloky:**

- **BreadcrumbList** na 17 top-level stránkách (servis + 4 podsekce, kurzy, campy, specialni-akce, pujcovna, pojisteni-bikeplan, blog listing, akce-archive listing, team listing, kontakt, obchodni-podminky, dodaci-podminky, zasady-ochrany-osobnich-udaju). Hierarchie: *Domů → [Sekce] → [Podsekce]*.
- **Service** schema na `servis.html` — `serviceType: "Servis jízdních kol"`, `provider` (LocalBusiness s adresou), `hasOfferCatalog` se 3 servisními balíčky (Standardní / Hardtail / Full).

**Celkový stav JSON-LD:**

| Typ | Počet stránek | Kde |
|---|---|---|
| `Organization + LocalBusiness` | 1 | `index.html` |
| `BreadcrumbList` (statický) | 17 | všechny top-level stránky |
| `Service` | 1 | `servis.html` |
| `Article` (dynamický) | CMS | `detail_post.html` |
| `Event` (dynamický) | CMS | `detail_akce.html` |
| `Person` (dynamický) | CMS | `detail_archive-team.html` |

**Ověření:**
- `node --check public/js/cms-loader.js` → syntax OK
- Všech 19 JSON-LD bloků napříč `public/*.html` parsuje jako validní JSON.
- Po deployi: otestovat v [Rich Results Test](https://search.google.com/test/rich-results) na URL `/blog/<slug>`, `/akce/<slug>`, `/servis`.

---

## Aktualizace 24. 4. 2026 — width/height na obrázky (CLS)

**Cíl:** snížit Cumulative Layout Shift (CLS) — browser potřebuje explicitní `width` a `height` (nebo CSS `aspect-ratio`), aby si rezervoval prostor před načtením obrázku.

**Baseline:** 43 / 516 img tagů (8.3 %) mělo width + height; 473 je postrádalo.

**Úpravy:**

- Statické HTML: Python script přečetl skutečné rozměry z `public/images/*` (PIL pro WebP/JPG/PNG, viewBox parser pro SVG) a doplnil `width="…" height="…"` do 460 img tagů v 21 stránkách. Dedupe mapa — 35 unikátních src (partner loga v patičce se opakují 42–43× napříč webem). Ruční fix na `images/bikeskills_1bikeskills.webp` (homepage) a `voucher.webp` (individuální kurzy), které měly prázdný nebo relativní src.
- Dynamické obrázky z CMS (cms-loader.js): 4 místa, kde se injektoval `imgEl.src` bez rozměrů, nyní nastavují explicitní width/height:
  - `renderAkceItem` list card → 800×600 (4:3)
  - Blog list card → 800×600 (4:3)
  - Team list card → 800×1000 (4:5 portrait)
  - Team detail → 1280×1600 (původně volalo `removeAttribute('width')`, což CLS přímo způsobovalo)
  - Akce detail a Blog detail už 1280×720 nastaveny měly.

**Výsledek:** 505 / 516 (**97.87 %** pokrytí). Zbývajících 11 imgs jsou Webflow CMS template placeholdery s prázdným `src=""` — skutečné rozměry nastavuje cms-loader dynamicky po načtení dat, CLS tedy není zasažen.

Po deployi změřit PageSpeed pro homepage / servis / blog listing — očekávaný efekt na CLS metriku.

---

## Celkové hodnocení

| Oblast | Skóre | Shrnutí |
|---|---|---|
| **SEO základy** | 7 / 10 | Solidní canonical, robots.txt, sitemap, většina titles a descriptions v češtině. Několik kritických zbytků z Webflow šablony. |
| **Strukturovaná data** | 3 / 10 | Pouze homepage má `Organization`/`LocalBusiness`. Chybí Article, Product, Event, Breadcrumb. |
| **Obsah / nadpisy** | 8 / 10 | Většina stránek má 1× H1 a srozumitelnou hierarchii. Několik dynamických detail stránek má defaultní H1. |
| **Technická performance** | 6 / 10 | Firebase caching je nastaven výborně, fonty s `preconnect` + `display=swap`, skripty mají `defer`. Hlavní problém: webflow.js 2,4 MB (470 KB gzipped), 4,6 MB nevyužitých obrázků. |
| **Obrázky** | 6 / 10 | 83 % má `loading="lazy"`, pouze 10 % má `width/height` (riziko CLS) a 2 % `srcset`. |
| **Hosting & cache** | 9 / 10 | Cache headers na Firebase jsou nastaveny příkladně (1 rok pro obrázky/fonty, 1 týden CSS/JS, 1 hod HTML). 301 redirecty pokrývají staré WP URL. |

**Nejdůležitější akce v pořadí priority:**

1. **Opravit Webflow zbytky v meta tagech** (detail_product.html, detail_category.html) — kritické SEO.
2. **Doplnit chybějící descriptions** (obchodni-podminky, dodaci-podminky, 404).
3. **Přepsat OG image** — `webclip.png` je 256 × 256 px, potřeba 1200 × 630 px (sdílení na FB/LinkedIn vypadá nepěkně).
4. **Smazat 114 nepoužívaných obrázků** (4,59 MB, zejména setup/style guide screenshoty z Webflow).
5. **Doplnit strukturovaná data** na klíčové typy stránek (Event, Article, Product, BreadcrumbList).
6. **Přidat width/height atributy** na obrázky pro lepší CLS (Cumulative Layout Shift).

---

## 1. SEO — detailní nálezy

### 1.1 Zbytky z Webflow/Udesly šablony (kritické)

Pozůstatky z původní šablony, které indexuje Google a které je vidět i při sdílení:

| Stránka | Problém |
|---|---|
| `detail_product.html` | `<title>Multy \| Webflow to WordPress Template \| Udesly Adapter</title>` — anglický titul šablony. |
| `detail_product.html` | Description: `"Multy is a multipurpose Webflow Template ready to be converted to WordPress through the Udesly Adapter"`. |
| `detail_category.html` | Totéž co výše — titul i description. |
| `setup-guide.html`, `style-guide.html` | Sice blokované v robots.txt, ale stránky v `/public` stále existují a 14+4 obrázků je součástí balíčku. |

**Co udělat:** přepsat title a description na cílové texty. Na detail_product.html a detail_category.html doplnit dynamické title/description z `cms-loader.js` (aby se při prokliku produktu nebo kategorie zobrazil reálný titul). Dále zvážit přesun `setup-guide.html` a `style-guide.html` mimo `/public`, ať se nedeployují vůbec.

### 1.2 Titles — duplicity a slabá místa

10 stránek má totožný titul `"Bikeskills - wordpress web"`:
`access-denied.html`, `checkout.html`, `detail_sku.html`, `log-in.html`, `order-confirmation.html`, `paypal-checkout.html`, `reset-password.html`, `sign-up.html`, `update-password.html`, `user-account.html`.

Většina z nich je v robots.txt blokována, takže se k indexu nedostane. Přesto doporučuji unikátní titles — uživatel je vidí v záložkách prohlížeče a při sdílení přes URL.

Další slabší titles:
- `campy.html` → `"Camp a Workshop"` — chybí brand i lokalita. Doporučuji např. *"Campy a workshopy MTB | BikeSkills — vícedenní výuka jízdy na kole"*.
- `pujcovna.html` → `"Cube Rental E-bikes"` — jen anglický brand bez kontextu. Např. *"Půjčovna elektrokol Cube | BikeSkills Říčany"*.
- `kompletni-servis-full.html`, `standartni-servis-kol.html` — chybí brand v titulku.

### 1.3 Meta descriptions

Chybí zcela na:
- `obchodni-podminky.html`
- `dodaci-podminky.html`
- `404.html` (zde je to OK, ale vhodné doplnit nabídku *"Vraťte se na homepage"*)

Příliš dlouhé (> 160 znaků, Google zkrátí):
- `campy.html` — **284 znaků** → zkrátit na ~150.
- `detail_product.html`, `detail_category.html` — 193 znaků + jde o text šablony (viz 1.1).

Příliš krátké:
- `pujcovna.html` — 49 znaků → rozšířit.

### 1.4 Canonical

✓ Všechny hlavní stránky mají `<link rel="canonical" ...>`.
✗ Chybí na `setup-guide.html` a `style-guide.html` (ale obě jsou v robots.txt disallow, takže low priority).

### 1.5 Open Graph / Twitter Cards

- Homepage má kompletní OG + Twitter tagy, ale **`og:image` je `webclip.png` o rozměru 256 × 256 px**. Pro sdílení na Facebooku / LinkedInu je doporučeno 1200 × 630 px (Facebook neškáluje nahoru a výsledek vypadá mrňavě). Vyrobit dedikovaný `og-image.jpg` v 1200 × 630 px a doplnit `og:image:width="1200"` + `og:image:height="630"`.
- `servis.html`, `campy.html` — **chybí `og:image`**. Facebook si vybere náhodný obrázek ze stránky.
- Doporučuji pro každou klíčovou landing page mít vlastní OG obrázek (index, blog, servis, campy, pujcovna, individualni-kurzy, team, kontakt).

### 1.6 Strukturovaná data (JSON-LD)

Má pouze `index.html` — správně `Organization` + `LocalBusiness` s adresou, telefonem, sociálními sítěmi.

Chybí na stránkách, kde by velmi pomohla:
- `detail_post.html` → **Article / BlogPosting** (datum publikace, autor, obrázek).
- `detail_akce.html` → **Event** (datum, místo, cena, organizátor). Toto je mimořádně cenné — eventy se v Google zobrazují v samostatných panelech.
- `detail_product.html` → **Product** + nabídka **Offer** (cena, měna, dostupnost). Umožní rich snippets ve výsledcích.
- `servis.html`, `individualni-kurzy.html`, `campy.html`, `pujcovna.html` → **Service** nebo **Course**.
- Všechny podstránky → **BreadcrumbList**.
- Jakákoli FAQ sekce → **FAQPage**.

Jelikož jsou detail stránky plněny z Firestore přes `cms-loader.js`, JSON-LD se dá generovat dynamicky při načtení dat — Google ho umí přečíst i po hydraci.

### 1.7 H1 hierarchie

Z 45 stránek:
- 29 stránek má správně 1 H1 ✓
- 13 stránek má 0 H1 — většinou auth / checkout, ale také `detail_akce.html` a `detail_sku.html` (pravděpodobně čekají na plnění z CMS — ověřte, že se H1 injektuje při vykreslení obsahu z Firestore).
- `style-guide.html` má 9 H1, `setup-guide.html` 5 H1, `search.html` 2 H1 — nepřekáží, všechny jsou v robots disallow.

### 1.8 Alt texty

✓ Žádný `<img>` zcela bez `alt` atributu (811 obrázků).
⚠ 91 obrázků má prázdný `alt=""`. Ve většině případů to odpovídá (dekorativní grafika), ale na `setup-guide.html` je 14 obsahových screenshotů s prázdným alt — pokud se stránka ponechá, doplnit.

### 1.9 robots.txt a sitemap.xml

`robots.txt` je nastaven vzorně — blokuje auth/checkout/guide stránky a odkazuje na sitemapu.
`sitemap.xml` obsahuje 223 URL včetně blogových článků a akcí. Žádná URL z disallow listu se v sitemap neobjevuje — OK.

Doporučuji: v sitemap zkontrolovat `<lastmod>` hodnoty u blog / akce URL — aktuálně používá jen `<changefreq>` a `<priority>`. `<lastmod>` je pro Google silnější signál čerstvosti.

### 1.10 Drobnosti

- `<meta charset="utf-8">` ✓
- `<meta name="viewport" content="width=device-width, initial-scale=1">` ✓
- `hreflang` — chybí, ale web je pouze v češtině, takže nepotřeba (dokud nepřidáš EN verzi).
- `<html lang="cs">` — nekontrolováno explicitně, doporučuji ověřit na všech stránkách.

---

## 2. Performance — detailní nálezy

### 2.1 JavaScript

| Soubor | Velikost | Gzipped | Loading |
|---|---|---|---|
| `js/webflow.js` | 2,4 MB | 471 KB | `defer` ✓ |
| `js/cms-loader.js` | 61 KB | 15 KB | `defer` ✓ |
| `js/admin.js` | 43 KB | — | pouze /admin |
| jQuery 3.5.1 (CDN) | 85 KB | ~30 KB | `defer` ✓ |
| Firebase SDK app+firestore | ~300 KB | ~80 KB | `defer` ✓ |
| Typekit | variabilní | — | `async` ✓ |

**Hlavní zátěž:** `webflow.js` — 471 KB po gzipu. Firebase Hosting gzip zapíná automaticky, ale Brotli ještě agresivněji (~380 KB). Ověřte v DevTools → Network, zda response používá `content-encoding: br`. Firebase podporuje Brotli pro klienty s `accept-encoding: br` — pokud by se náhodou posílalo gzip, je tam rezerva ~20 %.

Samotný `webflow.js` obsahuje `commerce`, `forms`, `slider`, `dropdown`, `lightbox` atd. — všechno, co Webflow exportuje. Pokud některé interakce nepotřebujete, dal by se JS zmenšit o 30–50 %, ale vyžaduje to znalost Webflow buildu a je rizikové.

**Rychlá výhra:** ověřit Brotli kompresi u Firebase Hostingu a případně přidat `<link rel="modulepreload">` pro Firebase SDK, aby začal stahovat dřív.

### 2.2 CSS

Tři render-blocking CSS soubory v `<head>`:
- `normalize.css` (1,8 KB) — OK.
- `webflow.css` (29 KB) — OK.
- `multy-webflow-to-wordpres-ea5f0e3d27991.webflow.css` (201 KB) — jádro stylů, gzipped ~32 KB. Ponechat tak, jak je.

CSS je minifikované.

### 2.3 Fonty

✓ `preconnect` na `fonts.googleapis.com` + `fonts.gstatic.com`.
✓ `display=swap` (text se zobrazí fallback fontem hned).
⚠ Načítáte 3 rodiny × více řezů: Lato (3), Montserrat (5), Lobster (1) = **9 souborů woff2**. Pokud všechny skutečně používáte, OK — ale pravidlem palce bývá použít 2 rodiny max 3–4 řezy. Doporučuji zkontrolovat, které řezy se na webu reálně objevují (v DevTools → Coverage), a nepoužívané z URL odstranit.

### 2.4 Cache / hosting headers (firebase.json)

Výborné nastavení:

```
obrázky (jpg/png/webp/svg/…)   → 1 rok, immutable ✓
fonty (woff/woff2/ttf)          → 1 rok, immutable ✓
css/js                          → 1 týden          ✓
html                            → 1 hodina         ✓
```

Jedno drobné doporučení: CSS a JS nemají hash v názvu (`webflow.css`, nikoli `webflow.abc123.css`), takže při nasazení změn v CSS se klientovi stará verze načte ještě až 7 dní. Buď hashovat názvy souborů v buildu, nebo zkrátit max-age na 1 den.

### 2.5 Script loading strategie

Na homepage se načítá v tomto pořadí:
1. `<head>`: Google Analytics (async), schema JSON-LD inline, 3 CSS, Typekit (async).
2. `<body>` konec: jQuery → webflow.js (defer) → js-cookie → Firebase app → Firebase firestore → cms-loader.js.

`defer` je použit tam, kde dává smysl. Jediná věc: Google Analytics v `<head>` s `async` je standard, ale pokud vám nezáleží na přesných *"pageview"* při rychlém odchodu uživatele (< 1 s), šlo by ho přesunout k patě `<body>` a ušetřit blokování parseru při DNS lookupu do `googletagmanager.com`.

### 2.6 Obrázky — velikost a formáty

| Formát | Počet | Velikost | Průměr |
|---|---|---|---|
| PNG | 89 | 3,79 MB | 43,7 KB |
| WebP | 38 | 1,24 MB | 33,5 KB |
| JPEG | 28 | 1,07 MB | 38,2 KB |
| SVG | 10 | 0,02 MB | 1,9 KB |
| **Celkem** | **165** | **6,13 MB** | — |

**Problém č. 1: 114 obrázků (4,59 MB) není v žádné produkční HTML.** Jedná se o:
- Screenshot-2020-05-14-*.png (rozličné velikosti) — screenshoty z Webflow setup guide.
- `activate-udesly-plugin-*.png`, `webflow-to-wordpress-error.png`, `page-setting*.png` — tutoriál Udesly.
- `banner2021.jpg`, `banner2021-p-800.jpeg` — starý banner.
- Duplikáty „*-p-800", „*-p-1080" atd. (Webflow automaticky generuje responsivní varianty), které stránky nereferencují.

Smazáním uvolníte **4,59 MB z /public** (rychlejší deploy, menší storage). Běžné stránky to nezrychlí, protože se stejně nenačítají — ale je to hygiena.

Před smazáním doporučuji vytvořit zálohu (git add + commit) a ověřit, že CMS (Firestore) na žádné z těchto obrázků neodkazuje.

### 2.7 Obrázky — lazy loading, rozměry, srcset

Z 811 `<img>` tagů v HTML:
- **83 % má `loading="lazy"`** ✓ dobré.
- **0 má `loading="eager"`** — LCP (Largest Contentful Paint) obrázek by měl mít `eager` a ideálně `fetchpriority="high"`. Na `index.html` je prvních pár img ve sliderech a jsou lazy — což zhoršuje LCP. Najít hero/první viditelný obrázek a nastavit `loading="eager" fetchpriority="high"`.
- **Jen 10 % má `width` + `height`** → riziko CLS. Bez rozměrů prohlížeč neví, kolik místa obrázku rezervovat, a při načtení se obsah „poskočí". Doplnit atributy na všechny nelazy obrázky v horní části stránky (hero, sekce nad fold).
- **Jen 2 % mají `srcset`** → mobily stahují stejně velké obrázky jako desktop. Webflow `-p-500.jpg`, `-p-800.jpg`, `-p-1080.jpg` varianty v `/images` už existují, ale v HTML se nepoužívají. Doplnit `srcset` alespoň u hero obrázků a obrázků v kartách.

### 2.8 Konverze PNG → WebP

Top 4 PNG > 200 KB patří k `setup-guide.html`, takže jejich smazání (viz 2.6) problém vyřeší. Ze zbývajících PNG v produkci bych namátkově přehnal skript `cwebp -q 82` a ušetřil dalších ~30 % velikosti. Je to ale opravdu "last mile" optimalizace — hlavní rezerva je jinde.

---

## 3. Doporučený plán prací (v pořadí)

### Urgentní (1–2 hodiny)
1. **Opravit title + description** na `detail_product.html` a `detail_category.html` — dynamicky z `cms-loader.js`, fallback statický v češtině.
2. **Doplnit meta description** na `obchodni-podminky.html`, `dodaci-podminky.html`, `404.html`.
3. **Vyrobit OG image 1200 × 630 px** pro homepage + hlavní landingy (servis, campy, kurzy, pujcovna, blog). Nahradit v `og:image`.
4. **Zkontrolovat, že `detail_akce.html` a `detail_sku.html` plní H1 dynamicky** z CMS (jinak se indexuje prázdná stránka).

### Brzy (1 den)
5. **Smazat 114 nepoužívaných obrázků** (cca 4,59 MB). Před smazáním seznam zkontrolovat proti Firestore (CMS může na některé odkazovat v polích obsahu).
6. **Přidat JSON-LD** `Event` na `detail_akce.html`, `Article` na `detail_post.html`, `BreadcrumbList` na všechny detail stránky. Generovat z Firestore dat v `cms-loader.js`.
7. **Doplnit `og:image` na `servis.html` a `campy.html`** (a jakoukoli další landing bez něj).
8. **Přejmenovat/zlepšit titles** na `campy.html`, `pujcovna.html`, servisních podstránkách (přidat brand + lokalitu).

### Střednědobě (několik dní)
9. **Doplnit `width` + `height`** atributy na obrázky nad fold. Pro Webflow export je to nejjednodušší doplnit skriptem, který si přečte rozměry souborů a upraví HTML.
10. **Nastavit `loading="eager" fetchpriority="high"`** na LCP kandidát (první hero obrázek).
11. **Doplnit `srcset`** pro hero / první sekci každé klíčové stránky — varianty `-p-500`, `-p-800`, `-p-1080` už existují.
12. **Přesunout `setup-guide.html` a `style-guide.html` mimo `/public`** (např. do `/public-dev/` ignorovaného v `firebase.json`), ať se na produkci neobjevují vůbec.
13. **Zkontrolovat Brotli** v Response Headers produkčního webu (DevTools → Network → zvolit `webflow.js` → Response Headers → `content-encoding: br`).
14. **Pro blog a akce doplnit `<lastmod>` do sitemap.xml** (v `generate-sitemap.js`).

### Dlouhodobě / doporučené
15. **Core Web Vitals měření** — připojit Google Search Console + PageSpeed Insights API a sledovat LCP/INP/CLS v čase.
16. **Redukce počtu font variant** (Lato + Montserrat + Lobster, dohromady 9 řezů — v Coverage ověřit, co se reálně používá).
17. **Zvážit přepsání homepage hero** na klasický `<img>` (nebo `<picture>`) s explicitní velikostí a `fetchpriority="high"` místo Webflow sliderového kontejneru — výrazně pomůže LCP na mobilech.

---

## 4. Co je v pořádku (ponechat)

- `robots.txt` — blokování auth a pomocných stránek.
- `sitemap.xml` generovaná buildem z `generate-sitemap.js`.
- Firebase hosting cache headers — nastavení 1 rok / 1 týden / 1 hod je best practice.
- 301 redirecty ze starých WordPress URL (70+ pravidel v `firebase.json`) — zachovávají linkbuilding ze starého webu.
- `defer` na skriptech, `async` na GTM a Typekit, `preconnect` na Google Fonts.
- `loading="lazy"` na 83 % obrázků.
- `display=swap` na Google Fonts.
- Homepage `Organization` / `LocalBusiness` JSON-LD.
- Canonical URL na všech produkčních stránkách.
- Čeština jako dominantní jazyk v titles/descriptions/H1.

---

## Příloha A — Seznam stránek s kritickými nálezy

| Stránka | Nález | Priorita |
|---|---|---|
| `detail_product.html` | Anglický title + description ze šablony | **P0** |
| `detail_category.html` | Anglický title + description ze šablony | **P0** |
| `obchodni-podminky.html` | Chybí meta description | P1 |
| `dodaci-podminky.html` | Chybí meta description | P1 |
| `servis.html` | Chybí og:image | P1 |
| `campy.html` | Chybí og:image, description 284 znaků, slabý titul | P1 |
| `pujcovna.html` | Description 49 znaků, titul bez brandu | P1 |
| `detail_akce.html` | Bez JSON-LD Event, 0 H1 ve statickém HTML | P1 |
| `detail_post.html` | Bez JSON-LD Article | P1 |
| `kompletni-servis-full.html` | Titul bez brandu | P2 |
| `standartni-servis-kol.html` | Titul bez brandu | P2 |
| `setup-guide.html`, `style-guide.html` | Template zbytky, by měly být mimo produkci | P2 |

## Příloha B — 20 největších nepoužívaných obrázků

Kandidáti na smazání (celkem 114 souborů / 4,59 MB):

- Screenshot-2020-05-14-at-14.56.12.png — 426 KB
- Screenshot-2020-05-14-at-14.54.20.png — 306 KB
- banner2021.jpg — 234 KB
- page-setting.png — 221 KB
- Screenshot-2020-05-14-at-14.54.20-p-2000.png — 203 KB
- Screenshot-2020-05-14-at-14.56.12-p-1600.png — 198 KB
- Screenshot-2020-05-14-at-14.42.04.png — 193 KB
- banner2021-p-800.jpeg — 175 KB
- Screenshot-2020-05-14-at-14.54.20-p-1600.png — 150 KB
- Screenshot-2020-05-14-at-14.56.12-p-1080.png — 116 KB
- webflow-to-wordpress-error.png — 106 KB
- activate-udesly-plugin-2.png — 105 KB
- Bikeplan-pojištění.webp — 105 KB *(možná duplicita s `bikeplan-pojisteni.webp`)*
- activate-udesly-plugin-3.png — 94 KB
- MTBTRIAL-MRAVENIŠTĚ-ŘÍČANY_1MTB&TRIAL-MRAVENIŠTĚ-ŘÍČANY.webp — 86 KB
- Screenshot-2020-05-14-at-14.54.20-p-1080.png — 86 KB
- page-setting-p-1080.png — 85 KB
- webflow-to-wordpress-error-p-1600.png — 81 KB
- Screenshot-2020-05-14-at-14.56.12-p-800.png — 77 KB
- Screenshot-2020-05-14-at-14.42.04-p-2600.png — 74 KB

Úplný seznam lze získat skriptem — zájemce o automatizaci doporučuji vytvořit `scripts/find-unused-images.js` v projektu.

## Aktualizace 24. 4. 2026 — Oprava zoomu/ořezu náhledů Akce (HP)

**Problém:** V sekci „Kurzy, Campy a další akce" na homepage byly náhledové obrázky příliš přiblížené – zobrazovala se pouze horní část snímku, hlavní motiv (text/účastníci) byl oříznutý.

**Příčina (diagnostika CSS):**

- `.akce-image-blok` měl `height: 130px` s `overflow: hidden`
- `.image-55` měl `position: absolute; bottom: auto; object-fit: cover; max-width: 100%`, ale **bez explicitní výšky**
- Obrázek tedy zůstal v přirozené velikosti a nadřazený blok mu oříznul spodní část → dojem silného „zoomu"

**Fix:** Scoped CSS override v `<style>` bloku v `public/index.html` (řádky 627–651):

```css
.kurzy-campy-akce-section .akce-image-blok { height: 240px; }
.kurzy-campy-akce-section .image-55 {
    position: absolute; top: 0; left: 0;
    width: 100%; height: 100%;
    max-width: none;
    object-fit: cover; object-position: center center;
}
/* responzivní breakpointy: 991px→220px, 767px→210px, 479px→260px */
```

**Důsledky:**

- Obrázek nyní vyplňuje celý blok přes `object-fit: cover` a zobrazuje střed motivu.
- Výška bloku zvětšena ze 130 px na 240 px (desktop) / 260 px (mobil ≤479 px, kde je grid 1 sloupec).
- Rozsah úpravy: **pouze homepage** (scoping přes `.kurzy-campy-akce-section`, která se jinde nevyskytuje).
- Archiv akcí (`akce-archive.html`) má stejný problém — doplněna identická úprava scoped přes `.section-wrapper.kurzy-campy` (wrapper existuje na HP i v archivu).
- HTML atributy `width="800" height="600"` z `cms-loader.js` (doplněné kvůli CLS) zůstávají — CLS se neřeší přes ně, protože kontejner má teď fixní výšku.

**Dotčené soubory:**

- `public/index.html` — inline `<style>` override na konci stávajícího bloku (řádky 627–651)
- `public/akce-archive.html` — stejný override před `</style>` (řádek 548)


---

## Aktualizace 24. 4. 2026 — PageSpeed Insights baseline

**Metodika:** Měření přes [pagespeed.web.dev](https://pagespeed.web.dev) (Lighthouse 13.0.1, jedno načtení stránky, prostředí HeadlessChromium 146). Mobilní emulace: Moto G Power, pomalé 4G. Desktop: emulovaná plocha, vlastní omezení sítě. Měřeno z produkční domény `bikeskills.cz`, snapshot z 24. 4. 2026 ~23:40–23:45 SELČ. Hodnoty Lighthouse jsou odhady a kolísají ±5–10 bodů mezi běhy — baseline slouží jako orientační startovní bod, ne absolutní hodnota.

Zkratky: **P** = Výkon (Performance), **A** = Přístupnost (Accessibility), **BP** = Doporučené postupy (Best Practices), **SEO** = SEO skóre.

### Skóre přehled (Lighthouse 0–100)

| Stránka | Zařízení | P | A | BP | SEO |
|---|---|---:|---:|---:|---:|
| `/` (HP) | Mobil | 45 | 87 | 96 | 100 |
| `/` (HP) | Desktop | 66 | 87 | 92 | 100 |
| `/individualni-kurzy` | Mobil | 55 | 90 | 100 | 100 |
| `/individualni-kurzy` | Desktop | 84 | 90 | 96 | 100 |
| `/campy` | Mobil | 48 | 86 | 100 | 100 |
| `/campy` | Desktop | 87 | 86 | 96 | 100 |
| `/servis` | Mobil | 48 | 87 | 100 | 100 |
| `/servis` | Desktop | 69 | 83 | 96 | 100 |
| `/akce-archive` | Mobil | 50 | 81 | 92 | 100 |
| `/akce-archive` | Desktop | **29** | 81 | 92 | 100 |
| `/blog` | Mobil | 52 | 86 | 92 | 100 |
| `/blog` | Desktop | 53 | 86 | 92 | 100 |

### Core Web Vitals — detailní metriky (vybrané stránky)

| Stránka | Zařízení | FCP | LCP | TBT | CLS | SI |
|---|---|---:|---:|---:|---:|---:|
| `/akce-archive` | Mobil | 8,3 s | 18,0 s | 290 ms | 0,07 | 8,5 s |
| `/akce-archive` | Desktop | 0,7 s | 4,0 s | 620 ms | **0,713** | 1,7 s |
| `/blog` | Mobil | 2,6 s | **22,6 s** | 420 ms | 0,002 | 9,6 s |
| `/blog` | Desktop | 0,7 s | 3,8 s | 410 ms | 0,003 | 3,3 s |

Prahy Core Web Vitals (2026): **LCP** ≤ 2,5 s good / ≤ 4 s needs improvement. **TBT** ≤ 200 ms / ≤ 600 ms. **CLS** ≤ 0,1 / ≤ 0,25. **FCP** ≤ 1,8 s / ≤ 3 s.

### Klíčová zjištění

- **SEO a Přístupnost jsou OK** — všechny stránky 100 SEO, A mezi 81–90. Focus je na P a BP.
- **Mobilní výkon je všude slabý** (45–55) — primárně kvůli LCP (největší obrázek nebo text render se načítá příliš pomalu) a Total Blocking Time (jQuery + Webflow JS balíky blokují hlavní vlákno).
- **Desktop se kroutí** mezi 53 (blog) a 87 (campy). Variabilita ukazuje, že problém je závislý na obsahu konkrétní stránky, ne systémový.
- **`/akce-archive` desktop — CLS 0,713 je kritické** (~7× nad good threshold). Stránka během renderu výrazně poskakuje. Pravděpodobná příčina: CMS loader (`cms-loader.js`) vkládá obrázky s `width`/`height` atributy, ale **kontejner `.akce-image-blok` má nově fixní výšku a `image-55` absolute pozici** — to by mělo pomoct. Vysoké CLS může být z jiné sekce (např. `.kurzy-campy` wrapper, který na archivu hostí všechny akce, nebo cookies banner). **Stojí za další prozkoumání** až bude nasazeno.
- **`/akce-archive` desktop TBT 620 ms** — hraničně "poor". JS pro CMS filtrování akcí běží nepotrebně dlouho.
- **`/blog` mobil LCP 22,6 s** — extrémně pomalý first paint. Stránka načítá úvodní banner z `/wp-content/uploads/` (nekomprimovaný/velký původní obrázek). Náprava: WebP + `fetchpriority="high"` + preload.

### Kontext pro interpretaci

Snapshot byl pořízen **před** nasazením opravy zoomu náhledů Akce (sekce výše). Opětovné změření po deploy ukáže, jestli:

1. fix `.akce-image-blok { height: 240px }` pomohl s CLS na `/akce-archive` (očekávané zlepšení — kontejner nyní alokuje prostor předem)
2. nebo jestli CLS byl způsoben jinou sekcí (cookies banner, Webflow interactions)

### Priority pro optimalizaci (návrh podle baseline)

1. **P1 — `/akce-archive` desktop CLS 0,713** — nejdřív ověřit dopad fixu Akce, pak diagnostikovat zbytek (cookies banner, Webflow IX2, lazy-loadované obrázky bez rozměrů). Layout shift je z UX i SEO hlediska nejhorší problém celého webu.
2. **P1 — `/blog` mobil LCP 22,6 s** — konverze obrázku banneru článku na WebP (zachování kvality, ~30–50 % úspora), `<link rel="preload">` pro hero image, kontrola `loading="lazy"` u first-above-the-fold.
3. **P2 — TBT napříč stránkami (290–620 ms)** — defer/async skriptů, odstranění nepoužívaných Webflow JS modulů (`webflow.js` je monolit ~120 KB). Sledovat `scripts` tag a zavést `defer` tam, kde ještě není.
4. **P2 — Accessibility 81–90** — většinou drobné (contrast ratio, chybějící aria-label). Doplnit při příštím iteračním kole.
5. **P3 — BP 92 vs 100** — rozdíl je obvykle v `no-unload-listeners` nebo `third-party-cookies`. Nízká priorita, některé nálezy plynou z GTM/GA, na které má smysl nezasahovat.


---

## Aktualizace 25. 4. 2026 — Architekturní analýza LCP na CMS stránkách

**Návaznost:** baseline z 24. 4. 2026 ukázal `/blog` mobil LCP **22,6 s**. Tento oddíl rozebírá, **proč** je to tak špatné, a navrhuje 4 cesty řešení.

**Poznámka k metodice:** Chrome MCP extension nebyla v této session dostupná, nemohl jsem zachytit živý waterfall. Analýza vychází z lokálního čtení kódu (`public/js/cms-loader.js` 1612 řádků, `public/blog.html`, `firebase.json`, `functions/index.js`) a z baseline PSI. Doporučuji ručně potvrdit waterfall v DevTools před implementací.

### Problém technicky

LCP element na `/blog` je první náhledový obrázek karty článku (`[item="featured-image"]` v `.collection-blog-item`). V publikovaném HTML má `<img>` **prázdný `src=""`** — URL se nastaví až runtime z Firestore. Tím LCP čeká na celý řetězec závislostí:

1. **HTML download** (TTFB ~200–500 ms na Firebase Hosting CDN)
2. **HTML parse + script discovery** — všechny skripty mají `defer`: jQuery (86 KB), `webflow.js`, `firebase-app-compat.js`, **`firebase-firestore-compat.js` (~280 KB)**, `cms-loader.js` (~50 KB)
3. **Skripty se stáhnou + parsuje + spustí** — na pomalé 4G to je 1,5–2,5 s pro Firestore SDK samotné
4. **`DOMContentLoaded` fire** → `cms-loader.js` zavolá `loadClankyList()`
5. **TLS handshake na `firestore.googleapis.com`** (cold connect ~300–600 ms — žádný preconnect v `<head>`)
6. **Firestore query `db.collection('clanky').orderBy('datum','desc').get()`** — **bez `.limit()`**, stáhne všech **138 článků** najednou (každý dokument obsahuje `popis`, `obsah` HTML, atd. — odhad 1–3 MB komprimované response)
7. **Render** — `imgEl.src = resolveUrl(data.imageUrl)` na první kartě — **teď teprve** browser začne stahovat hero obrázek
8. **TLS handshake na `firebasestorage.googleapis.com`** (cold connect — opět žádný preconnect)
9. **Image download** (i pro WebP 200 KB to je 0,5–2 s na pomalé 4G)
10. **LCP fires**

Na desktop tento řetězec stihne ~3,8 s, na mobilu Lighthouse pomalá 4G dosáhne 22,6 s. Konverze JPG → WebP samotná zachrání jen krok 9 (~500–1 000 ms) — **to je zhruba 5 % problému**, ne hlavní páka.

### Analýza CMS architektury (z kódu)

**Stránky a fetch pattern:**

- `/blog` → `loadClankyList()` → `db.collection('clanky').orderBy('datum','desc').get()` — **138 článků naráz**, klient-side paginace na 12 / stránku
- `/akce-archive` → `loadAkceList()` → `db.collection('akce').get()` — **60 akcí naráz**
- `/blog/<slug>` → `loadClanekDetail(slug)` → `where('slug','==',slug).limit(1).get()` + následně `orderBy('datum','desc').limit(5).get()` pro related posts (2 paralelní queries)
- `/akce/<slug>` → `loadAkceDetail(slug)` → `where('slug','==',slug).limit(1).get()` + galerie/lightbox
- Navíc každá stránka volá `applySeoFromSettings(path)` → `db.collection('settings').doc('seo').get()` (3. paralelní query)

**Build-time generování:** `scripts/generate-sitemap.js` už používá `firebase-admin` se `serviceAccountKey.json` — infrastruktura pro pre-render je tedy připravená, jen není využitá pro HTML.

**Firebase Functions:** `functions/index.js` má `sitemap`, `sendReservation`, `sendServisForm` — žádné SSR, ale infrastruktura existuje (region `europe-west1`).

**Hosting rewrites (`firebase.json`):** všechny detail URL (`/blog/**`, `/akce/**`, `/team/**`) jsou rewritované na statický `detail_post.html` / `detail_akce.html` / `detail_archive-team.html`. Tj. SEO crawler dostane prázdnou kostru a musí počkat na JS — neskvělé pro indexaci, ale Google to dnes řeší.

### Rozsah dat

| Kolekce | Počet dokumentů | Reálná potřeba pro LCP |
|---|---:|---|
| `clanky` | ~138 | 12 (první stránka) |
| `akce` | ~60 | 12 (první stránka) |
| Detail stránek | 138 + 60 = 198 | 1 (konkrétní slug) |

Over-fetch faktor 11× na `/blog` a 5× na `/akce-archive`.

### Možnosti řešení

| | Varianta A — Pre-render (SSG) | Varianta B — Functions SSR | Varianta C — Resource hints + limit | Varianta D — Status quo |
|---|---|---|---|---|
| **Princip** | Build-time skript stáhne data z Firestore a injectuje statický HTML do `blog.html`, `akce-archive.html` a generuje detail soubory `public/blog/<slug>/index.html` | Cloud Function renderuje HTML on-demand, cached na CDN přes `Cache-Control` header, rewrite v `firebase.json` | `<link rel="preconnect">` na `firestore.googleapis.com` + `firebasestorage.googleapis.com`, Firestore query s `.limit(12)` | Akceptovat pomalé CMS, optimalizovat statické stránky |
| **Dopad na LCP** | **22 s → ~3–5 s** (eliminuje firebase SDK + Firestore query z kritické cesty, browser preload scanner najde `src` v HTML hned) | **22 s → ~3–5 s** po cache hit; cold start funkce přidá 1–3 s | **22 s → ~17–19 s** (ušetří TLS handshakes a stahování dat, ale Firestore SDK 280 KB zůstává) | žádná změna |
| **Úsilí** | 1,5–2 dny (3 skripty, drobné úpravy `cms-loader.js` na progressive enhancement) | 2–4 dny (SSR template, error handling, cache logika, `minInstances: 1` pro cold start) | 0,5–1 den | 0 hodin |
| **Údržba** | Nízká — script běží automaticky před `firebase deploy`. CMS update = `npm run deploy:hosting` (volitelně automatizovat přes Firebase trigger + GitHub Action) | Střední — Function code je další vrstva, kterou je třeba testovat a deployovat. Cache invalidation logika nutná | Nízká | Nulová |
| **Náklady** | $0 — žádný runtime overhead | ~$0–5/měs (free tier 2M invokes; `minInstances:1` přidá ~$3) | $0 | $0 |
| **Rizika** | CMS změny nejsou real-time (ale reporty z akcí přidáváš nárazově, ne kontinuálně). Detail stránky se generují staticky → nutno re-deploy při změně textu článku | Cold start, vendor lock-in na Functions, deploy komplexnější. Pokud Functions selžou, celý blog nefunguje | LCP zůstane v "poor" pásmu (>4 s). Google CWV penalizace nezmizí | Postupné zhoršení Search rankingu jak Google víc bere CWV v úvahu |
| **Vhodnost** | ✅ Nejlepší pro malý web s relativně statickým obsahem | Použitelné, ale overkill pro 138 článků | Užitečné jako doplněk k A nebo B | Nedoporučeno — CWV mají rostoucí váhu v rankingu |

### Doporučení

**Doporučuji Variantu A (SSG/pre-render) doplněnou o resource hints z Varianty C.**

Důvody:

1. **One-person team** — A nepřidává runtime infrastrukturu k údržbě. SSR (B) přidá další kódovou bázi a cache logiku, kterou musíš sám provozovat.
2. **Bikeskills má relativně statický CMS** — reporty z akcí přibývají v řádu jednotek měsíčně, akce/kurzy se plánují s předstihem. Real-time nemá hodnotu, latence "deploy ~5 min po publish" je akceptovatelná.
3. **Reuse infrastruktury** — `firebase-admin` se service accountem už používáš v `scripts/generate-sitemap.js`. Stejný kód, stejné credentials.
4. **Bez vendor lock** — pre-rendered HTML je čistý statický soubor. Pokud někdy migruješ z Firebase Hosting jinam, `public/` jde převést 1:1.
5. **Nulové runtime náklady** — žádný cold start, žádný compute, jen Firebase Hosting CDN (kde už platíš).
6. **LCP redukce největší** — A i B dosahují srovnatelně cca 3–5 s, ale A je výrazně levnější na implementaci.
7. **Možnost progressive enhancement** — `cms-loader.js` může zůstat pro filtry/paginaci/related posts; jen ho upravíš tak, aby nepřepisoval pre-rendered DOM, pokud existuje.

**Konkrétní krok-za-krokem (odhad celkem 1,5–2 dny):**

- *Krok 1 (3–4 h):* `scripts/prerender-listings.js` — načte 12 nejnovějších článků a 12 nejbližších akcí, vyrenderuje HTML markup karet a injectuje do `public/blog.html` + `public/akce-archive.html` na místo prázdného template.
- *Krok 2 (4–6 h):* `scripts/prerender-detail-pages.js` — pro každý slug vygeneruje `public/blog/<slug>/index.html` jako kopii `detail_post.html` s nahrazeným `<title>`, `<meta>`, `<img src>`, `[item="content"]` HTML, JSON-LD Article schema. Stejně pro `akce/<slug>/index.html`. Pak smazat rewrites z `firebase.json`.
- *Krok 3 (1–2 h):* upravit `cms-loader.js` — pokud detekuje, že `[item="featured-image"]` už má neprázdný `src`, neresetuje DOM, jen napojí filtry/paginaci/related posts.
- *Krok 4 (1 h):* `package.json` — `"prerender": "node scripts/prerender-listings.js && node scripts/prerender-detail-pages.js"`, deploy hook `npm run deploy:hosting`.
- *Krok 5 (15 min):* přidat preconnect hints do `<head>` všech HTML (i statických — pomůže `cms-loader.js` doplňování pro filtry/related/paginace).

**Sekundární optimalizace (i pokud zvolíš jinou variantu):**

- Refaktor `loadClankyList()` a `loadAkceList()` na `.limit(12).get()` + Firestore cursor pro stránkování — over-fetch 11× je velmi špatný i kdyby LCP byl OK.
- Odstranit `applySeoFromSettings()` query pro CMS stránky — meta tagy už jsou v HTML staticky napsané, dynamický override z Firestore přidává jen latenci a nepřidává hodnotu.

### Návazné kroky

Před implementací doporučuji:

1. **Spustit DevTools waterfall** na `/blog` (Chrome DevTools → Network → Disable cache → Slow 4G throttling → reload). Potvrdit, že LCP element je opravdu featured-image první karty a ne např. hero text. Pokud bys nedostál připojit Chrome MCP příště, můžeš mi sdílet HAR export.
2. **Zkontrolovat Search Console**, kolik traffic má `/blog` a `/akce-archive` a jednotlivé detail URL — pokud detail stránky generují většinu kliků, je to silný argument pro variantu A (kde detail dostane největší benefit).
3. **Rozhodnout se pro variantu** (A / B / C / D). Po potvrzení připravím implementační plán a skripty.

**Status:** analýza, neimplementováno. Čeká na rozhodnutí.


---

## Aktualizace 1. 5. 2026 — Optimalizační kolo 2

**Kontext:** Mezi baseline (24. 4. 2026) a tímto kolem byla nasazena řada optimalizací (commits 06ec181 → 7a29567), takže i kdyby nedošlo k žádnému dalšímu zásahu, PSI metriky by se měly výrazně zlepšit oproti původnímu měření. Toto kolo (a) ověřuje stav v produkci, (b) identifikuje a opravuje skryté regrese, (c) dodává low-hanging-fruit zlepšení.

### Co je v produkci nasazeno (od 25. 4.)

Z `git log --since 25.4.` vyplývá, že byla provedena tato práce, kterou jsem ověřil curl-em proti živému webu:

| Optimalizace | Kde | Ověření |
|---|---|---|
| **SSG / pre-render** listing kartiček (12 ks) | `blog.html`, `akce-archive.html` (commit `0e7129a` + `9fbd35f`) | `data-prerendered="true"` v HTML přímo z curl-u, žádné čekání na Firestore. |
| **Hero LCP image** s `<link rel="preload"> + imagesrcset + fetchpriority="high"` | `<head>` všech listing stránek (commit `e2272a9` + `e963625`) | preload tag přítomen, image má `loading="eager" fetchpriority="high"`. |
| **Responsive srcset** 400/800/1600 WebP | všechny listing kartičky (commit `0240917`) | `srcset` + `sizes` přítomen u 12 kartiček. |
| **Cookie banner CLS fix** | `consent.js` + CSS (`a55e860`, `06ec181`, `4cb5660`, `12c3244`) | Banner má `display:none` výchozí, ukazuje se s 800 ms delay PO `window.load` přes třídu `cookies-show` na `<html>`. |
| **Lobster font self-hosted + preload + display:optional** | listing stránky (`06ec181`) | `<link rel="preload" as="font">` na 2 woff2 soubory. |
| **Lato + Montserrat lazy** přes `rel=preload as=style onload=this.rel='stylesheet'` | všechny stránky (`25b31c8`) | non-blocking pattern v HTML. |
| **Brotli compression** | Firebase Hosting auto | `content-encoding: br` na `webflow.css` i `webflow.js` (ověřeno curl -I). |
| **HSTS** `max-age=31556926` | Firebase auto | response header přítomen. |
| **JSON-LD Course schema** pro kurzové stránky bez fixních datumů | prerenderer (`7a29567`) | nasazeno. |
| **GDPR consent gating** GA4 + Meta Pixel | `consent.js` (`a55e860`) | trackery se nenačtou bez `cookieConsent=accepted`. |

Tj. obě P1 položky z baseline byly mezitím adresovány na úrovni kódu. Praktickou efektivitu je ale nutné potvrdit svěží PSI měřením — viz „Limity tohoto kola".

### Nově nalezený kritický problém — chybějící image variants

**Spuštěný diagnostický nástroj:** `node scripts/diagnose-variants.js`

**Nález:** Storage bucket `bikeskills-web.firebasestorage.app` má **13 originálních obrázků bez vygenerovaných WebP variant** `_400x400`, `_800x800`, `_1600x1600` (Firebase Image Resize Extension je nezpracovala — pravděpodobně extension queue selhal pro tyto konkrétní soubory). Per-year breakdown z diagnostického skriptu:

```
1776 (timestamp ~04/2026): 11 missing
1777 (~04-05/2026):         0 missing
2024 (legacy import):       1 missing (jeden 8.87 MB JPG)
unknown (placeholder):      1 missing
```

**Proč to bolí LCP `/akce-archive` desktopu:**

První karta v prerendered listingu (LCP element) odkazovala na `images/akce/1776888296311_trenink.webp`. HTML obsahoval:

```html
<link rel="preload" as="image"
  href="…1776888296311_trenink_800x800.webp"   ← HTTP 404
  imagesrcset="…_400x400.webp 400w, …_800x800.webp 800w, …_1600x1600.webp 1600w"  ← všechny 404
  fetchpriority="high">
```

Browser tedy:

1. Vystřelil `fetchpriority=high` request → **404** v ~50–200 ms (zbytečná kritická request).
2. `<img>` srcset rovněž 404 → onerror handler odebere `srcset` → fallback na `src` (originál 309 KB, **nikoli** 800x800 verze ~150 KB).
3. Originál se začne stahovat až **po** failure srcsetu, mimo preload prioritu.

Při Lighthouse Slow 4G to znamená několik sekund navíc na LCP kvůli zbytečným retries + downloadu velké originály místo komprese.

**Fix (proveden):** `node scripts/local-resize-fallback.js $(cat /tmp/missing-originals.txt)` — Sharp lokálně vygeneroval všech 13×3 = 39 chybějících variant a uploadnul je do Storage. Ověřeno curl-em — `1776888296311_trenink_400x400.webp`, `_800x800.webp`, `_1600x1600.webp` nyní vrací HTTP 200, `image/webp`, content-length 41/148/259 KB.

**Seznam obnovených originálů:**

```
images/akce/1776888209747_trenink.webp                                  ← druhý akce hero
images/akce/1776888296311_trenink.webp                                  ← /akce-archive LCP hero
images/akce/gallery/1776888189537_trenink.webp                          ← gallery
images/akce/gallery/1776945535669_…Kreslici-platno…                     ← gallery (3 ks)
images/akce/gallery/1776945551758_…
images/akce/gallery/1776945680823_…
images/placeholder.webp                                                  ← fallback pro blog karty
images/team/gallery/1776692843360_…20232663…                            ← team gallery (5 ks)
images/team/gallery/1776692844619_…Rasochy-cup-6…
images/team/gallery/1776692845843_…DSCN5501…
images/team/gallery/1776692847023_…FB_IMG…
images/team/gallery/1776692848440_…20180421-124130…
wp-content/uploads/2024/12/20240427_102854.jpg                          ← legacy upload (8.87 MB)
```

**Riziko:** Nízké. Skript reprodukuje výstup Image Resize Extension (stejný formát názvů, stejná logika `fit:'inside', withoutEnlargement:true, quality:80`). Originální soubory zůstávají nedotčené.

**Sekundární doporučení (nezavádět teď):** Sledovat, zda Image Resize Extension při dalších uploadech přes admin panel (Quill upload) opět nezapadne — pokud ano, doplnit do `admin.js` post-upload hook, který po nahrání do `images/akce/` nebo `images/blog/` zavolá triggeringovou logiku ručně, případně vyčte logy z extension queue. Diagnostický skript by měl běžet 1× měsíčně.

### Security hygiene — security headers do `firebase.json`

**Stav před:** Firebase auto-přidává `strict-transport-security` (HSTS) `max-age=31556926`. Žádné jiné security headers.

**Změna:** přidán nový blok do `hosting.headers` aplikující se na `**/*`:

```json
{
  "source": "**/*",
  "headers": [
    { "key": "X-Content-Type-Options", "value": "nosniff" },
    { "key": "X-Frame-Options", "value": "SAMEORIGIN" },
    { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
    { "key": "Permissions-Policy", "value": "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()" }
  ]
}
```

**Zdůvodnění voleb:**

- **X-Content-Type-Options: nosniff** — zákaz MIME sniffingu (univerzálně doporučováno, žádné vedlejší efekty).
- **X-Frame-Options: SAMEORIGIN** — povolen embed na vlastní doméně, blokován cross-origin (zabrání clickjackingu). `DENY` by zlomil potenciální vlastní iframe v admin UI; `SAMEORIGIN` je bezpečný kompromis.
- **Referrer-Policy: strict-origin-when-cross-origin** — moderní default (Chrome už toto chování má, ale explicitní hlavička pomáhá Firefoxu/Safari starší verze).
- **Permissions-Policy** — vypíná hardware API, která web nepoužívá. Neovlivní funkčnost partner widgetů (Comgate, Finsweet slider dots, Webflow IX2).

**CSP záměrně NEPŘIDÁNO.** Web načítá dynamicky inline scripty (Webflow IX2, GA4 přes consent.js, Meta Pixel), inline styly a externí domény (Firebase, Google Fonts, gstatic, cloudfront). Smysluplná CSP by vyžadovala audit a `nonce`-based whitelisting — to je samostatná práce, ne low-hanging fruit. **Doporučuji odložit do dedikovaného sprintu** s testovací doménou a Report-Only fází.

**Po deployi otestovat:**

- `curl -I https://bikeskills.cz/` — měly by se objevit 4 nové hlavičky.
- Mozilla Observatory `https://observatory.mozilla.org/analyze/bikeskills.cz` — očekávaný posun ze D/F na B (CSP chybí, takže A není dostupné).
- Smoke test: navigace po webu, fungují cookie banner, GA load po accept, Webflow animace, Comgate redirect z patičky. Nic z toho není dotčeno přidanými hlavičkami.

### Limity tohoto kola

**PSI nezměřeno.** Důvody:

1. **Anonymous PageSpeed Insights API quota = 0** — služba `pagespeedonline.googleapis.com` pro project 583797351490 vrací `RESOURCE_EXHAUSTED`. Memory záznam `project_bikeskills_psi_results.md` to potvrzuje.
2. **Chrome MCP extension není připojen** — `mcp__Claude_in_Chrome__list_connected_browsers` vrátil `[]`. Naše plánovaná cesta přes `pagespeed.web.dev` UI tedy nelze spustit.
3. **Bikeskills není v cowork-egress allowlistu pro browserless / WebPageTest** — pokus o jiný měřící endpoint by skončil stejně.

**Co dělat dál:** Spustit PSI ručně z prohlížeče po deployi:

- `https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fbikeskills.cz%2Fakce-archive&hl=cs&form_factor=desktop`
- `https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fbikeskills.cz%2Fblog&hl=cs&form_factor=mobile`

Zachytit screenshot a před/po porovnat s baseline tabulkou ze sekce „PageSpeed Insights baseline".

### Očekávané dopady (kvalifikovaný odhad bez měření)

| Stránka | Metrika | Baseline | Očekávaný pokles po nasazení | Zdroj zlepšení |
|---|---|---:|---:|---|
| `/blog` mobil | LCP | 22,6 s | **3–5 s** | SSG (eliminuje Firebase SDK + Firestore z kritické cesty), preload+fetchpriority, srcset, WebP |
| `/akce-archive` desktop | LCP | 4,0 s | **1,5–2,5 s** | + dnešní fix variant (uvolní preload + správnou velikost přes srcset místo 309 KB originálu) |
| `/akce-archive` desktop | CLS | 0,713 | **< 0,1** | Fix Akce zoomu (height:240px), font-display:optional, cookie banner ukázaný až po window.load+800ms |
| Mobil TBT napříč | TBT | 290–620 ms | **150–350 ms** | Lobster preload (snížení FCP→LCP gap), méně dynamického DOM rebuiltu díky SSG |

**Pozor:** Toto jsou modelové odhady ze změn v kódu, NE měřené hodnoty. Je nezbytné PSI manuálně přeměřit po dnešním deployi (image variants + security headers) a přepsat hodnoty v této tabulce skutečným naměřením.

### Provedené změny v repu

- `scripts/local-resize-fallback.js` (existoval) — spuštěn na 13 chybějících originálů. **Žádná změna kódu**, jen runtime invocation. Storage diff: +39 nových WebP souborů (suma ~3,5 MB).
- `firebase.json` — přidán 4. blok do `hosting.headers` (řádky 590–608), 18 přidaných řádků JSON.
- `SEO-AUDIT-2026-04.md` — tato sekce.

### Co se NEdotklo (ale stojí za úvahu pro kolo 3)

| Návrh | Riziko | Odhadovaný benefit | Proč ne teď |
|---|---|---|---|
| Critical CSS extrakce z `webflow.css` (205 KB → ~12 KB inline) | **Vysoké** — Webflow IX2 a animace závisí na celém stylesheetu. | Mobilní LCP −0,3–0,8 s | Vyžaduje regresní vizuální test napříč ~22 stránkami. Vyžaduje rozhodnutí uživatele. |
| Trim `webflow.js` (2,4 MB → 800 KB) — odstranit unused moduly (commerce, lightbox) | **Vysoké** — slider, dropdown, IX2 mohou přestat fungovat. | TBT −150–300 ms | Nutný regresní test. Vyžaduje rozhodnutí uživatele. |
| FAQPage JSON-LD na `/servis` | Nízké | SEO rich snippets | Potřeba obsah Q&A — uživatel musí dodat. |
| LocalBusiness Service JSON-LD pro lokální vyhledávání | Nízké | SEO local pack | Potřeba ověřit, že již není v `index.html` Organization/LocalBusiness. |
| CSP s nonce-based whitelisting | Střední | Security A+ | Samostatný sprint, Report-Only fáze. |
| Lighthouse Accessibility 81→95+ | Nízké | Score, ne hard SEO | Vyžaduje audit (kontrast, aria, focus-visible, skip link). |

### Kontrolní seznam před commitem (provedeno mnou)

- [x] `python3 -c "import json; json.load(open('firebase.json'))"` → JSON valid
- [x] curl ověřil HTTP 200 + `image/webp` na 3 nové variantach `1776888296311_trenink_*x*.webp`
- [x] curl ověřil, že stávající SSG, preload tagy, brotli, HSTS jsou na živém webu
- [x] `git status` před zápisem: clean (všechny předchozí commits flushnuté)

### Doporučený další krok pro uživatele

1. **Deploy** — `firebase deploy --only hosting` (Storage změny už jsou live, security headers se aktivují až po deploy).
2. **Smoke test** — ověřit, že nic vizuálně neregredovalo (homepage, akce-archive, blog, individuální kurzy, kontakt).
3. **Manuální PSI měření** — viz odkazy výše. Hodnoty zapsat do tabulky v této sekci.
4. **Rozhodnutí pro kolo 3** — který z odložených návrhů (critical CSS, JS trimming, CSP, FAQPage) je prioritou.

**Status:** dnes provedeno (1) backfill 13 chybějících image variants, (2) přidání 4 security headers do `firebase.json`, (3) ověření, že předchozí P1 fixy z 25–29. 4. jsou v produkci. Čeká na deploy + PSI re-measurement.
