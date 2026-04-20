/**
 * BIKESKILLS Admin Panel
 * Firebase Firestore CRUD pro akce a články
 */

// ============================================================
// FIREBASE CONFIG
// ============================================================
// TODO: Nahradit skutečnou konfigurací po vytvoření Firebase projektu
const firebaseConfig = {
  apiKey: "AIzaSyD-DnZA0IV6S7iGTAayrMdxSyndNJ8JqZM",
  authDomain: "bikeskills-web.firebaseapp.com",
  projectId: "bikeskills-web",
  storageBucket: "bikeskills-web.firebasestorage.app",
  messagingSenderId: "804622076781",
  appId: "1:804622076781:web:0cc99211c3c36f27842864",
  measurementId: "G-Y1GJE85WDX"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// ============================================================
// STATE
// ============================================================
let quillEditor = null;       // editor pro obsah článku
let quillAkcePopis = null;   // editor pro popis akce
let quillTeamPopis = null;   // editor pro popis člena týmu
let currentDeleteTarget = null; // { collection, id, name }
let akceGalerieUrls = [];   // pole URL fotek pro galerii akce
let clanekGalerieUrls = []; // pole URL fotek pro galerii článku
let teamGalerieUrls = [];   // pole URL fotek pro galerii člena týmu
const GALLERY_MAX = 20;
const STATUS_LABELS = {
  otevreno: 'Otevřeno',
  prihlasujte: 'Přihlašujte se',
  obsazeno: 'Obsazeno',
  odjeto: 'Odjeto'
};

// ============================================================
// AUTH
// ============================================================
auth.onAuthStateChanged(user => {
  if (user) {
    showDashboard(user);
  } else {
    showLogin();
  }
});

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('admin-dashboard').style.display = 'none';
}

function showDashboard(user) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-dashboard').style.display = 'flex';
  document.getElementById('user-email').textContent = user.email;
  
  // Quill image handler — nahraje obrázek do Firebase Storage a vloží URL
  function makeQuillImageHandler(quill, uploadFolder) {
    return function() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.click();
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        try {
          const url = await uploadImage(file, uploadFolder);
          const range = quill.getSelection(true);
          quill.insertEmbed(range.index, 'image', url);
          quill.setSelection(range.index + 1);
        } catch (err) {
          showToast('Chyba nahrávání obrázku: ' + err.message, 'error');
        }
      };
    };
  }

  const toolbarOptions = [
    [{ 'header': [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
    ['link', 'image'],
    ['blockquote'],
    ['clean']
  ];

  // Editor pro obsah článku
  if (!quillEditor) {
    quillEditor = new Quill('#clanek-editor', {
      theme: 'snow',
      modules: { toolbar: { container: toolbarOptions, handlers: {} } },
      placeholder: 'Obsah článku...'
    });
    quillEditor.getModule('toolbar').addHandler('image', makeQuillImageHandler(quillEditor, 'blog/content'));
  }

  // Editor pro popis akce
  if (!quillAkcePopis) {
    quillAkcePopis = new Quill('#akce-popis-editor', {
      theme: 'snow',
      modules: { toolbar: { container: toolbarOptions, handlers: {} } },
      placeholder: 'Popis akce...'
    });
    quillAkcePopis.getModule('toolbar').addHandler('image', makeQuillImageHandler(quillAkcePopis, 'akce/content'));
  }

  // Editor pro popis člena týmu
  if (!quillTeamPopis) {
    quillTeamPopis = new Quill('#team-popis-editor', {
      theme: 'snow',
      modules: { toolbar: { container: toolbarOptions, handlers: {} } },
      placeholder: 'Biografie / popis jezdce...'
    });
    quillTeamPopis.getModule('toolbar').addHandler('image', makeQuillImageHandler(quillTeamPopis, 'team/content'));
  }

  // Load data
  loadAkce();
  loadClanky();
  loadTeam();
}

// Login form - Email
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  btn.disabled = true;
  btn.textContent = 'Přihlašování...';
  errorEl.textContent = '';

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (error) {
    const messages = {
      'auth/user-not-found': 'Uživatel nenalezen',
      'auth/wrong-password': 'Nesprávné heslo',
      'auth/invalid-email': 'Neplatný e-mail',
      'auth/too-many-requests': 'Příliš mnoho pokusů, zkuste znovu později',
      'auth/invalid-credential': 'Neplatné přihlašovací údaje'
    };
    errorEl.textContent = messages[error.code] || 'Chyba přihlášení: ' + error.message;
  }

  btn.disabled = false;
  btn.textContent = 'Přihlásit se emailem';
});

