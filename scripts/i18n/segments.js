/**
 * Segmentace HTML na překladové jednotky (běhy textu + inline tagů mezi blokovými hranicemi)
 * a překladové atributy. Sdíleno build-en.js a extract.
 */
const INLINE = new Set(['strong','b','em','i','a','span','br','sup','sub','u','small','mark','s','abbr','code']);
const ATTRS = ['alt','title','placeholder','aria-label','data-placeholder'];

function hasLetters(s) { return /[A-Za-zÀ-ž]/.test(s.replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/gi, '')); }
function norm(s) { return s.replace(/\s+/g, ' ').trim(); }

/** Vrátí pole tokenů {type:'tag'|'text'|'raw', v} — script/style/comment jako raw. */
function tokenize(html) {
  const out = [];
  const re = /<!--[\s\S]*?-->|<(script|style|noscript|textarea)\b[^>]*>[\s\S]*?<\/\1>|<[^>]+>/gi;
  let last = 0, m;
  while ((m = re.exec(html))) {
    if (m.index > last) out.push({ type: 'text', v: html.slice(last, m.index) });
    const v = m[0];
    if (v.startsWith('<!--') || m[1]) out.push({ type: 'raw', v, rawTag: (m[1]||'').toLowerCase() });
    else out.push({ type: 'tag', v, name: (v.match(/^<\/?\s*([a-z0-9-]+)/i) || [,''])[1].toLowerCase() });
    last = re.lastIndex;
  }
  if (last < html.length) out.push({ type: 'text', v: html.slice(last) });
  return out;
}

/**
 * Projde HTML, každý běh předá fn(normalizedRun) → vrací náhradu nebo null.
 * Atributy (alt/title/placeholder/aria-label, value u submit) předá fnAttr(value) → náhrada/null.
 */
function transform(html, fnRun, fnAttr) {
  const toks = tokenize(html);
  let out = '', run = [];
  let inBody = !/<body\b/i.test(html);
  const flush = () => {
    if (!run.length) return;
    const raw = run.join('');
    run = [];
    const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
    const core = raw.slice(lead.length, raw.length - trail.length);
    if (inBody && hasLetters(core)) {
      const r = fnRun(norm(core));
      out += lead + (r != null ? r : core) + trail;
    } else out += raw;
  };
  const doAttrs = (tag) => {
    if (!fnAttr) return tag;
    let t = tag.replace(new RegExp(`(\\s(?:${ATTRS.join('|')})=")([^"]*)(")`, 'gi'), (m, a, v, b) => {
      if (!hasLetters(v)) return m;
      const r = fnAttr(norm(v)); return r != null ? a + r + b : m;
    });
    if (/^<input\b/i.test(t) && /type="submit"/i.test(t)) {
      t = t.replace(/(\svalue=")([^"]*)(")/i, (m, a, v, b) => { if (!hasLetters(v)) return m; const r = fnAttr(norm(v)); return r != null ? a + r + b : m; });
    }
    if (/\sdata-wait="/i.test(t)) {
      t = t.replace(/(\sdata-wait=")([^"]*)(")/i, (m, a, v, b) => { if (!hasLetters(v)) return m; const r = fnAttr(norm(v)); return r != null ? a + r + b : m; });
    }
    return t;
  };
  for (const tk of toks) {
    if (tk.type === 'text') { run.push(tk.v); continue; }
    if (tk.type === 'tag' && INLINE.has(tk.name)) { run.push(doAttrs(tk.v)); continue; }
    flush();
    if (tk.type === 'tag') {
      if (tk.name === 'body' && !tk.v.startsWith('</')) inBody = true;
      out += inBody ? doAttrs(tk.v) : tk.v;
    } else if (tk.rawTag === 'textarea' && inBody) {
      out += tk.v.replace(/^<textarea\b[^>]*>/i, t => doAttrs(t));
    } else out += tk.v;
  }
  flush();
  return out;
}

function collect(html) {
  const runs = new Set(), attrs = new Set();
  transform(html, r => { runs.add(r); return null; }, a => { attrs.add(a); return null; });
  return { runs: [...runs], attrs: [...attrs] };
}

module.exports = { tokenize, transform, collect, norm, hasLetters };

/** Nahradí tagy v běhu placeholdery {1},{2}… ; vrací {text, tags}. */
function mask(run) {
  const tags = [];
  const text = run.replace(/<[^>]+>/g, t => { tags.push(t); return `{${tags.length}}`; });
  return { text, tags };
}
/** Vrátí přeložený text s tagy zpět; vyhodí chybu, když nesedí placeholdery. */
function unmask(trText, tags) {
  const seen = new Set();
  const out = trText.replace(/\{(\d+)\}/g, (m, n) => {
    const i = +n - 1; if (!(i in tags)) throw new Error('neznámý placeholder ' + m);
    seen.add(i); return tags[i];
  });
  if (seen.size !== tags.length) throw new Error(`chybí placeholdery (${seen.size}/${tags.length})`);
  return out;
}
module.exports.mask = mask; module.exports.unmask = unmask;

/** Úsek je jen URL / e-mail (bez překladu). */
function isUrlLike(t) { const x = String(t).replace(/\{\d+\}/g, '').replace(/<[^>]+>/g, '').trim(); return /^(https?:\/\/|mailto:|www\.)\S*$/i.test(x) || /^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(x); }
function plainOf(html) { return String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }
/** Perex článku je jen zkrácený začátek obsahu → odvodí se z přeloženého obsahu. */
function perexFromContent(d) { const p = plainOf(d.perex); if (!p) return true; const o = plainOf(d.obsah); return o.startsWith(p.replace(/…$/, '').slice(0, Math.min(p.length, 120))); }
module.exports.isUrlLike = isUrlLike; module.exports.plainOf = plainOf; module.exports.perexFromContent = perexFromContent;
