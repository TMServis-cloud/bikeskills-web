#!/usr/bin/env node
/**
 * scripts/warm-drive-cache.js
 *
 * Tenhle projekt žije v Google Drive sync složce. Google Drive
 * (streamovací režim) drží soubory, které nebyly nedávno otevřené, jen
 * jako "cloud-only" placeholdery — teprve při prvním čtení je stahuje.
 * `firebase deploy` čte a hashuje tisíce souborů najednou a rychlostí,
 * na kterou Drive sync vrstva nestačí — výsledkem je buď pád
 * ("Error: An unexpected error has occurred.") nebo zaseknutí těsně
 * před koncem (viz incident bikeskills-web 2026-08-23: .firebaserc a
 * soubory v public/wp-content/uploads).
 *
 * Tento skript projde všechny soubory, které se budou nasazovat, a
 * "dotkne se" jich — donutí Drive je stáhnout na disk — DŘÍV, než
 * firebase-tools začne hashovat. Hosting public adresář se čte přímo
 * z firebase.json (podporuje single i multi-site "hosting"), takže
 * skript funguje beze změny napříč projekty s různým "public" (public/,
 * ".", dist/, build/, ...). .git a node_modules jsou v těchto projektech
 * symlinky mimo Drive, takže je walk() automaticky přeskočí.
 *
 * Zapojen jako "predeploy" hook ve firebase.json (a případně v npm
 * scriptech), takže běží automaticky před každým deployem.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXTRA_TARGETS = ['firebase.json', '.firebaserc', 'firestore.rules', 'firestore.indexes.json', 'storage.rules'];
const CONCURRENCY = 6;
const MAX_RETRIES = 6;
const RETRY_DELAY_MS = 2000;

function readHostingPublicDirs() {
  const fbJsonPath = path.join(ROOT, 'firebase.json');
  if (!fs.existsSync(fbJsonPath)) return ['public'];
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(fbJsonPath, 'utf8'));
  } catch (e) {
    return ['public'];
  }
  const hosting = cfg.hosting;
  if (!hosting) return ['public'];
  const entries = Array.isArray(hosting) ? hosting : [hosting];
  const dirs = entries.map(h => h.public).filter(Boolean);
  return dirs.length ? dirs : ['public'];
}

function walk(p, out) {
  const stat = fs.lstatSync(p);
  if (stat.isSymbolicLink()) return; // .git / node_modules jsou symlinky mimo Drive — přeskočit
  if (stat.isDirectory()) {
    // wp-content je ve firebase.json hosting.ignore — nenasazuje se, neprohřívat
    if (path.basename(p) === 'wp-content') return;
    for (const name of fs.readdirSync(p)) {
      walk(path.join(p, name), out);
    }
  } else if (stat.isFile()) {
    out.push(p);
  }
}

function collectFiles() {
  const targets = [...new Set([...readHostingPublicDirs(), ...EXTRA_TARGETS])];
  const out = [];
  for (const t of targets) {
    const p = path.join(ROOT, t);
    if (fs.existsSync(p)) walk(p, out);
  }
  return out;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function warmFile(p, attempt = 0) {
  try {
    const fd = fs.openSync(p, 'r');
    try {
      const buf = Buffer.alloc(1);
      fs.readSync(fd, buf, 0, 1, 0);
    } finally {
      fs.closeSync(fd);
    }
  } catch (err) {
    if (attempt >= MAX_RETRIES) {
      throw new Error(`${p}: ${err.message}`);
    }
    await sleep(RETRY_DELAY_MS);
    return warmFile(p, attempt + 1);
  }
}

async function main() {
  const startedAt = Date.now();
  console.log('[warm-drive-cache] Hledám soubory k prohřátí...');
  const files = collectFiles();
  console.log(`[warm-drive-cache] Nalezeno ${files.length} souborů. Ověřuji, že jsou lokálně dostupné...`);

  let done = 0;
  const failed = [];
  const queue = files.slice();

  async function worker() {
    while (queue.length) {
      const f = queue.pop();
      try {
        await warmFile(f);
      } catch (err) {
        failed.push(err.message);
      }
      done += 1;
      if (done % 1000 === 0 || done === files.length) {
        process.stdout.write(`[warm-drive-cache] ${done}/${files.length}\r`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  process.stdout.write('\n');

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  if (failed.length) {
    console.error(`[warm-drive-cache] CHYBA: ${failed.length} souborů se nepodařilo stáhnout z Google Drive po ${MAX_RETRIES} pokusech:`);
    failed.slice(0, 20).forEach(msg => console.error('  - ' + msg));
    if (failed.length > 20) console.error(`  ... a dalších ${failed.length - 20}`);
    console.error('[warm-drive-cache] Zkontrolujte připojení k internetu / stav Google Drive synchronizace a zkuste deploy znovu.');
    process.exit(1);
  }

  console.log(`[warm-drive-cache] Hotovo za ${seconds}s — všech ${files.length} souborů je lokálně dostupných, pokračuji na deploy.`);
}

main().catch(err => {
  console.error('[warm-drive-cache] Neočekávaná chyba:', err);
  process.exit(1);
});