// Login form - Google
const googleBtn = document.getElementById('google-login-btn');
if (googleBtn) {
  googleBtn.addEventListener('click', async () => {
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = 'Otevírám Google přihlášení...';
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
    } catch (error) {
      console.error('Google login error:', error);
      errorEl.textContent = 'Chyba Google přihlášení: ' + error.message;
    }
  });
}

// Logout
document.getElementById('logout-btn').addEventListener('click', () => {
  auth.signOut();
});

// ============================================================
// NAVIGATION
// ============================================================
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const section = item.dataset.section;

    // Update nav
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');

    // Show section
    document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
    document.getElementById(`section-${section}`).style.display = 'block';
  });
});

// ============================================================
// AKCE - CRUD
// ============================================================
async function loadAkce() {
  const tbody = document.getElementById('akce-tbody');
  tbody.innerHTML = '<tr class="loading-row"><td colspan="6">Načítání...</td></tr>';

  try {
    const snapshot = await db.collection('akce')
      .orderBy('datumSort', 'desc')
      .get();

    if (snapshot.empty) {
      tbody.innerHTML = '<tr class="loading-row"><td colspan="6">Žádné akce. Vytvořte novou akci.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    snapshot.forEach(doc => {
      const data = doc.data();
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${escapeHtml(data.nazev || '')}</strong></td>
        <td>${escapeHtml(data.datumText || '')}</td>
        <td><span class="category-badge">${escapeHtml(data.kategorie || '')}</span></td>
        <td>${data.cena ? data.cena.toLocaleString('cs-CZ') + ' CZK' : '–'}</td>
        <td><span class="status-badge status-${data.stav || 'otevreno'}">${STATUS_LABELS[data.stav] || data.stav || '–'}</span></td>
        <td>
          <div class="td-actions">
            <button class="btn-icon" title="Upravit" onclick="editAkce('${doc.id}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon btn-icon-danger" title="Smazat" onclick="confirmDeleteAkce('${doc.id}', '${escapeHtml(data.nazev || '')}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (error) {
    console.error('Error loading akce:', error);
    tbody.innerHTML = '<tr class="loading-row"><td colspan="6">Chyba načítání dat.</td></tr>';
  }
}

// ============================================================
// DYNAMIC GALLERY
// ============================================================

/** Vyrendruje dynamickou galerii do containeru */
function renderGallery(containerId, urls) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  urls.forEach((url, idx) => {
    if (!url) return;
    const div = document.createElement('div');
    div.className = 'gallery-dynamic-item';
    div.innerHTML = `
      <img src="${escapeHtml(url)}" alt="Foto ${idx + 1}" loading="lazy">
      <button type="button" class="gallery-remove-btn" title="Odebrat fotku" data-idx="${idx}">&times;</button>
    `;
    container.appendChild(div);
  });
  // Disable upload button at max
  const prefix = containerId.replace('-gallery-items', '');
  const fileLabel = document.getElementById(`${prefix}-gallery-file-label`);
  if (fileLabel) fileLabel.style.opacity = urls.length >= GALLERY_MAX ? '0.4' : '';
}

function renderAkceGallery() { renderGallery('akce-gallery-items', akceGalerieUrls); }
function renderClanekGallery() { renderGallery('clanek-gallery-items', clanekGalerieUrls); }
function renderTeamGallery() { renderGallery('team-gallery-items', teamGalerieUrls); }

function clearAkceGallery() {
  akceGalerieUrls = [];
  renderAkceGallery();
}

function clearClanekGallery() {
  clanekGalerieUrls = [];
  renderClanekGallery();
}

