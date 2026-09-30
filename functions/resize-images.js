/**
 * resizeImages — náhrada Firebase Extension "Resize Images"
 * (firebase/storage-resize-images@0.3.3, instance storage-resize-images).
 *
 * Cloud Functions v2, trigger google.cloud.storage.object.v1.finalized,
 * europe-west3 (stejný region jako bucket).
 *
 * Chování 1:1 s původní extension (config z extensions/storage-resize-images.env):
 *   IMG_SIZES=400x400,800x800,1600x1600, IMAGE_TYPE=webp,
 *   výstup ve STEJNÉ složce: foo.jpg -> foo_400x400.webp,
 *   MAKE_PUBLIC=true, DELETE_ORIGINAL_FILE=false, REGENERATE_TOKEN=false,
 *   CACHE_CONTROL_HEADER="public, max-age=31536000, immutable",
 *   SHARP_OPTIONS={"fit":"inside","withoutEnlargement":true}, IS_ANIMATED=true,
 *   1 GiB RAM, timeout 300 s, max 20 instancí.
 *
 * Navíc oproti extension: soubory, jejichž název už končí na _NxN, se nikdy
 * nezmenšují (pojistka proti foo_400x400_800x800.webp, když někdo nahraje
 * variantu bez metadata resizedImage=true).
 */
const { onObjectFinalized } = require('firebase-functions/v2/storage');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const sharp = require('sharp');
const path = require('path');

if (!admin.apps.length) admin.initializeApp();

const CONFIG = {
  bucket: 'bikeskills-web.firebasestorage.app',
  region: 'europe-west3',
  sizes: ['400x400', '800x800', '1600x1600'],
  format: 'webp',
  cacheControl: 'public, max-age=31536000, immutable',
  makePublic: true,
  sharpOptions: { fit: 'inside', withoutEnlargement: true },
  animated: true,
};

const SUPPORTED_CONTENT_TYPES = [
  'image/jpg', 'image/jpeg', 'image/png', 'image/tiff',
  'image/webp', 'image/gif', 'image/avif',
];
const SUPPORTED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp', '.gif', '.avif', '.jfif',
];
// Název už je varianta: foo_400x400.webp, foo_800x800.jpg …
const VARIANT_NAME_RE = /_\d+x\d+\.[a-z0-9]+$/i;

function shouldResize(obj) {
  const { name, contentType, contentEncoding, metadata = {} } = obj;
  if (!contentType) return 'no contentType';
  if (!SUPPORTED_CONTENT_TYPES.includes(contentType)) return `unsupported ${contentType}`;
  if (contentEncoding === 'gzip') return 'gzip encoded';
  if (metadata.resizedImage === 'true') return 'already resized (metadata)';
  if (metadata.resizeFailed) return 'previous resize failed';
  if (VARIANT_NAME_RE.test(name)) return 'name already has _NxN suffix';
  return null;
}

async function resizeOne(bucket, buf, obj, parsed, size) {
  const [w, h] = size.split('x').map((n) => parseInt(n, 10));
  const outName = SUPPORTED_EXTENSIONS.includes(parsed.ext.toLowerCase())
    ? `${parsed.name}_${size}.${CONFIG.format}`
    : `${parsed.name}${parsed.ext}_${size}`;
  const outPath = path.posix.join(parsed.dir, outName);

  const resized = await sharp(buf, { failOnError: false, ...CONFIG.sharpOptions, animated: CONFIG.animated })
    .rotate()
    .resize(w, h, { fit: 'inside', withoutEnlargement: true, ...CONFIG.sharpOptions })
    .toBuffer();
  const out = await sharp(resized, { animated: CONFIG.animated }).webp({}).toBuffer();

  // Custom metadata originálu (vč. firebaseStorageDownloadTokens) se kopíruje,
  // stejně jako v extension při REGENERATE_TOKEN=false.
  const customMetadata = { ...(obj.metadata || {}), resizedImage: 'true' };
  const contentDisposition = obj.contentDisposition
    ? obj.contentDisposition.replace(/(filename\*=utf-8''[^;\s]+)/, `filename*=utf-8''${outName}`)
    : undefined;

  const file = bucket.file(outPath);
  await file.save(out, {
    resumable: false,
    metadata: {
      contentType: 'image/webp',
      cacheControl: CONFIG.cacheControl || obj.cacheControl,
      contentDisposition,
      contentEncoding: obj.contentEncoding,
      contentLanguage: obj.contentLanguage,
      metadata: customMetadata,
    },
  });
  if (CONFIG.makePublic) await file.makePublic();
  return outPath;
}

exports.resizeImages = onObjectFinalized(
  {
    bucket: CONFIG.bucket,
    region: CONFIG.region,
    memory: '1GiB',
    timeoutSeconds: 300,
    maxInstances: 20,
    retry: false,
  },
  async (event) => {
    const obj = event.data;
    const skip = shouldResize(obj);
    if (skip) {
      logger.debug(`skip ${obj.name}: ${skip}`);
      return;
    }

    const bucket = admin.storage().bucket(obj.bucket);
    const parsed = path.posix.parse(obj.name);
    const [buf] = await bucket.file(obj.name).download();

    const results = await Promise.allSettled(
      CONFIG.sizes.map((s) => resizeOne(bucket, buf, obj, parsed, s)),
    );
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length) {
      failed.forEach((r) => logger.error(`resize failed for ${obj.name}`, r.reason));
      // stejně jako extension: označ original, aby se nezkoušel znovu dokola
      await bucket.file(obj.name).setMetadata({ metadata: { resizeFailed: 'true' } }).catch(() => {});
      return;
    }
    logger.info(`resized ${obj.name}`, { outputs: results.map((r) => r.value) });
  },
);
