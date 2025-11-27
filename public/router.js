// router.js - simple router: loads pages/<page>.html into #content
const router = (function() {
  const content = document.getElementById('content');
  const title = document.getElementById('pageTitle');
  const subtitle = document.getElementById('pageSubtitle');

  async function loadPage(page) {
    let pageName = page;
    let queryString = '';

    // Handle dynamic URL (e.g., detail?id=...)
    if (page.includes('?')) {
        [pageName, queryString] = page.split('?');
    }
    
    try {
      const res = await fetch(`pages/${pageName}.html`);
      if (!res.ok) throw new Error('not found');
      const html = await res.text();
      content.innerHTML = html;
      
      // Call optional onPageLoaded in page script
      if (window.onPageLoaded) {
        try { window.onPageLoaded(pageName); } catch(e){ console.warn(e); }
      }
      
      // Update active link styles
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      const link = document.querySelector(`.nav-item[data-page="${pageName}"]`);
      if (link) link.classList.add('active');

    } catch (err) {
      content.innerHTML = `<div class="p-4 alert alert-danger">Halaman ${pageName.toUpperCase()} tidak ditemukan: ${err.message}</div>`;
      title.textContent = 'Error';
      subtitle.textContent = '';
    }
  }

  return { navigateTo: loadPage };
})();