// Delegovaný klik pro smazání fotky z galerie
document.getElementById('akce-gallery-items').addEventListener('click', (e) => {
  const btn = e.target.closest('.gallery-remove-btn');
  if (!btn) return;
  const idx = parseInt(btn.dataset.idx);
  akceGalerieUrls.splice(idx, 1);
  renderAkceGallery();
});

document.getElementById('clanek-gallery-items').addEventListener('click', (e) => {
  const btn = e.target.closest('.gallery-remove-btn');
  if (!btn) return;
  const idx = parseInt(btn.dataset.idx);
  clanekGalerieUrls.splice(idx, 1);
  renderClanekGallery();
});

document.getElementById('team-gallery-items').addEventListener('click', (e) => {
  const btn = e.target.closest('.gallery-remove-btn');
  if (!btn) return;
  const idx = parseInt(btn.dataset.idx);
  teamGalerieUrls.splice(idx, 1);
  renderTeamGallery();
});

// Nahrání souborů do galerie
document.getElementById('akce-gallery-file').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  e.target.value = '';
  const remaining = GALLERY_MAX - akceGalerieUrls.length;
  const toUpload = files.slice(0, remaining);
  if (!toUpload.length) return;
  showToast(`Nahrávám ${toUpload.length} fotek...`);
  for (const file of toUpload) {
    try {
      const url = await uploadImage(file, 'akce/gallery');
      akceGalerieUrls.push(url);
      renderAkceGallery();
    } catch (err) {
      showToast('Chyba nahrávání: ' + err.message, 'error');
    }
  }
});

document.getElementById('clanek-gallery-file').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  e.target.value = '';
  const remaining = GALLERY_MAX - clanekGalerieUrls.length;
  const toUpload = files.slice(0, remaining);
  if (!toUpload.length) return;
  showToast(`Nahrávám ${toUpload.length} fotek...`);
  for (const file of toUpload) {
    try {
      const url = await uploadImage(file, 'blog/gallery');
      clanekGalerieUrls.push(url);
      renderClanekGallery();
    } catch (err) {
      showToast('Chyba nahrávání: ' + err.message, 'error');
    }
  }
});

document.getElementById('team-gallery-file').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  e.target.value = '';
  const remaining = GALLERY_MAX - teamGalerieUrls.length;
  const toUpload = files.slice(0, remaining);
  if (!toUpload.length) return;
  showToast(`Nahrávám ${toUpload.length} fotek...`);
  for (const file of toUpload) {
    try {
      const url = await uploadImage(file, 'team/gallery');
      teamGalerieUrls.push(url);
      renderTeamGallery();
    } catch (err) {
      showToast('Chyba nahrávání: ' + err.message, 'error');
    }
  }
});

// Přidání URL do galerie
document.getElementById('akce-gallery-add-url').addEventListener('click', () => {
  const input = document.getElementById('akce-gallery-url-input');
  const url = input.value.trim();
  if (!url || akceGalerieUrls.length >= GALLERY_MAX) return;
  akceGalerieUrls.push(url);
  input.value = '';
  renderAkceGallery();
});

document.getElementById('clanek-gallery-add-url').addEventListener('click', () => {
  const input = document.getElementById('clanek-gallery-url-input');
  const url = input.value.trim();
  if (!url || clanekGalerieUrls.length >= GALLERY_MAX) return;
  clanekGalerieUrls.push(url);
  input.value = '';
  renderClanekGallery();
});

document.getElementById('team-gallery-add-url').addEventListener('click', () => {
  const input = document.getElementById('team-gallery-url-input');
  const url = input.value.trim();
  if (!url || teamGalerieUrls.length >= GALLERY_MAX) return;
  teamGalerieUrls.push(url);
  input.value = '';
  renderTeamGallery();
});

// New akce
document.getElementById('btn-new-akce').addEventListener('click', () => {
  document.getElementById('akce-id').value = '';
  document.getElementById('form-akce').reset();
  document.getElementById('akce-aktivni').checked = true;
  document.getElementById('akce-image-preview').innerHTML = '';
  if (quillAkcePopis) quillAkcePopis.setContents([]);
  clearAkceGallery();
  document.getElementById('modal-akce-title').textContent = 'Nová akce';
  openModal('modal-akce');
});

