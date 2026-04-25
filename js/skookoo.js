/* ============================================================
   ÉDITIONS SKOOKOO — JavaScript partagé
   ============================================================ */

// ============================================================
// CONFIGURATION CLOUDFLARE R2
// ============================================================
// Changez cette URL pour pointer vers votre bucket R2 public
const R2_BASE_URL = 'https://pub-e40dd4d214674632a4c513ef3797acfe.r2.dev';

// Si vous utilisez un domaine personnalisé sur R2 :
// const R2_BASE_URL = 'https://livres.editions-skookoo.fr';

// Liste des dossiers de livres dans votre bucket R2
// Format : 'nom_du_dossier'
// Le script tentera de charger R2_BASE_URL/<dossier>/metadata.json
const BOOK_FOLDERS = [
  // Remplissez cette liste avec vos dossiers R2
  // Exemple : 'st_exupery_le_petit_prince'
  // Ces valeurs seront remplacées par votre propre index ou découverte dynamique
];

// Optionnel : fichier index listant tous les livres (recommandé pour la performance)
// Créez un fichier 'index.json' à la racine de votre bucket contenant :
// { "books": ["dossier1", "dossier2", ...] }
const R2_INDEX_URL = `${R2_BASE_URL}/index.json`;

// ============================================================
// CACHE EN MÉMOIRE
// ============================================================
const _cache = {
  books: null,
  metadata: {}
};

// ============================================================
// CHARGEMENT DES MÉTADONNÉES
// ============================================================

/**
 * Charge l'index des livres depuis R2 ou utilise BOOK_FOLDERS
 */
async function fetchBookList() {
  if (_cache.books) return _cache.books;

  try {
    // Tentative de chargement de l'index
    const resp = await fetch(R2_INDEX_URL);
    if (resp.ok) {
      const data = await resp.json();
      _cache.books = data.books || [];
      return _cache.books;
    }
  } catch (e) {
    console.warn('Index R2 non trouvé, utilisation de BOOK_FOLDERS');
  }

  _cache.books = BOOK_FOLDERS;
  return _cache.books;
}

/**
 * Charge les métadonnées d'un livre depuis son dossier R2
 */
async function fetchBookMetadata(folder) {
  if (_cache.metadata[folder]) return _cache.metadata[folder];

  try {
    const url = `${R2_BASE_URL}/${folder}/metadata.json`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw = await resp.json();

    // Normalisation des métadonnées
    const book = normalizeMetadata(raw, folder);
    _cache.metadata[folder] = book;
    return book;
  } catch (e) {
    console.error(`Erreur chargement métadonnées pour ${folder}:`, e);
    return null;
  }
}

/**
 * Normalise les champs du metadata.json vers un objet uniforme
 */
function normalizeMetadata(raw, folder) {
  // Support de différents formats de clés (camelCase, snake_case, etc.)
  const get = (...keys) => {
    for (const k of keys) {
      if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '') return raw[k];
    }
    return null;
  };

  const title  = get('title', 'titre') || folder.replace(/_/g, ' ');
  const author = get('author', 'auteur') || 'Auteur inconnu';
  const blurb  = get('blurb', 'quatrieme_de_couverture', '4eme_de_couverture') || '';
  const summary= get('summary', 'resume', 'résumé') || '';

  // Chemin de la couverture
  let coverRaw = get('cover', 'couverture') || '';
  let coverUrl;
  if (coverRaw.startsWith('http')) {
    coverUrl = coverRaw;
  } else if (coverRaw.startsWith('./')) {
    coverUrl = `${R2_BASE_URL}/${folder}/${coverRaw.slice(2)}`;
  } else if (coverRaw) {
    coverUrl = `${R2_BASE_URL}/${folder}/${coverRaw}`;
  } else {
    // Tentative de cover_raw.png ou jpeg avec nom conventionnel
    coverUrl = `${R2_BASE_URL}/${folder}/${folder}_cover_final.jpg`;
  }

  // Chemin de l'epub
  let epubRaw = get('epub', 'fichier_epub') || '';
  let epubUrl;
  if (epubRaw.startsWith('http')) {
    epubUrl = epubRaw;
  } else if (epubRaw.startsWith('./')) {
    epubUrl = `${R2_BASE_URL}/${folder}/${epubRaw.slice(2)}`;
  } else if (epubRaw) {
    epubUrl = `${R2_BASE_URL}/${folder}/${epubRaw}`;
  } else {
    epubUrl = `${R2_BASE_URL}/${folder}/${folder}_final.epub`;
  }

  // Vecteur moyen pour la similarité
  const meanVector = get('mean_vector') || null;

  return {
    folder,
    title,
    author,
    blurb,
    summary,
    coverUrl,
    epubUrl,
    meanVector,
    embedModel: get('embed_model') || null,
    chunkCount: get('chunk_count') || 0,
    vectorDim: get('vector_dim') || (meanVector ? meanVector.length : 0),
    raw
  };
}

