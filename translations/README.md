# Anglická verze bikeskills.cz (`/en/`)

EN verze se **generuje** z české – nic v `public/en/` needituj ručně, přepíše se.

## Co kde je
| Soubor | Účel |
|---|---|
| `scripts/i18n/pages.js` | mapa CZ stránka → EN slug (`servis` → `/en/bike-service`) |
| `translations/static-en.json` | překlady textů statických stránek (klíč = český úsek, tagy jako `{1}`) |
| `translations/cms-en.json` | překlady textů blogu, akcí a týmu z Firestore |
| `translations/slugs.json` | CZ slug → EN slug článků a akcí (generuje se) |
| `translations/firestore-snapshot/` | poslední stažená data z Firestore (zdroj pro překlad) |
| `scripts/build-en.js` | CZ HTML → `public/en/*.html` (+ hreflang a přepínač CZ/EN i do CZ stránek) |
| `scripts/i18n/apply-cms.js` | z překladů složí `public/en/data/*.json` (čte je `cms-loader.js`) |
| `scripts/prerender.js` | navíc generuje `/en/blog`, `/en/courses-and-events`, `/en/blog/<slug>`, `/en/events/<slug>` |

Firestore se **jen čte** – překlady v databázi nejsou, admin se nemění.

## Po úpravě české stránky nebo nového článku / akce
```bash
npm run i18n:todo          # stáhne Firestore, vypíše nepřeložené texty do translations/todo-*.json
# přelož: translations/batches/<static|cms>-NNNN.json  ve tvaru {"index": "English text"}
node scripts/i18n/merge-batches.js static   # nebo cms
npm run deploy:hosting     # build:en → sitemap → prerender → deploy
```
`node scripts/build-en.js --check` vypíše, co na statických stránkách chybí. Nepřeložený úsek zůstane česky; nepřeložený článek/akce se v EN výpisech nezobrazí.

## Pravidla
- URL bez koncového lomítka (`trailingSlash: false`): `/en`, `/en/blog/<slug>`, `/en/events/<slug>`.
- Odkazy na shop vedou na `shop.bikeskills.cz/en/…` (`scripts/i18n/links.js`).
- Právní texty mají poznámku, že závazná je česká verze.
- Formuláře posílají `lang: 'en'` → Cloud Functions pošlou anglické potvrzení (vyžaduje `firebase deploy --only functions`).
