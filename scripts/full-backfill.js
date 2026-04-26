// Full backfill: re-upload every original missing _400x400/_800x800/_1600x1600
// variants to trigger Image Resize Extension. Maintains checkpoint for resume.
//
// Usage:
//   node scripts/full-backfill.js                  # default: concurrency=5, batch=500
//   node scripts/full-backfill.js --concurrency=10
//   node scripts/full-backfill.js --refresh-list   # re-list bucket first (slow)
//   node scripts/full-backfill.js --dry-run        # show what would happen
//   node scripts/full-backfill.js --resume         # default behavior
//   node scripts/full-backfill.js --retry-failed   # retry only previously failed
//
// State files (in scripts/):
//   .backfill-missing.txt     — list of paths needing backfill (regenerable)
//   .backfill-checkpoint.json — done[] + failed{} for resume

const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'bikeskills-web.firebasestorage.app',
});
const bucket = admin.storage().bucket();
const SIZES = ['_400x400', '_800x800', '_1600x1600'];

const CHECKPOINT = path.join(__dirname, '.backfill-checkpoint.json');
const MISSING_LIST = path.join(__dirname, '.backfill-missing.txt');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
  })
);

const CONCURRENCY  = parseInt(args.concurrency || 5, 10);
const PAUSE_MS     = parseInt(args['pause-ms'] || 0, 10);
const BATCH_SIZE   = parseInt(args.batch || 500, 10);
const BATCH_PAUSE  = parseInt(args['batch-pause'] || 2000, 10);
const DRY_RUN      = !!args['dry-run'];
const REFRESH      = !!args['refresh-list'];
const RETRY_FAILED = !!args['retry-failed'];

console.log(`Config: concurrency=${CONCURRENCY}, batch=${BATCH_SIZE}, batch-pause=${BATCH_PAUSE}ms, pause=${PAUSE_MS}ms, dry-run=${DRY_RUN}, refresh=${REFRESH}, retry-failed=${RETRY_FAILED}`);

function ct(name) {
  if (/\.webp$/i.test(name)) return 'image/webp';
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.(jpe?g)$/i.test(name)) return 'image/jpeg';
  return 'application/octet-stream';
}

async function listAll(prefix = '') {
  const all = [];
  let pageToken;
  do {
    const [files, , apiResp] = await bucket.getFiles({ prefix, maxResults: 1000, pageToken });
    files.forEach((f) => all.push(f.name));
    pageToken = apiResp && apiResp.nextPageToken;
  } while (pageToken);
  return all;
}

async function buildMissingList() {
  console.log('Listing bucket bikeskills-web.firebasestorage.app …');
  const t0 = Date.now();
  const all = await listAll('');
  console.log(`  ${all.length} objects in ${((Date.now()-t0)/1000).toFixed(1)}s`);

  const originals = new Set();
  const variants = new Map();
  for (const n of all) {
    if (!/\.(webp|jpg|jpeg|png)$/i.test(n)) continue;
    const m = n.match(/^(.*?)(_\d+x\d+)(\.[a-z]+)$/i);
    if (m) {
      const orig = m[1] + m[3];
      if (!variants.has(orig)) variants.set(orig, new Set());
      variants.get(orig).add(m[2]);
    } else {
      originals.add(n);
    }
  }
  const missing = [];
  for (const o of originals) {
    const v = variants.get(o) || new Set();
    const has = SIZES.filter((s) => v.has(s));
    if (has.length < 3) missing.push(o);
  }
  // skip placeholder + odd 1776* timestamps
  const filtered = missing.filter((p) =>
    !p.startsWith('images/placeholder') && !/\/1776\d+_/.test(p)
  );
  fs.writeFileSync(MISSING_LIST, filtered.join('\n'));
  console.log(`  ${filtered.length} need backfill (raw missing: ${missing.length}, ${missing.length - filtered.length} skipped as placeholders/1776*)`);
  return filtered;
}

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT)) return { done: new Set(), failed: {} };
  const raw = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
  return { done: new Set(raw.done || []), failed: raw.failed || {} };
}

function saveCheckpoint(cp) {
  const tmp = CHECKPOINT + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({
    done: [...cp.done],
    failed: cp.failed,
    savedAt: new Date().toISOString(),
  }));
  fs.renameSync(tmp, CHECKPOINT);
}

