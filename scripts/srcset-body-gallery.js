/**
 * BIKESKILLS – Add srcset/sizes/loading=lazy/onerror to body-content gallery images
 *
 * Targets <figure class="wp-block-image..."> blocks in:
 *   - public/blog/<slug>/index.html
 *   - public/akce/<slug>/index.html
 *
 * For each <img src="...firebasestorage.../FILE.webp?alt=media">:
 *   - Adds srcset="FILE_400x400.webp 400w, FILE_800x800.webp 800w, FILE_1600x1600.webp 1600w"
 *   - Adds sizes="(max-width: 991px) 100vw, 1024px"
 *   - Adds loading="lazy" (below-fold gallery)
 *   - Adds onerror fallback that strips srcset+sizes if 404 happens
 *
 * Idempotent: skips images that already have srcset.
 *
 * Run:
 *   node scripts/srcset-body-gallery.js          # apply changes
 *   node scripts/srcset-body-gallery.js --dry    # preview only
 */

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DRY = process.argv.includes('--dry') || process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('-v') || process.argv.includes('--verbose');

// Gallery thumbnails are styled with `height: 160px; object-fit: cover` (.w-richtext
// .wp-block-gallery .wp-block-image img) and laid out 2-3 per row, so true displayed
// width is ~180px (mobile) -> ~250px (tablet) -> ~240px (desktop). Keep `sizes` tight
// so browser picks _400x400.webp (~17 KB) instead of _1600x1600.webp (~200 KB).
const SIZES_ATTR = '(max-width: 479px) 50vw, (max-width: 991px) 33vw, 240px';
const ONERROR = "this.onerror=null;this.removeAttribute('srcset');this.removeAttribute('sizes');";

// Match a wp-block-image figure block (with or without <a> wrapper).
const FIGURE_RE = /(<figure class="wp-block-image[^"]*"[^>]*>(?:\s*<a [^>]*>)?\s*<img\s)([^>]*?)(\/?>(?:\s*<\/a>)?\s*<\/figure>)/g;

function makeSrcset(src) {
  if (!/firebasestorage\.googleapis\.com\/.+\.webp\?alt=media/i.test(src)) return null;
  const v400 = src.replace(/(\.webp)(\?alt=media)/i, '_400x400$1$2');
  const v800 = src.replace(/(\.webp)(\?alt=media)/i, '_800x800$1$2');
  const v1600 = src.replace(/(\.webp)(\?alt=media)/i, '_1600x1600$1$2');
  return `${v400} 400w, ${v800} 800w, ${v1600} 1600w`;
}

function transformImgAttrs(imgAttrs) {
  if (/\bsrcset\s*=/i.test(imgAttrs)) return null;
  const srcMatch = imgAttrs.match(/\bsrc\s*=\s*"([^"]+)"/);
  if (!srcMatch) return null;
  const srcset = makeSrcset(srcMatch[1]);
  if (!srcset) return null;

  let out = imgAttrs.replace(
    /(\bsrc\s*=\s*"[^"]+")/,
    `$1 srcset="${srcset}" sizes="${SIZES_ATTR}"`,
  );
  if (!/\bloading\s*=/i.test(out)) out += ' loading="lazy"';
  if (!/\bonerror\s*=/i.test(out)) out += ` onerror="${ONERROR}"`;
  return out;
}

function processFile(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  let figuresFound = 0;
  let imgsTransformed = 0;
  let imgsSkipped = 0;

  const out = html.replace(FIGURE_RE, (full, head, attrs, tail) => {
    figuresFound++;
    const newAttrs = transformImgAttrs(attrs);
    if (!newAttrs) { imgsSkipped++; return full; }
    imgsTransformed++;
    return head + newAttrs + tail;
  });

  if (out === html) return { figuresFound, imgsTransformed, imgsSkipped, changed: false };
  if (!DRY) fs.writeFileSync(filePath, out);
  return { figuresFound, imgsTransformed, imgsSkipped, changed: true };
}

function listIndexHtmls() {
  const dirs = ['blog', 'akce'];
  const out = [];
  for (const d of dirs) {
    const dir = path.join(PUBLIC_DIR, d);
    if (!fs.existsSync(dir)) continue;
    for (const slug of fs.readdirSync(dir)) {
      const f = path.join(dir, slug, 'index.html');
      if (fs.existsSync(f) && fs.statSync(f).isFile()) out.push(f);
    }
  }
  return out;
}

(function main() {
  const files = listIndexHtmls();
  console.log(`${DRY ? '[DRY-RUN] ' : ''}Processing ${files.length} HTML files…`);
  let totFigs = 0; let totTrans = 0; let totSkip = 0; let filesChanged = 0;
  for (const f of files) {
    const r = processFile(f);
    totFigs += r.figuresFound;
    totTrans += r.imgsTransformed;
    totSkip += r.imgsSkipped;
    if (r.changed) {
      filesChanged++;
      if (VERBOSE) {
        const rel = path.relative(PUBLIC_DIR, f);
        console.log(`  ✓ ${rel} (+${r.imgsTransformed}, skip ${r.imgsSkipped})`);
      }
    }
  }
  console.log(`\n=== ${DRY ? 'DRY-RUN ' : ''}DONE ===`);
  console.log(`  files scanned   : ${files.length}`);
  console.log(`  files changed   : ${filesChanged}`);
  console.log(`  figures matched : ${totFigs}`);
  console.log(`  imgs transformed: ${totTrans}`);
  console.log(`  imgs skipped    : ${totSkip} (already had srcset / not firebase webp)`);
})();
