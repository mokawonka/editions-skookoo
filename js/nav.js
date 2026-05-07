/* ============================================================
   Éditions Skookoo — Shared Navigation
   Include BEFORE </body> on every page.
   Usage: <script src="js/nav.js"></script>
   ============================================================ */
(function () {
  /* ── Detect active page ── */
  const path = window.location.pathname;
  const isHome    = path.endsWith('index.html') || path.endsWith('/');
  const isLibrary = path.includes('livres');
  const isBook    = path.includes('livre.html');
  const isCart    = path.includes('panier');

  function activeIf(cond) { return cond ? ' style="color:var(--honey)"' : ''; }

  /* ── Cart badge count (reads localStorage) ── */
  function cartCount() {
    try {
      const items = JSON.parse(localStorage.getItem('skookoo_cart') || '[]');
      return items.reduce((s, i) => s + (i.qty || 1), 0);
    } catch { return 0; }
  }

  /* ── Inject nav into existing <nav class="nav"> ── */
  const nav = document.querySelector('nav.nav');
  if (!nav) return;

  const n = cartCount();
  const badgeHtml = n > 0
    ? `<span class="cart-badge" id="cart-badge">${n}</span>`
    : `<span class="cart-badge" id="cart-badge" style="display:none">0</span>`;

  nav.innerHTML = `
    <a href="index.html" class="nav-logo" aria-label="Éditions Skookoo — Accueil">
      <img src="assets/logo.png" alt="Abeille robot — logo Éditions Skookoo" />
      Éditions Skookoo
    </a>
    <ul class="nav-links" role="list">
      <li><a href="index.html"${activeIf(isHome)}>Accueil</a></li>
      <li><a href="livres.html"${activeIf(isLibrary)}>Bibliothèque</a></li>
      <li><a href="index.html#mission">Notre mission</a></li>
      <li><a href="index.html#processus">Processus</a></li>
      <li><a href="livres.html" class="nav-cta">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        Parcourir
      </a></li>
    </ul>
    <a href="panier.html" class="nav-cart" id="nav-cart" aria-label="Panier (${n} article${n !== 1 ? 's' : ''})">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
      ${badgeHtml}
    </a>
    <button class="nav-hamburger" id="nav-hamburger" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="mobile-drawer">
      <span></span><span></span><span></span>
    </button>
  `;

  /* ── Inject mobile drawer after <nav> ── */
  const drawer = document.createElement('div');
  drawer.className = 'mobile-drawer';
  drawer.id = 'mobile-drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-label', 'Menu de navigation');
  drawer.innerHTML = `
    <nav class="mobile-menu">
      <a href="index.html"${activeIf(isHome)}>Accueil</a>
      <a href="livres.html"${activeIf(isLibrary)}>Bibliothèque</a>
      <a href="index.html#mission">Notre mission</a>
      <a href="index.html#processus">Processus</a>
      <a href="panier.html"${activeIf(isCart)}>Panier</a>
      <a href="livres.html" class="nav-cta" style="margin-top:.5rem">Parcourir la bibliothèque →</a>
    </nav>
  `;
  nav.insertAdjacentElement('afterend', drawer);

  /* ── Hamburger logic ── */
  const btn = document.getElementById('nav-hamburger');
  btn.addEventListener('click', () => {
    const open = btn.classList.toggle('open');
    drawer.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    document.body.style.overflow = open ? 'hidden' : '';
  });
  drawer.addEventListener('click', e => {
    if (e.target === drawer) close();
  });
  drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  function close() {
    btn.classList.remove('open');
    drawer.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Ouvrir le menu');
    document.body.style.overflow = '';
  }
})();