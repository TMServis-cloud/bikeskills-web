/**
 * BIKESKILLS - WordPress XML Import Script
 * Parsuje WP export XML a importuje data do Firebase Firestore
 *
 * Usage:
 *   1. Stáhněte XML export z WP: Nástroje → Export → Vše
 *   2. Uložte do scripts/export.xml
 *   3. Nastavte GOOGLE_APPLICATION_CREDENTIALS (Service Account key)
 *   4. Spusťte: node scripts/wp-import.js
 */

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const admin = require('firebase-admin');

// ============================================================
// CONFIGURATION
// ============================================================

// Firebase Service Account
// Option 1: Set env var GOOGLE_APPLICATION_CREDENTIALS to path of key.json
// Option 2: Place the service account key file here
const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(__dirname, 'serviceAccountKey.json');

const FIREBASE_PROJECT_ID = 'bikeskills-web'; // TODO: Update with actual project ID
const XML_FILE = path.join(__dirname, 'export.xml');

// ============================================================
// FIREBASE INIT
// ============================================================
let firebaseApp;

try {
  if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    const serviceAccount = require(SERVICE_ACCOUNT_PATH);
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: `${FIREBASE_PROJECT_ID}.appspot.com`
    });
  } else {
    // Try default credentials (e.g., running in Cloud Shell)
    firebaseApp = admin.initializeApp({
      projectId: FIREBASE_PROJECT_ID,
      storageBucket: `${FIREBASE_PROJECT_ID}.appspot.com`
    });
  }
} catch (error) {
  console.error('❌ Firebase init error:', error.message);
  console.log('\n📋 Instructions:');
  console.log('1. Go to Firebase Console → Project Settings → Service Accounts');
  console.log('2. Click "Generate new private key"');
  console.log('3. Save it as scripts/serviceAccountKey.json');
  process.exit(1);
}

const db = admin.firestore();

