/**
 * Otisk českého zdroje překladu (en_src). Admin ho při překladu uloží a při další úpravě
 * porovná – když se čeština od překladu změnila, upozorní, že je potřeba zkontrolovat EN.
 * Počítá se z čistého textu (bez HTML), aby ho nerozhodilo přeformátování v editoru.
 * Kopie téže funkce je v public/js/admin.js (enSrcHash).
 */
const SRC_FIELDS = { clanky: ['titulek', 'perex', 'obsah'], akce: ['nazev', 'popis', 'uroven', 'datumText'], team: ['popis'] };
function plain(s) {
  return String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
function enSrcHash(col, d) {
  const str = SRC_FIELDS[col].map(f => plain(d[f])).join('\u0001');
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
module.exports = { SRC_FIELDS, enSrcHash };