// Edit akce
async function editAkce(id) {
  try {
    const doc = await db.collection('akce').doc(id).get();
    if (!doc.exists) {
      showToast('Akce nenalezena', 'error');
      return;
    }

    const data = doc.data();
    document.getElementById('akce-id').value = id;
    document.getElementById('akce-nazev').value = data.nazev || '';
    document.getElementById('akce-datum').value = data.datumText || '';
    document.getElementById('akce-datum-sort').value = data.datumSort || '';
    document.getElementById('akce-kategorie').value = data.kategorie || 'camp';
    document.getElementById('akce-uroven').value = data.uroven || '';
    document.getElementById('akce-cena').value = data.cena || '';
    document.getElementById('akce-stav').value = data.stav || 'otevreno';
    document.getElementById('akce-slug').value = data.slug || '';
    document.getElementById('akce-aktivni').checked = data.aktivni !== false;
    document.getElementById('akce-image-url').value = data.imageUrl || '';
    document.getElementById('akce-video-url').value = data.videoUrl || '';
    document.getElementById('akce-instagram-url').value = data.instagramUrl || '';

    // Popis do Quill editoru
    if (quillAkcePopis) {
      if (data.popis) quillAkcePopis.root.innerHTML = data.popis;
      else quillAkcePopis.setContents([]);
    }

    // Galerie — podpora nového pole galerie[] i starých galerie1..4
    if (data.galerie && data.galerie.length) {
      akceGalerieUrls = data.galerie.filter(Boolean);
    } else {
      akceGalerieUrls = [data.galerie1, data.galerie2, data.galerie3, data.galerie4].filter(Boolean);
    }
    renderAkceGallery();

    // Show image preview
    const preview = document.getElementById('akce-image-preview');
    if (data.imageUrl) {
      preview.innerHTML = `<img src="${escapeHtml(data.imageUrl)}" alt="Preview">`;
    } else {
      preview.innerHTML = '';
    }

    document.getElementById('modal-akce-title').textContent = 'Upravit akci';
    openModal('modal-akce');
  } catch (error) {
    console.error('Error loading akce:', error);
    showToast('Chyba načítání akce', 'error');
  }
}