/**
 * Charge tous les livres en parallèle (par lots pour les gros catalogues)
 */
async function fetchAllBooks() {
  const folders = await fetchBookList();
  const BATCH = 10;
  const results = [];

  for (let i = 0; i < folders.length; i += BATCH) {
    const batch = folders.slice(i, i + BATCH);
    const settled = await Promise.allSettled(batch.map(f => fetchBookMetadata(f)));
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) results.push(r.value);
    }
  }

  return results;
}

// ============================================================
// SIMILARITÉ COSINUS
// ============================================================

/**
 * Calcule la similarité cosinus entre deux vecteurs
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Retourne les N livres les plus similaires à un livre cible
 */
function findSimilarBooks(targetBook, allBooks, topN = 4) {
  if (!targetBook.meanVector) return [];

  return allBooks
    .filter(b => b.folder !== targetBook.folder && b.meanVector)
    .map(b => ({
      ...b,
      similarity: cosineSimilarity(targetBook.meanVector, b.meanVector)
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topN);
}

// ============================================================
// UTILITAIRES UI
// ============================================================

/**
 * Crée une carte de livre HTML
 */
function createBookCard(book, link = true) {
  const href = `livre.html?id=${encodeURIComponent(book.folder)}`;
  const card = document.createElement('div');
  card.className = 'book-card reveal';
  card.innerHTML = `
    <div class="book-cover-wrap">
      <img
        class="book-cover"
        src="${escHtml(book.coverUrl)}"
        alt="Couverture de ${escHtml(book.title)}"
        loading="lazy"
        onerror="this.src='assets/cover-placeholder.svg'"
      />
      <span class="book-ai-badge">IA</span>
    </div>
    <div class="book-meta-title">${escHtml(book.title)}</div>
    <div class="book-meta-author">${escHtml(book.author)}</div>
  `;
  if (link) {
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => { window.location.href = href; });
  }
  return card;
}

/**
 * Échappe les caractères HTML
 */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Intersection Observer pour les animations scroll
 */
function initReveal() {
  const observer = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); }
    }),
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

/**
 * Affiche un toast
 */
function showToast(msg, duration = 3000) {
  let toast = document.getElementById('sk-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'sk-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

/**
 * Génère des squelettes de chargement
 */
function renderSkeletons(container, count = 8) {
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const sk = document.createElement('div');
    sk.innerHTML = `
      <div class="skeleton skeleton-cover"></div>
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-author"></div>
    `;
    container.appendChild(sk);
  }
}

// Expose globals
window.SK = {
  R2_BASE_URL,
  fetchBookList,
  fetchBookMetadata,
  fetchAllBooks,
  normalizeMetadata,
  cosineSimilarity,
  findSimilarBooks,
  createBookCard,
  escHtml,
  initReveal,
  showToast,
  renderSkeletons,
};
