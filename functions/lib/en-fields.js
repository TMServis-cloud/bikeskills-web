/**
 * Anglické verze CMS dokumentů jsou ve Firestore ve STEJNÉM dokumentu jako české,
 * v polích s koncovkou `_en` (stejně jako na trialshow.cz):
 *
 *   clanky: titulek_en, perex_en, obsah_en, slug_en, metaTitle_en, metaDescription_en
 *   akce:   nazev_en, popis_en, uroven_en, datumText_en, dobaTrvani_en, ridersNumberWp_en,
 *           stavLabel_en, typAkce_en, slug_en, metaTitle_en, metaDescription_en
 *   team:   popis_en
 *
 * Pomocná pole: en_src (otisk českého textu, ze kterého překlad vznikl – admin podle něj
 * pozná, že se čeština od překladu změnila), en_auto (true = strojový překlad, false = upraveno ručně).
 *
 * Kopie téže definice: public/js/cms-loader.js (EN_FIELDS) a public/js/admin.js (EN_FIELDS).
 */
const EN_FIELDS = {
  clanky: ['titulek', 'perex', 'obsah', 'slug', 'metaTitle', 'metaDescription'],
  akce: ['nazev', 'popis', 'uroven', 'datumText', 'dobaTrvani', 'ridersNumberWp', 'stavLabel', 'typAkce', 'slug', 'metaTitle', 'metaDescription'],
  team: ['popis'],
};
// Pole, jehož vyplnění znamená „EN verze existuje" (bez něj se položka na /en/ nezobrazí)
const EN_KEY = { clanky: 'titulek', akce: 'nazev', team: 'popis' };

/** EN data dokumentu { titulek, perex, …, slug } nebo null, pokud EN verze neexistuje. */
function enOf(col, d) {
  if (!d || !EN_FIELDS[col] || !d[EN_KEY[col] + '_en']) return null;
  const e = {};
  for (const f of EN_FIELDS[col]) {
    const v = d[f + '_en'];
    if (v != null && v !== '') e[f] = v;
  }
  if (!e.slug) e.slug = d.slug; // tým má stejný slug v obou jazycích
  return e;
}

/** CZ dokument přepsaný EN poli (slugCs = původní český slug) nebo null. */
function localize(col, d) {
  const e = enOf(col, d);
  return e ? Object.assign({}, d, e, { slugCs: d.slug }) : null;
}

module.exports = { EN_FIELDS, EN_KEY, enOf, localize };