// ============================================================
// SLUG GENERATION
// ============================================================
function generateSlug(text) {
  const charMap = {
    'á': 'a', 'č': 'c', 'ď': 'd', 'é': 'e', 'ě': 'e', 'í': 'i',
    'ň': 'n', 'ó': 'o', 'ř': 'r', 'š': 's', 'ť': 't', 'ú': 'u',
    'ů': 'u', 'ý': 'y', 'ž': 'z', 'Á': 'a', 'Č': 'c', 'Ď': 'd',
    'É': 'e', 'Ě': 'e', 'Í': 'i', 'Ň': 'n', 'Ó': 'o', 'Ř': 'r',
    'Š': 's', 'Ť': 't', 'Ú': 'u', 'Ů': 'u', 'Ý': 'y', 'Ž': 'z'
  };

  return text
    .split('')
    .map(char => charMap[char] || char)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ============================================================
// HTML → PLAIN TEXT
// ============================================================
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// ============================================================
// PARSE WP XML
// ============================================================
async function parseWordPressXml(xmlPath) {
  console.log(`📂 Reading XML: ${xmlPath}`);

  if (!fs.existsSync(xmlPath)) {
    console.error(`❌ File not found: ${xmlPath}`);
    console.log(`\n📋 Place your WordPress export file at: ${xmlPath}`);
    process.exit(1);
  }

  const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
  const parser = new xml2js.Parser({
    explicitArray: false,
    trim: true
  });

  const result = await parser.parseStringPromise(xmlContent);
  const channel = result.rss.channel;
  const items = Array.isArray(channel.item) ? channel.item : [channel.item];

  console.log(`📊 Found ${items.length} items in XML`);

  const posts = [];
  const events = [];
  const teamMembers = [];
  const pages = [];

  for (const item of items) {
    if (!item) continue;

    const postType = item['wp:post_type'] || 'post';
    const status = item['wp:status'] || 'draft';

    // Skip drafts, trash, and private posts
    if (status !== 'publish') continue;

    const title = item.title || '';
    const slug = item['wp:post_name'] || generateSlug(title);
    const content = item['content:encoded'] || '';
    const excerpt = item['excerpt:encoded'] || '';
    const pubDate = item.pubDate ? new Date(item.pubDate) : null;
    const link = item.link || '';

    // Extract featured image (thumbnail)
    let imageUrl = '';
    const postMeta = item['wp:postmeta'];
    if (postMeta) {
      const metas = Array.isArray(postMeta) ? postMeta : [postMeta];
      for (const meta of metas) {
        if (meta['wp:meta_key'] === '_thumbnail_id') {
          // We'll resolve this later from attachments
          imageUrl = meta['wp:meta_value'];
        }
      }
    }

    // Extract categories and tags
    const categories = [];
    if (item.category) {
      const cats = Array.isArray(item.category) ? item.category : [item.category];
      for (const cat of cats) {
        if (typeof cat === 'string') {
          categories.push(cat);
        } else if (cat._ || cat.$) {
          categories.push(cat._ || cat.$.nicename);
        }
      }
    }

    const parsedItem = {
      title,
      slug,
      content,
      excerpt: stripHtml(excerpt),
      date: pubDate,
      link,
      imageUrl,
      categories,
      postType,
      status
    };

    // Categorize by post type
    const ignoredTypes = [
      'product', 'shop_coupon', 'shop_order', 'shop_order_refund', 'udesly_fe_data',
      'attachment', 'nav_menu_item', 'acf-field', 'acf-field-group',
      'wp_global_styles', 'yith_wcan_preset', 'page', 'custom_css',
      'adt_product_feed', 'product_variation', 'udesly_posts_query'
    ];

    if (ignoredTypes.includes(postType)) {
      continue; // Skip these completely
    }

    const hasTeamCat = categories.some(c => c.toLowerCase().includes('team'));
    const isEventCat = categories.some(c => c.toLowerCase() === 'vsechny-akce' || c.toLowerCase().includes('camp'));

    if (postType === 'team' || hasTeamCat) {
      teamMembers.push(parsedItem);
    } else if (postType === 'post') {
      if (isEventCat) {
        events.push(parsedItem);
      } else {
        posts.push(parsedItem);
      }
    } else if (
      postType === 'udesly_evt' ||
      postType === 'events' ||
      postType === 'tribe_events' ||
      postType === 'akce'
    ) {
      events.push(parsedItem);
    } else {
      // Unknown post type
      console.log(`  ℹ️ Skipping unknown post type "${postType}": ${title}`);
    }
  }

  // Resolve attachment URLs for featured images
  const attachments = items.filter(i => i && (i['wp:post_type'] === 'attachment'));
  const attachmentMap = {};
  for (const att of attachments) {
    const attId = att['wp:post_id'];
    const attUrl = att['wp:attachment_url'] || '';
    if (attId && attUrl) {
      attachmentMap[attId] = attUrl;
    }
  }

  // Replace thumbnail IDs with actual URLs
  for (const item of [...posts, ...events, ...teamMembers]) {
    if (item.imageUrl && attachmentMap[item.imageUrl]) {
      item.imageUrl = attachmentMap[item.imageUrl];
    } else if (item.imageUrl && !item.imageUrl.startsWith('http')) {
      item.imageUrl = ''; // Invalid thumbnail reference
    }
  }

  return { posts, events, teamMembers, pages, attachments: Object.values(attachmentMap) };
}

// ============================================================
// IMPORT TO FIRESTORE
// ============================================================
async function importToFirestore(data) {
  const { posts, events, teamMembers, pages } = data;

  console.log(`\n📥 Importing to Firestore...`);
  console.log(`   Články (posts): ${posts.length}`);
  console.log(`   Akce (events): ${events.length}`);
  console.log(`   Team: ${teamMembers.length}`);
  console.log(`   Stránky (pages): ${pages.length} (skipped)`);

  // Import articles (posts → clanky collection)
  console.log('\n📝 Importing články...');
  for (const post of posts) {
    try {
      const docData = {
        titulek: post.title,
        datum: post.date,
        autor: 'Bikeskills tým',
        perex: post.excerpt || stripHtml(post.content).substring(0, 200),
        obsah: post.content,
        slug: post.slug,
        imageUrl: post.imageUrl || '',
        publikovano: true,
        wpLink: post.link, // Keep original WP link for redirect mapping
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await db.collection('clanky').add(docData);
      console.log(`   ✅ ${post.title}`);
    } catch (error) {
      console.error(`   ❌ ${post.title}: ${error.message}`);
    }
  }

  // Import events (events → akce collection)
  console.log('\n🗓️ Importing akce...');
  for (const event of events) {
    try {
      const datumSort = event.date ? event.date.toISOString().split('T')[0] : '';
      const datumText = event.date
        ? event.date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '';

      const docData = {
        nazev: event.title,
        datum: event.date,
        datumSort: datumSort,
        datumText: datumText,
        uroven: '', // Will need to be set manually
        popis: stripHtml(event.content),
        cena: null, // Will need to be set manually
        mena: 'CZK',
        stav: 'odjeto', // Default to "odjeto" for imported events, adjust as needed
        stavLabel: 'Odjeto',
        kategorie: guessCategory(event),
        slug: event.slug,
        imageUrl: event.imageUrl || '',
        aktivni: true,
        wpLink: event.link,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await db.collection('akce').add(docData);
      console.log(`   ✅ ${event.title}`);
    } catch (error) {
      console.error(`   ❌ ${event.title}: ${error.message}`);
    }
  }

  // Import team (teamMembers → team collection)
  console.log('\n👥 Importing team...');
  for (const member of teamMembers) {
    try {
      const docData = {
        jmeno: member.title,
        popis: member.content, // Often team bio is in content
        slug: member.slug,
        imageUrl: member.imageUrl || '',
        poradi: 0,
        aktivni: true,
        wpLink: member.link,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await db.collection('team').add(docData);
      console.log(`   ✅ ${member.title}`);
    } catch (error) {
      console.error(`   ❌ ${member.title}: ${error.message}`);
    }
  }

  // Generate redirect mapping
  console.log('\n🔗 Redirect mapping (for firebase.json):');
  console.log('   Add these to firebase.json → hosting → redirects:');
  const redirects = [];

  for (const post of posts) {
    if (post.link) {
      const oldPath = new URL(post.link).pathname;
      const newPath = `/blog/${post.slug}/`;
      if (oldPath !== newPath) {
        redirects.push({ source: oldPath, destination: newPath, type: 301 });
        console.log(`   ${oldPath} → ${newPath}`);
      }
    }
  }

  // Save redirects to file
  if (redirects.length > 0) {
    const redirectsPath = path.join(__dirname, 'redirects.json');
    fs.writeFileSync(redirectsPath, JSON.stringify(redirects, null, 2));
    console.log(`\n📄 Redirects saved to: ${redirectsPath}`);
  }

  console.log('\n✅ Import complete!');
}

// ============================================================
// HELPERS
// ============================================================
function guessCategory(event) {
  const title = (event.title || '').toLowerCase();
  const content = (event.content || '').toLowerCase();
  const text = title + ' ' + content;

  if (text.includes('trial')) return 'trialovy';
  if (text.includes('camp') || text.includes('ladí') || text.includes('ladi')) return 'camp';
  if (text.includes('workshop')) return 'workshop';
  if (text.includes('kurz')) return 'kurz';
  return 'jine';
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('🚴 BIKESKILLS WordPress Import');
  console.log('================================\n');

  const data = await parseWordPressXml(XML_FILE);

  console.log(`\n📊 Summary:`);
  console.log(`   Posts (→ články): ${data.posts.length}`);
  console.log(`   Events (→ akce): ${data.events.length}`);
  console.log(`   Pages: ${data.pages.length}`);
  console.log(`   Attachments: ${data.attachments.length}`);

  // Show what we found
  if (data.posts.length > 0) {
    console.log('\n📝 Články:');
    data.posts.forEach(p => console.log(`   - ${p.title} (${p.slug})`));
  }
  if (data.events.length > 0) {
    console.log('\n🗓️ Akce:');
    data.events.forEach(e => console.log(`   - ${e.title} (${e.slug})`));
  }

  // Ask for confirmation before importing
  console.log('\n⏳ Importing to Firestore in 3 seconds... (Ctrl+C to cancel)');
  await new Promise(resolve => setTimeout(resolve, 3000));

  await importToFirestore(data);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
