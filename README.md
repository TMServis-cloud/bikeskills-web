# BIKESKILLS Web

MTB Škola BIKESKILLS – statický web s Firebase CMS.

## Technologie

- **Frontend**: HTML/CSS/JS (Webflow export, vyčištěný od Udesly)
- **CMS**: Firebase Firestore + vlastní admin panel
- **Hosting**: Firebase Hosting
- **CI/CD**: GitHub Actions → auto-deploy na push do `main`
- **Auth**: Firebase Authentication (e-mail/heslo)
- **Storage**: Firebase Storage (obrázky)

## Struktura

```
public/          → Firebase Hosting root
  admin/         → Admin panel (CMS)
  css/           → Styly
  js/            → Skripty (cms-loader.js, admin.js)
  images/        → Obrázky
scripts/         → Import skripty (WP XML → Firestore)
```

## Lokální vývoj

```bash
# Instalace
npm install

# Firebase emulátory
npm run serve

# Deploy
npm run deploy
```

## Import dat z WordPressu

1. Stáhněte XML export z WP: Nástroje → Export → Vše
2. Uložte do `scripts/export.xml`
3. Nastavte Firebase Service Account key (`scripts/serviceAccountKey.json`)
4. Spusťte: `npm run import`

## Větve

- `main` → produkce (auto-deploy)
- `develop` → staging
- `webflow-export` → surové Webflow exporty