// Save akce
document.getElementById('form-akce').addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('akce-id').value;
  const btn = document.getElementById('btn-save-akce');
  btn.disabled = true;
  btn.textContent = 'Ukládání...';

  try {
    // Handle image upload if file selected
    let imageUrl = document.getElementById('akce-image-url').value;
    const fileInput = document.getElementById('akce-image-file');
    if (fileInput.files.length > 0) {
      imageUrl = await uploadImage(fileInput.files[0], 'akce');
    }

    const nazev = document.getElementById('akce-nazev').value.trim();
    const slug = document.getElementById('akce-slug').value.trim() || generateSlug(nazev);
    const popis = quillAkcePopis ? quillAkcePopis.root.innerHTML : '';

    const data = {
      nazev: nazev,
      datumText: document.getElementById('akce-datum').value.trim(),
      datumSort: document.getElementById('akce-datum-sort').value || null,
      kategorie: document.getElementById('akce-kategorie').value,
      uroven: document.getElementById('akce-uroven').value.trim(),
      cena: parseInt(document.getElementById('akce-cena').value) || null,
      mena: 'CZK',
      stav: document.getElementById('akce-stav').value,
      stavLabel: STATUS_LABELS[document.getElementById('akce-stav').value],
      popis: popis,
      slug: slug,
      imageUrl: imageUrl,
      videoUrl: document.getElementById('akce-video-url').value.trim() || null,
      instagramUrl: document.getElementById('akce-instagram-url').value.trim() || null,
      galerie: akceGalerieUrls.filter(Boolean),
      aktivni: document.getElementById('akce-aktivni').checked,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (id) {
      await db.collection('akce').doc(id).update(data);
      showToast('Akce aktualizována ✓');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('akce').add(data);
      showToast('Akce vytvořena ✓');
    }

    closeModal('modal-akce');
    loadAkce();
  } catch (error) {
    console.error('Error saving akce:', error);
    showToast('Chyba ukládání: ' + error.message, 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Uložit akci';
});

function confirmDeleteAkce(id, name) {
  currentDeleteTarget = { collection: 'akce', id: id, name: name };
  document.getElementById('delete-item-name').textContent = name;
  openModal('modal-delete');
}

// ============================================================
// ČLÁNKY - CRUD
// ============================================================
async function loadClanky() {
  const tbody = document.getElementById('clanky-tbody');
  tbody.innerHTML = '<tr class="loading-row"><td colspan="5">Načítání...</td></tr>';

  try {
    const snapshot = await db.collection('clanky')
      .orderBy('datum', 'desc')
      .get();

    if (snapshot.empty) {
      tbody.innerHTML = '<tr class="loading-row"><td colspan="5">Žádné články. Vytvořte nový článek.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    snapshot.forEach(doc => {
      const data = doc.data();
      const datum = data.datum ? new Date(data.datum.seconds ? data.datum.seconds * 1000 : data.datum).toLocaleDateString('cs-CZ') : '–';
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${escapeHtml(data.titulek || '')}</strong></td>
        <td>${datum}</td>
        <td>${escapeHtml(data.autor || '–')}</td>
        <td><span class="status-badge ${data.publikovano !== false ? 'status-otevreno' : 'status-odjeto'}">${data.publikovano !== false ? 'Publikováno' : 'Koncept'}</span></td>
        <td>
          <div class="td-actions">
            <button class="btn-icon" title="Upravit" onclick="editClanek('${doc.id}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon btn-icon-danger" title="Smazat" onclick="confirmDeleteClanek('${doc.id}', '${escapeHtml(data.titulek || '')}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (error) {
    console.error('Error loading clanky:', error);
    tbody.innerHTML = '<tr class="loading-row"><td colspan="5">Chyba načítání dat.</td></tr>';
  }
}

// New článek
document.getElementById('btn-new-clanek').addEventListener('click', () => {
  document.getElementById('clanek-id').value = '';
  document.getElementById('form-clanek').reset();
  document.getElementById('clanek-publikovano').checked = true;
  document.getElementById('clanek-autor').value = 'Bikeskills tým';
  document.getElementById('clanek-image-preview').innerHTML = '';
  if (quillEditor) quillEditor.setContents([]);
  clearClanekGallery();
  document.getElementById('modal-clanek-title').textContent = 'Nový článek';
  openModal('modal-clanek');
});

// Edit článek
async function editClanek(id) {
  try {
    const doc = await db.collection('clanky').doc(id).get();
    if (!doc.exists) {
      showToast('Článek nenalezen', 'error');
      return;
    }

    const data = doc.data();
    document.getElementById('clanek-id').value = id;
    document.getElementById('clanek-titulek').value = data.titulek || '';
    document.getElementById('clanek-datum').value = data.datum
      ? (data.datum.seconds ? new Date(data.datum.seconds * 1000).toISOString().split('T')[0] : data.datum)
      : '';
    document.getElementById('clanek-autor').value = data.autor || 'Bikeskills tým';
    document.getElementById('clanek-perex').value = data.perex || '';
    document.getElementById('clanek-slug').value = data.slug || '';
    document.getElementById('clanek-publikovano').checked = data.publikovano !== false;
    document.getElementById('clanek-image-url').value = data.imageUrl || '';
    document.getElementById('clanek-video-url').value = data.videoUrl || '';
    document.getElementById('clanek-instagram-url').value = data.instagramUrl || '';

    // Galerie — podpora nového pole galerie[] i starých galerie1..4
    if (data.galerie && data.galerie.length) {
      clanekGalerieUrls = data.galerie.filter(Boolean);
    } else {
      clanekGalerieUrls = [data.galerie1, data.galerie2, data.galerie3, data.galerie4].filter(Boolean);
    }
    renderClanekGallery();

    // Load content into Quill
    if (quillEditor) {
      if (data.obsah) {
        quillEditor.root.innerHTML = data.obsah;
      } else {
        quillEditor.setContents([]);
      }
    }

    // Show image preview
    const preview = document.getElementById('clanek-image-preview');
    if (data.imageUrl) {
      preview.innerHTML = `<img src="${escapeHtml(data.imageUrl)}" alt="Preview">`;
    } else {
      preview.innerHTML = '';
    }

    document.getElementById('modal-clanek-title').textContent = 'Upravit článek';
    openModal('modal-clanek');
  } catch (error) {
    console.error('Error loading clanek:', error);
    showToast('Chyba načítání článku', 'error');
  }
}

// Save článek
document.getElementById('form-clanek').addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('clanek-id').value;
  const btn = document.getElementById('btn-save-clanek');
  btn.disabled = true;
  btn.textContent = 'Ukládání...';

  try {
    // Handle image upload if file selected
    let imageUrl = document.getElementById('clanek-image-url').value;
    const fileInput = document.getElementById('clanek-image-file');
    if (fileInput.files.length > 0) {
      imageUrl = await uploadImage(fileInput.files[0], 'blog');
    }

    const titulek = document.getElementById('clanek-titulek').value.trim();
    const slug = document.getElementById('clanek-slug').value.trim() || generateSlug(titulek);
    const datumValue = document.getElementById('clanek-datum').value;

    const data = {
      titulek: titulek,
      datum: datumValue ? new Date(datumValue) : null,
      autor: document.getElementById('clanek-autor').value.trim(),
      perex: document.getElementById('clanek-perex').value.trim(),
      obsah: quillEditor ? quillEditor.root.innerHTML : '',
      slug: slug,
      imageUrl: imageUrl,
      videoUrl: document.getElementById('clanek-video-url').value.trim() || null,
      instagramUrl: document.getElementById('clanek-instagram-url').value.trim() || null,
      galerie: clanekGalerieUrls.filter(Boolean),
      publikovano: document.getElementById('clanek-publikovano').checked,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (id) {
      await db.collection('clanky').doc(id).update(data);
      showToast('Článek aktualizován ✓');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('clanky').add(data);
      showToast('Článek vytvořen ✓');
    }

    closeModal('modal-clanek');
    loadClanky();
  } catch (error) {
    console.error('Error saving clanek:', error);
    showToast('Chyba ukládání: ' + error.message, 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Uložit článek';
});

function confirmDeleteClanek(id, name) {
  currentDeleteTarget = { collection: 'clanky', id: id, name: name };
  document.getElementById('delete-item-name').textContent = name;
  openModal('modal-delete');
}

// ============================================================
// DELETE CONFIRMATION
// ============================================================
document.getElementById('btn-confirm-delete').addEventListener('click', async () => {
  if (!currentDeleteTarget) return;

  const btn = document.getElementById('btn-confirm-delete');
  btn.disabled = true;
  btn.textContent = 'Mazání...';

  try {
    await db.collection(currentDeleteTarget.collection).doc(currentDeleteTarget.id).delete();
    showToast(`${currentDeleteTarget.name} smazáno ✓`);
    closeModal('modal-delete');

    if (currentDeleteTarget.collection === 'akce') {
      loadAkce();
    } else if (currentDeleteTarget.collection === 'clanky') {
      loadClanky();
    } else if (currentDeleteTarget.collection === 'team') {
      loadTeam();
    }
  } catch (error) {
    console.error('Error deleting:', error);
    showToast('Chyba mazání: ' + error.message, 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Smazat';
  currentDeleteTarget = null;
});

// ============================================================
// TÝM - CRUD
// ============================================================
async function loadTeam() {
  const tbody = document.getElementById('team-tbody');
  tbody.innerHTML = '<tr class="loading-row"><td colspan="5">Načítání...</td></tr>';

  try {
    const snapshot = await db.collection('team')
      .orderBy('poradi', 'asc')
      .get();

    if (snapshot.empty) {
      tbody.innerHTML = '<tr class="loading-row"><td colspan="5">Žádní členové týmu. Přidejte prvního.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    snapshot.forEach(doc => {
      const data = doc.data();
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>
          <div style="width:40px;height:40px;border-radius:50%;overflow:hidden;background:#eee;">
            ${data.imageUrl ? `<img src="${escapeHtml(data.imageUrl)}" style="width:100%;height:100%;object-fit:cover;">` : ''}
          </div>
        </td>
        <td><strong>${escapeHtml(data.jmeno || '')}</strong></td>
        <td>${data.poradi || 0}</td>
        <td><span class="status-badge ${data.aktivni !== false ? 'status-otevreno' : 'status-odjeto'}">${data.aktivni !== false ? 'Aktivní' : 'Skryto'}</span></td>
        <td>
          <div class="td-actions">
            <button class="btn-icon" title="Upravit" onclick="editTeam('${doc.id}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon btn-icon-danger" title="Smazat" onclick="confirmDeleteTeam('${doc.id}', '${escapeHtml(data.jmeno || '')}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (error) {
    console.error('Error loading team:', error);
    tbody.innerHTML = '<tr class="loading-row"><td colspan="5">Chyba načítání dat.</td></tr>';
  }
}

// New Team
document.getElementById('btn-new-team').addEventListener('click', () => {
  document.getElementById('team-id').value = '';
  document.getElementById('form-team').reset();
  document.getElementById('team-aktivni').checked = true;
  document.getElementById('team-poradi').value = 0;
  document.getElementById('team-image-preview').innerHTML = '';
  if (quillTeamPopis) quillTeamPopis.setContents([]);
  teamGalerieUrls = [];
  renderGallery('team-gallery-items', teamGalerieUrls);
  document.getElementById('modal-team-title').textContent = 'Nový člen týmu';
  openModal('modal-team');
});

// Edit Team
async function editTeam(id) {
  try {
    const doc = await db.collection('team').doc(id).get();
    if (!doc.exists) {
      showToast('Člen nenalezen', 'error');
      return;
    }

    const data = doc.data();
    document.getElementById('team-id').value = id;
    document.getElementById('team-jmeno').value = data.jmeno || '';
    document.getElementById('team-slug').value = data.slug || '';
    document.getElementById('team-poradi').value = data.poradi || 0;
    document.getElementById('team-aktivni').checked = data.aktivni !== false;
    document.getElementById('team-image-url').value = data.imageUrl || '';
    document.getElementById('team-video-url').value = data.videoUrl || '';
    document.getElementById('team-video-url2').value = data.videoUrl2 || '';
    document.getElementById('team-video-url3').value = data.videoUrl3 || '';

    if (quillTeamPopis) {
      quillTeamPopis.clipboard.dangerouslyPasteHTML(data.popis || '');
    }

    teamGalerieUrls = Array.isArray(data.galerie) ? [...data.galerie] : [];
    renderGallery('team-gallery-items', teamGalerieUrls);

    const preview = document.getElementById('team-image-preview');
    if (data.imageUrl) {
      preview.innerHTML = `<img src="${escapeHtml(data.imageUrl)}" alt="Preview">`;
    } else {
      preview.innerHTML = '';
    }

    document.getElementById('modal-team-title').textContent = 'Upravit člena týmu';
    openModal('modal-team');
  } catch (error) {
    console.error('Error loading team member:', error);
    showToast('Chyba načítání člena', 'error');
  }
}

// Save Team
document.getElementById('form-team').addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('team-id').value;
  const btn = document.getElementById('btn-save-team');
  btn.disabled = true;
  btn.textContent = 'Ukládání...';

  try {
    let imageUrl = document.getElementById('team-image-url').value;
    const fileInput = document.getElementById('team-image-file');
    if (fileInput.files.length > 0) {
      imageUrl = await uploadImage(fileInput.files[0], 'team');
    }

    const jmeno = document.getElementById('team-jmeno').value.trim();
    const slug = document.getElementById('team-slug').value.trim() || generateSlug(jmeno);
    const popis = quillTeamPopis ? quillTeamPopis.root.innerHTML : '';

    const data = {
      jmeno: jmeno,
      slug: slug,
      popis: popis,
      poradi: parseInt(document.getElementById('team-poradi').value) || 0,
      imageUrl: imageUrl,
      galerie: teamGalerieUrls,
      videoUrl: document.getElementById('team-video-url').value.trim() || null,
      videoUrl2: document.getElementById('team-video-url2').value.trim() || null,
      videoUrl3: document.getElementById('team-video-url3').value.trim() || null,
      aktivni: document.getElementById('team-aktivni').checked,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (id) {
      await db.collection('team').doc(id).update(data);
      showToast('Záznam týmu aktualizován ✓');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('team').add(data);
      showToast('Člen přidán do týmu ✓');
    }

    closeModal('modal-team');
    loadTeam();
  } catch (error) {
    console.error('Error saving team member:', error);
    showToast('Chyba ukládání: ' + error.message, 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Uložit člena';
});

function confirmDeleteTeam(id, name) {
  currentDeleteTarget = { collection: 'team', id: id, name: name };
  document.getElementById('delete-item-name').textContent = name;
  openModal('modal-delete');
}

// ============================================================
// IMAGE COMPRESSION + UPLOAD
// ============================================================

/** Zmenší obrázek na max. maxDim px a převede na WebP */
async function compressToWebP(file, maxDim = 1920, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > maxDim || h > maxDim) {
        if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => resolve(blob || file), 'image/webp', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(file); };
    img.src = blobUrl;
  });
}

async function uploadImage(file, folder) {
  const compressed = await compressToWebP(file);
  const timestamp = Date.now();
  const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9-]/g, '_');
  const filePath = `images/${folder}/${timestamp}_${baseName}.webp`;
  const ref = storage.ref(filePath);
  showToast('Nahrávání obrázku...');
  const snap = await ref.put(compressed, { contentType: 'image/webp' });
  const url = await snap.ref.getDownloadURL();
  showToast('Obrázek nahrán ✓');
  return url;
}

// Hlavní obrázek — náhled při výběru souboru
['akce-image-file', 'clanek-image-file', 'team-image-file'].forEach(inputId => {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const previewId = inputId.replace('-file', '-preview');
    const preview = document.getElementById(previewId);
    if (!preview) return;
    const reader = new FileReader();
    reader.onload = (ev) => { preview.innerHTML = `<img src="${ev.target.result}" alt="Preview">`; };
    reader.readAsDataURL(file);
  });
});

