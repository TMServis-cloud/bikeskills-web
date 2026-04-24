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
