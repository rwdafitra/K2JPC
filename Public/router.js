// simple router: loads pages/<page>.html into #content
const router = (function(){
  const content = document.getElementById('content');
  const title = document.getElementById('pageTitle');
  const subtitle = document.getElementById('pageSubtitle');

  async function loadPage(page){
    try {
      const res = await fetch(`pages/${page}.html`);
      if (!res.ok) throw new Error('not found');
      const html = await res.text();
      content.innerHTML = html;
      title.textContent = page.charAt(0).toUpperCase() + page.slice(1);
      subtitle.textContent = document.querySelector(`a[data-page="${page}"]`)?.textContent.trim() || '';
      // call optional onPageLoaded in page script
      if (window.onPageLoaded) {
        try { window.onPageLoaded(page); } catch(e){ console.warn(e); }
      }
    } catch (err) {
      content.innerHTML = `<div class="p-4">Halaman tidak ditemukan: ${page}</div>`;
    }
    // update active link styles
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    const link = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (link) link.classList.add('active');
  }

  return { navigateTo: loadPage };
})();
