/**
 * Uloží výchozí SEO nastavení do Firestore settings/seo
 * Usage: node scripts/seed-seo.js
 */
const path = require('path');
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))),
  projectId: 'bikeskills-web',
});

const db = admin.firestore();

const SEO = {
  homepage: {
    title: 'Zlepšete svou techniku jízdy na kole | Bikeskills.cz',
    description: 'Škola MTB jízdy na kole se zaměřením na techniku jízdy v jakémkoliv terénu. Výuka mistrů republiky a světa v TRIALu a technickém ENDURU.',
    ogImage: 'https://bikeskills.cz/images/webclip.png',
  },
  blog: {
    title: 'Blog | BikeSkills — MTB škola kola',
    description: 'Novinky, články a tipy ze světa MTB, trial a e-bike. Sledujte náš blog pro aktuální informace o kurzech, campech a akcích BikeSkills.',
    ogImage: 'https://bikeskills.cz/images/webclip.png',
  },
  akce: {
    title: 'Kurzy, campy a akce | BikeSkills — MTB škola kola',
    description: 'Přehled všech kurzů, campů a akcí BikeSkills. Výuka techniky jízdy na MTB a trial kole pro začátečníky i pokročilé. Přihlaste se na nejbližší termín.',
    ogImage: 'https://bikeskills.cz/images/webclip.png',
  },
  team: {
    title: 'Team | BikeSkills — instruktoři a závodníci',
    description: 'Team BikeSkills tvoří zkušení instruktoři a závodníci z MTB, trial a enduro disciplín. Přes 30 let na kole, závodní zkušenosti ze světových závodů.',
    ogImage: 'https://bikeskills.cz/images/webclip.png',
  },
};

async function main() {
  await db.collection('settings').doc('seo').set(SEO, { merge: true });
  console.log('✅ SEO settings uloženy do Firestore settings/seo');
  process.exit(0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
