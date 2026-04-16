const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIGURATION
// ============================================================
const EXPORT_DIR = path.join(__dirname, '../webflow-export');
const PUBLIC_DIR = path.join(__dirname, '../public');

// ============================================================
// REGEX PATTERNS TO REMOVE/REPLACE
// ============================================================
const PATTERNS = [
  // 1. Remove Udesly specific data attributes
  {
    regex: /\sdata-udesly-[a-zA-Z0-9-]+="[^"]*"/g,
    replace: ''
  },
  // 2. Remove Udesly WP tags / template syntax {udesly:...}
  {
    regex: /\{udesly:[^}]+\}/g,
    replace: ''
  },
  // 3. Remove WP / Udesly scripts from head
  {
    regex: /<script[^>]*src="[^"]*udesly[^"]*"[^>]*><\/script>/gi,
    replace: ''
  },
  // 4. Remove udesly attributes without values
  {
    regex: /\sudesly-[a-zA-Z0-9-]+/g,
    replace: ''
  }
];

// ============================================================
// INIT
// ============================================================
function init() {
  console.log('🧹 Starting Udesly Webflow cleanup...');
  
  if (!fs.existsSync(EXPORT_DIR)) {
    console.error(`❌ Export directory not found: ${EXPORT_DIR}`);
    return;
  }

  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  // Copy assets (css, js, images, fonts, documents)
  ['css', 'js', 'images', 'fonts', 'documents'].forEach(dir => {
    const src = path.join(EXPORT_DIR, dir);
    const dest = path.join(PUBLIC_DIR, dir);
    if (fs.existsSync(src)) {
      console.log(`📁 Copying ${dir}...`);
      copyDirRecursive(src, dest);
    }
  });

  // Clean HTML files
  console.log(`\n📄 Cleaning HTML files...`);
  
  const files = fs.readdirSync(EXPORT_DIR)
    .filter(file => file.endsWith('.html'));

  files.forEach(file => {
    const srcPath = path.join(EXPORT_DIR, file);
    const destPath = path.join(PUBLIC_DIR, file);
    
    // Skip some known Udesly internal pages
    if (file.includes('udesly_') || file === '401.html') {
      console.log(`   ⏭️ Skipping internal page: ${file}`);
      return;
    }

    console.log(`   ✨ Processing: ${file}`);
    let content = fs.readFileSync(srcPath, 'utf8');

    // Apply regex replacements
    PATTERNS.forEach(pattern => {
      content = content.replace(pattern.regex, pattern.replace);
    });
    
    // Inject Firebase and CMS loader
    content = injectFirebase(content);

    fs.writeFileSync(destPath, content);
  });

  console.log('\n✅ Cleanup complete! Files are ready in public/');
}

// ============================================================
// FIREBASE INJECTION
// ============================================================
function injectFirebase(content) {
  // Check if we already injected it
  if (content.includes('cms-loader.js')) return content;

  const scripts = `
  <!-- Firebase SDK -->
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js"></script>
  
  <!-- Bikeskills CMS Loader -->
  <script src="/js/cms-loader.js"></script>
</body>`;

  return content.replace('</body>', scripts);
}

// ============================================================
// HELPERS
// ============================================================
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

init();
