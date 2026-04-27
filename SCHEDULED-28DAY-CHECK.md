# 28denní ověření SEO + výkon bikeskills.cz

**Spustit:** Neděle 2026-05-24 ~9:00 SELČ
**Účel:** Ověřit, jestli optimalizace ze session 2026-04-26 fungují i v reálném provozu (Field Data od uživatelů), ne jen v PSI sim.

## Jak naplánovat

Otevři novou Cowork session a vlož tento prompt:

> Naplánuj na neděli 24. května 2026 v 9:00 SELČ jednorázový task `bikeskills-seo-perf-28day-check` s instrukcemi z tohoto souboru.

Cowork si vyžádá schedule skill a uloží task. Pak ho zapomeň — pošle ti notifikaci.

---

## Prompt pro scheduled task (zkopíruj celé)

Ověř SEO a výkonové metriky webu **bikeskills.cz** po 28 dnech od optimalizační session 2026-04-26 a porovnej proti baseline. Cílem je posoudit, jestli optimalizace zafungovaly i v reálném provozu (Field Data od skutečných uživatelů), nebo jestli zbývá ještě něco doladit.

### Kontext projektu

- Web: bikeskills.cz (Webflow → WordPress → Firebase Hosting migrace)
- Workspace: `/Users/kabelcihiworkstation/Library/CloudStorage/GoogleDrive-cihacek@chytreit.cz/Můj disk/Google Antigravity projekty/bikeskills-web`
- Hosting: Firebase Hosting + Fastly CDN, region europe-west3
- CMS: Firestore + cms-loader.js + prerendrované HTML

### Baseline z 2026-04-26 (z paměti `project_bikeskills_psi_results.md`)

Test URL: `https://bikeskills.cz/blog/zehnani-kol-svatba-bikeru-a-dny-bezpecnosti/`

**Mobile (Moto G Power, slow 4G simulation):** Performance 85, FCP 1.5s, LCP 2.6s, TBT 250ms, CLS 0.148 (variance 0-0.148 mezi runy), SI 2.7s.
**Desktop:** Performance 85-99 (variance), FCP 0.4s, LCP 0.7s, TBT 70-340ms, CLS 0, SI 0.9s.

Hlavní winy z předchozí optimalizace: desktop LCP 2.1->0.7s (3x rychlejší), mobile TBT 410->250ms, gallery srcset, Image Resize Extension.

Otevřené problémy: Mobile CLS variance kolem 0.148 (možný font-display: optional timing issue na Lobster), TBT z webflow.js forced reflow (#33), render-blocking CSS chain (#48).

### Postup

**1. Ověř, že web stále běží.** Otevři `https://bikeskills.cz/` v prohlížeči (přes Chrome MCP). Zkontroluj že se načítá a hero se zobrazuje. Pokud ne, ohlaš chybu a zastav se.

**2. PSI test.** Spusť fresh PSI run na pagespeed.web.dev pro `https://bikeskills.cz/blog/zehnani-kol-svatba-bikeru-a-dny-bezpecnosti/`. Mobile + Desktop tab, ideálně 2 runy s odstupem ~5 min kvůli Lighthouse variance. Zaznamenat: Performance score, FCP, LCP, TBT, CLS, Speed Index. Spusť taky PSI na homepage `https://bikeskills.cz/` jako sanity check.

**3. Search Console - Field Data.** Tohle je důležitější než PSI sim. Naviguj na `https://search.google.com/search-console` (přes Chrome MCP). Pokud uživatel není přihlášený, požádej o login (Google Workspace cihacek@chytreit.cz). Vyber property `bikeskills.cz`. Sekce Core Web Vitals / Page Experience: rozdělení Good/Needs Improvement/Poor pro mobile i desktop, konkrétní hodnoty CLS, LCP, INP. Sekce Indexing: počet proindexovaných stránek, errory. Sekce Performance: clicks/impressions trend za 28 dní.

**4. Bucket + provoz.** Firebase Console `https://console.firebase.google.com/project/bikeskills-web/overview`: Hosting traffic stats, Storage velikost (baseline 14 514 originálů), Functions Image Resize Extension health.

**5. Porovnej s baseline a vyhodnoť.** Krátký report v češtině (3-4 odstavce, ne bullet seznam): PSI delta vs 2026-04-26, Field Data verdict, doporučení (#33 TBT, #48 render-blocking CSS, CLS přes size-adjust na Lobster). Pokud Field Data jsou v zelené, řekni "není potřeba dál optimalizovat".

**6. Aktualizuj memory.** Updatuj `project_bikeskills_psi_results.md` s 28denními výsledky (zachovat baseline 2026-04-26 jako referenci).

### Constraints

- Žádné code changes bez explicitního schválení uživatele
- Pokud najdeš regression, ohlaš a počkej na rozhodnutí
- Anonymous PSI API má quota=0, jen pagespeed.web.dev v prohlížeči
- Počítej s Lighthouse/Fastly variance - vezmi 2 runy

### Success criteria

Hotovo když máš PSI fresh čísla (blog detail + homepage), Search Console Field Data, porovnávací report v češtině, updated memory file.