async function reupload(p) {
  const file = bucket.file(p);
  const [buf] = await file.download();
  await file.save(buf, {
    contentType: ct(p),
    metadata: { metadata: { backfillRetry: String(Date.now()) } },
    resumable: false,
  });
  return buf.length;
}

async function withRetry(p, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await reupload(p); }
    catch (e) {
      lastErr = e;
      const ms = 1000 * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, ms));
    }
  }
  throw lastErr;
}

async function pool(items, conc, fn) {
  const queue = items.slice();
  const workers = Array(conc).fill(0).map(async () => {
    while (queue.length) {
      const item = queue.shift();
      await fn(item);
    }
  });
  await Promise.all(workers);
}

(async () => {
  let missing;
  if (REFRESH || !fs.existsSync(MISSING_LIST)) {
    missing = await buildMissingList();
  } else {
    missing = fs.readFileSync(MISSING_LIST, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
    const before = missing.length;
    missing = missing.filter((p) => !p.startsWith('images/placeholder') && !/\/1776\d+_/.test(p));
    console.log(`Loaded ${missing.length} from ${path.basename(MISSING_LIST)} (${before - missing.length} placeholder/1776* skipped at load) — use --refresh-list to rebuild`);
  }

  const cp = loadCheckpoint();
  let todo;
  if (RETRY_FAILED) {
    todo = Object.keys(cp.failed);
    console.log(`Retry-failed mode: ${todo.length} files`);
  } else {
    todo = missing.filter((p) => !cp.done.has(p));
    console.log(`Already done: ${cp.done.size}, failed: ${Object.keys(cp.failed).length}, todo: ${todo.length}`);
  }

  if (DRY_RUN) {
    console.log('DRY RUN — exiting without uploading.');
    if (todo.length) {
      console.log('First 10 todo:');
      todo.slice(0, 10).forEach((p) => console.log('  ' + p));
    }
    return;
  }
  if (!todo.length) {
    console.log('Nothing to do.');
    return;
  }

  console.log(`\n=== Starting backfill ===`);
  const t0 = Date.now();
  let done = 0, failed = 0, bytes = 0;
  let lastSave = Date.now();

  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE);
    const tBatch = Date.now();
    await pool(batch, CONCURRENCY, async (p) => {
      try {
        const n = await withRetry(p);
        cp.done.add(p);
        delete cp.failed[p];
        done++; bytes += n;
        if (done % 25 === 0) {
          const elapsed = (Date.now() - t0) / 1000;
          const rate = (done / Math.max(elapsed, 1)).toFixed(1);
          const etaMin = ((todo.length - done) / Math.max(rate, 0.1) / 60).toFixed(1);
          process.stdout.write(`\r  ${done}/${todo.length} (${(done * 100 / todo.length).toFixed(1)}%) ${rate}/s ETA ${etaMin} min       `);
        }
        // checkpoint every 30s
        if (Date.now() - lastSave > 30000) {
          saveCheckpoint(cp);
          lastSave = Date.now();
        }
      } catch (e) {
        cp.failed[p] = e.message;
        failed++;
      }
      if (PAUSE_MS) await new Promise((r) => setTimeout(r, PAUSE_MS));
    });
    saveCheckpoint(cp);
    lastSave = Date.now();
    const dtBatch = ((Date.now() - tBatch) / 1000).toFixed(0);
    process.stdout.write('\r');
    console.log(`[batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(todo.length / BATCH_SIZE)}] +${batch.length} in ${dtBatch}s · total done=${done}, failed=${failed}, ${(bytes / 1024 / 1024).toFixed(0)} MB. Pause ${BATCH_PAUSE}ms…`);
    if (i + BATCH_SIZE < todo.length) await new Promise((r) => setTimeout(r, BATCH_PAUSE));
  }

  saveCheckpoint(cp);
  const dtMin = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\n=== DONE ===`);
  console.log(`${dtMin} min · ${done} OK · ${failed} FAILED · ${(bytes / 1024 / 1024).toFixed(0)} MB transferred`);
  if (failed) {
    const failedList = Object.entries(cp.failed);
    console.log(`\nFailed (${failedList.length}); first 20:`);
    failedList.slice(0, 20).forEach(([p, m]) => console.log(`  ${p}: ${m}`));
    console.log(`\nRetry: node scripts/full-backfill.js --retry-failed`);
  }
  console.log(`\nNext: wait ~5 min for extension to finish async generation, then:`);
  console.log(`  node scripts/diagnose-variants.js     # ověř 100% pokrytí`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