// ============================================================
// MODAL HELPERS
// ============================================================
function openModal(id) {
  document.getElementById(id).style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
  document.body.style.overflow = '';
}

// Close modal on overlay click or close button
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', () => {
    overlay.closest('.modal').style.display = 'none';
    document.body.style.overflow = '';
  });
});

document.querySelectorAll('.modal-close, [data-modal]').forEach(btn => {
  btn.addEventListener('click', () => {
    const modalId = btn.dataset.modal || btn.closest('.modal')?.id;
    if (modalId) closeModal(modalId);
  });
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal').forEach(modal => {
      if (modal.style.display !== 'none') {
        modal.style.display = 'none';
        document.body.style.overflow = '';
      }
    });
  }
});

// ============================================================
// TOAST NOTIFICATION
// ============================================================
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-message');
  
  toast.className = `toast toast-${type}`;
  msgEl.textContent = message;
  toast.style.display = 'block';

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

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

document.getElementById('akce-nazev').addEventListener('blur', (e) => {
  const slugField = document.getElementById('akce-slug');
  if (!slugField.value && e.target.value) {
    slugField.value = generateSlug(e.target.value);
  }
});

document.getElementById('clanek-titulek').addEventListener('blur', (e) => {
  const slugField = document.getElementById('clanek-slug');
  if (!slugField.value && e.target.value) {
    slugField.value = generateSlug(e.target.value);
  }
});

document.getElementById('team-jmeno').addEventListener('blur', (e) => {
  const slugField = document.getElementById('team-slug');
  if (!slugField.value && e.target.value) {
    slugField.value = generateSlug(e.target.value);
  }
});
