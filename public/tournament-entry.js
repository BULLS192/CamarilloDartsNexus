(() => {
  if (document.querySelector('[data-nexus-tournament-director]')) return;
  const link = document.createElement('a');
  link.href = '/tournament.html';
  link.textContent = 'Tournament Director';
  link.dataset.nexusTournamentDirector = 'true';
  link.title = 'Open NEXUS Tournament Director';
  link.style.cssText = 'display:inline-flex;align-items:center;gap:6px;text-decoration:none;font-weight:800;white-space:nowrap';
  const nav = document.querySelector('nav, .nav, .tabs, .topbar, header');
  if (nav) {
    link.className = 'button secondary nexus-tournament-entry';
    nav.appendChild(link);
  } else {
    link.style.cssText += ';position:fixed;right:16px;bottom:16px;z-index:9999;padding:10px 14px;border-radius:999px;background:#e53935;color:white;box-shadow:0 6px 24px rgba(0,0,0,.35)';
    document.body.appendChild(link);
  }
})();
