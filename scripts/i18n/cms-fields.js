// Která pole CMS kolekcí se překládají (plain = text, html = HTML obsah)
module.exports = {
  clanky: { plain: ['titulek', 'perex'], html: ['obsah'], include: d => d.publikovano !== false && !!d.slug },
  akce:   { plain: ['nazev', 'uroven', 'stavLabel', 'typAkce', 'ridersNumberWp', 'dobaTrvani', 'datumText'], html: ['popis'], include: d => d.aktivni !== false && !!d.slug },
  team:   { plain: [], html: ['popis'], include: d => d.aktivni !== false && !!d.slug },
};
